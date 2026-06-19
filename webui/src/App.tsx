import { useState, useCallback, useRef, useEffect } from 'react';
import { useMessageBus, type Envelope, type ContentBlock } from './hooks/useMessageBus';
import { NodeList } from './components/NodeList';
import { AddNodeDialog } from './components/AddNodeDialog';
import { AgentList } from './components/AgentList';
import { AgentFolderPanel } from './components/AgentFolderPanel';
import { TaskBoard } from './components/TaskBoard';
import { ProjectList } from './components/ProjectList';
import { TrashView } from './components/TrashView';
import { RuleList } from './components/RuleList';
import { SkillList } from './components/SkillList';
import { ToolSet } from './components/ToolSet';
import { LogViewer } from './components/LogViewer';
import { AgentQueuePanel } from './components/AgentQueuePanel';
import { WorkflowList } from './components/WorkflowList';
import { FloatingChat } from './components/FloatingChat';
import { LangSwitcher } from './components/LangSwitcher';
import WorkspaceMembers from './components/WorkspaceMembers';
import NotificationBell from './components/NotificationBell';
import { useDashboardWSContext } from './hooks/DashboardWSContext';
import { useResourceSync } from './hooks/useResourceSync';
import { useLang } from './i18n/context';
import { auth as authApi, workspaces as workspacesApi, workspaceMembers as workspaceMembersApi, invitations as invitationsApi, users as usersApi, tokens as tokensApi } from './api/client';
import type { Node, Session, AuthState, Workspace, WorkspaceRole, WorkspaceMember, UserSummary, ApiToken } from './types';
import WorkspaceContext from './hooks/WorkspaceContext';

type Page = 'nodes' | 'tasks' | 'rules' | 'projects' | 'agents' | 'tools' | 'skills' | 'agent-queue' | 'workflows' | 'logs' | 'trash';

