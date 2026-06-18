import { useState, useEffect, useCallback } from 'react';
import { useLang } from '../i18n/context';
import { nodes as nodesApi } from '../api/client';
import type { Node } from '../types';

interface NodeSettingsDialogProps {
  node: Node;
  onClose: () => void;
}

export function NodeSettingsDialog({ node, onClose }: NodeSettingsDialogProps) {
  const { t } = useLang();
  const [config, setConfig] = useState<{ os: string; arch: string; version: string; status: string; connected_server: string; backup_server_url: string } | null>(null);
  const [backupServer, setBackupServer] = useState('');
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    nodesApi.getConfig(node.id).then((cfg) => {
      setConfig(cfg);
      setBackupServer(cfg.backup_server_url || '');
    }).catch((err) => {
      setError(err.message || 'Failed to load config');
    }).finally(() => setLoading(false));
  }, [node.id]);

  const handleSave = useCallback(async () => {
    setSaved(false);
    setError(null);
    try {
      await nodesApi.updateConfig(node.id, {
        server_url: config?.connected_server || '',
        backup_server_url: backupServer,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Save failed');
    }
  }, [node.id, config?.connected_server, backupServer]);

  const handleSwitch = useCallback(async () => {
    if (!backupServer.trim()) return;
    setSwitching(true);
    setError(null);
    try {
      await nodesApi.updateConfig(node.id, { server_url: backupServer.trim() });
      setSwitching(false);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Switch failed');
      setSwitching(false);
    }
  }, [node.id, backupServer, onClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: '16px', padding: '32px',
          width: '520px', maxWidth: '90vw', maxHeight: '85vh', overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '16px', right: '16px',
            width: '36px', height: '36px', borderRadius: '50%',
            border: 'none', background: '#f5f5f5', cursor: 'pointer',
            fontSize: '1.2em', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#666',
          }}
        >
          ✕
        </button>

        <h2 style={{ margin: '0 0 20px', color: '#1a1a2e', fontSize: '1.2em' }}>
          {t('nodeSettings')} - {node.name}
        </h2>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>{t('loading')}...</div>
        ) : config ? (
          <>
            {/* Server connection info */}
            <div style={{
              background: '#f8f9fa', borderRadius: '8px', padding: '16px',
              marginBottom: '20px',
            }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '0.95em', color: '#333' }}>{t('currentServer')}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px', fontSize: '0.85em' }}>
                <div style={{ color: '#888' }}>{t('currentServer')}:</div>
                <div style={{ color: '#333', fontWeight: 500 }}>
                  {config.connected_server || 'unknown'}
                </div>
                <div style={{ color: '#888' }}>{t('nodeStatus')}:</div>
                <div>
                  <span style={{
                    fontSize: '0.8em', padding: '1px 8px', borderRadius: '10px',
                    background: config.status === 'online' ? '#e8f5e9' : '#f5f5f5',
                    color: config.status === 'online' ? '#2e7d32' : '#999',
                    fontWeight: 500,
                  }}>
                    {config.status}
                  </span>
                </div>
                <div style={{ color: '#888' }}>{t('nodeVersion')}:</div>
                <div style={{ color: '#333' }}>{config.version || 'unknown'}</div>
                <div style={{ color: '#888' }}>{t('nodePlatform')}:</div>
                <div style={{ color: '#333' }}>{config.os} / {config.arch}</div>
              </div>
            </div>

            {/* Backup server config */}
            <div style={{
              background: '#f8f9fa', borderRadius: '8px', padding: '16px',
              marginBottom: '20px',
            }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '0.95em', color: '#333' }}>{t('backupServer')}</h3>
              <input
                value={backupServer}
                onChange={(e) => setBackupServer(e.target.value)}
                placeholder={t('backupServerPlaceholder')}
                style={{
                  width: '100%', padding: '10px', borderRadius: '6px',
                  border: '1px solid #ddd', fontSize: '0.9em', boxSizing: 'border-box',
                  marginBottom: '12px',
                }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleSave}
                  disabled={!backupServer.trim()}
                  style={{
                    padding: '8px 20px',
                    background: saved ? '#4caf50' : '#1976d2',
                    color: '#fff', border: 'none', borderRadius: '6px',
                    cursor: !backupServer.trim() ? 'not-allowed' : 'pointer',
                    fontSize: '0.85em', fontWeight: 600,
                  }}
                >
                  {saved ? t('serverSaved') : t('save')}
                </button>
                <button
                  onClick={handleSwitch}
                  disabled={switching || !backupServer.trim()}
                  style={{
                    padding: '8px 20px',
                    background: switching ? '#ccc' : '#e53935',
                    color: '#fff', border: 'none', borderRadius: '6px',
                    cursor: switching || !backupServer.trim() ? 'not-allowed' : 'pointer',
                    fontSize: '0.85em', fontWeight: 600,
                  }}
                >
                  {switching ? t('saving') + '...' : t('switchServer')}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                background: '#ffebee', color: '#c62828', padding: '8px 12px',
                borderRadius: '6px', fontSize: '0.85em', marginBottom: '12px',
              }}>
                {error}
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px', color: '#e53935' }}>{error || t('unknownError')}</div>
        )}
      </div>
    </div>
  );
}
