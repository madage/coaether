import { useEffect, useState } from 'react';
import { nodes as nodesApi } from '../api/client';
import type { Node } from '../types';

export function NodeList({ onSelect }: { onSelect?: (node: Node) => void }) {
  const [nodeList, setNodeList] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadNodes();
  }, []);

  async function loadNodes() {
    try {
      setLoading(true);
      const data = await nodesApi.list();
      setNodeList(data.nodes);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load nodes');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="loading">Loading nodes...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (nodeList.length === 0) {
    return <div className="empty">No nodes registered. Start an Agent Node to begin.</div>;
  }

  return (
    <div className="node-list">
      <h3>Nodes ({nodeList.length})</h3>
      {nodeList.map((node) => (
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
            {node.os} / {node.arch} - {node.status}
          </div>
          <div style={{ fontSize: '0.8em', color: '#999' }}>
            Last seen: {new Date(node.last_seen).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
