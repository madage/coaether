import React from 'react';
import { pluginClient } from './PluginClient';
import type { SlotName } from './types';

interface PluginSlotProps {
  /** The slot name to render components for. */
  name: SlotName;
  /** Props passed to each plugin component. */
  componentProps?: Record<string, any>;
  /** Custom wrapper style for each plugin component. */
  componentStyle?: React.CSSProperties;
  /** Content shown when no plugins registered for this slot. */
  empty?: React.ReactNode;
}

/**
 * PluginSlot renders all components registered by plugins for a given slot.
 *
 * Usage:
 * ```tsx
 * <PluginSlot name="task-detail-tab" componentProps={{ taskId: task.id }} />
 * ```
 */
export function PluginSlot({ name, componentProps = {}, componentStyle, empty }: PluginSlotProps) {
  const components = pluginClient.getComponents(name);

  if (components.length === 0) {
    return empty !== undefined ? <>{empty}</> : null;
  }

  return (
    <>
      {components.map((reg) => {
        const Component = reg.component;
        return (
          <div
            key={`${reg.pluginId}-${reg.slot}`}
            className={`plugin-slot plugin-slot-${name} plugin-${reg.pluginId}`}
            data-plugin-id={reg.pluginId}
            data-slot={name}
            style={componentStyle}
          >
            <Component {...componentProps} />
          </div>
        );
      })}
    </>
  );
}
