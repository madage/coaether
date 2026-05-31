import type { Node, Session, CreateSessionReq, Agent } from '../types';

const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }

  return res.json();
}

// Auth
export const auth = {
  login: (username: string, password: string) =>
    request<{ token: string; user: { id: string; username: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  register: (username: string, password: string) =>
    request<{ token: string; user: { id: string; username: string } }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
};

// Nodes
export const nodes = {
  list: () => request<{ nodes: Node[] }>('/nodes'),

  getByID: (id: string) => request<Node>(`/nodes/${id}`),

  register: (data: { node_token: string; name: string; os: string; arch: string; version: string }) =>
    request<{ node_id: string; ws_token: string }>('/nodes/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  heartbeat: (nodeID: string, status: string) =>
    request<{ status: string }>('/nodes/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ node_id: nodeID, status }),
    }),

  scan: (nodeID: string) =>
    request<{ status: string }>(`/nodes/${nodeID}/scan`, { method: 'POST' }),
};

// Agents
export const agents = {
  list: (nodeID: string) => request<{ agents: Agent[] }>(`/nodes/${nodeID}/agents`),

  toggle: (agentID: string, enabled: boolean) =>
    request<{ status: string }>(`/agents/${agentID}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),
};

// Sessions
export const sessions = {
  list: () => request<{ sessions: Session[] }>('/sessions'),

  getByID: (id: string) => request<Session>(`/sessions/${id}`),

  create: (data: CreateSessionReq) =>
    request<{ id: string; status: string; prompt: string; workspace: string; node_id: string; created_at: string }>(
      '/sessions',
      { method: 'POST', body: JSON.stringify(data) }
    ),

  getMessages: (sessionID: string) =>
    request<{ messages: Record<string, unknown>[] }>(`/sessions/${sessionID}/messages`),
};
