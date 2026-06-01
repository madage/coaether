import React, { useEffect, useState, useCallback } from 'react';
import { useLang } from '../i18n/context';
import { agentProfiles } from '../api/client';
import { AgentCard } from './AgentCard';
import { AgentCreateCard } from './AgentCreateCard';
import { AgentForm } from './AgentForm';
import { AgentDetailModal } from './AgentDetailModal';
import type { AgentProfile, RuntimeEntity } from '../types';

export function AgentList() {
  const { t } = useLang();
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [runtimes, setRuntimes] = useState<Record<string, string>>({});
  const [selectedProfile, setSelectedProfile] = useState<AgentProfile | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProfiles = useCallback(async () => {
    try {
      const [profilesRes, runtimesRes] = await Promise.all([
        agentProfiles.list(),
        agentProfiles.listRuntimes(),
      ]);
      setProfiles(profilesRes.profiles);
      const rtMap: Record<string, string> = {};
      runtimesRes.runtimes.forEach((r: RuntimeEntity) => { rtMap[r.id] = r.name; });
      setRuntimes(rtMap);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const handleUpdate = useCallback(async (id: string, data: Partial<AgentProfile>) => {
    try {
      await agentProfiles.update(id, data);
      setProfiles((prev) => prev.map((p) => p.id === id ? { ...p, ...data } : p));
      setSelectedProfile(null);
    } catch {
      // silently fail
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm(t('confirmDelete'))) return;
    try {
      await agentProfiles.delete(id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      setSelectedProfile(null);
    } catch {
      // silently fail
    }
  }, [t]);

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
            runtimeName={runtimes[profile.agent_id] || profile.agent_id}
            onClick={() => setSelectedProfile(profile)}
          />
        ))}
        <AgentCreateCard onClick={() => setShowCreate(true)} />
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
          runtimeName={runtimes[selectedProfile.agent_id] || selectedProfile.agent_id}
          onClose={() => setSelectedProfile(null)}
          onSave={handleUpdate}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
