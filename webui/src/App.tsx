import { useState, useCallback, useEffect, useRef } from 'react';
import { Terminal } from './components/Terminal';
import { NodeList } from './components/NodeList';
import { SessionList } from './components/SessionList';
import { CreateSession } from './components/CreateSession';
import { LangSwitcher } from './components/LangSwitcher';
import { useWebSocket } from './hooks/useWebSocket';
import { useDashboardWS } from './hooks/useDashboardWS';
import { useLang } from './i18n/context';
import { auth as authApi, sessions as sessionsApi } from './api/client';
import type { Node, Session, AuthState } from './types';

type Page = 'nodes' | 'sessions' | 'terminal';

function App() {
  const { t, lang } = useLang();
  const [auth, setAuth] = useState<AuthState>({ token: null, user: null });
  const [page, setPage] = useState<Page>('nodes');
  const [activeSessionID, setActiveSessionID] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  // Real-time dashboard data (nodes + sessions)
  const { nodes, sessions } = useDashboardWS();
  // Track whether we've received WS data for the current session
  const receivedData = useRef(false);

  // Check for existing token
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try {
        setAuth({ token, user: JSON.parse(userStr) });
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
  }, []);

  // WebSocket hook for terminal — clear "waiting" on first data
  const onOutput = useCallback((data: string) => {
    if (!receivedData.current) {
      receivedData.current = true;
      Terminal.clear();
    }
    Terminal.write(data);
  }, []);

  const onTaskResult = useCallback((success: boolean, error?: string) => {
    if (success) {
      Terminal.writeln(`\r\n\x1b[32m${t('sessionCompleted')}\x1b[0m`);
    } else {
      Terminal.writeln(`\r\n\x1b[31m${t('sessionFailed')}${error || t('unknownError')}]\x1b[0m`);
    }
  }, [t]);

  const { sendInput } = useWebSocket({
    sessionID: activeSessionID || '',
    onOutput,
    onTaskResult,
  });

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    try {
      const fn = isRegister ? authApi.register : authApi.login;
      const data = await fn(username, password);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setAuth({ token: data.token, user: data.user });
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : t('authFailed'));
    }
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setAuth({ token: null, user: null });
  }

  function handleNodeSelect(node: Node) {
    void node;
  }

  async function handleSessionSelect(session: Session) {
    receivedData.current = false;
    setActiveSessionID(session.id);
    setPage('terminal');

    // Defer to let UI update
    setTimeout(async () => {
      if (session.status === 'completed' || session.status === 'failed') {
        Terminal.writeln('Loading...');
        try {
          const detail = await sessionsApi.getByID(session.id);
          if (detail.output_log) {
            Terminal.clear();
            Terminal.write(detail.output_log);
          } else {
            Terminal.clear();
            Terminal.writeln(t('sessionCompleted'));
          }
          if (detail.error_log) {
            Terminal.writeln(`\r\n\x1b[31mError: ${detail.error_log}\x1b[0m`);
          }
        } catch {
          Terminal.clear();
          Terminal.writeln(t('sessionCompleted'));
        }
      } else {
        // For pending/running sessions, show waiting message
        Terminal.writeln(t('waitingForSession'));
      }
    }, 0);
  }

  function handleSessionCreated(sessionID: string) {
    receivedData.current = false;
    setActiveSessionID(sessionID);
    setPage('terminal');

    setTimeout(() => {
      Terminal.writeln(t('waitingForSession'));
    }, 0);
  }

  // Login screen
  if (!auth.token) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', top: 16, right: 16 }}>
          <LangSwitcher />
        </div>
        <div
          style={{
            background: '#fff',
            padding: '40px',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            width: '360px',
          }}
        >
          <h1 style={{ margin: '0 0 24px', textAlign: 'center', color: '#1a1a2e' }}>{t('appTitle')}</h1>
          <p style={{ textAlign: 'center', color: '#666', marginBottom: '24px' }}>
            {t('appSubtitle')}
          </p>

          <form onSubmit={handleAuth}>
            <div style={{ marginBottom: '16px' }}>
              <input
                type="text"
                placeholder={t('username')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <input
                type="password"
                placeholder={t('password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
                required
              />
            </div>

            {authError && (
              <div style={{ color: '#f44336', marginBottom: '12px', fontSize: '0.9em' }}>{authError}</div>
            )}

            <button type="submit" style={buttonStyle}>
              {isRegister ? t('register') : t('login')}
            </button>

            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => setIsRegister(!isRegister)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#1976d2',
                  cursor: 'pointer',
                  fontSize: '0.9em',
                }}
              >
                {isRegister ? t('alreadyHasAccount') : t('noAccount')}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Main app
  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f5f5f5' }}>
      {/* Sidebar */}
      <div
        style={{
          width: '280px',
          background: '#1a1a2e',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '20px', borderBottom: '1px solid #333' }}>
          <h2 style={{ margin: 0, fontSize: '1.3em' }}>{t('appTitle')}</h2>
          <div style={{ fontSize: '0.85em', color: '#999', marginTop: '4px' }}>
            {auth.user?.username}
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', padding: '8px' }}>
          {(['nodes', 'sessions', 'terminal'] as Page[]).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              style={{
                padding: '12px 16px',
                textAlign: 'left',
                background: page === p ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.95em',
                marginBottom: '2px',
              }}
            >
              {p === 'nodes' ? `📡 ${t('navNodes')}` : p === 'sessions' ? `📋 ${t('navSessions')}` : `💻 ${t('navTerminal')}`}
            </button>
          ))}
        </nav>

        <div style={{ marginTop: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <LangSwitcher />
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '8px',
              background: 'transparent',
              color: '#999',
              border: '1px solid #333',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {t('logout')}
          </button>
        </div>
      </div>

      {/* Main content area with overlay approach for terminal persistence */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {/* Nodes page */}
        <div style={{ display: page === 'nodes' ? 'block' : 'none', padding: '24px', maxWidth: '800px' }}>
          <h2>{t('agentNodes')}</h2>
          <NodeList nodes={nodes} onSelect={handleNodeSelect} />
          <div style={{ fontSize: '0.85em', color: '#999', marginTop: '8px' }}>
            {sessions.length} {t('sessions').toLowerCase()} | {t('navNodes').toLowerCase()}: {nodes.length}
          </div>
        </div>

        {/* Sessions page */}
        <div style={{ display: page === 'sessions' ? 'flex' : 'none', maxWidth: '1200px', height: '100%' }}>
          <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
            <SessionList sessions={sessions} onSelect={handleSessionSelect} />
          </div>
          <div style={{ width: '400px', borderLeft: '1px solid #e0e0e0', overflow: 'auto' }}>
            <CreateSession nodes={nodes} onCreated={handleSessionCreated} />
          </div>
        </div>

        {/* Terminal page — always rendered but hidden when not active */}
        <div style={{ display: page === 'terminal' ? 'flex' : 'none', padding: '24px', height: '100%', flexDirection: 'column' }}>
          <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h3 style={{ margin: 0 }}>
              {t('session')}: {activeSessionID ? activeSessionID.substring(0, 8) + '...' : t('none')}
            </h3>
            <button
              onClick={() => {
                setActiveSessionID(null);
                setPage('nodes');
              }}
              style={{
                padding: '6px 12px',
                background: '#f44336',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.85em',
              }}
            >
              {t('disconnect')}
            </button>
          </div>
          <div style={{ flex: 1 }}>
            <Terminal onInput={sendInput} />
          </div>
          {!activeSessionID && (
            <div style={{ marginTop: '12px', padding: '16px', background: '#fff3e0', borderRadius: '6px', color: '#e65100' }}>
              {t('noActiveSession')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  borderRadius: '6px',
  border: '1px solid #ddd',
  fontSize: '1em',
  boxSizing: 'border-box',
};

const buttonStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  background: '#1976d2',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '1em',
  fontWeight: 600,
};

export default App;
