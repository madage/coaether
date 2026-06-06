import { useState, useCallback, useEffect, useRef } from 'react';
import { useLang } from '../i18n/context';
import { nodes as nodesApi } from '../api/client';

interface AddNodeDialogProps {
  onClose: () => void;
}

type Platform = 'mac' | 'windows';

export function AddNodeDialog({ onClose }: AddNodeDialogProps) {
  const { t } = useLang();
  const [nodeName, setNodeName] = useState('');
  const [command, setCommand] = useState<string | null>(null);
  const [commandPS1, setCommandPS1] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<'idle' | 'waiting' | 'connected'>('idle');
  const [platform, setPlatform] = useState<Platform>('mac');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!nodeName.trim()) return;
    setLoading(true);
    setError(null);
    setStatus('idle');
    try {
      const res = await nodesApi.generateToken(nodeName.trim());
      setCommand(res.command);
      setCommandPS1((res as any).command_ps1 || null);
      setExpiresAt(res.expires_at);
      setStatus('waiting');

      // Start polling for node connection (check node list for tok- prefix)
      const deadline = new Date(res.expires_at).getTime();
      pollingRef.current = setInterval(async () => {
        try {
          const nodeList = await nodesApi.list();
          const found = nodeList.nodes.some(n => n.id.startsWith('tok-'));
          if (found) {
            setStatus('connected');
            if (pollingRef.current) clearInterval(pollingRef.current);
          }
        } catch {
          // ignore polling errors
        }
        // Stop polling if token expired
        if (Date.now() > deadline) {
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
      }, 2000);
    } catch (err: any) {
      setError(err.message || t('alreadyHasNode'));
    } finally {
      setLoading(false);
    }
  }, [nodeName, t]);

  const currentCommand = platform === 'mac' ? command : (commandPS1 || command);

  const handleCopy = useCallback(async () => {
    if (!currentCommand) return;
    try {
      await navigator.clipboard.writeText(currentCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
      const el = document.createElement('textarea');
      el.value = currentCommand;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [currentCommand]);

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
          width: '580px', maxWidth: '90vw', maxHeight: '85vh', overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
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

        <h2 style={{ margin: '0 0 8px', color: '#1a1a2e' }}>{t('addNodeTitle')}</h2>

        {/* Step info */}
        <div style={{
          background: '#e3f2fd', borderRadius: '8px', padding: '12px',
          marginBottom: '20px', fontSize: '0.85em', color: '#1565c0', lineHeight: 1.5,
        }}>
          {t('step1')}
        </div>

        {/* Node name input */}
        {!command && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: '#333', fontSize: '0.9em' }}>
              {t('nodeName')}
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={nodeName}
                onChange={(e) => setNodeName(e.target.value)}
                placeholder={t('nodeNamePlaceholder')}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                style={{
                  flex: 1, padding: '10px', borderRadius: '6px',
                  border: '1px solid #ddd', fontSize: '1em', boxSizing: 'border-box',
                }}
              />
              <button
                onClick={handleGenerate}
                disabled={loading || !nodeName.trim()}
                style={{
                  padding: '10px 20px',
                  background: loading ? '#ccc' : '#1976d2',
                  color: '#fff', border: 'none', borderRadius: '6px',
                  cursor: loading || !nodeName.trim() ? 'not-allowed' : 'pointer',
                  fontSize: '0.9em', fontWeight: 600, whiteSpace: 'nowrap',
                }}
              >
                {loading ? t('loading') + '...' : t('generateCommand')}
              </button>
            </div>
            {error && (
              <div style={{ color: '#d32f2f', fontSize: '0.85em', marginTop: '6px' }}>{error}</div>
            )}
          </div>
        )}

        {/* Command display */}
        {command && (
          <>
            {/* Platform tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
              <button
                onClick={() => { setPlatform('mac'); setCopied(false); }}
                style={{
                  padding: '6px 16px', border: 'none', borderRadius: '6px 6px 0 0',
                  background: platform === 'mac' ? '#1a1a2e' : '#e0e0e0',
                  color: platform === 'mac' ? '#fff' : '#666',
                  cursor: 'pointer', fontSize: '0.85em', fontWeight: 500,
                }}
              >
                {t('runOnMac')}
              </button>
              <button
                onClick={() => { setPlatform('windows'); setCopied(false); }}
                style={{
                  padding: '6px 16px', border: 'none', borderRadius: '6px 6px 0 0',
                  background: platform === 'windows' ? '#1a1a2e' : '#e0e0e0',
                  color: platform === 'windows' ? '#fff' : '#666',
                  cursor: 'pointer', fontSize: '0.85em', fontWeight: 500,
                }}
              >
                {t('runOnWindows')}
              </button>
            </div>

            <div style={{
              background: '#1a1a2e', borderRadius: '0 8px 8px 8px', padding: '16px',
              marginBottom: '12px', position: 'relative',
            }}>
              <pre style={{
                margin: 0, color: '#a8d8ea', fontSize: '0.82em',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                lineHeight: 1.6, fontFamily: "'Fira Code', 'Consolas', monospace",
              }}>
                {currentCommand}
              </pre>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <button
                onClick={handleCopy}
                style={{
                  padding: '8px 20px',
                  background: copied ? '#4caf50' : '#1976d2',
                  color: '#fff', border: 'none', borderRadius: '6px',
                  cursor: 'pointer', fontSize: '0.9em', fontWeight: 600,
                }}
              >
                {copied ? t('copied') : t('copyCommand')}
              </button>
            </div>

            {/* Status indicator */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '12px', borderRadius: '8px',
              background: status === 'connected' ? '#e8f5e9' : status === 'waiting' ? '#fff8e1' : '#f5f5f5',
              color: status === 'connected' ? '#2e7d32' : status === 'waiting' ? '#f57f17' : '#999',
              fontSize: '0.85em',
            }}>
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block',
                background: status === 'connected' ? '#4caf50' : status === 'waiting' ? '#ff9800' : '#ccc',
              }} />
              {status === 'connected' ? t('nodeAdded') :
               status === 'waiting' ? t('waitingNode') :
               expiresAt ? `Token expires at ${new Date(expiresAt).toLocaleTimeString()}` : ''}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
