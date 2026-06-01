import { useState, useEffect } from 'react';
import { useLang } from '../i18n/context';
import { agents as agentsApi } from '../api/client';
import type { Node, Agent } from '../types';

interface AgentListProps {
  nodes: Node[];
}

export function AgentList({ nodes }: AgentListProps) {
  const { t } = useLang();
  const [agentMap, setAgentMap] = useState<Record<string, Agent[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onlineNodes = nodes.filter((n) => n.status === 'online' || n.status === 'busy');
    if (onlineNodes.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all(
      onlineNodes.map((n) =>
        agentsApi.list(n.id).then((data) => ({ nodeId: n.id, agents: data.agents })).catch(() => null),
      ),
    ).then((results) => {
      const map: Record<string, Agent[]> = {};
      for (const r of results) {
        if (r && r.agents.length > 0) {
          map[r.nodeId] = r.agents;
        }
      }
      setAgentMap(map);
    }).finally(() => setLoading(false));
  }, [nodes]);

  // Flatten to [nodeId, agent][] for display
  const allAgents: Array<{ nodeId: string; nodeName: string; agent: Agent }> = [];
  for (const n of nodes) {
    const agents = agentMap[n.id];
    if (agents) {
      for (const a of agents) {
        allAgents.push({ nodeId: n.id, nodeName: n.name, agent: a });
      }
    }
  }

  const onlineNodes = nodes.filter((n) => n.status === 'online' || n.status === 'busy');

  if (loading) {
    return <div style={{ padding: '24px', color: '#999' }}>{t('loading')}...</div>;
  }

  if (onlineNodes.length === 0) {
    return <div style={{ padding: '24px', color: '#999' }}>{t('noNodes')}</div>;
  }

  if (allAgents.length === 0) {
    return <div style={{ padding: '24px', color: '#999' }}>{t('noAgents')}</div>;
  }

  return (
    <div className="agent-list" style={{ padding: '24px' }}>
      {allAgents.map(({ nodeId, nodeName, agent }) => (
        <div
          key={`${nodeId}-${agent.id}`}
          style={{
            padding: '12px 16px',
            marginBottom: '8px',
            background: '#fff',
            borderRadius: '8px',
            border: '1px solid #e0e0e0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: '1em' }}>{agent.name}</div>
            <div style={{ fontSize: '0.85em', color: '#666', marginTop: '2px' }}>
              {agent.command}{agent.version ? ` (${agent.version})` : ''}
            </div>
            <div style={{ fontSize: '0.75em', color: '#999', marginTop: '2px' }}>
              {nodeName}
            </div>
          </div>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '0.8em',
              background: agent.enabled ? '#e8f5e9' : '#f5f5f5',
              color: agent.enabled ? '#2e7d32' : '#999',
              border: `1px solid ${agent.enabled ? '#a5d6a7' : '#e0e0e0'}`,
            }}
          >
            {agent.enabled ? t('enabled') : t('disabled')}
          </span>
        </div>
      ))}
    </div>
  );
}
