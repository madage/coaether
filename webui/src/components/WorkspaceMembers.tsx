import React, { useEffect, useState, useCallback } from 'react';
import { useLang } from '../i18n/context';
import { workspaceMembers, invitations as invitationsApi } from '../api/client';
import { useWorkspace } from '../hooks/WorkspaceContext';
import type { WorkspaceMember, WorkspaceRole, PendingInvitation } from '../types';

interface Props {
  workspaceId: string;
}

function WorkspaceMembers({ workspaceId }: Props) {
  const { t, lang } = useLang();
  const { role } = useWorkspace();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('worker');
  const [error, setError] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [activeTab, setActiveTab] = useState<'members' | 'invitations'>('members');

  const canManage = role === 'admin' || role === 'owner';

  const fetchData = useCallback(async () => {
    try {
      const [membersRes, invRes] = await Promise.all([
        workspaceMembers.list(workspaceId),
        invitationsApi.list(workspaceId).catch(() => ({ invitations: [] as PendingInvitation[] })),
      ]);
      setMembers(membersRes.members);
      setInvitations(invRes.invitations);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleInvite = useCallback(async () => {
    if (!inviteEmail.trim()) return;
    setError('');
    setInviteLink('');
    try {
      const res = await invitationsApi.create(workspaceId, { email: inviteEmail, role: inviteRole });
      setInviteEmail('');
      setInviteRole('worker');
      // Show the invitation link
      if (res.redirect_url) {
        setInviteLink(res.redirect_url);
      }
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation');
    }
  }, [inviteEmail, inviteRole, workspaceId, fetchData]);

  const handleRemove = useCallback(async (userId: string) => {
    if (!window.confirm(lang === 'zh' ? '确定移除该成员？' : 'Remove this member?')) return;
    try {
      await workspaceMembers.remove(workspaceId, userId);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  }, [workspaceId, fetchData, lang]);

  const handleRoleChange = useCallback(async (userId: string, newRole: WorkspaceRole) => {
    try {
      await workspaceMembers.updateRole(workspaceId, userId, { role: newRole });
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    }
  }, [workspaceId, fetchData]);

  const handleCancelInvitation = useCallback(async (invId: string) => {
    try {
      await invitationsApi.cancel(workspaceId, invId);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel invitation');
    }
  }, [workspaceId, fetchData]);

  const roleName = (r: string) => {
    const names: Record<string, string> = {
      owner: lang === 'zh' ? '拥有者' : 'Owner',
      admin: lang === 'zh' ? '管理员' : 'Admin',
      worker: lang === 'zh' ? '工作人员' : 'Worker',
      observer: lang === 'zh' ? '观察者' : 'Observer',
    };
    return names[r] || r;
  };

  const statusLabel = (s: string) => {
    const labels: Record<string, string> = {
      pending: lang === 'zh' ? '待确认' : 'Pending',
      accepted: lang === 'zh' ? '已接受' : 'Accepted',
      declined: lang === 'zh' ? '已拒绝' : 'Declined',
      expired: lang === 'zh' ? '已过期' : 'Expired',
    };
    return labels[s] || s;
  };

  if (loading) {
    return <div style={{ color: '#999', fontSize: '0.9em', padding: '12px 0' }}>{t('loading')}...</div>;
  }

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', borderBottom: '1px solid #eee' }}>
        <button
          onClick={() => setActiveTab('members')}
          style={{
            padding: '6px 12px', border: 'none', background: 'none',
            cursor: 'pointer', fontSize: '0.85em',
            color: activeTab === 'members' ? '#1976d2' : '#999',
            borderBottom: activeTab === 'members' ? '2px solid #1976d2' : '2px solid transparent',
            fontWeight: activeTab === 'members' ? 600 : 400,
          }}
        >
          {lang === 'zh' ? '成员' : 'Members'} ({members.length})
        </button>
        <button
          onClick={() => setActiveTab('invitations')}
          style={{
            padding: '6px 12px', border: 'none', background: 'none',
            cursor: 'pointer', fontSize: '0.85em',
            color: activeTab === 'invitations' ? '#1976d2' : '#999',
            borderBottom: activeTab === 'invitations' ? '2px solid #1976d2' : '2px solid transparent',
            fontWeight: activeTab === 'invitations' ? 600 : 400,
          }}
        >
          {lang === 'zh' ? '邀请' : 'Invitations'} ({invitations.length})
        </button>
      </div>

      {activeTab === 'members' && (
        <>
          {/* Member list */}
          <div style={{ marginBottom: '16px' }}>
            {members.map((m) => (
              <div key={m.user_id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', borderRadius: '8px', marginBottom: '6px',
                background: '#f9f9f9',
              }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.95em' }}>{m.username}</div>
                  <div style={{ fontSize: '0.8em', color: '#999' }}>
                    {roleName(m.role)}
                    {' · '}
                    {new Date(m.joined_at).toLocaleDateString()}
                  </div>
                </div>
                {canManage && m.role !== 'owner' && (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.user_id, e.target.value as WorkspaceRole)}
                      style={{
                        padding: '4px 6px', borderRadius: '4px', border: '1px solid #ddd',
                        fontSize: '0.8em', cursor: 'pointer',
                      }}
                    >
                      <option value="admin">{roleName('admin')}</option>
                      <option value="worker">{roleName('worker')}</option>
                      <option value="observer">{roleName('observer')}</option>
                    </select>
                    <button
                      onClick={() => handleRemove(m.user_id)}
                      style={{
                        padding: '4px 8px', borderRadius: '4px', border: '1px solid #e0e0e0',
                        background: '#fff', cursor: 'pointer', color: '#c62828', fontSize: '0.8em',
                      }}
                    >
                      {t('taskDelete')}
                    </button>
                  </div>
                )}
                {m.role === 'owner' && (
                  <span style={{
                    padding: '4px 10px', borderRadius: '4px', background: '#e8e8e8',
                    color: '#999', fontSize: '0.75em',
                  }}>{roleName('owner')}</span>
                )}
              </div>
            ))}
          </div>

          {/* Invite by email form */}
          {canManage && (
            <div style={{ borderTop: '1px solid #eee', paddingTop: '16px' }}>
              <div style={{ fontWeight: 500, fontSize: '0.9em', marginBottom: '8px', color: '#555' }}>
                {lang === 'zh' ? '通过邮箱邀请成员' : 'Invite Member by Email'}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="email"
                  placeholder={lang === 'zh' ? '输入邮箱地址' : 'Enter email address'}
                  value={inviteEmail}
                  onChange={(e) => { setInviteEmail(e.target.value); setError(''); setInviteLink(''); }}
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd',
                    fontSize: '0.9em', boxSizing: 'border-box',
                  }}
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)}
                  style={{
                    padding: '8px', borderRadius: '6px', border: '1px solid #ddd',
                    fontSize: '0.9em', cursor: 'pointer',
                  }}
                >
                  <option value="admin">{roleName('admin')}</option>
                  <option value="worker">{roleName('worker')}</option>
                  <option value="observer">{roleName('observer')}</option>
                </select>
                <button
                  onClick={handleInvite}
                  style={{
                    padding: '8px 16px', borderRadius: '6px', border: 'none',
                    background: '#1976d2', color: '#fff', cursor: 'pointer', fontSize: '0.9em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {lang === 'zh' ? '邀请' : 'Invite'}
                </button>
              </div>
              {error && <div style={{ color: '#c62828', fontSize: '0.85em', marginBottom: '8px' }}>{error}</div>}
              {inviteLink && (
                <div style={{
                  background: '#e8f5e9', borderRadius: '6px', padding: '10px 12px',
                  fontSize: '0.85em', color: '#2e7d32', wordBreak: 'break-all',
                }}>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                    {lang === 'zh' ? '邀请已创建！链接（开发环境）：' : 'Invitation created! Link (dev):'}
                  </div>
                  <a href={inviteLink} target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2' }}>
                    {inviteLink}
                  </a>
                  <button
                    onClick={() => navigator.clipboard.writeText(inviteLink)}
                    style={{
                      marginLeft: '8px', padding: '2px 8px', borderRadius: '4px',
                      border: '1px solid #2e7d32', background: '#fff', color: '#2e7d32',
                      cursor: 'pointer', fontSize: '0.8em',
                    }}
                  >
                    {lang === 'zh' ? '复制' : 'Copy'}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === 'invitations' && (
        <div>
          {invitations.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#999', padding: '24px', fontSize: '0.9em' }}>
              {lang === 'zh' ? '暂无待处理的邀请' : 'No pending invitations'}
            </div>
          ) : (
            invitations.map((inv) => (
              <div key={inv.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', borderRadius: '8px', marginBottom: '6px',
                background: '#f9f9f9',
              }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.95em' }}>{inv.invitee_email}</div>
                  <div style={{ fontSize: '0.8em', color: '#999' }}>
                    {roleName(inv.role)}
                    {' · '}
                    {statusLabel(inv.status)}
                    {' · '}
                    {new Date(inv.created_at).toLocaleDateString()}
                  </div>
                </div>
                {canManage && inv.status === 'pending' && (
                  <button
                    onClick={() => handleCancelInvitation(inv.id)}
                    style={{
                      padding: '4px 8px', borderRadius: '4px', border: '1px solid #e0e0e0',
                      background: '#fff', cursor: 'pointer', color: '#c62828', fontSize: '0.8em',
                    }}
                  >
                    {lang === 'zh' ? '取消' : 'Cancel'}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {!canManage && (
        <div style={{ fontSize: '0.85em', color: '#999', textAlign: 'center', padding: '12px 0' }}>
          {lang === 'zh' ? '仅管理员和拥有者可管理成员' : 'Only admins and owners can manage members'}
        </div>
      )}
    </div>
  );
}

export default WorkspaceMembers;
