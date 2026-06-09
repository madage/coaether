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
  const [showHelp, setShowHelp] = useState(false);

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, fontSize: '1.15em', color: '#1a1a2e' }}>
          {t('agentProfiles')}
          {profiles.length > 0 && (
            <span style={{ color: '#999', fontSize: '0.8em', fontWeight: 400, marginLeft: '8px' }}>
              ({profiles.length})
            </span>
          )}
        </h3>
        <button
          onClick={() => setShowHelp(true)}
          title={lang === 'zh' ? '创建规范' : 'Creation guide'}
          style={{
            width: '32px', height: '32px', borderRadius: '50%',
            border: '1px solid #ddd', background: '#fff', cursor: 'pointer',
            fontSize: '1em', fontWeight: 700, color: '#999',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >?</button>
      </div>

      {/* Help modal */}
      {showHelp && (
        <div onClick={() => setShowHelp(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200,
          }}
        >
          <div onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: '12px', padding: '32px',
              width: '600px', maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15em', color: '#1a1a2e' }}>
                {lang === 'zh' ? '智能体创建规范' : 'Agent Creation Guide'}
              </h3>
              <button onClick={() => setShowHelp(false)}
                style={{ width: '30px', height: '30px', borderRadius: '50%', border: 'none', background: '#f5f5f5', cursor: 'pointer', fontSize: '1em', color: '#666' }}
              >✕</button>
            </div>

            <div style={{ fontSize: '0.9em', color: '#444', lineHeight: 1.7 }}>
              {lang === 'zh' ? (
                <>
                  <h4 style={{ margin: '0 0 8px', color: '#333' }}>1. 名称 (Name)</h4>
                  <p style={{ margin: '0 0 16px', color: '#666' }}>给智能体起一个简洁明了的名称，例如"前端助手"、"代码审查员"。名称将显示在任务分配和队列中。</p>

                  <h4 style={{ margin: '0 0 8px', color: '#333' }}>2. 描述 (Description)</h4>
                  <p style={{ margin: '0 0 16px', color: '#666' }}>简要描述智能体的职责和能力范围，例如"负责前端代码审查和 CSS 优化"。描述会展示在智能体卡片上。</p>

                  <h4 style={{ margin: '0 0 8px', color: '#333' }}>3. 系统提示词 (System Prompt)</h4>
                  <p style={{ margin: '0 0 16px', color: '#666' }}>定义智能体的角色、个性和专业知识。这是最关键的配置项，决定了智能体的行为方式。</p>

                  <h4 style={{ margin: '0 0 8px', color: '#333' }}>4. 行为指令 (Behavior Instructions)</h4>
                  <p style={{ margin: '0 0 16px', color: '#666' }}>定义沟通风格、语气和行为准则，使智能体更具个性。</p>

                  <h4 style={{ margin: '0 0 8px', color: '#333' }}>5. 能力标签 (Ability Tags)</h4>
                  <p style={{ margin: '0 0 16px', color: '#666' }}>用逗号分隔的标签，标识智能体的技能领域，如 "frontend, react, css"。</p>

                  <h4 style={{ margin: '0 0 8px', color: '#333' }}>6. 节点与运行时 (Node & Runtime)</h4>
                  <p style={{ margin: '0 0 16px', color: '#666' }}>选择智能体运行的目标节点和运行时环境。节点必须在线且状态正常。</p>

                  <h4 style={{ margin: '0 0 8px', color: '#333' }}>7. 审核采样率 (Review Sample Rate)</h4>
                  <p style={{ margin: '0 0 16px', color: '#666' }}>0.0 到 1.0 之间的值，控制任务完成后进入审核流程的比例。0.0 表示从不审核，1.0 表示始终审核。</p>

                  <h4 style={{ margin: '0 0 8px', color: '#333' }}>示例配置</h4>
                  <pre style={{
                    background: '#f5f5f5', padding: '12px', borderRadius: '8px',
                    fontSize: '0.85em', lineHeight: 1.5, overflow: 'auto',
                  }}>
{`名称: 前端代码审查员
描述: 负责 React 组件的代码审查和性能优化
系统提示词: 你是一名资深前端工程师，
精通 React、TypeScript 和 CSS。
审查代码时关注：可维护性、性能、
可访问性和最佳实践。
行为指令: 以专业且友善的语气提供
代码反馈，给出具体改进建议。
能力标签: frontend, react, typescript, css
审核采样率: 1.0`}
                  </pre>
                </>
              ) : (
                <>
                  <h4 style={{ margin: '0 0 8px', color: '#333' }}>1. Name</h4>
                  <p style={{ margin: '0 0 16px', color: '#666' }}>Give your agent a clear, concise name, e.g. "Frontend Assistant" or "Code Reviewer". The name appears in task assignments and the queue.</p>

                  <h4 style={{ margin: '0 0 8px', color: '#333' }}>2. Description</h4>
                  <p style={{ margin: '0 0 16px', color: '#666' }}>Briefly describe the agent's responsibilities and capabilities, e.g. "Handles frontend code review and CSS optimization". Displayed on the agent card.</p>

                  <h4 style={{ margin: '0 0 8px', color: '#333' }}>3. System Prompt</h4>
                  <p style={{ margin: '0 0 16px', color: '#666' }}>Defines the agent's role, personality, and expertise. This is the most critical configuration — it determines how the agent behaves.</p>

                  <h4 style={{ margin: '0 0 8px', color: '#333' }}>4. Behavior Instructions</h4>
                  <p style={{ margin: '0 0 16px', color: '#666' }}>Defines communication style, tone, and behavioral guidelines to make the agent more personable.</p>

                  <h4 style={{ margin: '0 0 8px', color: '#333' }}>5. Ability Tags</h4>
                  <p style={{ margin: '0 0 16px', color: '#666' }}>Comma-separated tags identifying the agent's skill areas, e.g. "frontend, react, css".</p>

                  <h4 style={{ margin: '0 0 8px', color: '#333' }}>6. Node & Runtime</h4>
                  <p style={{ margin: '0 0 16px', color: '#666' }}>Select the target node and runtime where the agent runs. The node must be online and healthy.</p>

                  <h4 style={{ margin: '0 0 8px', color: '#333' }}>7. Review Sample Rate</h4>
                  <p style={{ margin: '0 0 16px', color: '#666' }}>A value between 0.0 and 1.0 controlling the proportion of completed tasks that enter review. 0.0 = never review, 1.0 = always review.</p>

                  <h4 style={{ margin: '0 0 8px', color: '#333' }}>Example Configuration</h4>
                  <pre style={{
                    background: '#f5f5f5', padding: '12px', borderRadius: '8px',
                    fontSize: '0.85em', lineHeight: 1.5, overflow: 'auto',
                  }}>
{`Name: Frontend Code Reviewer
Description: Reviews React components
  and performance optimizations
System Prompt: You are a senior frontend
  engineer proficient in React, TypeScript,
  and CSS. Focus on: maintainability,
  performance, accessibility, and best
  practices.
Behavior: Provide code feedback in a
  professional and friendly tone with
  concrete improvement suggestions.
Tags: frontend, react, typescript, css
Review Sample Rate: 1.0`}
                  </pre>
                </>
              )}
            </div>
          </div>
        </div>
      )}

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
