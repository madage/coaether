import { useLang } from '../i18n/context';
import type { Node } from '../types';

interface NodeListProps {
  nodes: Node[];
  onSelect?: (node: Node) => void;
}

export function NodeList({ nodes, onSelect }: NodeListProps) {
  const { t } = useLang();

  const statusLabel: Record<string, string> = {
    online: t('nodeOnline'),
    offline: t('nodeOffline'),
    busy: t('nodeBusy'),
  };

  if (nodes.length === 0) {
    return <div className="empty">{t('noNodes')}</div>;
  }

  return (
    <div className="node-list">
      <h3>{t('agentNodes')} ({nodes.length})</h3>
      {nodes.map((node) => (
        <div
          key={node.id}
          className={`node-card ${node.status}`}
          onClick={() => onSelect?.(node)}
          style={{
            padding: '12px',
            margin: '8px 0',
            borderRadius: '6px',
            cursor: 'pointer',
            background: node.status === 'online' ? '#e8f5e9' : node.status === 'busy' ? '#fff3e0' : '#f5f5f5',
            border: `2px solid ${
              node.status === 'online' ? '#4caf50' : node.status === 'busy' ? '#ff9800' : '#e0e0e0'
            }`,
          }}
        >
          <div style={{ fontWeight: 600 }}>{node.name}</div>
          <div style={{ fontSize: '0.85em', color: '#666' }}>
            {node.os} / {node.arch} - {statusLabel[node.status] || node.status}
          </div>
          <div style={{ fontSize: '0.8em', color: '#999' }}>
            {t('lastSeen')}: {new Date(node.last_seen).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
