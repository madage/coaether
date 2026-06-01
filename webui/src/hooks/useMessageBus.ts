import { useEffect, useRef, useState, useCallback } from 'react';
import { sessions as sessionsAPI } from '../api/client';

// Mirror of server protocol types for the frontend
export interface ContentBlock {
  type: string;
  content?: string;
  language?: string;
  filename?: string;
  headers?: string[];
  rows?: string[][];
  url?: string;
  indent?: number;
  collapsible?: boolean;
  collapsed?: boolean;

  // Progress / thinking fields
  status?: string;
  message?: string;

  // Tool use fields
  tool?: string;
  tool_input?: string;
}

export interface Envelope {
  id?: string;
  from?: string;
  to?: string;
  type: string;
  session_id?: string;
  payload?: {
    content?: ContentBlock[];
    code?: string;
    message?: string;
    agents?: Array<{ id: string; name?: string; backend?: string }>;
    members?: Array<{ endpoint: string; role: string }>;
    metadata?: Record<string, unknown>;

    // Permission fields
    tool_use_id?: string;
    tool?: string;
    input?: string;
    approved?: boolean;
  };
  timestamp?: number;
  reply_to?: string;
}

interface UseMessageBusOptions {
  userID: string;
  onMessage?: (env: Envelope) => void;
}

const LS_ACTIVE_SESSION = 'activeSessionID';

