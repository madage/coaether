import React, { useState, useEffect } from 'react';
import { useLang } from '../i18n/context';
import { agentProfiles } from '../api/client';
import type { RuntimeEntity } from '../types';

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
  const { t } = useLang();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedRuntime, setSelectedRuntime] = useState('');
  const [runtimes, setRuntimes] = useState<RuntimeEntity[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    agentProfiles.listRuntimes().then((res) => {
      setRuntimes(res.runtimes);
    }).catch(() => {
      setRuntimes([{ id: 'claude', name: 'Claude Code', description: 'AI programming assistant' }]);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !selectedRuntime) return;
    setSaving(true);
    setError(null);
    try {
      await agentProfiles.create({
        name: name.trim(),
        description: description.trim(),
        agent_id: selectedRuntime,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

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
              {t('agentRuntime')} <span style={{ color: '#f44336' }}>*</span>
            </label>
            <select
              value={selectedRuntime}
              onChange={(e) => setSelectedRuntime(e.target.value)}
              style={{ ...inputStyle, background: '#fff' }}
              required
            >
              <option value="">{t('selectRuntime')}</option>
              {runtimes.map((r) => (
                <option key={r.id} value={r.id}>{r.name} - {r.description}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '24px' }}>
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
