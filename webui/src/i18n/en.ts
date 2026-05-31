export const en = {
  // App
  appTitle: 'Superco',
  appSubtitle: 'AI Agent Distributed Platform',

  // Auth
  login: 'Login',
  register: 'Register',
  username: 'Username',
  password: 'Password',
  logout: 'Logout',
  alreadyHasAccount: 'Already have an account? Login',
  noAccount: "Don't have an account? Register",
  authFailed: 'Authentication failed',

  // Sidebar
  navNodes: 'Nodes',
  navSessions: 'Sessions',
  navTerminal: 'Terminal',

  // Nodes
  agentNodes: 'Agent Nodes',
  loadingNodes: 'Loading nodes...',
  noNodes: 'No nodes registered. Start an Agent Node to begin.',
  refresh: 'Refresh',
  lastSeen: 'Last seen',
  nodeOnline: 'online',
  nodeOffline: 'offline',
  nodeBusy: 'busy',

  // Sessions
  sessions: 'Sessions',
  loadingSessions: 'Loading sessions...',
  noSessions: 'No sessions yet. Create one to get started.',
  workspace: 'Workspace',
  created: 'Created',
  sessionPending: 'pending',
  sessionRunning: 'running',
  sessionPaused: 'paused',
  sessionStatusCompleted: 'completed',
  sessionStatusFailed: 'failed',

  // Create Session
  newSession: 'New Session',
  targetNode: 'Target Node',
  selectNode: 'Select a node...',
  noOnlineNodes: 'No online nodes available',
  workspacePath: 'Workspace Path',
  workspacePlaceholder: '/home/user/project or C:\\Users\\me\\project',
  prompt: 'Prompt',
  promptPlaceholder: 'Describe the task for Claude Code...',
  allFieldsRequired: 'All fields are required',
  creating: 'Creating...',
  startSession: 'Start Session',
  failedToCreate: 'Failed to create session',

  // Terminal
  terminal: 'Terminal',
  session: 'Session',
  none: 'None',
  disconnect: 'Disconnect',
  noActiveSession: 'No active session. Create a session from the Sessions tab first.',
  waitingForSession: 'Waiting for session...',
  sessionCompleted: '[Session completed successfully]',
  sessionFailed: '[Session failed: ',
  unknownError: 'unknown error',

  // Language
  switchLang: '中文',
} as const;