export function useMessageBus({ userID, onMessage }: UseMessageBusOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const connIDRef = useRef<string>('');
  const endpointRef = useRef<string>('');
  const [connected, setConnected] = useState(false);
  const [sessionID, setSessionID] = useState<string | null>(() => {
    // Restore session from localStorage on mount
    return localStorage.getItem(LS_ACTIVE_SESSION);
  });
  const [messages, setMessages] = useState<Envelope[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [sessionActive, setSessionActive] = useState(false); // confirmed active on bus
  const pendingRef = useRef<Array<{ resolve: (id: string) => void }>>([]);

  // Get or create a unique connection ID
  const getConnID = useCallback(() => {
    if (!connIDRef.current) {
      connIDRef.current = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
    return connIDRef.current;
  }, []);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/ws/bus?type=ui&user_id=${encodeURIComponent(userID)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;
    const connID = getConnID();
    endpointRef.current = `ui://${userID}/${connID}`;

    ws.onopen = () => {
      console.log('[Bus] Connected:', endpointRef.current);
      setConnected(true);

      // Send hello with capabilities
      ws.send(JSON.stringify({
        id: crypto.randomUUID ? crypto.randomUUID() : `msg-${Date.now()}`,
        from: endpointRef.current,
        to: 'system://bus',
        type: 'hello',
        payload: { endpoint_type: 'ui' },
      }));

      // Auto-restore session from localStorage after reconnect
      const savedID = localStorage.getItem(LS_ACTIVE_SESSION);
      if (savedID) {
        console.log('[Bus] Auto-restoring session:', savedID);
        setSessionID(savedID);
        setSessionEnded(false);
        setLoadingHistory(true);
        // Join the session on the bus
        ws.send(JSON.stringify({
          id: crypto.randomUUID ? crypto.randomUUID() : `msg-${Date.now()}`,
          from: endpointRef.current,
          to: 'system://bus',
          type: 'session.join',
          session_id: savedID,
        }));
        // Load history from REST API
        sessionsAPI.getMessages(savedID).then((res) => {
          const history = (res.messages || []) as unknown as Envelope[];
          setMessages(history);
        }).catch(() => {
          // best-effort
        }).finally(() => {
          setLoadingHistory(false);
        });
      }
    };

    ws.onmessage = (event) => {
      try {
        const env: Envelope = JSON.parse(event.data);
        console.log('[Bus] RECV:', env.type, env.from, '→', env.to);

        // Handle session.created — persist and resolve pending promise
        if (env.type === 'session.created' && env.session_id) {
          setSessionID(env.session_id);
          setSessionEnded(false);
          setSessionActive(true);
          localStorage.setItem(LS_ACTIVE_SESSION, env.session_id);
          // Load history from server
          setLoadingHistory(true);
          sessionsAPI.getMessages(env.session_id).then((res) => {
            const history = (res.messages || []) as unknown as Envelope[];
            setMessages((prev) => {
              // Filter out any messages from history that are already in state
              // (prevents duplicates from race conditions)
              const existingIDs = new Set(prev.map((m) => m.id));
              const newHistory = history.filter((m) => m.id && !existingIDs.has(m.id));
              return [...newHistory, ...prev];
            });
          }).catch(() => {
            // History fetch is best-effort
          }).finally(() => {
            setLoadingHistory(false);
          });
          // Resolve pending create session promises
          pendingRef.current.forEach((p) => p.resolve(env.session_id!));
          pendingRef.current = [];
        }

        // Handle session.joined — session is active on the bus
        if (env.type === 'session.joined') {
          setSessionActive(true);
          setSessionEnded(false);
        }

        // Handle error — e.g. SESSION_NOT_FOUND from joining a stale session
        if (env.type === 'error' && env.payload?.code === 'SESSION_NOT_FOUND') {
          setSessionEnded(true);
          setSessionActive(false);
        }

        // Handle session.end — clean up persisted state
        if (env.type === 'session.end') {
          localStorage.removeItem(LS_ACTIVE_SESSION);
          setSessionEnded(true);
          setSessionActive(false);
        }

        // Add to messages (skip internal system messages)
        if (env.type !== 'pong' && env.type !== 'hello' && env.type !== 'permission.response') {
          setMessages((prev) => [...prev, env]);
        }

        onMessage?.(env);
      } catch (e) {
        console.warn('[Bus] Parse error:', e);
      }
    };

    ws.onclose = () => {
      console.log('[Bus] Disconnected');
      setConnected(false);
    };

    ws.onerror = () => {
      ws.close();
    };

    return () => {
      ws.close();
    };
  }, [userID, getConnID, onMessage]);

  const send = useCallback((env: Envelope) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (!env.id) {
        env.id = crypto.randomUUID ? crypto.randomUUID() : `msg-${Date.now()}`;
      }
      if (!env.from) {
        env.from = endpointRef.current;
      }
      if (!env.timestamp) {
        env.timestamp = Date.now();
      }
      wsRef.current.send(JSON.stringify(env));
      return true;
    }
    return false;
  }, []);

  const createSession = useCallback((agents: Array<{ id: string; backend?: string }>): Promise<string> => {
    return new Promise((resolve) => {
      const env: Envelope = {
        from: endpointRef.current,
        to: 'system://bus',
        type: 'session.create',
        payload: { agents },
      };

      // Store resolve callback
      pendingRef.current.push({ resolve });
      send(env);
    });
  }, [send]);

  const joinSession = useCallback((sessionID: string) => {
    setSessionID(sessionID);
    setMessages([]);
    setSessionEnded(false);
    setSessionActive(false); // awaiting session.joined confirmation
    setLoadingHistory(true);
    localStorage.setItem(LS_ACTIVE_SESSION, sessionID);

    // Load historical messages from REST API
    sessionsAPI.getMessages(sessionID).then((res) => {
      const history = (res.messages || []) as unknown as Envelope[];
      setMessages(history);
    }).catch(() => {
      // best-effort
    }).finally(() => {
      setLoadingHistory(false);
    });

    // Join the session on the bus for real-time message routing
    send({
      from: endpointRef.current,
      to: 'system://bus',
      type: 'session.join',
      session_id: sessionID,
    });
  }, [send]);

  const sendMessage = useCallback((text: string) => {
    if (!sessionID) return false;
    return send({
      from: endpointRef.current,
      to: `session://${sessionID}`,
      type: 'message',
      session_id: sessionID,
      payload: {
        content: [{ type: 'text', content: text }],
      },
    });
  }, [send, sessionID]);

  return {
    connected,
    sessionID,
    messages,
    loadingHistory,
    sessionEnded,
    sessionActive,
    send,
    createSession,
    joinSession,
    sendMessage,
    clearMessages: useCallback(() => setMessages([]), []),
  };
}
