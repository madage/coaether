import React, { useEffect, useState, useCallback } from 'react';
import { useLang } from '../i18n/context';
import { agentProfiles } from '../api/client';
import { AgentCard } from './AgentCard';
import { AgentCreateCard } from './AgentCreateCard';
import { AgentForm } from './AgentForm';
import { AgentDetailModal } from './AgentDetailModal';
import type { AgentProfile, RuntimeEntity } from '../types';

function generateQuestion(): { a: number; b: number; op: '+' | '-'; answer: number } {
  const a = Math.floor(Math.random() * 20) + 1;
  const b = Math.floor(Math.random() * 20) + 1;
  const op: '+' | '-' = Math.random() > 0.5 ? '+' : '-';
  const answer = op === '+' ? a + b : Math.max(a, b) - Math.min(a, b);
  const [na, nb] = op === '+' ? [a, b] : [Math.max(a, b), Math.min(a, b)];
  return { a: na, b: nb, op, answer };
}

export function AgentList() {
  const { t, lang } = useLang();
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [runtimes, setRuntimes] = useState<Record<string, string>>({});
  const [selectedProfile, setSelectedProfile] = useState<AgentProfile | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  // Delete verification
  const [deleteVerify, setDeleteVerify] = useState<{
    profileId: string;
    a: number; b: number; op: '+' | '-'; answer: number;
  } | null>(null);
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyError, setVerifyError] = useState(false);

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
    const q = generateQuestion();
    setDeleteVerify({ profileId: id, ...q });
    setVerifyInput('');
    setVerifyError(false);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteVerify) return;
    const userAnswer = parseInt(verifyInput, 10);
    if (isNaN(userAnswer) || userAnswer !== deleteVerify.answer) {
      setVerifyError(true);
      return;
    }
    try {
      await agentProfiles.delete(deleteVerify.profileId);
      setProfiles((prev) => prev.filter((p) => p.id !== deleteVerify.profileId));
      setSelectedProfile(null);
      setDeleteVerify(null);
      setVerifyInput('');
      setVerifyError(false);
    } catch {
      // silently fail
    }
  }, [deleteVerify, verifyInput]);

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

      {/* Delete verification modal */}
      {deleteVerify && (
        <div
          onClick={() => { setDeleteVerify(null); setVerifyError(false); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: '12px', padding: '28px',
              width: '360px', maxWidth: '90vw',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)', textAlign: 'center',
            }}
          >
            <h3 style={{ margin: '0 0 8px', color: '#333' }}>{t('confirmDelete')}</h3>
            <p style={{ color: '#666', fontSize: '0.9em', marginBottom: '20px' }}>
              {lang === 'zh' ? '请回答以下验证问题：' : 'Answer the following to confirm:'}
            </p>
            <div style={{ fontSize: '1.4em', fontWeight: 700, color: '#333', marginBottom: '16px' }}>
              {deleteVerify.a} {deleteVerify.op} {deleteVerify.b} = ?
            </div>
            <input
              value={verifyInput}
              onChange={(e) => { setVerifyInput(e.target.value); setVerifyError(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleDeleteConfirm(); }}
              style={{
                width: '100%', padding: '10px', borderRadius: '6px',
                border: verifyError ? '1px solid #c62828' : '1px solid #ddd',
                fontSize: '1.1em', textAlign: 'center', boxSizing: 'border-box', outline: 'none',
                marginBottom: '8px',
              }}
              autoFocus
            />
            {verifyError && (
              <div style={{ color: '#c62828', fontSize: '0.85em', marginBottom: '8px' }}>
                {lang === 'zh' ? '答案错误，请重试' : 'Wrong answer, try again'}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '12px' }}>
              <button
                onClick={() => { setDeleteVerify(null); setVerifyError(false); }}
                style={{
                  padding: '10px 20px', borderRadius: '6px', border: '1px solid #ddd',
                  background: '#fff', cursor: 'pointer', color: '#666', fontSize: '0.95em',
                }}
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleDeleteConfirm}
                style={{
                  padding: '10px 20px', borderRadius: '6px', border: 'none',
                  background: '#c62828', color: '#fff', cursor: 'pointer', fontSize: '0.95em',
                }}
              >
                {t('deleteAgent')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