function App() {
  const { t, lang } = useLang();
  const [auth, setAuth] = useState<AuthState>(() => {
    const token = localStorage.getItem('token');
    const raw = localStorage.getItem('user');
    const wsId = localStorage.getItem('workspace_id');
    if (token && raw) {
      try {
        return { token, user: JSON.parse(raw), workspace_id: wsId, workspace_role: null };
      } catch {
        // corrupted user data, ignore
      }
    }
    return { token: null, user: null, workspace_id: null, workspace_role: null };
  });
  const [page, setPage] = useState<Page>(() => {
    const saved = localStorage.getItem('page') as Page | null;
    return saved || 'nodes';
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [captchaCode, setCaptchaCode] = useState('');
  const [captchaCooldown, setCaptchaCooldown] = useState(0);
  const [captchaSent, setCaptchaSent] = useState(false);
  const [captchaDefaultCode, setCaptchaDefaultCode] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const { nodes, sessions, connected: dashboardConnected, subscribeNotification } = useDashboardWSContext();
  const [toast, setToast] = useState<{ title: string; message: string } | null>(null);
  const [showAddNode, setShowAddNode] = useState(false);
  const [targetTaskId, setTargetTaskId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('page', page);
  }, [page]);

  // Captcha countdown timer
  useEffect(() => {
    if (captchaCooldown <= 0) return;
    const timer = setInterval(() => {
      setCaptchaCooldown((prev) => {
        if (prev <= 1) {
          localStorage.removeItem('captcha_deadline');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [captchaCooldown]);

  // Restore captcha countdown on mount (survives refresh)
  useEffect(() => {
    const stored = localStorage.getItem('captcha_deadline');
    if (stored) {
      const deadline = parseInt(stored, 10);
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (remaining > 0) {
        setCaptchaCooldown(remaining);
        setCaptchaSent(true);
      } else {
        localStorage.removeItem('captcha_deadline');
      }
    }
  }, []);

  // Invitation token from URL
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const [invitationInfo, setInvitationInfo] = useState<{
    workspace_name?: string;
    inviter_name?: string;
    status?: string;
  } | null>(null);

  // Check URL for invitation token on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setInvitationToken(token);
      invitationsApi.get(token).then((info) => {
        setInvitationInfo({
          workspace_name: info.workspace_name,
          inviter_name: info.inviter_name,
          status: 'valid',
        });
      }).catch((err) => {
        setInvitationInfo({ status: err.message || 'invalid' });
      });
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Handle invitation accept when user is logged in
  useEffect(() => {
    if (auth.token && invitationToken && invitationInfo?.status === 'valid') {
      invitationsApi.accept(invitationToken).then((res) => {
        if (res.workspace_id) {
          localStorage.setItem('workspace_id', res.workspace_id);
          setInvitationToken(null);
          setInvitationInfo(null);
          // Refresh workspaces to get updated list
          workspacesApi.list().then((wsRes) => {
            setWorkspaces(wsRes.workspaces);
            const ws = wsRes.workspaces.find(w => w.id === res.workspace_id);
            setAuth(prev => ({
              ...prev,
              workspace_id: res.workspace_id || prev.workspace_id,
              workspace_role: (ws?.role as WorkspaceRole) || prev.workspace_role,
            }));
          }).catch(() => {});
        }
      }).catch(() => {});
    }
  }, [auth.token, invitationToken, invitationInfo]);

  // Workspace state
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const [showWorkspaceManager, setShowWorkspaceManager] = useState(false);
  const [wsManagerTab, setWsManagerTab] = useState<'workspaces' | 'members' | 'tokens'>('workspaces');
  const [newWsName, setNewWsName] = useState('');
  const [newWsDesc, setNewWsDesc] = useState('');

  // User management state
  const [userList, setUserList] = useState<UserSummary[]>([]);
  const [userDeleteVerify, setUserDeleteVerify] = useState<{
    userId: string; email: string; a: number; b: number; op: '+' | '-'; answer: number;
  } | null>(null);
  const [userVerifyInput, setUserVerifyInput] = useState('');

  // Token management state
  const [tokenList, setTokenList] = useState<ApiToken[]>([]);
  const [showCreateToken, setShowCreateToken] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenExpiry, setNewTokenExpiry] = useState('7d');
  const [revealedToken, setRevealedToken] = useState<string | null>(null);

  // Workspace delete verification
  const [wsDeleteVerify, setWsDeleteVerify] = useState<{
    id: string; a: number; b: number; op: '+' | '-'; answer: number;
  } | null>(null);
  const [wsVerifyInput, setWsVerifyInput] = useState('');
  const [wsVerifyError, setWsVerifyError] = useState(false);

  // Fetch workspaces when authenticated
  useEffect(() => {
    if (auth.token) {
      workspacesApi.list().then((res) => {
        setWorkspaces(res.workspaces);
        const currentWsId = localStorage.getItem('workspace_id');
        const currentWs = res.workspaces.find(w => w.id === currentWsId);
        if (currentWs?.role) {
          setAuth(prev => ({ ...prev, workspace_role: currentWs.role as WorkspaceRole }));
        }
      }).catch(() => {});
    }
  }, [auth.token]);

  const [pendingPermissions, setPendingPermissions] = useState<Envelope[]>([]);

  // Permission mode: 'auto' (auto-approve) or 'restricted' (require user input)
  const [permissionMode, setPermissionMode] = useState<'auto' | 'restricted'>('auto');
  const permissionModeRef = useRef(permissionMode);
  permissionModeRef.current = permissionMode;

  // Message Bus — only connect when authenticated
  const bus = useMessageBus({
    userID: auth.user?.id || 'anonymous',
    workspaceID: auth.workspace_id || undefined,
    onMessage: useCallback((env: Envelope) => {
      if (env.type === 'permission.request') {
        if (permissionModeRef.current === 'auto') {
          const sid = sessionIDRef.current;
          if (sid) {
            bus.send({
              type: 'permission.response',
              to: `session://${sid}`,
              session_id: sid,
              payload: {
                tool_use_id: env.payload?.tool_use_id,
                approved: true,
              },
            });
          } else {
            setPendingPermissions((prev) => [...prev, env]);
          }
        } else {
          setPendingPermissions((prev) => [...prev, env]);
        }
      }
    }, []),
  });

  const sessionIDRef = useRef<string | null>(null);
  sessionIDRef.current = bus.sessionID;

  const sendPermissionResponse = useCallback((approved: boolean) => {
    const queue = pendingPermissions;
    if (queue.length === 0 || !bus.sessionID) return;
    for (const req of queue) {
      bus.send({
        type: 'permission.response',
        to: `session://${bus.sessionID}`,
        session_id: bus.sessionID,
        payload: {
          tool_use_id: req.payload?.tool_use_id,
          approved,
        },
      });
    }
    setPendingPermissions([]);
  }, [pendingPermissions, bus]);

  const handleNodeSelect = useCallback((node: Node) => {
    void node;
  }, []);

  const handleSessionSelect = useCallback((session: Session) => {
    bus.joinSession(session.id);
  }, [bus]);

  const handleSessionCreated = useCallback(async (sessionID: string) => {
    bus.joinSession(sessionID);
  }, [bus]);

  const handleSendCaptcha = useCallback(async () => {
    if (!email || captchaCooldown > 0) return;
    try {
      const res = await authApi.sendCaptcha(email);
      const remaining = Math.max(0, Math.ceil((res.next_send_at * 1000 - Date.now()) / 1000));
      setCaptchaCooldown(remaining);
      setCaptchaSent(true);
      setCaptchaDefaultCode(res.default_code || '8888');
      localStorage.setItem('captcha_deadline', String(Date.now() + remaining * 1000));
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to send code');
    }
  }, [email, captchaCooldown]);

  const handleSendBlocks = useCallback((blocks: ContentBlock[]) => {
    if (!bus.sessionID) return false;
    return bus.send({
      type: 'message',
      to: `session://${bus.sessionID}`,
      session_id: bus.sessionID,
      payload: { content: blocks },
    });
  }, [bus.sessionID, bus.send]);

  const handleWorkspaceChange = useCallback(async () => {
    try {
      const res = await workspacesApi.list();
      setWorkspaces(res.workspaces);
      const currentWsId = localStorage.getItem('workspace_id');
      const currentWs = res.workspaces.find(w => w.id === currentWsId);
      if (currentWs?.role) {
        setAuth(prev => ({ ...prev, workspace_role: currentWs.role as WorkspaceRole }));
      }
      setWorkspaceKey((k) => k + 1);
    } catch {}
  }, []);

  const handleOpenTask = useCallback((taskId: string) => {
    setTargetTaskId(taskId);
    setPage('tasks');
  }, []);

  // Auto-refresh workspaces on WebSocket resource_change signal
  useResourceSync("workspaces", handleWorkspaceChange);

  // In-app notification toast from WebSocket
  useEffect(() => {
    if (!auth.token) return;
    const unsub = subscribeNotification((n) => {
      setToast(n);
      setTimeout(() => setToast(null), 5000);
    });
    return unsub;
  }, [auth.token, subscribeNotification]);

  const handleCreateWorkspace = useCallback(async () => {
    if (!newWsName.trim()) return;
    try {
      await workspacesApi.create({ name: newWsName, description: newWsDesc });
      setNewWsName('');
      setNewWsDesc('');
      const res = await workspacesApi.list();
      setWorkspaces(res.workspaces);
    } catch {
      alert('Failed to create workspace');
    }
  }, [newWsName, newWsDesc]);

  const handleDeleteWorkspace = useCallback(async (id: string) => {
    try {
      await workspacesApi.delete(id);
      const res = await workspacesApi.list();
      setWorkspaces(res.workspaces);
      if (id === localStorage.getItem('workspace_id')) {
        const firstWs = res.workspaces[0];
        if (firstWs) {
          localStorage.setItem('workspace_id', firstWs.id);
          setWorkspaceKey((k) => k + 1);
        }
      }
    } catch {
      alert('Failed to delete workspace');
    }
  }, []);

  const handleWsDeleteClick = useCallback((id: string) => {
    const a = Math.floor(Math.random() * 20) + 1;
    const b = Math.floor(Math.random() * 20) + 1;
    const op = Math.random() > 0.5 ? '+' : '-';
    const answer = op === '+' ? a + b : Math.max(a, b) - Math.min(a, b);
    const [na, nb] = op === '+' ? [a, b] : [Math.max(a, b), Math.min(a, b)];
    setWsDeleteVerify({ id, a: na, b: nb, op, answer });
    setWsVerifyInput('');
    setWsVerifyError(false);
  }, []);

  const handleWsDeleteConfirm = useCallback(async () => {
    if (!wsDeleteVerify) return;
    const userAnswer = parseInt(wsVerifyInput, 10);
    if (isNaN(userAnswer) || userAnswer !== wsDeleteVerify.answer) {
      setWsVerifyError(true);
      return;
    }
    const id = wsDeleteVerify.id;
    setWsDeleteVerify(null);
    setWsVerifyInput('');
    setWsVerifyError(false);
    await handleDeleteWorkspace(id);
  }, [wsDeleteVerify, wsVerifyInput, handleDeleteWorkspace]);

  // User management
  const fetchUsers = useCallback(async () => {
    try {
      const res = await usersApi.list();
      setUserList(res.users);
    } catch {
      // silently fail
    }
  }, []);

  const handleUserDeleteClick = useCallback((userId: string, userEmail: string) => {
    const a = Math.floor(Math.random() * 20) + 1;
    const b = Math.floor(Math.random() * 20) + 1;
    const op = Math.random() > 0.5 ? '+' : '-';
    const answer = op === '+' ? a + b : Math.max(a, b) - Math.min(a, b);
    const [na, nb] = op === '+' ? [a, b] : [Math.max(a, b), Math.min(a, b)];
    setUserDeleteVerify({ userId, email: userEmail, a: na, b: nb, op, answer });
    setUserVerifyInput('');
  }, []);

  const handleUserDeleteConfirm = useCallback(async () => {
    if (!userDeleteVerify) return;
    const userAnswer = parseInt(userVerifyInput, 10);
    if (isNaN(userAnswer) || userAnswer !== userDeleteVerify.answer) {
      alert(lang === 'zh' ? '答案错误' : 'Wrong answer');
      return;
    }
    try {
      await usersApi.delete(userDeleteVerify.userId);
      setUserDeleteVerify(null);
      setUserVerifyInput('');
      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete user');
    }
  }, [userDeleteVerify, userVerifyInput, fetchUsers, lang]);

  // Token management
  const fetchTokens = useCallback(async () => {
    try {
      const res = await tokensApi.list();
      setTokenList(res.tokens);
    } catch {
      // silently fail
    }
  }, []);

  const handleCreateToken = useCallback(async () => {
    if (!newTokenName.trim()) return;
    try {
      const res = await tokensApi.create({ name: newTokenName.trim(), expiry: newTokenExpiry as '7d' | '30d' | '90d' | 'permanent' });
      setRevealedToken(res.token);
      setNewTokenName('');
      setShowCreateToken(false);
      fetchTokens();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create token');
    }
  }, [newTokenName, newTokenExpiry, fetchTokens]);

  const handleRevokeToken = useCallback(async (id: string) => {
    try {
      await tokensApi.delete(id);
      fetchTokens();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to revoke token');
    }
  }, [fetchTokens]);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback
    }
  }, []);

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
            width: '400px',
          }}
        >
          <h1 style={{ margin: '0 0 24px', textAlign: 'center', color: '#1a1a2e' }}>{t('appTitle')}</h1>
          <p style={{ textAlign: 'center', color: '#666', marginBottom: '24px' }}>
            {t('appSubtitle')}
          </p>

          {/* Invitation info banner */}
          {invitationInfo?.status === 'valid' && (
            <div style={{
              background: '#e8f5e9', borderRadius: '8px', padding: '12px',
              marginBottom: '16px', fontSize: '0.9em', color: '#2e7d32',
            }}>
              {lang === 'zh' ? (
                <>你已被 <strong>{invitationInfo.inviter_name}</strong> 邀请加入工作区 <strong>{invitationInfo.workspace_name}</strong></>
              ) : (
                <>You've been invited by <strong>{invitationInfo.inviter_name}</strong> to join workspace <strong>{invitationInfo.workspace_name}</strong></>
              )}
              <div style={{ marginTop: '4px', fontSize: '0.85em' }}>
                {lang === 'zh' ? '登录或注册后将自动接受邀请' : 'Login or register to accept the invitation'}
              </div>
            </div>
          )}

          {invitationInfo?.status && invitationInfo.status !== 'valid' && (
            <div style={{
              background: '#fbe9e7', borderRadius: '8px', padding: '12px',
              marginBottom: '16px', fontSize: '0.9em', color: '#c62828',
            }}>
              {invitationInfo.status}
            </div>
          )}

          <form onSubmit={async (e) => {
            e.preventDefault();
            setAuthError(null);
            try {
              const data = isRegister
                ? await authApi.register(email, password, confirmPassword, captchaCode, invitationToken || undefined)
                : await authApi.login(email, password);
              localStorage.setItem('token', data.token);
              localStorage.setItem('user', JSON.stringify(data.user));
              if (data.workspace_id) {
                localStorage.setItem('workspace_id', data.workspace_id);
              }
              setAuth({ token: data.token, user: data.user, workspace_id: data.workspace_id || null, workspace_role: null });
            } catch (err) {
              setAuthError(err instanceof Error ? err.message : t('authFailed'));
            }
          }}>
            <div style={{ marginBottom: '16px' }}>
              <input
                type="email"
                placeholder={lang === 'zh' ? '邮箱' : 'Email'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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

            {isRegister && (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <input
                    type="password"
                    placeholder={t('confirmPassword')}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    style={inputStyle}
                    required
                  />
                  {confirmPassword && password !== confirmPassword && (
                    <div style={{ color: '#f44336', fontSize: '0.8em', marginTop: '4px' }}>{t('passwordMismatch')}</div>
                  )}
                </div>
                <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder={t('captchaCode')}
                    value={captchaCode}
                    onChange={(e) => setCaptchaCode(e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                    required
                    maxLength={4}
                    pattern="[0-9]{4}"
                    inputMode="numeric"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={handleSendCaptcha}
                    disabled={captchaCooldown > 0 || !email}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '6px',
                      border: '1px solid #1976d2',
                      background: captchaCooldown > 0 ? '#f5f5f5' : '#fff',
                      color: captchaCooldown > 0 ? '#999' : '#1976d2',
                      cursor: captchaCooldown > 0 ? 'default' : 'pointer',
                      fontSize: '0.85em',
                      whiteSpace: 'nowrap',
                      minWidth: '110px',
                    }}
                  >
                    {captchaCooldown > 0 ? `${captchaCooldown}${t('captchaRetry')}` : captchaSent ? t('sendCaptcha') : t('sendCaptcha')}
                  </button>
                </div>
                {captchaSent && (
                  <div style={{ color: '#999', fontSize: '0.8em', marginBottom: '12px', marginTop: '-8px' }}>
                    {t('captchaDefault')}{captchaDefaultCode || '8888'}
                  </div>
                )}
              </>
            )}

            {authError && (
              <div style={{ color: '#f44336', marginBottom: '12px', fontSize: '0.9em' }}>{authError}</div>
            )}

            <button type="submit" style={buttonStyle}>
              {isRegister ? t('register') : t('login')}
            </button>

            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => {
                  setIsRegister(!isRegister);
                  setConfirmPassword('');
                  setCaptchaCode('');
                  setAuthError(null);
                }}
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

          {invitationToken && (
            <div style={{ marginTop: '12px', textAlign: 'center' }}>
              <button
                onClick={() => { setInvitationToken(null); setInvitationInfo(null); }}
                style={{
                  background: 'none', border: 'none', color: '#999',
                  cursor: 'pointer', fontSize: '0.85em',
                }}
              >
                {lang === 'zh' ? '忽略邀请' : 'Dismiss invitation'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const busConnected = bus.connected;
  const hasSession = bus.sessionID !== null;

  return (
    <WorkspaceContext.Provider value={{ role: auth.workspace_role, workspaceId: auth.workspace_id }}>
    <div style={{ display: 'flex', height: '100vh', background: '#f5f5f5' }}>
      {/* Sidebar wrapper — positions the toggle on the boundary line */}
      <div style={{ position: 'relative', flexShrink: 0, height: '100%' }}>
        <div
          style={{
            width: sidebarCollapsed ? '52px' : '280px',
            background: '#1a1a2e',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            transition: 'width 0.2s ease',
            overflow: 'hidden',
            height: '100%',
          }}
        >
        {/* Header */}
        <div style={{
          padding: sidebarCollapsed ? '12px 8px' : '20px',
          borderBottom: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          justifyContent: sidebarCollapsed ? 'center' : 'space-between',
        }}>
          {sidebarCollapsed ? (
            <span style={{ fontSize: '1.1em' }}>🤖</span>
          ) : (
            <h2 style={{ margin: 0, fontSize: '1.3em' }}>{t('appTitle')}</h2>
          )}
        </div>

        {!sidebarCollapsed && workspaces.length > 0 && (
          <div style={{ padding: '0 20px 12px', borderBottom: '1px solid #333' }}>
            <div style={{ marginTop: '10px', display: 'flex', gap: '4px', alignItems: 'center' }}>
              <select
                value={localStorage.getItem('workspace_id') || ''}
                onChange={(e) => {
                  const newId = e.target.value;
                  localStorage.setItem('workspace_id', newId);
                  localStorage.removeItem('activeSessionID');
                  const ws = workspaces.find(w => w.id === newId);
                  setAuth(prev => ({ ...prev, workspace_id: newId, workspace_role: (ws?.role as WorkspaceRole) || null }));
                  setWorkspaceKey((k) => k + 1);
                }}
                style={{
                  flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid #444',
                  background: '#2a2a3e', color: '#fff', fontSize: '0.82em', cursor: 'pointer', outline: 'none',
                }}
              >
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
              <button onClick={() => setShowWorkspaceManager(true)} style={{
                background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '0.9em', padding: '4px',
              }} title={t('manageWorkspaces')}>⚙</button>
            </div>
          </div>
        )}

        {!sidebarCollapsed && (
          <div style={{ fontSize: '0.85em', color: '#999', padding: '4px 20px 12px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>{auth.user?.username} ({auth.user?.email})</span>
            <NotificationBell onWorkspaceChange={handleWorkspaceChange} onOpenTask={handleOpenTask} />
          </div>
        )}

        {/* Navigation */}
        <nav style={{ display: 'flex', flexDirection: 'column', padding: sidebarCollapsed ? '4px' : '8px', flex: 1 }}>
          {(['nodes', 'tasks', 'rules', 'projects', 'agents', 'tools', 'skills', 'agent-queue', 'workflows', 'logs', 'trash'] as Page[]).map((p) => {
            const icon = p === 'nodes' ? '📡' : p === 'tasks' ? '📋' : p === 'projects' ? '📁' : p === 'agents' ? '🤖' : p === 'rules' ? '⚡' : p === 'tools' ? '🔧' : p === 'skills' ? '📚' : p === 'agent-queue' ? '⏳' : p === 'workflows' ? '🔗' : p === 'logs' ? '📜' : '🗑';
            const label = p === 'nodes' ? t('navNodes') : p === 'tasks' ? t('navTasks') : p === 'projects' ? t('navProjects') : p === 'agents' ? t('agents') : p === 'rules' ? t('navAutomation') : p === 'tools' ? t('navTools') : p === 'skills' ? t('navSkills') : p === 'agent-queue' ? t('navAgentQueue') || 'Queue' : p === 'workflows' ? (t('taskWorkflow') || 'Workflows') : p === 'logs' ? t('navLogs') : t('navTrash');
            return (
              <button
                key={p}
                onClick={() => setPage(p)}
                title={sidebarCollapsed ? label : undefined}
                style={{
                  padding: sidebarCollapsed ? '10px 0' : '12px 16px',
                  textAlign: sidebarCollapsed ? 'center' : 'left',
                  background: page === p ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.95em',
                  marginBottom: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                  ...(p === 'trash' ? { marginTop: 'auto', marginBottom: 0 } : {}),
                }}
              >
                <span style={{
                  display: 'inline-block',
                  width: sidebarCollapsed ? 'auto' : '24px',
                  textAlign: 'center',
                  marginRight: sidebarCollapsed ? 0 : '4px',
                  fontSize: sidebarCollapsed ? '1.1em' : '1em',
                }}>
                  {icon}
                </span>
                {!sidebarCollapsed && label}
              </button>
            );
          })}
        </nav>

        {/* Connection status */}
        <div style={{
          padding: sidebarCollapsed ? '4px' : '8px 16px',
          fontSize: '0.75em',
          color: '#666',
          textAlign: sidebarCollapsed ? 'center' : 'left',
        }}>
          <span style={{
            display: 'inline-block',
            width: sidebarCollapsed ? '6px' : '8px',
            height: sidebarCollapsed ? '6px' : '8px',
            borderRadius: '50%',
            background: busConnected ? '#4caf50' : '#f44336',
            marginRight: sidebarCollapsed ? 0 : '4px',
          }} />
          {!sidebarCollapsed && <>Bus: {busConnected ? 'connected' : 'offline'}</>}
          {!sidebarCollapsed && hasSession && (
            <span style={{ marginLeft: '8px', color: '#4caf50' }}>
              | Session: {bus.sessionID?.slice(0, 6)}...
            </span>
          )}
          {!sidebarCollapsed && (
            <span style={{ marginLeft: '8px' }}>
              <span style={{
                display: 'inline-block',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: dashboardConnected ? '#4caf50' : '#f44336',
                marginRight: '2px',
              }} />
              Dash: {dashboardConnected ? 'on' : 'off'}
            </span>
          )}
        </div>

        {/* Bottom */}
        <div style={{ padding: sidebarCollapsed ? '8px 4px' : '16px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: sidebarCollapsed ? 'center' : 'stretch' }}>
          {sidebarCollapsed ? (
            <>
              <NotificationBell onWorkspaceChange={handleWorkspaceChange} onOpenTask={handleOpenTask} />
              <button
                onClick={() => {
                  localStorage.removeItem('token');
                  localStorage.removeItem('user');
                  localStorage.removeItem('workspace_id');
                  localStorage.removeItem('activeSessionID');
                  setAuth({ token: null, user: null, workspace_id: null, workspace_role: null });
                }}
                title={t('logout')}
                style={{
                  background: 'none', border: 'none', color: '#999', cursor: 'pointer',
                  fontSize: '0.95em', padding: '4px',
                }}
              >🚪</button>
            </>
          ) : (
            <>
              <LangSwitcher />
              <button
                onClick={() => {
                  localStorage.removeItem('token');
                  localStorage.removeItem('user');
                  localStorage.removeItem('workspace_id');
                  localStorage.removeItem('activeSessionID');
                  setAuth({ token: null, user: null, workspace_id: null, workspace_role: null });
                }}
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
            </>
          )}
        </div>
        </div>
        {/* Toggle button on the sidebar / content boundary */}
        <button
          onClick={() => {
            const next = !sidebarCollapsed;
            setSidebarCollapsed(next);
            localStorage.setItem('sidebarCollapsed', String(next));
          }}
          title={sidebarCollapsed ? (lang === 'zh' ? '展开菜单' : 'Expand menu') : (lang === 'zh' ? '收起菜单' : 'Collapse menu')}
          style={{
            position: 'absolute',
            right: '-14px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '14px',
            height: '48px',
            border: 'none',
            borderRadius: '0 8px 8px 0',
            background: '#1a1a2e',
            color: '#888',
            cursor: 'pointer',
            fontSize: '0.6em',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >{sidebarCollapsed ? '▶' : '◀'}</button>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Nodes page */}
        <div style={{ display: page === 'nodes' ? 'block' : 'none', padding: '24px', maxWidth: '800px', height: '100%', overflow: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ margin: 0 }}>{t('agentNodes')}</h2>
            <button
              onClick={() => setShowAddNode(true)}
              style={{
                padding: '8px 16px',
                background: '#1976d2',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.85em',
                fontWeight: 600,
              }}
            >
              + {t('addNode')}
            </button>
          </div>
          <NodeList nodes={nodes} onSelect={handleNodeSelect} />
          <div style={{ fontSize: '0.85em', color: '#999', marginTop: '8px' }}>
            {sessions.length} {t('sessions').toLowerCase()} | {t('navNodes').toLowerCase()}: {nodes.length}
          </div>
        </div>

        {/* Agents page */}
        <div style={{ display: page === 'agents' ? 'flex' : 'none', height: '100%', flexDirection: 'column', overflow: 'hidden' }}>
          <h2 style={{ padding: '24px 24px 12px', flexShrink: 0 }}>{t('agents')}</h2>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <AgentFolderPanel key={workspaceKey} />
          </div>
        </div>

        {/* Tasks page */}
        <div style={{ display: page === 'tasks' ? 'block' : 'none', height: '100%', overflow: 'auto' }}>
          <TaskBoard key={workspaceKey} initialTaskId={targetTaskId} onTaskOpened={() => setTargetTaskId(null)} />
        </div>

        {/* Projects page */}
        <div style={{ display: page === 'projects' ? 'block' : 'none', height: '100%', overflow: 'auto' }}>
          <ProjectList key={workspaceKey} />
        </div>

        {/* Rules page */}
        <div style={{ display: page === 'rules' ? 'block' : 'none', height: '100%', overflow: 'auto' }}>
          <RuleList key={workspaceKey} />
        </div>

        {/* Tools page */}
        <div style={{ display: page === 'tools' ? 'block' : 'none', height: '100%', overflow: 'auto' }}>
          <ToolSet />
        </div>

        {/* Skills page */}
        <div style={{ display: page === 'skills' ? 'block' : 'none', height: '100%', overflow: 'auto' }}>
          <SkillList key={workspaceKey} />
        </div>

        {/* Agent Queue page */}
        <div style={{ display: page === 'agent-queue' ? 'block' : 'none', height: '100%', overflow: 'auto' }}>
          <AgentQueuePanel key={workspaceKey} />
        </div>

        {/* Workflows page */}
        <div style={{ display: page === 'workflows' ? 'block' : 'none', height: '100%', overflow: 'auto' }}>
          <WorkflowList key={workspaceKey} />
        </div>


        {/* Logs page */}
        <div style={{ display: page === 'logs' ? 'block' : 'none', height: '100%', overflow: 'auto' }}>
          <LogViewer key={workspaceKey} />
        </div>

        {/* Trash page */}
        <div style={{ display: page === 'trash' ? 'block' : 'none', height: '100%', overflow: 'auto' }}>
          <TrashView key={workspaceKey} />
        </div>

        <FloatingChat key={workspaceKey}
          messages={bus.messages}
          sessionID={bus.sessionID}
          sessionActive={bus.sessionActive}
          sessionEnded={bus.sessionEnded}
          connected={busConnected}
          loadingHistory={bus.loadingHistory}
          onCreateSession={bus.createSession}
          onJoinSession={bus.joinSession}
          onSendMessage={bus.sendMessage}
          onSendBlocks={handleSendBlocks}
          onClearMessages={() => bus.sendMessage('/clear')}
          pendingPermissions={pendingPermissions.length}
          onPermissionResponse={(approved) => sendPermissionResponse(approved)}
          permissionMode={permissionMode}
          onTogglePermissionMode={() => setPermissionMode(prev => prev === 'auto' ? 'restricted' : 'auto')}
        />
      </div>
    </div>

    {/* Workspace Manager Modal */}
    {showWorkspaceManager && (
      <div
        onClick={() => setShowWorkspaceManager(false)}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: '#fff', borderRadius: '16px', padding: '28px',
            width: '480px', maxWidth: '90vw',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0 }}>{t('manageWorkspaces')}</h3>
            <button onClick={() => setShowWorkspaceManager(false)} style={{
              width: '32px', height: '32px', borderRadius: '50%', border: 'none',
              background: '#f5f5f5', cursor: 'pointer', fontSize: '1em',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666',
            }}>✕</button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid #eee' }}>
            <button
              onClick={() => setWsManagerTab('workspaces')}
              style={{
                padding: '8px 16px', border: 'none', background: 'none',
                cursor: 'pointer', fontSize: '0.9em', color: wsManagerTab === 'workspaces' ? '#1976d2' : '#999',
                borderBottom: wsManagerTab === 'workspaces' ? '2px solid #1976d2' : '2px solid transparent',
                fontWeight: wsManagerTab === 'workspaces' ? 600 : 400,
              }}
            >
              {t('workspaceLabel')}
            </button>
            <button
              onClick={() => setWsManagerTab('members')}
              style={{
                padding: '8px 16px', border: 'none', background: 'none',
                cursor: 'pointer', fontSize: '0.9em', color: wsManagerTab === 'members' ? '#1976d2' : '#999',
                borderBottom: wsManagerTab === 'members' ? '2px solid #1976d2' : '2px solid transparent',
                fontWeight: wsManagerTab === 'members' ? 600 : 400,
              }}
            >
              {lang === 'zh' ? '成员' : 'Members'}
            </button>
            {(auth.workspace_role === 'admin' || auth.workspace_role === 'owner') && (
              <button
                onClick={() => { setWsManagerTab('tokens'); fetchTokens(); }}
                style={{
                  padding: '8px 16px', border: 'none', background: 'none',
                  cursor: 'pointer', fontSize: '0.9em', color: wsManagerTab === 'tokens' ? '#1976d2' : '#999',
                  borderBottom: wsManagerTab === 'tokens' ? '2px solid #1976d2' : '2px solid transparent',
                  fontWeight: wsManagerTab === 'tokens' ? 600 : 400,
                }}
              >
                {t('tokenManagement')}
              </button>
            )}
          </div>

          {wsManagerTab === 'workspaces' ? (
          <>
          {/* Workspace list */}
          <div style={{ marginBottom: '16px', maxHeight: '300px', overflow: 'auto' }}>
            {workspaces.map((ws) => (
              <div key={ws.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', borderRadius: '8px', marginBottom: '6px',
                background: '#f9f9f9',
              }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.95em' }}>{ws.name}</div>
                  {ws.description && <div style={{ fontSize: '0.8em', color: '#999' }}>{ws.description}</div>}
                </div>
                {ws.name === 'Default' ? (
                  <span style={{
                    padding: '4px 10px', borderRadius: '4px', background: '#e8e8e8',
                    color: '#999', fontSize: '0.75em',
                  }}>{t('workspaceDefaultName')}</span>
                ) : (
                  <button
                    onClick={() => handleWsDeleteClick(ws.id)}
                    style={{
                      padding: '4px 12px', borderRadius: '4px', border: '1px solid #e0e0e0',
                      background: '#fff', cursor: 'pointer', color: '#c62828', fontSize: '0.8em',
                    }}
                  >
                    {t('taskDelete')}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add workspace form */}
          <div style={{ borderTop: '1px solid #eee', paddingTop: '16px' }}>
            <input
              placeholder={t('workspaceName')}
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd',
                fontSize: '0.9em', boxSizing: 'border-box', marginBottom: '8px',
              }}
            />
            <input
              placeholder={t('workspaceDescription')}
              value={newWsDesc}
              onChange={(e) => setNewWsDesc(e.target.value)}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd',
                fontSize: '0.9em', boxSizing: 'border-box', marginBottom: '8px',
              }}
            />
            <button
              onClick={handleCreateWorkspace}
              style={{
                width: '100%', padding: '8px', borderRadius: '6px', border: 'none',
                background: '#1976d2', color: '#fff', cursor: 'pointer', fontSize: '0.9em',
              }}
            >
              + {t('addWorkspace')}
            </button>
          </div>
          </>
          ) : wsManagerTab === 'members' ? (
            <WorkspaceMembers workspaceId={localStorage.getItem('workspace_id') || ''} />
          ) : (
            <>
            {/* Token management tab */}
            <div style={{ maxHeight: '350px', overflow: 'auto' }}>
              {tokenList.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#999', padding: '24px', fontSize: '0.9em' }}>
                  {t('tokenNoTokens')}
                </div>
              ) : (
                tokenList.map((tok) => (
                  <div key={tok.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 12px', borderRadius: '8px', marginBottom: '6px',
                    background: '#f9f9f9',
                  }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '0.95em' }}>{tok.name}</div>
                      <div style={{ fontSize: '0.75em', color: '#999' }}>
                        {t('tokenCreated')}: {new Date(tok.created_at).toLocaleDateString()}
                        {tok.expires_at ? ` · ${t('tokenExpires')}: ${new Date(tok.expires_at).toLocaleDateString()}` : ` · ${t('tokenPermanent')}`}
                        {tok.last_used_at ? ` · ${t('tokenLastUsed')}: ${new Date(tok.last_used_at).toLocaleDateString()}` : ` · ${t('tokenNeverUsed')}`}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevokeToken(tok.id)}
                      style={{
                        padding: '4px 12px', borderRadius: '4px', border: '1px solid #e0e0e0',
                        background: '#fff', cursor: 'pointer', color: '#c62828', fontSize: '0.8em',
                      }}
                    >
                      {t('tokenRevoke')}
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Create token form */}
            <div style={{ borderTop: '1px solid #eee', paddingTop: '16px' }}>
              {showCreateToken ? (
                <>
                  <input
                    placeholder={t('tokenNamePlaceholder')}
                    value={newTokenName}
                    onChange={(e) => setNewTokenName(e.target.value)}
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd',
                      fontSize: '0.9em', boxSizing: 'border-box', marginBottom: '8px',
                    }}
                  />
                  <select
                    value={newTokenExpiry}
                    onChange={(e) => setNewTokenExpiry(e.target.value)}
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd',
                      fontSize: '0.9em', boxSizing: 'border-box', marginBottom: '8px',
                      background: '#fff',
                    }}
                  >
                    <option value="7d">{t('tokenExpiry7d')}</option>
                    <option value="30d">{t('tokenExpiry30d')}</option>
                    <option value="90d">{t('tokenExpiry90d')}</option>
                    <option value="permanent">{t('tokenExpiryPermanent')}</option>
                  </select>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={handleCreateToken}
                      style={{
                        flex: 1, padding: '8px', borderRadius: '6px', border: 'none',
                        background: '#1976d2', color: '#fff', cursor: 'pointer', fontSize: '0.9em',
                      }}
                    >
                      {t('tokenGenerate')}
                    </button>
                    <button
                      onClick={() => { setShowCreateToken(false); setNewTokenName(''); }}
                      style={{
                        padding: '8px 16px', borderRadius: '6px', border: '1px solid #ddd',
                        background: '#fff', cursor: 'pointer', fontSize: '0.9em', color: '#666',
                      }}
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => setShowCreateToken(true)}
                  style={{
                    width: '100%', padding: '8px', borderRadius: '6px', border: 'none',
                    background: '#1976d2', color: '#fff', cursor: 'pointer', fontSize: '0.9em',
                  }}
                >
                  + {t('tokenCreate')}
                </button>
              )}
            </div>
            </>
          )}
        </div>
      </div>
    )}
    {/* Token reveal modal */}
    {revealedToken && (
      <div
        onClick={() => setRevealedToken(null)}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2100,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: '#fff', borderRadius: '12px', padding: '28px',
            width: '420px', maxWidth: '90vw',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}
        >
          <h3 style={{ margin: '0 0 8px', color: '#333' }}>{t('tokenReveal')}</h3>
          <p style={{ color: '#c62828', fontSize: '0.85em', marginBottom: '16px' }}>
            {t('tokenRevealWarning')}
          </p>
          <div style={{
            background: '#f5f5f5', borderRadius: '8px', padding: '12px',
            fontFamily: 'monospace', fontSize: '0.85em', wordBreak: 'break-all',
            marginBottom: '16px', border: '1px solid #e0e0e0',
            userSelect: 'all',
          }}>
            {revealedToken}
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              onClick={async () => { await copyToClipboard(revealedToken); }}
              style={{
                padding: '8px 20px', borderRadius: '6px', border: 'none',
                background: '#1976d2', color: '#fff', cursor: 'pointer', fontSize: '0.9em',
              }}
            >
              {t('tokenCopyButton')}
            </button>
            <button
              onClick={() => setRevealedToken(null)}
              style={{
                padding: '8px 20px', borderRadius: '6px', border: '1px solid #ddd',
                background: '#fff', cursor: 'pointer', fontSize: '0.9em', color: '#666',
              }}
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Workspace delete verification modal */}
    {wsDeleteVerify && (
      <div
        onClick={() => { setWsDeleteVerify(null); setWsVerifyError(false); }}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2100,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: '#fff', borderRadius: '12px', padding: '28px',
            width: '360px', maxWidth: '90vw',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)', textAlign: 'center',
          }}
        >
          <h3 style={{ margin: '0 0 8px', color: '#333' }}>{t('taskConfirmDelete')}</h3>
          <p style={{ color: '#666', fontSize: '0.9em', marginBottom: '20px' }}>
            {lang === 'zh' ? '请回答以下验证问题：' : 'Answer the following to confirm:'}
          </p>
          <div style={{ fontSize: '1.4em', fontWeight: 700, color: '#333', marginBottom: '16px' }}>
            {wsDeleteVerify.a} {wsDeleteVerify.op} {wsDeleteVerify.b} = ?
          </div>
          <input
            value={wsVerifyInput}
            onChange={(e) => { setWsVerifyInput(e.target.value); setWsVerifyError(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleWsDeleteConfirm(); }}
            style={{
              width: '100%', padding: '10px', borderRadius: '6px',
              border: wsVerifyError ? '1px solid #c62828' : '1px solid #ddd',
              fontSize: '1.1em', textAlign: 'center', boxSizing: 'border-box', outline: 'none',
              marginBottom: '8px',
            }}
            autoFocus
          />
          {wsVerifyError && (
            <div style={{ color: '#c62828', fontSize: '0.85em', marginBottom: '8px' }}>
              {lang === 'zh' ? '答案错误，请重试' : 'Wrong answer, try again'}
            </div>
          )}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '12px' }}>
            <button
              onClick={() => { setWsDeleteVerify(null); setWsVerifyError(false); }}
              style={{
                padding: '10px 20px', borderRadius: '6px', border: '1px solid #ddd',
                background: '#fff', cursor: 'pointer', color: '#666', fontSize: '0.95em',
              }}
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleWsDeleteConfirm}
              style={{
                padding: '10px 20px', borderRadius: '6px', border: 'none',
                background: '#c62828', color: '#fff', cursor: 'pointer', fontSize: '0.95em',
              }}
            >
              {t('taskDelete')}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* User delete verification modal */}
    {userDeleteVerify && (
      <div
        onClick={() => setUserDeleteVerify(null)}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2100,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: '#fff', borderRadius: '12px', padding: '28px',
            width: '360px', maxWidth: '90vw',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)', textAlign: 'center',
          }}
        >
          <h3 style={{ margin: '0 0 8px', color: '#333' }}>
            {lang === 'zh' ? '删除用户' : 'Delete User'}
          </h3>
          <p style={{ color: '#666', fontSize: '0.9em', marginBottom: '8px' }}>
            {lang === 'zh' ? `确定删除用户 ${userDeleteVerify.email}？` : `Delete user ${userDeleteVerify.email}?`}
          </p>
          <p style={{ color: '#999', fontSize: '0.85em', marginBottom: '20px' }}>
            {lang === 'zh' ? '此操作将删除该用户及其所有数据，不可恢复。请回答验证问题：' : 'This permanently removes the user and all their data.'}
          </p>
          <div style={{ fontSize: '1.4em', fontWeight: 700, color: '#333', marginBottom: '16px' }}>
            {userDeleteVerify.a} {userDeleteVerify.op} {userDeleteVerify.b} = ?
          </div>
          <input
            value={userVerifyInput}
            onChange={(e) => setUserVerifyInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleUserDeleteConfirm(); }}
            style={{
              width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd',
              fontSize: '1.1em', textAlign: 'center', boxSizing: 'border-box', outline: 'none',
              marginBottom: '8px',
            }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '12px' }}>
            <button
              onClick={() => setUserDeleteVerify(null)}
              style={{
                padding: '10px 20px', borderRadius: '6px', border: '1px solid #ddd',
                background: '#fff', cursor: 'pointer', color: '#666', fontSize: '0.95em',
              }}
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleUserDeleteConfirm}
              style={{
                padding: '10px 20px', borderRadius: '6px', border: 'none',
                background: '#c62828', color: '#fff', cursor: 'pointer', fontSize: '0.95em',
              }}
            >
              {t('taskDelete')}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* In-app notification toast */}
    {toast && (
      <div
        onClick={() => setToast(null)}
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 10000,
          background: '#323232',
          color: '#fff',
          padding: '14px 20px',
          borderRadius: '10px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          maxWidth: '400px',
          cursor: 'pointer',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: '0.9em', marginBottom: '4px' }}>{toast.title}</div>
        <div style={{ fontSize: '0.82em', opacity: 0.9 }}>{toast.message}</div>
      </div>
    )}
      {showAddNode && <AddNodeDialog onClose={() => setShowAddNode(false)} />}
    </WorkspaceContext.Provider>
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
