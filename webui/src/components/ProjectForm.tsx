import { useState, useEffect } from 'react';
import { useLang } from '../i18n/context';
import { workspaceMembers as workspaceMembersApi, agentProfiles as agentProfilesApi } from '../api/client';
import { useWorkspace } from '../hooks/WorkspaceContext';
import type { AssigneeType, ProjectStatus, WorkspaceMember, AgentProfile } from '../types';

const presetColors = [
  '#1976d2', '#388e3c', '#f57c00', '#c62828',
  '#7b1fa2', '#00838f', '#e91e63', '#546e7a',
];

interface ProjectFormData {
  name: string;
  description: string;
  color: string;
  assignee_id?: string | null;
  assignee_type?: AssigneeType | null;
  status?: ProjectStatus;
  started_at?: string | null;
  due_at?: string | null;
}

interface ProjectFormProps {
  initial?: { name: string; description: string; color: string; assignee_id?: string; assignee_type?: AssigneeType; status?: ProjectStatus; started_at?: string; due_at?: string };
  onClose: () => void;
  onSave: (data: ProjectFormData) => void;
}

export function ProjectForm({ initial, onClose, onSave }: ProjectFormProps) {
  const { t, lang } = useLang();
  const { workspaceId } = useWorkspace();
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [color, setColor] = useState(initial?.color || presetColors[0]);
  const [status, setStatus] = useState<ProjectStatus>(initial?.status || 'planning');
  const [assigneeId, setAssigneeId] = useState<string | null>(initial?.assignee_id || null);
  const [assigneeType, setAssigneeType] = useState<AssigneeType | null>(initial?.assignee_type || null);
  const [startedAt, setStartedAt] = useState(initial?.started_at ? initial.started_at.slice(0, 10) : '');
  const [dueAt, setDueAt] = useState(initial?.due_at ? initial.due_at.slice(0, 10) : '');

  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);

  useEffect(() => {
    if (workspaceId) {
      workspaceMembersApi.list(workspaceId).then((res) => setMembers(res.members)).catch(() => {});
    }
    agentProfilesApi.list().then((res) => setAgentProfiles(res.profiles)).catch(() => {});
  }, [workspaceId]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    // Convert date-only strings to RFC3339 format for Go time.Time parsing
    const toRFC3339 = (d: string) => d ? d + 'T00:00:00Z' : null;
    onSave({
      name: name.trim(),
      description: description.trim(),
      color,
      assignee_id: assigneeId,
      assignee_type: assigneeType,
      status,
      started_at: toRFC3339(startedAt),
      due_at: toRFC3339(dueAt),
    });
  };

  return (
    <div onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
      }}
    >
      <div onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '16px', padding: '32px',
          width: '480px', maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <h3 style={{ margin: '0 0 24px', color: '#333' }}>
          {initial ? t('profileEdit') : t('projectCreate')}
        </h3>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.85em', color: '#666', marginBottom: '4px' }}>
              {t('projectName')} *
            </label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              style={inputStyle} required autoFocus />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.85em', color: '#666', marginBottom: '4px' }}>
              {t('projectDescription')}
            </label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          {/* Assignee */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.85em', color: '#666', marginBottom: '4px' }}>负责人</label>
            <select
              value={assigneeId ? `${assigneeType || 'user'}:${assigneeId}` : ''}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) { setAssigneeId(null); setAssigneeType(null); }
                else { const [type, id] = val.split(':'); setAssigneeType(type as AssigneeType); setAssigneeId(id); }
              }}
              style={selectStyle}
            >
              <option value="">未指派</option>
              <optgroup label="用户">
                {members.map((m) => (
                  <option key={`user:${m.user_id}`} value={`user:${m.user_id}`}>👤 {m.username}</option>
                ))}
              </optgroup>
              <optgroup label="智能体">
                {agentProfiles.map((a) => (
                  <option key={`agent_profile:${a.id}`} value={`agent_profile:${a.id}`}>{a.avatar || '🤖'} {a.name}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Status */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.85em', color: '#666', marginBottom: '4px' }}>状态</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)} style={selectStyle}>
              <option value="planning">规划中</option>
              <option value="active">进行中</option>
              <option value="completed">已完成</option>
              <option value="on_hold">挂起</option>
            </select>
          </div>

          {/* Date range */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.85em', color: '#666', marginBottom: '4px' }}>开始日期</label>
              <input type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.85em', color: '#666', marginBottom: '4px' }}>截止日期</label>
              <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} style={inputStyle} />
            </div>
          </div>

          {/* Color */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '0.85em', color: '#666', marginBottom: '8px' }}>
              {t('projectColor')}
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {presetColors.map((c) => (
                <div key={c} onClick={() => setColor(c)}
                  style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    background: c, cursor: 'pointer',
                    border: color === c ? '3px solid #333' : '3px solid transparent',
                    transition: 'border 0.15s',
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnSecondaryStyle}>
              {t('cancel')}
            </button>
            <button type="submit" style={{ ...btnPrimaryStyle, background: color }}>
              {t('saveAgent')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px', borderRadius: '6px',
  border: '1px solid #ddd', fontSize: '0.95em', boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = { ...inputStyle, background: '#fff' };

const btnSecondaryStyle: React.CSSProperties = {
  padding: '10px 20px', borderRadius: '6px', border: '1px solid #ddd',
  background: '#fff', cursor: 'pointer', color: '#666', fontSize: '0.95em',
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: '10px 24px', borderRadius: '6px', border: 'none',
  color: '#fff', cursor: 'pointer', fontSize: '0.95em', fontWeight: 600,
};
