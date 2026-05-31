import { useEffect, useRef, useState, useCallback } from 'react';

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
  };
  timestamp?: number;
  reply_to?: string;
}

interface UseMessageBusOptions {
  userID: string;
  onMessage?: (env: Envelope) => void;
}

export function useMessageBus({ userID, onMessage }: UseMessageBusOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const connIDRef = useRef<string>('');
  const endpointRef = useRef<string>('');
  const [connected, setConnected] = useState(false);
  const [sessionID, setSessionID] = useState<string | null>(null);
  const [messages, setMessages] = useState<Envelope[]>([]);
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
    };

    ws.onmessage = (event) => {
      try {
        const env: Envelope = JSON.parse(event.data);
        console.log('[Bus] RECV:', env.type, env.from, '→', env.to);

        // Handle session.created — resolve pending promise
        if (env.type === 'session.created' && env.session_id) {
          setSessionID(env.session_id);
          // Resolve pending create session promises
          pendingRef.current.forEach((p) => p.resolve(env.session_id!));
          pendingRef.current = [];
        }

        // Add to messages (skip internal system messages)
        if (env.type !== 'pong' && env.type !== 'hello') {
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
    send,
    createSession,
    sendMessage,
    clearMessages: useCallback(() => setMessages([]), []),
  };
}
