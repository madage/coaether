import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageStream } from './MessageStream';
import { InputArea } from './InputArea';
import { agentProfiles } from '../api/client';
import { useLang } from '../i18n/context';
import type { Envelope, ContentBlock } from '../hooks/useMessageBus';
import type { AgentProfile } from '../types';

interface FloatingChatProps {
  messages: Envelope[];
  sessionID: string | null;
  sessionActive: boolean;
  sessionEnded: boolean;
  connected: boolean;
  loadingHistory: boolean;
  onCreateSession: (agents: Array<{ id: string; backend?: string }>) => Promise<string>;
  onJoinSession: (sessionId: string) => void;
  onSendMessage: (text: string) => boolean;
  onSendBlocks: (blocks: ContentBlock[]) => boolean;
  onClearMessages: () => void;
  pendingPermissions: number;
  onPermissionResponse: (approved: boolean) => void;
  permissionMode: 'auto' | 'restricted';
  onTogglePermissionMode: () => void;
}

const ICON_SIZE = 56;

export function FloatingChat({
  messages, sessionID, sessionActive, sessionEnded, connected, loadingHistory,
  onCreateSession, onJoinSession, onSendMessage, onSendBlocks, onClearMessages,
  pendingPermissions, onPermissionResponse,
  permissionMode, onTogglePermissionMode,
}: FloatingChatProps) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [agentSessions, setAgentSessions] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const profilesMap = useRef<Record<string, AgentProfile>>({});

  // Fetch user's agent profiles
  useEffect(() => {
    agentProfiles.list().then((res) => {
      setProfiles(res.profiles);
      const map: Record<string, AgentProfile> = {};
      res.profiles.forEach((p: AgentProfile) => { map[p.id] = p; });
      profilesMap.current = map;
    }).catch(() => {});
  }, []);

  const [pos, setPos] = useState(() => ({
    x: typeof window !== 'undefined' ? window.innerWidth - ICON_SIZE - 24 : 0,
    y: typeof window !== 'undefined' ? window.innerHeight - ICON_SIZE - 24 : 0,
  }));
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);
  const pendingMsg = useRef('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    hasMoved.current = false;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      hasMoved.current = true;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - ICON_SIZE, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - ICON_SIZE, e.clientY - dragOffset.current.y)),
      });
    };
    const handleMouseUp = () => { dragging.current = false; };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleIconClick = () => {
    if (hasMoved.current) { hasMoved.current = false; return; }
    setOpen((prev) => !prev);
  };

  // Track sessionID changes → store agent-to-session mapping
  const prevSessionID = useRef(sessionID);
  useEffect(() => {
    if (sessionID && sessionID !== prevSessionID.current && selectedAgent) {
      prevSessionID.current = sessionID;
      setAgentSessions((prev) => ({ ...prev, [selectedAgent]: sessionID }));
    }
  }, [sessionID, selectedAgent]);

  // Send pending message when session becomes active
  const sendMsgRef = useRef(onSendMessage);
  sendMsgRef.current = onSendMessage;
  useEffect(() => {
    if (sessionActive && pendingMsg.current && sessionID) {
      sendMsgRef.current(pendingMsg.current);
      pendingMsg.current = '';
    }
  }, [sessionActive, sessionID]);

  const handleAgentChange = useCallback((agentId: string) => {
    setSelectedAgent(agentId);
    const sid = agentSessions[agentId];
    if (sid) {
      onJoinSession(sid);
    }
  }, [agentSessions, onJoinSession]);

  const handleSend = useCallback((text: string): boolean => {
    if (!selectedAgent) return false;

    const profile = profilesMap.current[selectedAgent];
    const runtimeId = profile?.agent_id || selectedAgent;
    const sid = agentSessions[selectedAgent];
    if (!sid || sessionEnded) {
      pendingMsg.current = text;
      onCreateSession([{ id: runtimeId, backend: 'api' }]);
      return true;
    }
    if (sid !== sessionID) {
      pendingMsg.current = text;
      onJoinSession(sid);
      return true;
    }
    return onSendMessage(text);
  }, [selectedAgent, agentSessions, sessionEnded, sessionID, onCreateSession, onJoinSession, onSendMessage]);

  const handleAttachImage = useCallback(() => {
    imgInputRef.current?.click();
  }, []);

  const handleAttachFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImageSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onSendBlocks([{ type: 'image', url: reader.result as string }]);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [onSendBlocks]);

  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
    if (isImage) {
      const reader = new FileReader();
      reader.onload = () => {
        onSendBlocks([{ type: 'image', url: reader.result as string }]);
      };
      reader.readAsDataURL(file);
    } else {
      onSendMessage(`📎 ${file.name}`);
    }
    e.target.value = '';
  }, [onSendBlocks, onSendMessage]);

  const needsAgent = !selectedAgent;
  const noSessionYet = selectedAgent && !agentSessions[selectedAgent];
  const chatDisabled = !connected;

  return (
    <>
      {/* Floating chat icon */}
      <div
        onMouseDown={handleMouseDown}
        onClick={handleIconClick}
        style={{
          position: 'fixed',
          left: pos.x, top: pos.y,
          width: ICON_SIZE, height: ICON_SIZE,
          borderRadius: '50%',
          background: '#1976d2', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.5em', cursor: 'grab', zIndex: 999,
          userSelect: 'none',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 4px 8px rgba(0,0,0,0.15)',
          transition: dragging.current ? 'none' : 'box-shadow 0.2s, transform 0.2s',
        }}
        onMouseEnter={(e) => {
          if (!dragging.current) {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.35), 0 6px 12px rgba(0,0,0,0.2)';
          }
        }}
        onMouseLeave={(e) => {
          if (!dragging.current) {
            e.currentTarget.style.transform = '';
            e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3), 0 4px 8px rgba(0,0,0,0.15)';
          }
        }}
      >
        💬
      </div>

      {/* Hidden file inputs */}
      <input
        type="file" ref={imgInputRef} accept="image/*"
        onChange={handleImageSelected} style={{ display: 'none' }}
      />
      <input
        type="file" ref={fileInputRef}
        onChange={handleFileSelected} style={{ display: 'none' }}
      />

      {/* Chat window overlay */}
      {open && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.3)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              width: '540px', height: '660px',
              background: '#fff', borderRadius: '16px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with agent selector */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e0e0e0',
              background: '#fff',
              display: 'flex', alignItems: 'center', gap: '12px',
              flexShrink: 0,
            }}>
              <select
                value={selectedAgent}
                onChange={(e) => handleAgentChange(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #ccc',
                  fontSize: '0.95em',
                  background: '#fff',
                  flex: 1,
                  maxWidth: '200px',
                }}
              >
                <option value="">{t('selectAgent') || '选择智能体...'}</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.avatar} {p.name}</option>
                ))}
              </select>

              {selectedAgent && !noSessionYet && (
                <span style={{
                  fontSize: '0.75em', color: '#999',
                  background: '#f5f5f5', padding: '2px 8px',
                  borderRadius: '4px', whiteSpace: 'nowrap',
                }}>
                  {agentSessions[selectedAgent]?.slice(0, 8)}...
                </span>
              )}

              {!connected && (
                <span style={{ fontSize: '0.8em', color: '#f44336' }}>Disconnected</span>
              )}

              <button
                onClick={onTogglePermissionMode}
                style={{
                  padding: '4px 10px',
                  background: permissionMode === 'auto' ? '#e8f5e9' : '#fff3e0',
                  color: permissionMode === 'auto' ? '#2e7d32' : '#e65100',
                  border: `1px solid ${permissionMode === 'auto' ? '#a5d6a7' : '#ffe0b2'}`,
                  borderRadius: '4px', cursor: 'pointer', fontSize: '0.75em',
                  display: 'flex', alignItems: 'center', gap: '4px',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{
                  display: 'inline-block', width: '6px', height: '6px',
                  borderRadius: '50%',
                  background: permissionMode === 'auto' ? '#4caf50' : '#ff9800',
                }} />
                {permissionMode === 'auto' ? t('autoMode') : t('restrictedMode')}
              </button>

              <div style={{ flex: 1 }} />

              {sessionID && (
                <button onClick={onClearMessages} style={{
                  padding: '4px 10px', background: '#f5f5f5', color: '#666',
                  border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75em',
                }}>Clear</button>
              )}
            </div>

            {/* Messages or placeholder */}
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
              {needsAgent ? (
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#aaa', fontSize: '1.1em', padding: '24px', textAlign: 'center',
                }}>
                  {'请选择智能体开始聊天'}
                </div>
              ) : noSessionYet ? (
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#aaa', fontSize: '1em', padding: '24px', textAlign: 'center',
                }}>
                  {'发送消息后将创建新的会话'}
                </div>
              ) : messages.length === 0 && !loadingHistory ? (
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#aaa', fontSize: '1em', padding: '24px', textAlign: 'center',
                }}>
                  {'开始聊天'}
                </div>
              ) : (
                <>
                  {loadingHistory && (
                    <div style={{ padding: '12px 20px', color: '#1976d2', fontSize: '0.85em' }}>
                      {'Loading history...'}
                    </div>
                  )}
                  {sessionEnded && (
                    <div style={{ padding: '12px 20px', color: '#9e9e9e', fontSize: '0.85em' }}>
                      {'Session ended (read-only)'}
                    </div>
                  )}
                  <MessageStream messages={messages} />
                </>
              )}
            </div>

            {/* Input area with attachment buttons */}
            <div style={{ borderTop: '1px solid #e0e0e0', background: '#fff' }}>
              {/* Attachment toolbar */}
              <div style={{
                display: 'flex', gap: '4px', padding: '8px 16px 0',
              }}>
                <button
                  onClick={handleAttachImage}
                  title="Attach image"
                  style={{
                    width: '32px', height: '32px',
                    borderRadius: '6px', border: 'none',
                    background: 'transparent', cursor: 'pointer',
                    fontSize: '1.1em', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    color: '#666',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f0f0f0'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >📷</button>
                <button
                  onClick={handleAttachFile}
                  title="Attach file"
                  style={{
                    width: '32px', height: '32px',
                    borderRadius: '6px', border: 'none',
                    background: 'transparent', cursor: 'pointer',
                    fontSize: '1.1em', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    color: '#666',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f0f0f0'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >📎</button>
              </div>
              <InputArea
                onSend={handleSend}
                disabled={chatDisabled || needsAgent}
                placeholder={
                  !selectedAgent
                    ? '请先选择智能体'
                    : sessionEnded
                      ? 'Session ended'
                      : connected ? '输入消息...' : t('connecting')
                }
                pendingPermissions={pendingPermissions}
                onPermissionResponse={onPermissionResponse}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
