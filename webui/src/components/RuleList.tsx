import { useState, useEffect, useCallback } from 'react';
import { useLang } from '../i18n/context';
import { rules as rulesApi } from '../api/client';
import { useResourceSync } from '../hooks/useResourceSync';
import { RuleForm } from './RuleForm';
import { RuleLogModal } from './RuleLogModal';
import type { TaskRule } from '../types';

export function RuleList() {
  const { t } = useLang();
  const [ruleList, setRuleList] = useState<TaskRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<TaskRule | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [logRuleId, setLogRuleId] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    try {
      const res = await rulesApi.list();
      setRuleList(res.rules);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  useResourceSync('task_rules', fetchRules);

  const handleToggle = async (rule: TaskRule) => {
    try {
      await rulesApi.update(rule.id, { enabled: !rule.enabled });
      setRuleList((prev) => prev.map((r) => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
    } catch {
      // silently fail
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('ruleConfirmDelete') || 'Delete this rule?')) return;
    try {
      await rulesApi.delete(id);
      setRuleList((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // silently fail
    }
  };

  const handleEdit = (rule: TaskRule) => {
    setEditingRule(rule);
  };

  const triggerLabels: Record<string, string> = {
    on_comment: t('ruleTriggerComment') || 'On Comment',
    on_status_change: t('ruleTriggerStatus') || 'On Status Change',
    on_assignee_change: t('ruleTriggerAssignee') || 'On Assignee Change',
    on_task_create: t('ruleTriggerCreate') || 'On Task Create',
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', color: '#999', textAlign: 'center' }}>
        {t('loading')}...
      </div>
    );
  }

  return (
    <div>
      {ruleList.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#999', padding: '48px 24px', fontSize: '0.9em' }}>
          <p style={{ marginBottom: '16px' }}>{t('ruleEmpty') || 'No automation rules yet.'}</p>
          <button onClick={() => setShowCreate(true)} style={btnPrimaryStyle}>
            {t('ruleCreate') || 'Create Rule'}
          </button>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4 style={{ margin: 0, fontSize: '1em', color: '#333', fontWeight: 600 }}>
              {t('navAutomation') || 'Automation'} ({ruleList.length})
            </h4>
            <button onClick={() => setShowCreate(true)} style={btnPrimaryStyle}>
              {t('ruleCreate') || 'Create Rule'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {ruleList.map((rule) => (
              <div key={rule.id} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 16px', background: '#fafafa', borderRadius: '8px',
                border: '1px solid #eee',
              }}>
                <button
                  onClick={() => handleToggle(rule)}
                  title={rule.enabled ? t('ruleDisable') || 'Disable' : t('ruleEnable') || 'Enable'}
                  style={{
                    width: '36px', height: '20px', borderRadius: '10px',
                    border: 'none', cursor: 'pointer', position: 'relative',
                    background: rule.enabled ? '#4caf50' : '#ccc',
                    transition: 'background 0.2s', flexShrink: 0,
                  }}
                >
                  <span style={{
                    position: 'absolute', top: '2px',
                    left: rule.enabled ? '18px' : '2px',
                    width: '16px', height: '16px', borderRadius: '50%',
                    background: '#fff', transition: 'left 0.2s',
                  }} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.9em', fontWeight: 600, color: '#333', marginBottom: '2px' }}>
                    {rule.name}
                  </div>
                  <div style={{ fontSize: '0.78em', color: '#888' }}>
                    {triggerLabels[rule.trigger_type] || rule.trigger_type}
                    {rule.description && ` — ${rule.description}`}
                  </div>
                </div>
                <button onClick={() => setLogRuleId(rule.id)}
                  style={iconBtnStyle} title={t('ruleViewLogs') || 'View Logs'}>
                  📋
                </button>
                <button onClick={() => handleEdit(rule)}
                  style={iconBtnStyle} title={t('edit') || 'Edit'}>
                  ✏️
                </button>
                <button onClick={() => handleDelete(rule.id)}
                  style={iconBtnStyle} title={t('delete') || 'Delete'}>
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showCreate && (
        <RuleForm
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            fetchRules();
          }}
        />
      )}

      {editingRule && (
        <RuleForm
          rule={editingRule}
          onClose={() => setEditingRule(null)}
          onSaved={() => {
            setEditingRule(null);
            fetchRules();
          }}
        />
      )}

      {logRuleId && (
        <RuleLogModal
          ruleId={logRuleId}
          onClose={() => setLogRuleId(null)}
        />
      )}
    </div>
  );
}

const btnPrimaryStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: '6px', border: 'none',
  background: '#1976d2', color: '#fff', cursor: 'pointer', fontSize: '0.85em', fontWeight: 600,
};

const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: '1em', padding: '4px', lineHeight: 1, opacity: 0.6,
};
