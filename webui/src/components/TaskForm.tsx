import { useState, useEffect } from 'react';
import { useLang } from '../i18n/context';
import { projects as projectsApi, agentProfiles as agentProfilesApi, tasks as tasksApi, workspaceMembers as workspaceMembersApi } from '../api/client';
import { useWorkspace } from '../hooks/WorkspaceContext';
import type { Task, TaskStatus, Project, Priority, AssigneeType, TaskAssignee, WorkspaceMember, AgentProfile } from '../types';

interface TaskFormProps {
  task?: Task;
  onClose: () => void;
  onSave: (data: {
    title: string;
    description: string;
    status?: TaskStatus;
    project_id?: string | null;
    parent_id?: string | null;
    assignee_id?: string | null;
    assignee_type?: AssigneeType | null;
    priority?: Priority;
    tags?: string[];
    due_at?: string | null;
  }) => void;
}

export function TaskForm({ task, onClose, onSave }: TaskFormProps) {
  const { t } = useLang();
  const { workspaceId } = useWorkspace();
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [status, setStatus] = useState<TaskStatus>(task?.status || 'todo');
  const [projectId, setProjectId] = useState<string | null>(task?.project_id || null);
  const [parentId, setParentId] = useState<string | null>(task?.parent_id || null);
  const [assigneeId, setAssigneeId] = useState<string | null>(task?.assignee_id || null);
  const [assigneeType, setAssigneeType] = useState<AssigneeType | null>(task?.assignee_type || null);
  const [priority, setPriority] = useState<Priority>(task?.priority || 'medium');
  const [tags, setTags] = useState<string[]>(task?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [dueAt, setDueAt] = useState(task?.due_at ? task.due_at.slice(0, 10) : '');

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);

  useEffect(() => {
    projectsApi.list().then((res) => setProjects(res.projects)).catch(() => {});
    tasksApi.list({ parentId: 'none' }).then((res) => setTasks(res.tasks)).catch(() => {});
    if (workspaceId) {
      workspaceMembersApi.list(workspaceId).then((res) => setMembers(res.members)).catch(() => {});
    }
    agentProfilesApi.list().then((res) => setProfiles(res.profiles)).catch(() => {});
  }, [workspaceId]);

  const setProfiles = (profiles: AgentProfile[]) => setAgentProfiles(profiles);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      description: description.trim(),
      ...(task ? { status } : {}),
      project_id: projectId,
      parent_id: parentId,
      assignee_id: assigneeId,
      assignee_type: assigneeType,
      priority,
      tags: tags.length > 0 ? tags : undefined,
      due_at: dueAt ? dueAt + 'T00:00:00Z' : null,
    });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, overflowY: 'auto', padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '12px', padding: '28px',
          width: '520px', maxWidth: '90vw',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <h3 style={{ margin: '0 0 20px', color: '#333' }}>
          {task ? t('taskEdit') : t('taskCreate')}
        </h3>

        <form onSubmit={handleSubmit}>
          {/* Title */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.85em', color: '#666', marginBottom: '4px' }}>
              {t('taskTitle')} *
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
              required
              autoFocus
            />
          </div>

          {/* Creator (read-only) */}
          {task?.creator_name && (
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.85em', color: '#666', marginBottom: '4px' }}>
                创建者
              </label>
              <div style={{ ...inputStyle, background: '#f5f5f5', color: '#888', display: 'flex', alignItems: 'center', padding: '10px' }}>
                ✏️ {task.creator_name}
              </div>
            </div>
          )}

          {/* Description */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.85em', color: '#666', marginBottom: '4px' }}>
              {t('taskDescription')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          {/* Project */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.85em', color: '#666', marginBottom: '4px' }}>
              {t('navProjects')}
            </label>
            <select value={projectId || ''} onChange={(e) => setProjectId(e.target.value || null)} style={selectStyle}>
              <option value="">{t('defaultProject')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Parent Task */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.85em', color: '#666', marginBottom: '4px' }}>
              父任务
            </label>
            <select
              value={parentId || ''}
              onChange={(e) => setParentId(e.target.value || null)}
              style={selectStyle}
              disabled={!!task} // Disable on edit for simplicity
            >
              <option value="">无（顶层任务）</option>
              {tasks
                .filter(t => t.id !== task?.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
            </select>
          </div>

          {/* Assignee (Responsible Person) */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.85em', color: '#666', marginBottom: '4px' }}>
              负责人
            </label>
            <select
              value={assigneeId ? `${assigneeType || 'user'}:${assigneeId}` : ''}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) {
                  setAssigneeId(null);
                  setAssigneeType(null);
                } else {
                  const [type, id] = val.split(':');
                  setAssigneeType(type as AssigneeType);
                  setAssigneeId(id);
                }
              }}
              style={selectStyle}
            >
              <option value="">未指派</option>
              <optgroup label="用户">
                {members.map((m) => (
                  <option key={`user:${m.user_id}`} value={`user:${m.user_id}`}>
                    👤 {m.username}
                  </option>
                ))}
              </optgroup>
              <optgroup label="智能体">
                {agentProfiles.map((a) => (
                  <option key={`agent_profile:${a.id}`} value={`agent_profile:${a.id}`}>
                    {a.avatar || '🤖'} {a.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Priority */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.85em', color: '#666', marginBottom: '4px' }}>
              优先级
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['urgent', 'high', 'medium', 'low'] as Priority[]).map((p) => (
                <label key={p} style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                  padding: '8px', borderRadius: '6px', border: `1px solid ${priority === p ? '#1976d2' : '#ddd'}`,
                  background: priority === p ? '#e3f2fd' : '#fff', cursor: 'pointer', fontSize: '0.85em',
                }}>
                  <input
                    type="radio"
                    name="priority"
                    value={p}
                    checked={priority === p}
                    onChange={() => setPriority(p)}
                    style={{ display: 'none' }}
                  />
                  {p === 'urgent' && '🔴'} {p === 'high' && '🟠'} {p === 'medium' && '🔵'} {p === 'low' && '⚪'}
                  {p}
                </label>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.85em', color: '#666', marginBottom: '4px' }}>
              标签
            </label>
            <div style={{ display: 'flex', gap: '4px', marginBottom: '6px', flexWrap: 'wrap' }}>
              {tags.map((tag) => (
                <span key={tag} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  padding: '2px 8px', borderRadius: '8px', background: '#e3f2fd', color: '#1565c0',
                  fontSize: '0.8em',
                }}>
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1565c0', padding: 0, fontSize: '1em', lineHeight: 1 }}>
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="输入标签后回车添加"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button type="button" onClick={addTag} style={{
                padding: '8px 14px', borderRadius: '6px', border: '1px solid #ddd',
                background: '#f5f5f5', cursor: 'pointer', fontSize: '0.85em',
              }}>
                添加
              </button>
            </div>
          </div>

          {/* Due Date */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.85em', color: '#666', marginBottom: '4px' }}>
              截止日期
            </label>
            <input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Status (edit only) */}
          {task && (
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.85em', color: '#666', marginBottom: '4px' }}>
                {t('taskStatus')}
              </label>
              <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} style={selectStyle}>
                <option value="todo">{t('taskStatusTodo')}</option>
                <option value="in_progress">{t('taskStatusInProgress')}</option>
                <option value="blocked">{t('taskStatusBlocked')}</option>
                <option value="review">{t('taskStatusReview')}</option>
                <option value="done">{t('taskStatusDone')}</option>
              </select>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnSecondaryStyle}>
              {t('cancel')}
            </button>
            <button type="submit" style={btnPrimaryStyle}>
              {t('saveAgent')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd',
  fontSize: '0.95em', boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, background: '#fff',
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: '10px 20px', borderRadius: '6px', border: 'none',
  background: '#1976d2', color: '#fff', cursor: 'pointer', fontSize: '0.95em',
};

const btnSecondaryStyle: React.CSSProperties = {
  padding: '10px 20px', borderRadius: '6px', border: '1px solid #ddd',
  background: '#fff', cursor: 'pointer', color: '#666', fontSize: '0.95em',
};
