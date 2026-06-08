import React, { useState, useEffect } from 'react';
import type { AgentProfile, Node, Agent } from '../types';
import { agentProfiles, nodes, agents } from '../api/client';
import { useLang } from '../i18n/context';

interface AgentDetailModalProps {
  profile: AgentProfile;
  runtimeName?: string;
  nodeName?: string;
  onClose: () => void;
  onSave?: (id: string, data: Partial<AgentProfile>) => void;
  onDelete?: (id: string) => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '16px',
  padding: '40px',
  width: '560px',
  maxWidth: '90vw',
  maxHeight: '85vh',
  overflow: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  position: 'relative',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  borderRadius: '6px',
  border: '1px solid #ddd',
  fontSize: '1em',
  boxSizing: 'border-box',
};

export function AgentDetailModal({ profile, runtimeName, nodeName, onClose, onSave, onDelete }: AgentDetailModalProps) {
  const { t, lang } = useLang();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(profile.name);
  const [editDesc, setEditDesc] = useState(profile.description);
  const [editSystemPrompt, setEditSystemPrompt] = useState(profile.system_prompt || '');
  const [editInstructions, setEditInstructions] = useState(profile.instructions || '');
  const [editTags, setEditTags] = useState(profile.tags?.join(', ') || '');
  const [editMaxConcurrency, setEditMaxConcurrency] = useState(profile.max_concurrency || 1);
  const [editNodeId, setEditNodeId] = useState(profile.node_id || '');
  const [editAgentId, setEditAgentId] = useState(profile.agent_id);
  const [nodeList, setNodeList] = useState<Node[]>([]);
  const [agentList, setAgentList] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);

  useEffect(() => {
    nodes.list().then((res) => {
      setNodeList(res.nodes);
    }).catch(() => {});
  }, []);

  // Fetch agents when node changes in edit mode
  useEffect(() => {
    if (!editing || !editNodeId) {
      setAgentList([]);
      return;
    }
    setLoadingAgents(true);
    agents.list(editNodeId).then((res) => {
      setAgentList(res.agents.filter(a => a.enabled));
    }).catch(() => {
      setAgentList([]);
    }).finally(() => {
      setLoadingAgents(false);
    });
  }, [editNodeId, editing]);

  const handleSave = () => {
    onSave?.(profile.id, {
      name: editName,
      description: editDesc,
      system_prompt: editSystemPrompt,
      instructions: editInstructions,
      agent_id: editAgentId,
      node_id: editNodeId || undefined,
      max_concurrency: editMaxConcurrency,
      tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setEditName(profile.name);
    setEditDesc(profile.description);
    setEditSystemPrompt(profile.system_prompt || '');
    setEditInstructions(profile.instructions || '');
    setEditTags(profile.tags?.join(', ') || '');
    setEditMaxConcurrency(profile.max_concurrency || 1);
    setEditAgentId(profile.agent_id);
    setEditNodeId(profile.node_id || '');
    setEditing(false);
  };

  const handleDelete = () => {
    onDelete?.(profile.id);
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px', right: '16px',
            width: '36px', height: '36px',
            borderRadius: '50%',
            border: 'none',
            background: '#f5f5f5',
            cursor: 'pointer',
            fontSize: '1.2em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
          }}
        >✕</button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '4em', marginBottom: '12px' }}>{profile.avatar}</div>
          <h2 style={{ margin: '0', color: '#1a1a2e', fontSize: '1.5em' }}>{profile.name}</h2>
          <span style={{
            display: 'inline-block',
            marginTop: '8px',
            padding: '4px 12px',
            borderRadius: '12px',
            fontSize: '0.8em',
            fontWeight: 600,
            background: profile.enabled ? '#e8f5e9' : '#f5f5f5',
            color: profile.enabled ? '#2e7d32' : '#9e9e9e',
          }}>
            {profile.enabled ? t('enabled') : t('disabled')}
          </span>
        </div>

        {editing ? (
          /* Edit mode */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: '#333', fontSize: '0.9em' }}>
                {t('agentName')}
              </label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: '#333', fontSize: '0.9em' }}>
                {t('agentNode')}
              </label>
              <select
                value={editNodeId}
                onChange={(e) => setEditNodeId(e.target.value)}
                style={{ ...inputStyle, background: '#fff' }}
              >
                <option value="">{lang === 'zh' ? '选择一个节点...' : 'Select a node...'}</option>
                {nodeList.filter(n => n.status === 'online' || n.status === 'busy').map((n) => (
                  <option key={n.id} value={n.id}>{n.name} ({n.status})</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: '#333', fontSize: '0.9em' }}>
                {t('agentRuntime')}
              </label>
              <select
                value={editAgentId}
                onChange={(e) => setEditAgentId(e.target.value)}
                style={{ ...inputStyle, background: '#fff' }}
                disabled={!editNodeId}
              >
                <option value="">
                  {!editNodeId
                    ? (lang === 'zh' ? '请先选择节点' : 'Select a node first')
                    : loadingAgents
                      ? (lang === 'zh' ? '加载中...' : 'Loading...')
                      : agentList.length === 0
                        ? (lang === 'zh' ? '该节点没有可用 Agent' : 'No agents on this node')
                        : lang === 'zh' ? '选择一个 Agent...' : 'Select an agent...'}
                </option>
                {agentList.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: '#333', fontSize: '0.9em' }}>
                {t('agentDescription')}
              </label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={4}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: '#333', fontSize: '0.9em' }}>
                {t('systemPrompt')}
              </label>
              <textarea
                value={editSystemPrompt}
                onChange={(e) => setEditSystemPrompt(e.target.value)}
                placeholder={t('systemPromptPlaceholder')}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '0.85em' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: '#333', fontSize: '0.9em' }}>
                {t('instructions')}
              </label>
              <textarea
                value={editInstructions}
                onChange={(e) => setEditInstructions(e.target.value)}
                placeholder={t('instructionsPlaceholder')}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontSize: '0.85em' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: '#333', fontSize: '0.9em' }}>
                {t('abilityTags')}
              </label>
              <input
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder={t('abilityTagsPlaceholder')}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: '#333', fontSize: '0.9em' }}>
                {t('maxConcurrency')}
              </label>
              <input
                type="number"
                value={editMaxConcurrency}
                onChange={(e) => setEditMaxConcurrency(Math.max(1, parseInt(e.target.value) || 1))}
                min={1}
                max={20}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '8px' }}>
              <button onClick={handleCancel} style={{
                padding: '10px 24px', background: '#f5f5f5', color: '#666',
                border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '0.95em',
              }}>{t('cancel')}</button>
              <button onClick={handleSave} style={{
                padding: '10px 24px', background: '#1976d2', color: '#fff',
                border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.95em', fontWeight: 600,
              }}>{t('saveAgent')}</button>
            </div>
          </div>
        ) : (
          /* View mode */
          <>
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontWeight: 600, color: '#333', fontSize: '0.9em', marginBottom: '8px' }}>
                {t('agentDescription')}
              </div>
              <p style={{ margin: 0, color: '#555', fontSize: '0.95em', lineHeight: 1.6 }}>
                {profile.description || '-'}
              </p>
            </div>

            {profile.system_prompt && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, color: '#333', fontSize: '0.9em', marginBottom: '8px' }}>
                  {t('systemPrompt')}
                </div>
                <p style={{ margin: 0, color: '#666', fontSize: '0.85em', lineHeight: 1.6, fontFamily: 'monospace', background: '#f5f5f5', padding: '10px', borderRadius: '6px', whiteSpace: 'pre-wrap' }}>
                  {profile.system_prompt}
                </p>
              </div>
            )}

            {profile.instructions && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, color: '#333', fontSize: '0.9em', marginBottom: '8px' }}>
                  {t('instructions')}
                </div>
                <p style={{ margin: 0, color: '#555', fontSize: '0.95em', lineHeight: 1.6, background: '#fef7e0', padding: '10px', borderRadius: '6px', whiteSpace: 'pre-wrap' }}>
                  {profile.instructions}
                </p>
              </div>
            )}

            {profile.tags && profile.tags.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, color: '#333', fontSize: '0.9em', marginBottom: '8px' }}>
                  {t('abilityTags')}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {profile.tags.map((tag, i) => (
                    <span key={i} style={{
                      background: '#e3f2fd', color: '#1565c0', padding: '2px 10px',
                      borderRadius: '10px', fontSize: '0.8em', fontWeight: 500,
                    }}>{tag}</span>
                  ))}
                </div>
              </div>
            )}

            <div style={{
              background: '#f9f9f9',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '24px',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              fontSize: '0.9em',
            }}>
              <div>
                <div style={{ color: '#999', fontSize: '0.85em' }}>{t('agentRuntime')}</div>
                <div style={{ color: '#333', fontWeight: 500 }}>{runtimeName || profile.agent_id}</div>
              </div>
              <div>
                <div style={{ color: '#999', fontSize: '0.85em' }}>ID</div>
                <div style={{ color: '#333', fontWeight: 500, fontSize: '0.85em' }}>{profile.id.slice(0, 8)}...</div>
              </div>
              <div>
                <div style={{ color: '#999', fontSize: '0.85em' }}>Version</div>
                <div style={{ color: '#333', fontWeight: 500 }}>{profile.version || '-'}</div>
              </div>
              <div>
                <div style={{ color: '#999', fontSize: '0.85em' }}>Backend</div>
                <div style={{ color: '#333', fontWeight: 500 }}>{profile.backend}</div>
              </div>
              <div>
                <div style={{ color: '#999', fontSize: '0.85em' }}>{t('agentNode')}</div>
                <div style={{ color: '#333', fontWeight: 500 }}>{nodeName || '-'}</div>
              </div>
              <div>
                <div style={{ color: '#999', fontSize: '0.85em' }}>{t('agentLoad')}</div>
                <div style={{ color: '#333', fontWeight: 500 }}>{profile.current_load ?? 0}/{profile.max_concurrency ?? 1}</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
              {onDelete && <button onClick={handleDelete} style={{
                padding: '10px 24px', background: '#fbe9e7', color: '#d32f2f',
                border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.95em',
              }}>{t('deleteAgent')}</button>}
              {onSave && <button onClick={() => setEditing(true)} style={{
                padding: '10px 24px', background: '#1976d2', color: '#fff',
                border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.95em', fontWeight: 600,
              }}>{t('editAgent')}</button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
