import type React from 'react';
import type { SlotName, RegisteredComponent } from './types';

/**
 * PluginClient is the runtime that manages plugin frontend components.
 *
 * - ComponentRegistry: plugins register components to named slots
 * - Plugin loading: loads plugin frontend bundles dynamically
 * - Backend bridge: callAction() proxies to the plugin via the main server
 */
class PluginClient {
  private registry = new Map<SlotName, RegisteredComponent[]>();
  private loadedPlugins = new Set<string>();
  private initialized = false;

  /** Initialize by fetching plugin list from the backend. */
  async init(baseUrl: string = '/api') {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const res = await fetch(`${baseUrl}/plugins`);
      const data = await res.json();
      const plugins: Array<{ name: string; state: string; frontend_slots?: Record<string, string> }> = data.plugins ?? [];

      for (const p of plugins) {
        if (p.state !== 'running') continue;
        if (!p.frontend_slots || Object.keys(p.frontend_slots).length === 0) continue;

        this.loadedPlugins.add(p.name);

        // Dynamically import the plugin's frontend entry
        for (const [slotName, componentName] of Object.entries(p.frontend_slots)) {
          this.loadPluginComponents(p.name, slotName as SlotName, componentName);
        }
      }
    } catch (err) {
      console.warn('[PluginClient] Failed to load plugins:', err);
    }
  }

  /**
   * Try to dynamically import a plugin's frontend bundle.
   * The import path convention: /plugins/{name}/frontend/index.js
   */
  private async loadPluginComponents(pluginId: string, slot: SlotName, componentName: string) {
    try {
      const mod = await import(/* @vite-ignore */ `/plugins/${pluginId}/frontend/index.js`);
      const Component = mod[componentName] as React.ComponentType<any> | undefined;

      if (Component) {
        this.registerComponent(pluginId, slot, componentName, Component);
      }
    } catch (err) {
      console.warn(`[PluginClient] Failed to load plugin component ${pluginId}/${componentName}:`, err);
    }
  }

  /** Register a component to a slot. */
  registerComponent(
    pluginId: string,
    slot: SlotName,
    label: string,
    component: React.ComponentType<any>,
    weight = 100,
  ) {
    if (!this.registry.has(slot)) {
      this.registry.set(slot, []);
    }
    this.registry.get(slot)!.push({ pluginId, slot, label, component, weight });
    this.registry.get(slot)!.sort((a, b) => a.weight - b.weight);
  }

  /** Get all components registered for a slot. */
  getComponents(slot: SlotName): RegisteredComponent[] {
    return this.registry.get(slot) ?? [];
  }

  /** Call an action on a plugin backend via the main server proxy. */
  async callAction(pluginId: string, action: string, payload?: any): Promise<any> {
    const res = await fetch(`/api/plugins-proxy/${pluginId}/__action/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    return res.json();
  }

  /** Get plugin info from backend. */
  async getPluginInfo(pluginId: string) {
    const res = await fetch(`/api/plugins/${pluginId}`);
    if (!res.ok) return null;
    return res.json();
  }
}

/** Singleton instance shared across the app. */
export const pluginClient = new PluginClient();
