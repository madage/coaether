import { useState, useEffect, useCallback } from 'react';
import { useLang } from '../i18n/context';
import { tools as toolsApi } from '../api/client';
import { useResourceSync } from '../hooks/useResourceSync';
import type { SystemTool } from '../types';

const toolNameKeyMap: Record<string, string> = {
  create_sub_task: 'toolName_create_sub_task',
  propose_decomposition_plan: 'toolName_propose_decomposition_plan',
  assign_task: 'toolName_assign_task',
  review_task: 'toolName_review_task',
  add_comment: 'toolName_add_comment',
  get_task_detail: 'toolName_get_task_detail',
  list_sub_tasks: 'toolName_list_sub_tasks',
  update_task_status: 'toolName_update_task_status',
  search_agent_profiles: 'toolName_search_agent_profiles',
};

export function ToolSet() {
  const { t, lang } = useLang();

  const getToolDisplayName = (name: string): string => {
    const key = toolNameKeyMap[name];
    return key ? (t as (k: string) => string)(key) : name;
  };

  const [toolList, setToolList] = useState<SystemTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  const fetchTools = useCallback(async () => {
    try {
      const res = await toolsApi.list();
      setToolList(res.tools);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  useResourceSync('tools', fetchTools);

  const handleToggle = async (toolName: string, enabled: boolean) => {
    // Optimistic update
    setToolList(prev =>
      prev.map(t => t.name === toolName ? { ...t, enabled, status: enabled ? 'active' : 'disabled' } : t)
    );
    try {
      await toolsApi.toggle(toolName, enabled);
    } catch {
      // Revert on failure
      fetchTools();
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', color: '#999', textAlign: 'center' }}>
        {t('loading')}...
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: '1.15em', color: '#1a1a2e' }}>
          {t('toolSetTitle')}
          <span style={{ color: '#999', fontSize: '0.8em', fontWeight: 400, marginLeft: '8px' }}>({toolList.length})</span>
        </h3>
        <p style={{ margin: 0, color: '#999', fontSize: '0.82em' }}>
          {lang === 'zh' ? '管理 Harness 工具的全局开关状态' : 'Manage global on/off state of Harness tools'}
        </p>
      </div>

      {/* Card grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '16px',
      }}>
        {toolList.map(tool => (
          <div
            key={tool.name}
            onClick={() => setExpandedTool(expandedTool === tool.name ? null : tool.name)}
            style={{
              background: '#fff',
              borderRadius: '12px',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1), 0 10px 20px rgba(0,0,0,0.06)',
              cursor: 'pointer',
              overflow: 'hidden',
              opacity: tool.enabled ? 1 : 0.6,
              transition: 'transform 0.2s, boxShadow 0.2s, opacity 0.2s',
              position: 'relative',
            }}
            onMouseEnter={(e) => {
              if (tool.enabled) {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.12), 0 16px 32px rgba(0,0,0,0.08)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = '';
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1), 0 10px 20px rgba(0,0,0,0.06)';
            }}
          >
            {/* Toggle switch (top-right) */}
            <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggle(tool.name, !tool.enabled);
                }}
                style={{
                  width: '36px',
                  height: '20px',
                  borderRadius: '10px',
                  background: tool.enabled ? '#4caf50' : '#ccc',
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '2px',
                  left: tool.enabled ? '18px' : '2px',
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                }} />
              </div>
            </div>

            {/* Content */}
            <div style={{ padding: '20px 24px' }}>
              {/* Icon based on tool type */}
              <div style={{ fontSize: '1.6em', marginBottom: '8px', lineHeight: 1 }}>
                {tool.name === 'create_sub_task' ? '📦' :
                 tool.name === 'propose_decomposition_plan' ? '📋' :
                 tool.name === 'assign_task' ? '👤' :
                 tool.name === 'review_task' ? '✅' :
                 tool.name === 'add_comment' ? '💬' :
                 tool.name === 'get_task_detail' ? '🔍' :
                 tool.name === 'list_sub_tasks' ? '📑' :
                 tool.name === 'update_task_status' ? '🔄' : '🔧'}
              </div>
              <div style={{ fontWeight: 600, fontSize: '0.95em', color: '#333', marginBottom: '4px' }}>
                {getToolDisplayName(tool.name)}
              </div>
              <div style={{ fontSize: '0.8em', color: '#999', marginBottom: '8px', lineHeight: 1.4 }}>
                {tool.description}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                <span style={{
                  padding: '2px 8px', borderRadius: '8px', fontSize: '0.7em', fontWeight: 500,
                  background: tool.enabled ? '#e8f5e9' : '#fbe9e7',
                  color: tool.enabled ? '#2e7d32' : '#c62828',
                }}>
                  {tool.enabled ? (lang === 'zh' ? '启用' : 'Enabled') : (lang === 'zh' ? '已禁用' : 'Disabled')}
                </span>
                <span style={{
                  padding: '2px 8px', borderRadius: '8px', fontSize: '0.7em', fontWeight: 500,
                  background: '#e3f2fd', color: '#1565c0',
                }}>
                  {tool.required_perm}
                </span>
              </div>
              <div style={{ fontSize: '0.75em', color: '#aaa' }}>
                {tool.linked_agent_count > 0
                  ? (lang === 'zh' ? `${tool.linked_agent_count} 个智能体已挂载` : `${tool.linked_agent_count} agents mounted`)
                  : (lang === 'zh' ? '暂无智能体挂载' : 'No agents mounted')}
              </div>
            </div>

            {/* Expanded detail: linked agents */}
            {expandedTool === tool.name && tool.linked_agent_names.length > 0 && (
              <div style={{
                borderTop: '1px solid #eee',
                padding: '12px 24px 16px',
                background: '#fafafa',
              }}>
                <div style={{ fontSize: '0.8em', fontWeight: 600, color: '#666', marginBottom: '6px' }}>
                  {t('toolLinkedAgents')}:
                </div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {tool.linked_agent_names.map(name => (
                    <span key={name} style={{
                      padding: '2px 8px', borderRadius: '8px', fontSize: '0.75em',
                      background: '#e8f5e9', color: '#2e7d32', fontWeight: 500,
                    }}>{name}</span>
                  ))}
                </div>
              </div>
            )}
            {expandedTool === tool.name && tool.linked_agent_names.length === 0 && (
              <div style={{
                borderTop: '1px solid #eee',
                padding: '12px 24px 16px',
                background: '#fafafa',
              }}>
                <div style={{ fontSize: '0.8em', color: '#aaa' }}>
                  {lang === 'zh' ? '暂无智能体挂载此工具' : 'No agents have this tool in their capabilities'}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
