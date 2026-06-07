import { useState, useEffect, useCallback } from 'react';
import { useLang } from '../i18n/context';
import { rules as rulesApi } from '../api/client';
import { useResourceSync } from '../hooks/useResourceSync';
import { RuleForm } from './RuleForm';
import { RuleLogModal } from './RuleLogModal';
import type { TaskRule } from '../types';

export function RuleList() {
  const { t, lang } = useLang();
  const [ruleList, setRuleList] = useState<TaskRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<TaskRule | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [logRuleId, setLogRuleId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

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
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '24px' }}>
              <h4 style={{ margin: 0, fontSize: '1em', color: '#333', fontWeight: 600 }}>
                {t('navAutomation') || 'Automation'} ({ruleList.length})
              </h4>
            </div>
            <div />
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
          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <button onClick={() => setShowHelp(true)}
              style={{
                width: '22px', height: '22px', borderRadius: '50%', border: '1px solid #ccc',
                background: 'none', cursor: 'pointer', fontSize: '0.8em', color: '#999',
                fontWeight: 700, padding: 0, marginRight: '8px', verticalAlign: 'middle',
              }}
              title="Help"
            >?</button>
            <button onClick={() => setShowCreate(true)} style={btnPrimaryStyle}>
              {t('ruleCreate') || 'Create Rule'}
            </button>
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

      {showHelp && (
        <div
          onClick={() => setShowHelp(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 3000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: '12px', padding: '28px',
              width: '520px', maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1em' }}>
                {lang === 'zh' ? '规则使用说明' : 'Rules Usage Guide'}
              </h3>
              <button onClick={() => setShowHelp(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2em', color: '#999' }}>
                ✕
              </button>
            </div>

            <div style={{ fontSize: '0.9em', lineHeight: 1.7, color: '#333' }}>
              {lang === 'zh' ? (
                <>
                  <p><strong>规则 = 触发器 + 条件 + 动作</strong></p>

                  <p><strong>触发器（Trigger）</strong> — 何时触发：</p>
                  <ul style={{ paddingLeft: '20px' }}>
                    <li><strong>评论时</strong> — 有人评论任务时触发</li>
                    <li><strong>状态变更时</strong> — 任务状态改变时触发</li>
                    <li><strong>负责人变更时</strong> — 任务负责人改变时触发</li>
                    <li><strong>创建任务时</strong> — 新任务创建时触发</li>
                  </ul>

                  <p><strong>条件（Conditions JSON）</strong> — 可选的条件判断：</p>
                  <ul style={{ paddingLeft: '20px' }}>
                    <li><code>{`{"field":"comment_content","op":"matches","value":"@urgent"}`}</code> — 评论内容匹配正则</li>
                    <li><code>{`{"field":"status","op":"equals","value":"done"}`}</code> — 状态等于指定值</li>
                    <li><code>{`{"field":"assignee_id","op":"is_null"}`}</code> — 负责人为空</li>
                    <li>不填条件则无条件触发</li>
                  </ul>

                  <p><strong>动作（Actions JSON）</strong> — 满足条件时执行：</p>
                  <ul style={{ paddingLeft: '20px' }}>
                    <li><code>{`{"type":"set_priority","value":"high"}`}</code> — 设置优先级</li>
                    <li><code>{`{"type":"set_status","value":"in_progress"}`}</code> — 设置状态</li>
                    <li><code>{`{"type":"add_tag","value":"bug"}`}</code> — 添加标签</li>
                    <li><code>{`{"type":"assign_user","value":"<user_id>"}`}</code> — 分配负责人</li>
                    <li><code>{`{"type":"webhook","value":"https://..."}`}</code> — 调用 Webhook</li>
                    <li>可同时执行多个动作：<code>[{`{"type":"..."},{"type":"..."}`}]</code></li>
                  </ul>

                  <p><strong>示例：</strong>评论 @urgent → 设优先级为紧急</p>
                  <pre style={{ background: '#f5f5f5', padding: '10px', borderRadius: '6px', fontSize: '0.85em', overflow: 'auto' }}>
{`触发器: 评论时
条件: {"field":"comment_content","op":"matches","value":"@urgent"}
动作: [
  {"type":"set_priority","value":"urgent"},
  {"type":"set_status","value":"in_progress"}
]`}
                  </pre>
                </>
              ) : (
                <>
                  <p><strong>Rule = Trigger + Condition + Action</strong></p>

                  <p><strong>Trigger</strong> — When to fire:</p>
                  <ul style={{ paddingLeft: '20px' }}>
                    <li><strong>On Comment</strong> — When someone comments on a task</li>
                    <li><strong>On Status Change</strong> — When task status changes</li>
                    <li><strong>On Assignee Change</strong> — When task assignee changes</li>
                    <li><strong>On Task Create</strong> — When a new task is created</li>
                  </ul>

                  <p><strong>Conditions (JSON)</strong> — Optional condition checks:</p>
                  <ul style={{ paddingLeft: '20px' }}>
                    <li><code>{`{"field":"comment_content","op":"matches","value":"@urgent"}`}</code> — Regex match</li>
                    <li><code>{`{"field":"status","op":"equals","value":"done"}`}</code> — Exact value match</li>
                    <li><code>{`{"field":"assignee_id","op":"is_null"}`}</code> — Check if empty</li>
                    <li>Leave empty to fire unconditionally</li>
                  </ul>

                  <p><strong>Actions (JSON)</strong> — What to do when matched:</p>
                  <ul style={{ paddingLeft: '20px' }}>
                    <li><code>{`{"type":"set_priority","value":"high"}`}</code> — Set priority</li>
                    <li><code>{`{"type":"set_status","value":"in_progress"}`}</code> — Set status</li>
                    <li><code>{`{"type":"add_tag","value":"bug"}`}</code> — Add a tag</li>
                    <li><code>{`{"type":"assign_user","value":"<user_id>"}`}</code> — Assign user</li>
                    <li><code>{`{"type":"webhook","value":"https://..."}`}</code> — Call webhook</li>
                    <li>Multiple actions: <code>[{`{"type":"..."},{"type":"..."}`}]</code></li>
                  </ul>

                  <p><strong>Example:</strong> Comment @urgent → Set priority to urgent</p>
                  <pre style={{ background: '#f5f5f5', padding: '10px', borderRadius: '6px', fontSize: '0.85em', overflow: 'auto' }}>
{`Trigger: On Comment
Condition: {"field":"comment_content","op":"matches","value":"@urgent"}
Actions: [
  {"type":"set_priority","value":"urgent"},
  {"type":"set_status","value":"in_progress"}
]`}
                  </pre>
                </>
              )}
            </div>
          </div>
        </div>
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
