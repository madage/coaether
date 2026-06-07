# Frontend Slots

Plugins can register React components in the host UI, rendered at specified slot locations.

## Architecture

```
CoAether WebUI
│
├── PluginClient (global singleton)
│   ├── ComponentRegistry
│   │   ├── task-detail-tab: [PluginA.Tab, PluginB.Tab]
│   │   ├── settings-page: [PluginC.Settings]
│   │   └── ...
│   │
│   ├── callAction(pluginId, action, payload)
│   │       └── Host server → POST /api/plugins/{pluginId}/actions/{action}
│   │
│   └── getPluginInfo(pluginId)
│
├── Pages render <PluginSlot name="..." />
│
└── Slot components rendered sorted by weight
```

## Available Slots

| Slot Name | Location | Render Mode | Description |
|-----------|---------|-------------|-------------|
| `task-detail-tab` | Tab bar at top of task detail page | Tab label | Add custom tab pages |
| `task-detail-sidebar` | Right sidebar of task detail page | Vertical stack | Add custom info areas |
| `task-card-actions` | Action button group on task card | Horizontal button layout | Add quick actions |
| `project-sidebar` | Sidebar on project detail page | Vertical stack | Add project-related components |
| `project-header-actions` | Project header action area | Horizontal layout | Add project action buttons |
| `board-toolbar` | Board toolbar | Horizontal layout | Add filter/action tools |
| `settings-page` | Settings page (full page) | Standalone page | Plugin's own settings page |
| `settings-section` | Section within settings page | Collapsible panel | Plugin settings items |
| `global-header` | Global top navigation bar | Horizontal layout | Navigation items |
| `global-sidebar` | Bottom of global sidebar | Vertical stack | Sidebar extension |
| `dashboard-widget` | Dashboard area | Card grid | Overview info cards |

## Declaring Frontend Components

Declare in `plugin.json`:

```json
{
  "frontend": {
    "entry": "./frontend/dist/index.js",
    "slots": {
      "task-detail-tab": "MyTabComponent",
      "settings-section": "MySettings"
    }
  }
}
```

- `entry`: ES Module bundle entry file (relative to plugin directory)
- `slots`: Slot name → exported component name mapping

## Creating Frontend Components

### Project Structure

```
my-plugin/
├── plugin.json
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts          ← Exported components
│       ├── MyTabComponent.tsx
│       └── MySettings.tsx
```

### vite.config.ts

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
    },
  },
});
```

### Component Example

```tsx
// frontend/src/MyTabComponent.tsx
import React from 'react';

interface TaskDetailTabProps {
  taskId?: string;
  taskTitle?: string;
}

export function MyTabComponent({ taskId, taskTitle }: TaskDetailTabProps) {
  return (
    <div style={{ padding: '16px' }}>
      <h4>Plugin Tab</h4>
      <p>Task: {taskTitle} ({taskId})</p>
    </div>
  );
}
```

### Entry File

```tsx
// frontend/src/index.ts
export { MyTabComponent } from './MyTabComponent';
export { MySettings } from './MySettings';
```

### package.json

```json
{
  "name": "my-plugin-frontend",
  "private": true,
  "scripts": {
    "build": "vite build"
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0"
  }
}
```

## Frontend → Backend Communication

Plugin components can call the plugin backend via `callAction`:

```tsx
export function MyTabComponent({ taskId }: { taskId?: string }) {
  const [data, setData] = React.useState(null);

  React.useEffect(() => {
    // Call plugin backend action
    fetch('/api/plugins/my-plugin/widgets')
      .then(res => res.json())
      .then(setData);
  }, []);

  return <div>{JSON.stringify(data)}</div>;
}
```

Requests from components are automatically proxied to the plugin backend (via the host server's reverse proxy).

## Build Specifications

| Specification | Requirement |
|---------------|-------------|
| Bundler | Vite |
| Output format | ES Module |
| React version | Same as host (React 18) |
| CSS isolation | CSS Modules or inline styles |
| Component interface | React.ComponentType<any> |
| No fixed width/height | Controlled by host slot container |

## Style Isolation

Use CSS Modules to avoid style conflicts:

```tsx
// MyTabComponent.module.css
.container { padding: 16px; }
.title { color: #333; }

// MyTabComponent.tsx
import styles from './MyTabComponent.module.css';

export function MyTabComponent() {
  return (
    <div className={styles.container}>
      <h4 className={styles.title}>Content</h4>
    </div>
  );
}
```

## SlotProvider API

Plugin components can import `PluginClient` singleton for more capabilities:

```tsx
import React from 'react';

// Use fetch directly (auto-proxied to plugin backend)
export function MyComponent() {
  const [config, setConfig] = React.useState(null);

  React.useEffect(() => {
    // Fetch plugin config
    fetch('/api/plugins/my-plugin/config')
      .then(r => r.json())
      .then(setConfig);
  }, []);

  return <div>Config: {JSON.stringify(config)}</div>;
}
```
