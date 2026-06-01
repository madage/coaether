import React, { useState } from 'react';
import type { AgentProfile } from '../types';
import { useLang } from '../i18n/context';

interface AgentDetailModalProps {
  profile: AgentProfile;
  runtimeName?: string;
  onClose: () => void;
  onSave: (id: string, data: Partial<AgentProfile>) => void;
  onDelete: (id: string) => void;
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

export function AgentDetailModal({ profile, runtimeName, onClose, onSave, onDelete }: AgentDetailModalProps) {
  const { t } = useLang();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(profile.name);
  const [editDesc, setEditDesc] = useState(profile.description);

  const handleSave = () => {
    onSave(profile.id, { name: editName, description: editDesc });
    setEditing(false);
  };

  const handleCancel = () => {
    setEditName(profile.name);
    setEditDesc(profile.description);
    setEditing(false);
  };

  const handleDelete = () => {
    if (window.confirm(t('confirmDelete'))) {
      onDelete(profile.id);
    }
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
                {t('agentDescription')}
              </label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={4}
                style={{ ...inputStyle, resize: 'vertical' }}
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
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
              <button onClick={handleDelete} style={{
                padding: '10px 24px', background: '#fbe9e7', color: '#d32f2f',
                border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.95em',
              }}>{t('deleteAgent')}</button>
              <button onClick={() => setEditing(true)} style={{
                padding: '10px 24px', background: '#1976d2', color: '#fff',
                border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.95em', fontWeight: 600,
              }}>{t('editAgent')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
