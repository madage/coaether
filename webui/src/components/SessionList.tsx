import { useEffect, useState } from 'react';
import { sessions as sessionsApi } from '../api/client';
import type { Session } from '../types';

export function SessionList({ onSelect }: { onSelect?: (session: Session) => void }) {
  const [sessionList, setSessionList] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    try {
      setLoading(true);
      const data = await sessionsApi.list();
      setSessionList(data.sessions);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }

  const statusColors: Record<string, string> = {
    pending: '#ff9800',
    running: '#2196f3',
    paused: '#9e9e9e',
    completed: '#4caf50',
    failed: '#f44336',
  };

  if (loading) {
    return <div className="loading">Loading sessions...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (sessionList.length === 0) {
    return <div className="empty">No sessions yet. Create one to get started.</div>;
  }

  return (
    <div className="session-list">
      <h3>Sessions ({sessionList.length})</h3>
      {sessionList.map((session) => (
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
              {session.status}
            </span>
          </div>
          <div style={{ fontSize: '0.85em', color: '#666', marginTop: '4px' }}>
            Workspace: {session.workspace} | Created: {new Date(session.created_at).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
