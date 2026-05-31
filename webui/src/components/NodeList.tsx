import { useState, useEffect, useCallback } from 'react';
import { useLang } from '../i18n/context';
import { agents as agentsApi, nodes as nodesApi } from '../api/client';
import type { Node, Agent } from '../types';

interface NodeListProps {
  nodes: Node[];
  onSelect?: (node: Node) => void;
}

export function NodeList({ nodes, onSelect }: NodeListProps) {
  const { t } = useLang();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [agentMap, setAgentMap] = useState<Record<string, Agent[]>>({});
  const [scanning, setScanning] = useState<string | null>(null);

  const statusLabel: Record<string, string> = {
    online: t('nodeOnline'),
    offline: t('nodeOffline'),
    busy: t('nodeBusy'),
  };

  // Fetch agents when a node is expanded
  useEffect(() => {
    if (expandedId && !agentMap[expandedId]) {
      agentsApi.list(expandedId).then((data) => {
        setAgentMap((prev) => ({ ...prev, [expandedId]: data.agents }));
      }).catch(() => {});
    }
  }, [expandedId, agentMap]);

  const handleScan = useCallback(async (nodeID: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setScanning(nodeID);
    try {
      await nodesApi.scan(nodeID);
      // Re-fetch agents after short delay
      setTimeout(async () => {
        const data = await agentsApi.list(nodeID);
        setAgentMap((prev) => ({ ...prev, [nodeID]: data.agents }));
        setScanning(null);
      }, 2000);
    } catch {
      setScanning(null);
    }
  }, []);

  const handleToggleAgent = useCallback(async (agent: Agent, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await agentsApi.toggle(agent.id, !agent.enabled);
      setAgentMap((prev) => ({
        ...prev,
        [agent.node_id]: (prev[agent.node_id] || []).map((a) =>
          a.id === agent.id ? { ...a, enabled: !a.enabled } : a,
        ),
      }));
    } catch {}
  }, []);

  if (nodes.length === 0) {
    return <div className="empty">{t('noNodes')}</div>;
  }

  return (
    <div className="node-list">
      {nodes.map((node) => {
        const agents = agentMap[node.id];
        const isExpanded = expandedId === node.id;

        return (
          <div key={node.id} style={{ margin: '8px 0' }}>
            <div
              className={`node-card ${node.status}`}
              onClick={() => {
                onSelect?.(node);
                setExpandedId(isExpanded ? null : node.id);
              }}
              style={{
                padding: '12px',
                borderRadius: '6px',
                cursor: 'pointer',
                background: node.status === 'online' ? '#e8f5e9' : node.status === 'busy' ? '#fff3e0' : '#f5f5f5',
                border: `2px solid ${
                  node.status === 'online' ? '#4caf50' : node.status === 'busy' ? '#ff9800' : '#e0e0e0'
                }`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{node.name}</div>
                  <div style={{ fontSize: '0.85em', color: '#666' }}>
                    {node.os} / {node.arch} - {statusLabel[node.status] || node.status}
                  </div>
                  <div style={{ fontSize: '0.8em', color: '#999' }}>
                    {t('lastSeen')}: {new Date(node.last_seen).toLocaleString()}
                  </div>
                </div>
                <div style={{ fontSize: '0.8em', color: '#999', textAlign: 'right' }}>
                  <div>{t('maxSessions')}: {node.max_sessions}</div>
                  <button
                    onClick={(e) => handleScan(node.id, e)}
                    disabled={scanning === node.id}
                    style={{
                      marginTop: '4px',
                      padding: '3px 8px',
                      background: scanning === node.id ? '#ccc' : '#1976d2',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: scanning === node.id ? 'not-allowed' : 'pointer',
                      fontSize: '0.85em',
                    }}
                  >
                    {scanning === node.id ? t('scanning') : t('scanAgents')}
                  </button>
                </div>
              </div>
            </div>

            {/* Expanded agent list */}
            {isExpanded && (
              <div
                style={{
                  margin: '0 8px',
                  padding: '8px 12px',
                  background: '#fafafa',
                  border: '1px solid #e0e0e0',
                  borderTop: 'none',
                  borderRadius: '0 0 6px 6px',
                }}
              >
                <div style={{ fontSize: '0.9em', fontWeight: 500, marginBottom: '6px' }}>
                  {t('agents')}:
                </div>
                {!agents ? (
                  <div style={{ fontSize: '0.85em', color: '#999' }}>{t('loading')}...</div>
                ) : agents.length === 0 ? (
                  <div style={{ fontSize: '0.85em', color: '#999' }}>{t('noAgents')}</div>
                ) : (
                  agents.map((agent) => (
                    <div
                      key={agent.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '4px 8px',
                        margin: '2px 0',
                        background: '#fff',
                        borderRadius: '4px',
                        border: '1px solid #eee',
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 500 }}>{agent.name}</span>
                        <span style={{ fontSize: '0.8em', color: '#999', marginLeft: '8px' }}>
                          {agent.command} {agent.version ? `(${agent.version})` : ''}
                        </span>
                      </div>
                      <button
                        onClick={(e) => handleToggleAgent(agent, e)}
                        style={{
                          padding: '2px 8px',
                          background: agent.enabled ? '#4caf50' : '#e0e0e0',
                          color: agent.enabled ? '#fff' : '#666',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          fontSize: '0.8em',
                        }}
                      >
                        {agent.enabled ? t('enabled') : t('disabled')}
                      </button>
                    </div>
                  ))
                )}
                {agents && agents.length > 0 && (
                  <div style={{ fontSize: '0.75em', color: '#bbb', marginTop: '4px' }}>
                    {t('agentHint')}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
