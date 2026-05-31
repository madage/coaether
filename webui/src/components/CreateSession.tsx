import { useState } from 'react';
import { sessions as sessionsApi } from '../api/client';
import type { Node } from '../types';

interface CreateSessionProps {
  nodes: Node[];
  onCreated: (sessionID: string) => void;
}

export function CreateSession({ nodes, onCreated }: CreateSessionProps) {
  const [prompt, setPrompt] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [nodeID, setNodeID] = useState(nodes[0]?.id || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!prompt.trim() || !workspace.trim() || !nodeID) {
      setError('All fields are required');
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
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setSubmitting(false);
    }
  }

  const onlineNodes = nodes.filter((n) => n.status === 'online');

  return (
    <form onSubmit={handleSubmit} style={{ padding: '16px' }}>
      <h3>New Session</h3>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Target Node</label>
        <select
          value={nodeID}
          onChange={(e) => setNodeID(e.target.value)}
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
          required
        >
          <option value="">Select a node...</option>
          {nodes.map((node) => (
            <option key={node.id} value={node.id} disabled={node.status !== 'online'}>
              {node.name} ({node.os}) - {node.status}
            </option>
          ))}
        </select>
        {onlineNodes.length === 0 && (
          <div style={{ color: '#f44336', fontSize: '0.85em', marginTop: '4px' }}>
            No online nodes available
          </div>
        )}
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Workspace Path</label>
        <input
          type="text"
          value={workspace}
          onChange={(e) => setWorkspace(e.target.value)}
          placeholder="/home/user/project or C:\Users\me\project"
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
          required
        />
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the task for Claude Code..."
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
        {submitting ? 'Creating...' : 'Start Session'}
      </button>
    </form>
  );
}
