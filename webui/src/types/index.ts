// === Agent Types ===
export interface Agent {
  id: string;
  node_id: string;
  name: string;
  command: string;
  version: string;
  enabled: boolean;
  auto_detected: boolean;
}

// === Agent Profile Types ===
export interface AgentProfile {
  id: string;
  user_id: string;
  name: string;
  avatar: string;
  description: string;
  agent_id: string;
  version: string;
  model: string;
  backend: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface RuntimeEntity {
  id: string;
  name: string;
  description: string;
}

// === Node Types ===
export type NodeStatus = 'online' | 'offline' | 'busy';

export interface Node {
  id: string;
  user_id: string;
  name: string;
  os: string;
  arch: string;
  status: NodeStatus;
  version: string;
  ip: string;
  max_sessions: number;
  last_seen: string;
  created_at: string;
  agents?: Agent[];
}

// === Session Types ===
export type SessionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';

export interface Session {
  id: string;
  user_id: string;
  node_id: string;
  agent_id?: string;
  status: SessionStatus;
  prompt: string;
  workspace: string;
  output_log?: string;
  error_log?: string;
  pid?: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface CreateSessionReq {
  prompt?: string;
  workspace: string;
  node_id: string;
  agent_id: string;
}

// === Auth Types ===
export interface AuthState {
  token: string | null;
  user: { id: string; username: string } | null;
}
