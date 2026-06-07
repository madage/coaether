import { useState, useEffect, useCallback } from 'react';
import { useLang } from '../i18n/context';
import { skills as skillsApi, tasks } from '../api/client';
import { useResourceSync } from '../hooks/useResourceSync';
import { MathConfirmDialog } from './MathConfirmDialog';
import type { Skill } from '../types';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px', borderRadius: '6px',
  border: '1px solid #ddd', fontSize: '1em', boxSizing: 'border-box',
};

export function SkillList() {
  const { t, lang } = useLang();

  const [skillList, setSkillList] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTag, setSearchTag] = useState('');

  // Create / Edit modal state
  const [showForm, setShowForm] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formTags, setFormTags] = useState('');
  const [saving, setSaving] = useState(false);

  // Extract modal
  const [showExtract, setShowExtract] = useState(false);
  const [extractTaskId, setExtractTaskId] = useState('');
  const [extracting, setExtracting] = useState(false);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchSkills = useCallback(async () => {
    try {
      const res = await skillsApi.list();
      setSkillList(res.skills);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  useResourceSync('skills', fetchSkills);

  const filtered = searchTag
    ? skillList.filter(s => s.tags?.some(t => t.toLowerCase().includes(searchTag.toLowerCase())))
    : skillList;

  const openCreate = () => {
    setEditingSkill(null);
    setFormName('');
    setFormDesc('');
    setFormContent('');
    setFormTags('');
    setShowForm(true);
  };

  const openEdit = (s: Skill) => {
    setEditingSkill(s);
    setFormName(s.name);
    setFormDesc(s.description || '');
    setFormContent(s.content);
    setFormTags((s.tags || []).join(', '));
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formContent.trim()) return;
    setSaving(true);
    try {
      const tags = formTags.split(',').map(t => t.trim()).filter(Boolean);
      if (editingSkill) {
        await skillsApi.update(editingSkill.id, { name: formName.trim(), description: formDesc.trim(), content: formContent.trim(), tags });
      } else {
        await skillsApi.create({ name: formName.trim(), description: formDesc.trim(), content: formContent.trim(), tags });
      }
      setShowForm(false);
      fetchSkills();
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  const handleExtract = async () => {
    if (!extractTaskId.trim()) return;
    setExtracting(true);
    try {
      await skillsApi.extractFromTask({ task_id: extractTaskId.trim() });
      setShowExtract(false);
      setExtractTaskId('');
      fetchSkills();
    } catch {
      // silently fail
    } finally {
      setExtracting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    try {
      await skillsApi.delete(id);
      setSkillList(prev => prev.filter(s => s.id !== id));
    } catch {
      // silently fail
    }
  };

  const allTags = [...new Set(skillList.flatMap(s => s.tags || []))].sort();

  if (loading) {
    return (
      <div style={{ padding: '24px', color: '#999', textAlign: 'center' }}>
        {t('loading')}...
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '1.15em', color: '#1a1a2e' }}>
          {t('skillLibrary') || 'Skill Library'}
          {skillList.length > 0 && <span style={{ color: '#999', fontSize: '0.8em', fontWeight: 400, marginLeft: '8px' }}>({skillList.length})</span>}
        </h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowExtract(true)} style={secondaryBtnStyle}>
            {t('skillExtract') || 'Extract'}
          </button>
          <button onClick={openCreate} style={btnPrimaryStyle}>
            {t('skillCreate') || 'Create'}
          </button>
        </div>
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div style={{ marginBottom: '16px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8em', color: '#999', marginRight: '4px' }}>{t('abilityTags')}:</span>
          <button
            onClick={() => setSearchTag('')}
            style={{
              ...tagBtnStyle,
              background: !searchTag ? '#1976d2' : '#eee',
              color: !searchTag ? '#fff' : '#666',
            }}
          >'All'</button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setSearchTag(searchTag === tag ? '' : tag)}
              style={{
                ...tagBtnStyle,
                background: searchTag === tag ? '#1976d2' : '#eee',
                color: searchTag === tag ? '#fff' : '#666',
              }}
            >{tag}</button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', color: '#999', padding: '48px 24px', fontSize: '0.95em' }}>
          {searchTag
            ? (lang === 'zh' ? `没有匹配"${searchTag}"的技能` : `No skills matching "${searchTag}"`)
            : (t('skillEmpty') || 'No skills yet. Create one or extract from a completed task.')}
        </div>
      )}

      {/* Skill cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filtered.map(skill => (
          <div key={skill.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: '12px',
            padding: '16px', background: '#fafafa', borderRadius: '8px',
            border: '1px solid #eee',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.95em', fontWeight: 600, color: '#333', marginBottom: '4px' }}>
                {skill.name}
              </div>
              {skill.description && (
                <div style={{ fontSize: '0.8em', color: '#888', marginBottom: '6px' }}>
                  {skill.description}
                </div>
              )}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                {(skill.tags || []).map((tag, i) => (
                  <span key={i} style={{
                    background: '#e3f2fd', color: '#1565c0',
                    padding: '1px 8px', borderRadius: '8px', fontSize: '0.75em', fontWeight: 500,
                  }}>{tag}</span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '0.75em', color: '#aaa' }}>
                <span>{t('skillUsage') || 'Used'}: {skill.usage_count}</span>
                {skill.source_task_id && <span>{t('skillFromTask') || 'From task'}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
              <button onClick={() => openEdit(skill)} style={iconBtnStyle} title={t('edit') || 'Edit'}>
                ✏️
              </button>
              <button onClick={() => setDeleteId(skill.id)} style={iconBtnStyle} title={t('delete') || 'Delete'}>
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div style={overlayStyle} onClick={() => setShowForm(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', color: '#1a1a2e' }}>
              {editingSkill ? (t('skillEdit') || 'Edit Skill') : (t('skillCreate') || 'Create Skill')}
            </h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>{t('skillNameLabel') || 'Name'} <span style={{ color: '#f44336' }}>*</span></label>
              <input value={formName} onChange={(e) => setFormName(e.target.value)} style={inputStyle} placeholder={t('skillNamePlaceholder') || 'Skill name'} />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>{t('skillDescriptionLabel') || 'Description'}</label>
              <input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} style={inputStyle} placeholder={t('skillDescriptionPlaceholder') || 'Optional description'} />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>{t('skillContent') || 'Content'} <span style={{ color: '#f44336' }}>*</span></label>
              <textarea
                value={formContent} onChange={(e) => setFormContent(e.target.value)}
                rows={6} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '0.85em' }}
                placeholder={t('skillContentPlaceholder') || 'Skill content / prompt template...'}
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>{t('abilityTags')}</label>
              <input value={formTags} onChange={(e) => setFormTags(e.target.value)} style={inputStyle}
                placeholder={t('abilityTagsPlaceholder')} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setShowForm(false)} style={cancelBtnStyle}>{t('cancel')}</button>
              <button onClick={handleSave} disabled={saving || !formName.trim() || !formContent.trim()} style={{
                ...btnPrimaryStyle, opacity: saving || !formName.trim() || !formContent.trim() ? 0.6 : 1,
              }}>{saving ? '...' : t('save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Extract Modal */}
      {showExtract && (
        <div style={overlayStyle} onClick={() => { setShowExtract(false); setExtractTaskId(''); }}>
          <div style={{ ...modalStyle, width: '420px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', color: '#1a1a2e' }}>
              {t('skillExtractFromTask') || 'Extract Skill from Task'}
            </h3>
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>{t('skillTaskId') || 'Task ID'} <span style={{ color: '#f44336' }}>*</span></label>
              <input
                value={extractTaskId}
                onChange={(e) => setExtractTaskId(e.target.value)}
                style={inputStyle}
                placeholder={t('skillTaskIdPlaceholder') || 'Enter task ID...'}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => { setShowExtract(false); setExtractTaskId(''); }} style={cancelBtnStyle}>{t('cancel')}</button>
              <button onClick={handleExtract} disabled={extracting || !extractTaskId.trim()} style={{
                ...btnPrimaryStyle, opacity: extracting || !extractTaskId.trim() ? 0.6 : 1,
              }}>{extracting ? '...' : t('skillExtract') || 'Extract'}</button>
            </div>
          </div>
        </div>
      )}

      <MathConfirmDialog
        open={deleteId !== null}
        title={t('confirmDelete')}
        description={lang === 'zh' ? '确定删除此技能？' : 'Delete this skill?'}
        confirmLabel={t('delete') || 'Delete'}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: '#fff', borderRadius: '12px', padding: '28px',
  width: '520px', maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto',
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
};

const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: '6px', fontWeight: 600,
  color: '#333', fontSize: '0.9em',
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: '6px', border: 'none',
  background: '#1976d2', color: '#fff', cursor: 'pointer', fontSize: '0.85em', fontWeight: 600,
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: '6px', border: '1px solid #1976d2',
  background: '#fff', color: '#1976d2', cursor: 'pointer', fontSize: '0.85em', fontWeight: 600,
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '10px 24px', background: '#f5f5f5', color: '#666',
  border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '0.95em',
};

const tagBtnStyle: React.CSSProperties = {
  padding: '4px 12px', borderRadius: '12px', border: 'none',
  cursor: 'pointer', fontSize: '0.78em', fontWeight: 500,
};

const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: '1em', padding: '4px', lineHeight: 1, opacity: 0.6,
};
