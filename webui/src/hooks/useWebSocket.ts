import { useEffect, useRef, useCallback } from 'react';
import type { WSMessage } from '../types';

interface UseWebSocketOptions {
  sessionID: string;
  onOutput: (data: string) => void;
  onTaskResult: (success: boolean, error?: string) => void;
}

export function useWebSocket({ sessionID, onOutput, onTaskResult }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const shouldReconnect = useRef(true);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/ws/ui?session_id=${sessionID}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected to session:', sessionID);
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        switch (msg.type) {
          case 'output':
            onOutput((msg.payload as { data: string }).data);
            break;
          case 'task_result': {
            const p = msg.payload as { success: boolean; error?: string };
            onTaskResult(p.success, p.error);
            break;
          }
        }
      } catch (e) {
        console.warn('[WS] Failed to parse message:', e);
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected from session:', sessionID);
      if (shouldReconnect.current) {
        reconnectTimer.current = setTimeout(connect, 3000);
      }
    };

    ws.onerror = (err) => {
      console.error('[WS] Error:', err);
      ws.close();
    };
  }, [sessionID, onOutput, onTaskResult]);

  useEffect(() => {
    shouldReconnect.current = true;
    connect();

    return () => {
      shouldReconnect.current = false;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const send = useCallback((type: string, payload: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  const sendInput = useCallback((data: string) => {
    send('input', { session_id: sessionID, data });
  }, [send, sessionID]);

  return { send, sendInput };
}
