import { useState } from 'react';
import { useLang } from '../i18n/context';
import { rules as rulesApi } from '../api/client';
import type { TaskRule } from '../types';

interface Props {
  rule?: TaskRule | null;
  onClose: () => void;
  onSaved: () => void;
}

const TRIGGER_OPTIONS = [
  { value: 'on_comment', labelKey: 'ruleTriggerComment' as const, fallback: 'On Comment' },
  { value: 'on_status_change', labelKey: 'ruleTriggerStatus' as const, fallback: 'On Status Change' },
  { value: 'on_assignee_change', labelKey: 'ruleTriggerAssignee' as const, fallback: 'On Assignee Change' },
  { value: 'on_task_create', labelKey: 'ruleTriggerCreate' as const, fallback: 'On Task Create' },
];

const CONDITIONS_HELP = `{\n  "field": "comment_content",\n  "op": "matches|equals|contains",\n  "value": "@urgent"\n}`;

const ACTIONS_HELP = `[\n  { "type": "set_priority", "value": "urgent" },\n  { "type": "set_status", "value": "done" },\n  { "type": "assign_user", "value": "user-id" },\n  { "type": "add_tag", "value": "tag-name" },\n  { "type": "webhook", "value": "https://..." }\n]`;

export function RuleForm({ rule, onClose, onSaved }: Props) {
  const { t } = useLang();
  const isEdit = !!rule;

  const [name, setName] = useState(rule?.name || '');
  const [description, setDescription] = useState(rule?.description || '');
  const [triggerType, setTriggerType] = useState(rule?.trigger_type || 'on_comment');
  const [conditions, setConditions] = useState(JSON.stringify(rule?.conditions || {}, null, 2));
  const [actions, setActions] = useState(JSON.stringify(rule?.actions || [], null, 2));
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError(t('ruleErrorNameRequired') || 'Rule name is required');
      return;
    }

    let parsedConditions: Record<string, unknown>;
    let parsedActions: Record<string, unknown>[];
    try {
      parsedConditions = JSON.parse(conditions);
      parsedActions = JSON.parse(actions);
    } catch {
      setError(t('ruleErrorJsonInvalid') || 'Invalid JSON in conditions or actions');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const data = {
        name: name.trim(),
        description: description.trim(),
        trigger_type: triggerType,
        conditions: parsedConditions,
        actions: parsedActions,
        enabled,
      };

      if (isEdit && rule) {
        await rulesApi.update(rule.id, data);
      } else {
        await rulesApi.create(data);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '16px', padding: '28px',
          width: '520px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0 }}>
            {isEdit ? (t('ruleEdit') || 'Edit Rule') : (t('ruleCreate') || 'Create Rule')}
          </h3>
          <button onClick={onClose} style={{
            width: '32px', height: '32px', borderRadius: '50%', border: 'none',
            background: '#f5f5f5', cursor: 'pointer', fontSize: '1em',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666',
          }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Name */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85em', fontWeight: 600, color: '#333', marginBottom: '4px' }}>
              {t('ruleName') || 'Rule Name'}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('ruleNamePlaceholder') || 'My automation rule'}
              style={inputStyle}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85em', fontWeight: 600, color: '#333', marginBottom: '4px' }}>
              {t('ruleDescription') || 'Description'}
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('ruleDescriptionPlaceholder') || 'Optional description'}
              style={inputStyle}
            />
          </div>

          {/* Trigger Type */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85em', fontWeight: 600, color: '#333', marginBottom: '4px' }}>
              {t('ruleTrigger') || 'Trigger'}
            </label>
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value)}
              style={inputStyle}
            >
              {TRIGGER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey) || opt.fallback}
                </option>
              ))}
            </select>
          </div>

          {/* Conditions */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85em', fontWeight: 600, color: '#333', marginBottom: '4px' }}>
              {t('ruleConditions') || 'Conditions (JSON)'}
            </label>
            <textarea
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              style={{ ...inputStyle, minHeight: '80px', fontFamily: 'monospace', fontSize: '0.82em' }}
              placeholder={CONDITIONS_HELP}
            />
            <div style={{ fontSize: '0.75em', color: '#999', marginTop: '2px' }}>
              {t('ruleConditionsHint') || 'Format: field, op (matches/equals/contains), value'}
            </div>
          </div>

          {/* Actions */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85em', fontWeight: 600, color: '#333', marginBottom: '4px' }}>
              {t('ruleActions') || 'Actions (JSON)'}
            </label>
            <textarea
              value={actions}
              onChange={(e) => setActions(e.target.value)}
              style={{ ...inputStyle, minHeight: '100px', fontFamily: 'monospace', fontSize: '0.82em' }}
              placeholder={ACTIONS_HELP}
            />
            <div style={{ fontSize: '0.75em', color: '#999', marginTop: '2px' }}>
              {t('ruleActionsHint') || 'Array of {type, value} objects'}
            </div>
          </div>

          {/* Enabled */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="rule-enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="rule-enabled" style={{ fontSize: '0.85em', color: '#333', cursor: 'pointer' }}>
              {t('ruleEnabled') || 'Enabled'}
            </label>
          </div>

          {/* Error */}
          {error && (
            <div style={{ color: '#c62828', fontSize: '0.85em', padding: '8px 12px', background: '#fbe9e7', borderRadius: '6px' }}>
              {error}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '10px 20px', borderRadius: '6px', border: '1px solid #ddd',
                background: '#fff', cursor: 'pointer', color: '#666', fontSize: '0.9em',
              }}
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '10px 20px', borderRadius: '6px', border: 'none',
                background: saving ? '#90caf9' : '#1976d2', color: '#fff',
                cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.9em', fontWeight: 600,
              }}
            >
              {saving ? (t('saving') || 'Saving...') : (t('save') || 'Save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd',
  fontSize: '0.9em', boxSizing: 'border-box', outline: 'none',
};
