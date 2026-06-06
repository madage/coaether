import { useState, useEffect, useRef, useCallback } from 'react';
import { useLang } from '../i18n/context';
import { invitations as invitationsApi, workspaces as workspacesApi } from '../api/client';
import type { PendingInvitation } from '../types';

interface Props {
  onWorkspaceChange?: () => void;
}

export default function NotificationBell({ onWorkspaceChange }: Props) {
  const { t, lang } = useLang();
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invitationsApi.pending();
      setInvitations(res.invitations || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount and poll every 30s
  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 30000);
    return () => clearInterval(interval);
  }, [fetchPending]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        bellRef.current &&
        !bellRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleAccept = async (inv: PendingInvitation) => {
    try {
      const res = await invitationsApi.accept(inv.token);
      if (res.workspace_id) {
        localStorage.setItem('workspace_id', res.workspace_id);
      }
      setInvitations(prev => prev.filter(i => i.id !== inv.id));
      setMessage(t('invitationAccepted'));
      setTimeout(() => setMessage(null), 3000);
      onWorkspaceChange?.();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to accept');
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleDecline = async (inv: PendingInvitation) => {
    try {
      await invitationsApi.decline(inv.token);
      setInvitations(prev => prev.filter(i => i.id !== inv.id));
      setMessage(t('invitationDeclined'));
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to decline');
      setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={bellRef}
        onClick={() => setOpen(!open)}
        title={t('pendingInvitations')}
        style={{
          background: 'none',
          border: 'none',
          color: '#ccc',
          cursor: 'pointer',
          fontSize: '1.1em',
          padding: '4px',
          position: 'relative',
          lineHeight: 1,
        }}
      >
        🔔
        {invitations.length > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-2px',
              right: '-6px',
              background: '#f44336',
              color: '#fff',
              borderRadius: '50%',
              width: '16px',
              height: '16px',
              fontSize: '10px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            {invitations.length > 9 ? '9+' : invitations.length}
          </span>
        )}
      </button>

      {message && (
        <div style={{
          position: 'absolute',
          bottom: '-28px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#333',
          color: '#fff',
          padding: '4px 10px',
          borderRadius: '4px',
          fontSize: '0.75em',
          whiteSpace: 'nowrap',
          zIndex: 100,
        }}>
          {message}
        </div>
      )}

      {open && (
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            left: '36px',
            top: '-8px',
            width: '320px',
            maxHeight: '400px',
            overflow: 'auto',
            background: '#fff',
            borderRadius: '10px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            zIndex: 3000,
            color: '#333',
          }}
        >
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid #eee',
            fontWeight: 600,
            fontSize: '0.9em',
            color: '#666',
          }}>
            {t('pendingInvitations')}
          </div>

          {loading && invitations.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#999', fontSize: '0.85em' }}>
              {t('loading')}...
            </div>
          ) : invitations.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#999', fontSize: '0.85em' }}>
              {t('noPendingInvitations')}
            </div>
          ) : (
            invitations.map((inv) => (
              <div key={inv.id} style={{
                padding: '12px 16px',
                borderBottom: '1px solid #f5f5f5',
              }}>
                <div style={{ fontSize: '0.85em', marginBottom: '8px', lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 500 }}>{inv.inviter_name}</span>
                  {lang === 'zh' ? ' 邀请你加入工作区 ' : ' invited you to '}
                  <span style={{ fontWeight: 500 }}>{inv.workspace_name}</span>
                </div>
                <div style={{ fontSize: '0.75em', color: '#999', marginBottom: '8px' }}>
                  {new Date(inv.created_at).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleAccept(inv)}
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      background: '#1976d2',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '0.82em',
                      fontWeight: 600,
                    }}
                  >
                    {t('accept')}
                  </button>
                  <button
                    onClick={() => handleDecline(inv)}
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: '1px solid #ddd',
                      background: '#fff',
                      color: '#666',
                      cursor: 'pointer',
                      fontSize: '0.82em',
                    }}
                  >
                    {t('decline')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
