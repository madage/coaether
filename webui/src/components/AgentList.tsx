import React, { useEffect, useState, useCallback } from 'react';
import { useLang } from '../i18n/context';
import { agentProfiles, nodes, agents } from '../api/client';
import { AgentCard } from './AgentCard';
import { AgentCreateCard } from './AgentCreateCard';
import { AgentForm } from './AgentForm';
import { AgentDetailModal } from './AgentDetailModal';
import { MathConfirmDialog } from './MathConfirmDialog';
import { useResourceSync } from '../hooks/useResourceSync';
import type { AgentProfile, Node } from '../types';
import { useWorkspace } from '../hooks/WorkspaceContext';

export function AgentList() {
  const { t, lang } = useLang();
  const { role } = useWorkspace();
  const isObserver = role === 'observer';
  const canWrite = role === 'admin' || role === 'owner' || role === 'worker';
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [agentsMap, setAgentsMap] = useState<Record<string, string>>({});
  const [nodesMap, setNodesMap] = useState<Record<string, string>>({});
  const [selectedProfile, setSelectedProfile] = useState<AgentProfile | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteProfileId, setDeleteProfileId] = useState<string | null>(null);

  const fetchProfiles = useCallback(async () => {
    try {
      const [profilesRes, nodesRes] = await Promise.all([
        agentProfiles.list(),
        nodes.list(),
      ]);
      setProfiles(profilesRes.profiles);

      // Build node name map
      const ndMap: Record<string, string> = {};
      nodesRes.nodes.forEach((n: Node) => { ndMap[n.id] = n.name; });
      setNodesMap(ndMap);

      // Fetch agents for each unique node_id from profiles
      const nodeIds = [...new Set(profilesRes.profiles.map(p => p.node_id).filter((id): id is string => !!id))];
      const agentMap: Record<string, string> = {};
      await Promise.all(nodeIds.map(async (nid) => {
        try {
          const res = await agents.list(nid);
          res.agents.forEach(a => { agentMap[a.id] = a.name; });
        } catch {
          // node might be offline
        }
      }));
      setAgentsMap(agentMap);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  useResourceSync('agent_profiles', fetchProfiles);

  const handleUpdate = useCallback(async (id: string, data: Partial<AgentProfile>) => {
    try {
      await agentProfiles.update(id, data);
      setProfiles((prev) => prev.map((p) => p.id === id ? { ...p, ...data } : p));
      setSelectedProfile(null);
    } catch {
      // silently fail
    }
  }, []);

  const handleDelete = useCallback((id: string) => {
    setDeleteProfileId(id);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteProfileId) return;
    const id = deleteProfileId;
    setDeleteProfileId(null);
    try {
      await agentProfiles.delete(id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      setSelectedProfile(null);
    } catch {
      // silently fail
    }
  }, [deleteProfileId]);

  if (loading) {
    return (
      <div style={{ padding: '24px', color: '#999', textAlign: 'center' }}>
        {t('loading')}...
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '20px',
      }}>
        {profiles.map((profile) => (
          <AgentCard
            key={profile.id}
            profile={profile}
            runtimeName={agentsMap[profile.agent_id] || profile.agent_id}
            nodeName={(profile.node_id && nodesMap[profile.node_id]) || ''}
            onClick={() => setSelectedProfile(profile)}
          />
        ))}
        {!isObserver && <AgentCreateCard onClick={() => setShowCreate(true)} />}
      </div>

      {profiles.length === 0 && (
        <div style={{ textAlign: 'center', color: '#999', marginTop: '48px', fontSize: '0.95em' }}>
          {t('noProfiles')}
        </div>
      )}

      {showCreate && (
        <AgentForm
          onClose={() => setShowCreate(false)}
          onCreated={fetchProfiles}
        />
      )}

      {selectedProfile && (
        <AgentDetailModal
          profile={selectedProfile}
          runtimeName={agentsMap[selectedProfile.agent_id] || selectedProfile.agent_id}
          nodeName={(selectedProfile.node_id && nodesMap[selectedProfile.node_id]) || ''}
          onClose={() => setSelectedProfile(null)}
          onSave={canWrite ? handleUpdate : undefined}
          onDelete={role === 'admin' || role === 'owner' ? handleDelete : undefined}
        />
      )}

      <MathConfirmDialog
        open={deleteProfileId !== null}
        title={t('confirmDelete')}
        description={lang === 'zh' ? '此操作不可恢复，请完成验证：' : 'This cannot be undone. Complete the verification:'}
        confirmLabel={t('deleteAgent')}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteProfileId(null)}
      />
    </div>
  );
}
