import { useEffect, useState } from 'react';
import { nodes as nodesApi, sessions as sessionsApi } from '../api/client';
import { useLang } from '../i18n/context';
import type { Node } from '../types';

interface CreateSessionProps {
  nodes?: Node[];
  onCreated: (sessionID: string) => void;
}

export function CreateSession({ nodes: propNodes, onCreated }: CreateSessionProps) {
  const { t } = useLang();
  const [prompt, setPrompt] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [fetchedNodes, setFetchedNodes] = useState<Node[]>([]);
  const [nodeID, setNodeID] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nodes = propNodes && propNodes.length > 0 ? propNodes : fetchedNodes;

  useEffect(() => {
    if (!propNodes || propNodes.length === 0) {
      nodesApi.list().then((data) => {
        setFetchedNodes(data.nodes);
        if (data.nodes.length > 0) setNodeID(data.nodes[0].id);
      }).catch(() => {});
    } else {
      if (propNodes.length > 0) setNodeID(propNodes[0].id);
    }
  }, [propNodes]);

  const statusLabel: Record<string, string> = {
    online: t('nodeOnline'),
    offline: t('nodeOffline'),
    busy: t('nodeBusy'),
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!prompt.trim() || !workspace.trim() || !nodeID) {
      setError(t('allFieldsRequired'));
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const session = await sessionsApi.create({
        prompt: prompt.trim(),
        workspace: workspace.trim(),
        node_id: nodeID,
      });
      onCreated(session.id);
      setPrompt('');
      setWorkspace('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToCreate'));
    } finally {
      setSubmitting(false);
    }
  }

  const onlineNodes = nodes.filter((n) => n.status === 'online');

  return (
    <form onSubmit={handleSubmit} style={{ padding: '16px' }}>
      <h3>{t('newSession')}</h3>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>{t('targetNode')}</label>
        <select
          value={nodeID}
          onChange={(e) => setNodeID(e.target.value)}
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
          required
        >
          <option value="">{t('selectNode')}</option>
          {nodes.map((node) => (
            <option key={node.id} value={node.id} disabled={node.status !== 'online'}>
              {node.name} ({node.os}) - {statusLabel[node.status] || node.status}
            </option>
          ))}
        </select>
        {onlineNodes.length === 0 && (
          <div style={{ color: '#f44336', fontSize: '0.85em', marginTop: '4px' }}>
            {t('noOnlineNodes')}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>{t('workspacePath')}</label>
        <input
          type="text"
          value={workspace}
          onChange={(e) => setWorkspace(e.target.value)}
          placeholder={t('workspacePlaceholder')}
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
          required
        />
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>{t('prompt')}</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('promptPlaceholder')}
          rows={4}
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', resize: 'vertical' }}
          required
        />
      </div>

      {error && (
        <div style={{ color: '#f44336', marginBottom: '12px', fontSize: '0.9em' }}>{error}</div>
      )}

      <button
        type="submit"
        disabled={submitting || onlineNodes.length === 0}
        style={{
          padding: '10px 24px',
          background: submitting ? '#ccc' : '#1976d2',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: submitting ? 'not-allowed' : 'pointer',
          fontSize: '1em',
        }}
      >
        {submitting ? t('creating') : t('startSession')}
      </button>
    </form>
  );
}
