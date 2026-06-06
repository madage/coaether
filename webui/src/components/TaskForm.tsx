import { useState, useEffect } from 'react';
import { useLang } from '../i18n/context';
import type { Task, TaskStatus } from '../types';

interface TaskFormProps {
  task?: Task;
  onClose: () => void;
  onSave: (data: { title: string; description: string; status?: TaskStatus }) => void;
}

export function TaskForm({ task, onClose, onSave }: TaskFormProps) {
  const { t } = useLang();
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [status, setStatus] = useState<TaskStatus>(task?.status || 'todo');

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      description: description.trim(),
      ...(task ? { status } : {}),
    });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '28px',
          width: '420px',
          maxWidth: '90vw',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <h3 style={{ margin: '0 0 20px', color: '#333' }}>
          {task ? t('taskEdit') : t('taskCreate')}
        </h3>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.85em', color: '#666', marginBottom: '4px' }}>
              {t('taskTitle')} *
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #ddd',
                fontSize: '0.95em',
                boxSizing: 'border-box',
              }}
              required
              autoFocus
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.85em', color: '#666', marginBottom: '4px' }}>
              {t('taskDescription')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #ddd',
                fontSize: '0.95em',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {task && (
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.85em', color: '#666', marginBottom: '4px' }}>
                {t('taskStatus')}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  fontSize: '0.95em',
                  boxSizing: 'border-box',
                }}
              >
                <option value="todo">{t('taskStatusTodo')}</option>
                <option value="in_progress">{t('taskStatusInProgress')}</option>
                <option value="blocked">{t('taskStatusBlocked')}</option>
                <option value="review">{t('taskStatusReview')}</option>
                <option value="done">{t('taskStatusDone')}</option>
              </select>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                border: '1px solid #ddd',
                background: '#fff',
                cursor: 'pointer',
                color: '#666',
                fontSize: '0.95em',
              }}
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                border: 'none',
                background: '#1976d2',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.95em',
              }}
            >
              {t('saveAgent')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
