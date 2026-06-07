# 前端插槽

插件可以向主程序 UI 注册 React 组件，显示在指定的插槽位置。

## 架构

```
CoAether WebUI
│
├── PluginClient (全局单例)
│   ├── ComponentRegistry
│   │   ├── task-detail-tab: [PluginA.Tab, PluginB.Tab]
│   │   ├── settings-page: [PluginC.Settings]
│   │   └── ...
│   │
│   ├── callAction(pluginId, action, payload)
│   │       └── 主服务器 → POST /api/plugins/{pluginId}/actions/{action}
│   │
│   └── getPluginInfo(pluginId)
│
├── 各页面嵌入 <PluginSlot name="..." />
│
└── 插槽组件按 weight 排序渲染
```

## 可用插槽

| 插槽名称 | 位置 | 渲染方式 | 说明 |
|---------|------|---------|------|
| `task-detail-tab` | 任务详情页顶部标签栏 | Tab 标签 | 添加自定义标签页 |
| `task-detail-sidebar` | 任务详情页右侧栏 | 垂直堆叠 | 添加自定义信息区域 |
| `task-card-actions` | 任务卡片操作按钮组 | 水平排列按钮 | 添加快捷操作 |
| `project-sidebar` | 项目详情页侧边栏 | 垂直堆叠 | 添加项目相关组件 |
| `project-header-actions` | 项目头部操作区 | 水平排列 | 添加项目操作按钮 |
| `board-toolbar` | 看板工具栏 | 水平排列 | 添加筛选/操作工具 |
| `settings-page` | 设置页面（全页） | 独立页面 | 插件自己的设置页 |
| `settings-section` | 设置页中的分区 | 折叠面板 | 插件设置项 |
| `global-header` | 全局顶部导航栏 | 水平排列 | 导航项 |
| `global-sidebar` | 全局侧边栏底部 | 垂直堆叠 | 侧边栏扩展 |
| `dashboard-widget` | 仪表盘区域 | 卡片网格 | 概览信息卡片 |

## 声明前端组件

在 `plugin.json` 中声明：

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

- `entry`：ES Module 打包入口文件（相对于插件目录）
- `slots`：插槽名称 → 导出组件名的映射

## 创建前端组件

### 项目结构

```
my-plugin/
├── plugin.json
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts          ← 导出组件
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

### 组件示例

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
      <h4>插件标签页</h4>
      <p>任务: {taskTitle} ({taskId})</p>
    </div>
  );
}
```

### 入口文件

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

## 前端 → 后端通信

插件组件可以通过 `callAction` 调用插件后端：

```tsx
export function MyTabComponent({ taskId }: { taskId?: string }) {
  const [data, setData] = React.useState(null);

  React.useEffect(() => {
    // 调用插件后端的 action
    fetch('/api/plugins/my-plugin/widgets')
      .then(res => res.json())
      .then(setData);
  }, []);

  return <div>{JSON.stringify(data)}</div>;
}
```

组件发起的请求被自动代理到插件后端（通过主服务器的反向代理）。

## 构建规范

| 规范 | 要求 |
|------|------|
| 打包工具 | Vite |
| 输出格式 | ES Module |
| React 版本 | 与主程序同版本（React 18） |
| CSS 隔离 | CSS Modules 或 inline styles |
| 组件接口 | React.ComponentType<any> |
| 不要固定宽高 | 由主程序插槽容器控制 |

## 样式隔离

推荐使用 CSS Modules 避免样式冲突：

```tsx
// MyTabComponent.module.css
.container { padding: 16px; }
.title { color: #333; }

// MyTabComponent.tsx
import styles from './MyTabComponent.module.css';

export function MyTabComponent() {
  return (
    <div className={styles.container}>
      <h4 className={styles.title}>内容</h4>
    </div>
  );
}
```

## SlotProvider API

插件组件可通过导入 `PluginClient` 单例获取更多能力：

```tsx
import React from 'react';

// 直接使用 fetch（自动代理到插件后端）
export function MyComponent() {
  const [config, setConfig] = React.useState(null);

  React.useEffect(() => {
    // 获取插件配置
    fetch('/api/plugins/my-plugin/config')
      .then(r => r.json())
      .then(setConfig);
  }, []);

  return <div>配置: {JSON.stringify(config)}</div>;
}
```
