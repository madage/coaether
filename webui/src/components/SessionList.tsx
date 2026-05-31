import { useLang } from '../i18n/context';
import type { Session } from '../types';

interface SessionListProps {
  sessions: Session[];
  onSelect?: (session: Session) => void;
}

export function SessionList({ sessions, onSelect }: SessionListProps) {
  const { t } = useLang();

  const statusColors: Record<string, string> = {
    pending: '#ff9800',
    running: '#2196f3',
    paused: '#9e9e9e',
    completed: '#4caf50',
    failed: '#f44336',
  };

  const statusLabels: Record<string, string> = {
    pending: t('sessionPending'),
    running: t('sessionRunning'),
    paused: t('sessionPaused'),
    completed: t('sessionStatusCompleted'),
    failed: t('sessionStatusFailed'),
  };

  if (sessions.length === 0) {
    return <div className="empty">{t('noSessions')}</div>;
  }

  return (
    <div className="session-list">
      <h3>{t('sessions')} ({sessions.length})</h3>
      {sessions.map((session) => (
        <div
          key={session.id}
          className="session-card"
          onClick={() => onSelect?.(session)}
          style={{
            padding: '12px',
            margin: '8px 0',
            borderRadius: '6px',
            cursor: 'pointer',
            background: '#fafafa',
            border: '1px solid #e0e0e0',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {session.prompt.substring(0, 60)}
              {session.prompt.length > 60 ? '...' : ''}
            </div>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '0.8em',
                color: '#fff',
                background: statusColors[session.status] || '#999',
                whiteSpace: 'nowrap',
              }}
            >
              {statusLabels[session.status] || session.status}
            </span>
          </div>
          <div style={{ fontSize: '0.85em', color: '#666', marginTop: '4px' }}>
            {t('workspace')}: {session.workspace} | {t('created')}: {new Date(session.created_at).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
