import React, { useState, useEffect, useCallback } from 'react';
import { useLang } from '../i18n/context';
import { agentProfiles, nodes, agents } from '../api/client';
import type { Node, Agent } from '../types';

interface AgentFormProps {
  onClose: () => void;
  onCreated: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  padding: '32px',
  width: '480px',
  maxWidth: '90vw',
  boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  borderRadius: '6px',
  border: '1px solid #ddd',
  fontSize: '1em',
  boxSizing: 'border-box',
};

const avatars = ['🤖', '🧠', '⚡', '🎯', '🔧', '🛠️', '🌟', '💡', '🚀', '🎨'];

export function AgentForm({ onClose, onCreated }: AgentFormProps) {
  const { t, lang } = useLang();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [tags, setTags] = useState('');
  const [nodeList, setNodeList] = useState<Node[]>([]);
  const [selectedNode, setSelectedNode] = useState('');
  const [agentList, setAgentList] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    nodes.list().then((res) => {
      setNodeList(res.nodes);
    }).catch(() => {});
  }, []);

  // Fetch agents when node changes
  useEffect(() => {
    if (!selectedNode) {
      setAgentList([]);
      setSelectedAgent('');
      return;
    }
    setLoadingAgents(true);
    setSelectedAgent('');
    agents.list(selectedNode).then((res) => {
      setAgentList(res.agents.filter(a => a.enabled));
    }).catch(() => {
      setAgentList([]);
    }).finally(() => {
      setLoadingAgents(false);
    });
  }, [selectedNode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !selectedNode || !selectedAgent) return;
    setSaving(true);
    setError(null);
    try {
      await agentProfiles.create({
        name: name.trim(),
        description: description.trim(),
        system_prompt: systemPrompt.trim(),
        agent_id: selectedAgent,
        node_id: selectedNode,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const nodeRequired = true;
  const agentRequired = true;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 24px', color: '#1a1a2e' }}>{t('createAgent')}</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: '#333', fontSize: '0.9em' }}>
              {t('agentName')} <span style={{ color: '#f44336' }}>*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('agentNamePlaceholder')}
              style={inputStyle}
              required
              autoFocus
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: '#333', fontSize: '0.9em' }}>
              {t('agentNode')} <span style={{ color: '#f44336' }}>*</span>
            </label>
            <select
              value={selectedNode}
              onChange={(e) => setSelectedNode(e.target.value)}
              style={{ ...inputStyle, background: '#fff' }}
              required={nodeRequired}
            >
              <option value="">{lang === 'zh' ? '选择一个节点...' : 'Select a node...'}</option>
              {nodeList.filter(n => n.status === 'online' || n.status === 'busy').map((n) => (
                <option key={n.id} value={n.id}>{n.name} ({n.status})</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: '#333', fontSize: '0.9em' }}>
              {t('agentRuntime')} <span style={{ color: '#f44336' }}>*</span>
            </label>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              style={{ ...inputStyle, background: '#fff' }}
              required={agentRequired}
              disabled={!selectedNode}
            >
              <option value="">
                {!selectedNode
                  ? (lang === 'zh' ? '请先选择节点' : 'Select a node first')
                  : loadingAgents
                    ? (lang === 'zh' ? '加载中...' : 'Loading...')
                    : agentList.length === 0
                      ? (lang === 'zh' ? '该节点没有可用 Agent' : 'No agents on this node')
                      : t('selectRuntime')}
              </option>
              {agentList.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: '#333', fontSize: '0.9em' }}>
              {t('agentDescription')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('agentDescriptionPlaceholder')}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: '#333', fontSize: '0.9em' }}>
              {t('systemPrompt')}
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={t('systemPromptPlaceholder')}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '0.85em' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: '#333', fontSize: '0.9em' }}>
              {t('abilityTags')} <span style={{ color: '#999', fontWeight: 400, fontSize: '0.85em' }}>({t('optional')})</span>
            </label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t('abilityTagsPlaceholder')}
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{ color: '#f44336', marginBottom: '12px', fontSize: '0.9em' }}>{error}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 24px', background: '#f5f5f5', color: '#666',
                border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '0.95em',
              }}
            >{t('cancel')}</button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '10px 24px', background: '#1976d2', color: '#fff',
                border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: '0.95em', fontWeight: 600, opacity: saving ? 0.7 : 1,
              }}
            >{saving ? '...' : t('saveAgent')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
