import type React from 'react';

/** All available UI slot names where plugin components can be registered. */
export type SlotName =
  | 'task-detail-tab'
  | 'task-detail-sidebar'
  | 'task-card-actions'
  | 'project-sidebar'
  | 'project-header-actions'
  | 'board-toolbar'
  | 'settings-page'
  | 'settings-section'
  | 'global-header'
  | 'global-sidebar'
  | 'dashboard-widget';

/** A component registered to a slot by a plugin. */
export interface RegisteredComponent {
  pluginId: string;
  slot: SlotName;
  label: string;
  component: React.ComponentType<any>;
  weight: number;
}

/** Plugin manifest as served by the backend. */
export interface PluginManifest {
  name: string;
  version: string;
  type: 'core' | 'extension' | 'runtime';
  label?: Record<string, string>;
  description?: Record<string, string>;
  author?: string;
  permissions: string[];
  frontend_slots: Record<string, string>;
  state: string;
}

/** Response from /api/plugins endpoint. */
export interface PluginListResponse {
  plugins: PluginManifest[];
}
