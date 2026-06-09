import { useState, useEffect, useCallback } from 'react';
import { useLang } from '../i18n/context';
import { workflows as workflowsApi, tasks as tasksApi } from '../api/client';
import { useResourceSync } from '../hooks/useResourceSync';
import { TaskDetail } from './TaskDetail';
import type { Workflow, Task, WorkflowStatus } from '../types';

const wfStatusColors: Record<string, string> = {
  active: '#2e7d32',
  paused: '#e65100',
  done: '#1565c0',
  stuck: '#c62828',
};

const wfStatusBgColors: Record<string, string> = {
  active: '#e8f5e9',
  paused: '#fff3e0',
  done: '#e3f2fd',
  stuck: '#ffebee',
};

export function WorkflowList() {
  const { t, lang } = useLang();
  const [list, setList] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newBudget, setNewBudget] = useState('100000');
  const [creating, setCreating] = useState(false);

  // Detail view
  const [selectedWf, setSelectedWf] = useState<Workflow | null>(null);
  const [wfTasks, setWfTasks] = useState<Task[]>([]);
  const [wfSummary, setWfSummary] = useState<{ status: string; count: number }[]>([]);
  const [wfTasksLoading, setWfTasksLoading] = useState(false);
  const [taskDetailTask, setTaskDetailTask] = useState<Task | null>(null);

  const fetchList = useCallback(async () => {
    try {
      const res = await workflowsApi.list();
      setList(res.workflows);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);
  useResourceSync('workflows', fetchList);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await workflowsApi.create({
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
        token_budget: parseInt(newBudget) || undefined,
      });
      setShowCreate(false);
      setNewTitle('');
      setNewDesc('');
      setNewBudget('100000');
      await fetchList();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create workflow');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (id: string, status: WorkflowStatus) => {
    try {
      await workflowsApi.updateStatus(id, status);
      setList(prev => prev.map(w => w.id === id ? { ...w, status } : w));
      if (selectedWf?.id === id) {
        setSelectedWf(prev => prev ? { ...prev, status } : null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const openWorkflow = async (wf: Workflow) => {
    setSelectedWf(wf);
    setWfTasksLoading(true);
    try {
      const [detailRes, tasksRes] = await Promise.all([
        workflowsApi.get(wf.id),
        workflowsApi.listTasks(wf.id),
      ]);
      setWfSummary(detailRes.task_summary);
      setWfTasks(tasksRes.tasks);
    } catch {
      // silently fail
    } finally {
      setWfTasksLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', color: '#999', textAlign: 'center' }}>
        {t('loading')}...
      </div>
    );
  }

  if (selectedWf) {
    return (
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        <button
          onClick={() => { setSelectedWf(null); setWfTasks([]); }}
          style={{
            background: 'none', border: 'none', color: '#1976d2', cursor: 'pointer',
            fontSize: '0.9em', padding: 0, marginBottom: '16px', display: 'block',
          }}
        >&larr; {lang === 'zh' ? '返回工作流列表' : 'Back to workflows'}</button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.3em', color: '#1a1a2e' }}>{selectedWf.title}</h2>
            {selectedWf.description && (
              <p style={{ margin: '4px 0 0', color: '#666', fontSize: '0.9em' }}>{selectedWf.description}</p>
            )}
          </div>
          <span style={{
            fontSize: '0.85em', padding: '4px 12px', borderRadius: '12px',
            background: wfStatusBgColors[selectedWf.status] || '#eee',
            color: wfStatusColors[selectedWf.status] || '#666',
            fontWeight: 600,
          }}>
            {selectedWf.status}
          </span>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div style={{ padding: '12px 16px', background: '#f5f5f5', borderRadius: '8px', minWidth: '100px' }}>
            <div style={{ fontSize: '0.75em', color: '#999', marginBottom: '4px' }}>
              {lang === 'zh' ? 'Token 预算' : 'Token Budget'}
            </div>
            <div style={{ fontWeight: 600, fontSize: '1em', color: '#333' }}>
              {selectedWf.token_budget.toLocaleString()}
            </div>
          </div>
          <div style={{ padding: '12px 16px', background: '#f5f5f5', borderRadius: '8px', minWidth: '100px' }}>
            <div style={{ fontSize: '0.75em', color: '#999', marginBottom: '4px' }}>
              {lang === 'zh' ? '已用 Token' : 'Tokens Used'}
            </div>
            <div style={{ fontWeight: 600, fontSize: '1em', color: '#333' }}>
              {selectedWf.tokens_used.toLocaleString()}
            </div>
          </div>
          {wfSummary.map(s => (
            <div key={s.status} style={{ padding: '12px 16px', background: '#f5f5f5', borderRadius: '8px', minWidth: '80px' }}>
              <div style={{ fontSize: '0.75em', color: '#999', marginBottom: '4px' }}>{s.status}</div>
              <div style={{ fontWeight: 600, fontSize: '1em', color: '#333' }}>{s.count}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {selectedWf.status === 'active' && (
            <button onClick={() => handleStatusChange(selectedWf.id, 'paused')}
              style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid #e65100', background: '#fff', color: '#e65100', cursor: 'pointer', fontSize: '0.85em' }}
            >{lang === 'zh' ? '暂停' : 'Pause'}</button>
          )}
          {selectedWf.status === 'paused' && (
            <button onClick={() => handleStatusChange(selectedWf.id, 'active')}
              style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', background: '#2e7d32', color: '#fff', cursor: 'pointer', fontSize: '0.85em' }}
            >{lang === 'zh' ? '恢复' : 'Resume'}</button>
          )}
          {(selectedWf.status === 'active' || selectedWf.status === 'paused') && (
            <button onClick={() => handleStatusChange(selectedWf.id, 'done')}
              style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid #ddd', background: '#fff', color: '#666', cursor: 'pointer', fontSize: '0.85em' }}
            >{lang === 'zh' ? '完成' : 'Mark Done'}</button>
          )}
        </div>

        {/* Task list */}
        <h3 style={{ margin: '0 0 12px', fontSize: '1em', color: '#555' }}>
          {lang === 'zh' ? '工作流任务' : 'Workflow Tasks'} ({wfTasks.length})
        </h3>
        {wfTasksLoading ? (
          <div style={{ color: '#999', fontSize: '0.9em' }}>{t('loading')}...</div>
        ) : wfTasks.length === 0 ? (
          <div style={{ color: '#999', padding: '24px', textAlign: 'center', fontSize: '0.9em' }}>
            {lang === 'zh' ? '暂无任务' : 'No tasks'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {wfTasks.map(task => {
              const tColors: Record<string, { bg: string; color: string }> = {
                todo: { bg: '#e0e0e0', color: '#616161' },
                in_progress: { bg: '#bbdefb', color: '#1565c0' },
                blocked: { bg: '#d1c4e9', color: '#4527a0' },
                completed: { bg: '#d4edda', color: '#155724' },
                review: { bg: '#ffe0b2', color: '#e65100' },
                done: { bg: '#c8e6c9', color: '#2e7d32' },
                stuck: { bg: '#f8d7da', color: '#721c24' },
              };
              const sc = tColors[task.status] || tColors.todo;
              return (
                <div key={task.id}
                  onClick={() => setTaskDetailTask(task)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 14px', background: '#fafafa', borderRadius: '8px',
                    border: '1px solid #eee', cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f0f4ff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fafafa'; }}
                >
                  <span style={{
                    width: '10px', height: '10px', borderRadius: '50%',
                    background: sc.color, flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, fontSize: '0.9em', color: '#333', fontWeight: 500 }}>
                    {task.title}
                  </span>
                  {typeof task.depth === 'number' && (
                    <span style={{ fontSize: '0.75em', color: '#999' }}>
                      Lv.{task.depth}
                    </span>
                  )}
                  {task.completion_behavior && task.completion_behavior !== 'auto_done' && (
                    <span style={{
                      fontSize: '0.7em', padding: '1px 6px', borderRadius: '4px',
                      background: '#e8f5e9', color: '#2e7d32',
                    }}>
                      {task.completion_behavior}
                    </span>
                  )}
                  {task.parallel_group && (
                    <span style={{
                      fontSize: '0.7em', padding: '1px 6px', borderRadius: '4px',
                      background: '#f3e5f5', color: '#6a1b9a',
                    }}>
                      {task.parallel_group}
                    </span>
                  )}
                  <span style={{
                    fontSize: '0.75em', padding: '2px 8px', borderRadius: '8px',
                    background: sc.bg, color: sc.color, fontWeight: 500,
                  }}>
                    {t(`taskStatus${task.status.charAt(0).toUpperCase() + task.status.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase())}` as any) || task.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '1.15em', color: '#1a1a2e' }}>
          {t('taskWorkflow') || 'Workflows'}
          {list.length > 0 && (
            <span style={{ color: '#999', fontSize: '0.8em', fontWeight: 400, marginLeft: '8px' }}>
              ({list.length})
            </span>
          )}
        </h3>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            padding: '8px 16px', background: '#1976d2', color: '#fff',
            border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85em', fontWeight: 600,
          }}
        >+ {lang === 'zh' ? '创建工作流' : 'Create'}</button>
      </div>

      {list.length === 0 && (
        <div style={{ textAlign: 'center', color: '#999', padding: '48px 24px', fontSize: '0.95em' }}>
          {lang === 'zh' ? '暂无工作流' : 'No workflows yet.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {list.map(wf => (
          <div key={wf.id}
            onClick={() => openWorkflow(wf)}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '14px 18px', background: '#fff', borderRadius: '10px',
              border: '1px solid #eee', cursor: 'pointer',
              transition: 'box-shadow 0.15s, transform 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = '';
              e.currentTarget.style.transform = '';
            }}
          >
            <span style={{
              width: '10px', height: '10px', borderRadius: '50%',
              background: wfStatusColors[wf.status] || '#999',
              flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.95em', fontWeight: 500, color: '#333' }}>
                {wf.title}
              </div>
              {wf.description && (
                <div style={{ fontSize: '0.8em', color: '#999', marginTop: '2px' }}>
                  {wf.description}
                </div>
              )}
            </div>
            <span style={{ fontSize: '0.8em', color: '#888' }}>
              {lang === 'zh' ? 'Token' : 'Budget'}: {wf.tokens_used.toLocaleString()}/{wf.token_budget.toLocaleString()}
            </span>
            <span style={{
              fontSize: '0.8em', padding: '3px 10px', borderRadius: '10px',
              background: wfStatusBgColors[wf.status] || '#eee',
              color: wfStatusColors[wf.status] || '#666',
              fontWeight: 600,
            }}>
              {wf.status}
            </span>
          </div>
        ))}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div onClick={() => setShowCreate(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100,
          }}
        >
          <div onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: '12px', padding: '28px',
              width: '420px', maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ margin: '0 0 20px', color: '#333' }}>
              {lang === 'zh' ? '创建工作流' : 'Create Workflow'}
            </h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '0.85em', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>
                {t('taskTitle')} *
              </label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={lang === 'zh' ? '工作流标题' : 'Workflow title'}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd',
                  fontSize: '0.9em', boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '0.85em', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>
                {t('taskDescription')}
              </label>
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder={lang === 'zh' ? '可选描述' : 'Optional description'}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd',
                  fontSize: '0.9em', fontFamily: 'inherit', minHeight: '60px', boxSizing: 'border-box', resize: 'vertical',
                }}
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '0.85em', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>
                {lang === 'zh' ? 'Token 预算' : 'Token Budget'}
              </label>
              <input
                type="number"
                value={newBudget}
                onChange={(e) => setNewBudget(e.target.value)}
                min="0"
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd',
                  fontSize: '0.9em', boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreate(false)}
                style={{ padding: '8px 20px', borderRadius: '6px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer', color: '#666' }}
              >{t('cancel')}</button>
              <button onClick={handleCreate} disabled={creating || !newTitle.trim()}
                style={{
                  padding: '8px 20px', borderRadius: '6px', border: 'none',
                  background: creating || !newTitle.trim() ? '#ccc' : '#1976d2',
                  color: '#fff', cursor: creating || !newTitle.trim() ? 'default' : 'pointer',
                }}
              >{creating ? '...' : t('save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Task detail modal */}
      {taskDetailTask && (
        <TaskDetail
          task={taskDetailTask}
          onClose={() => setTaskDetailTask(null)}
          onDelete={() => { setTaskDetailTask(null); openWorkflow(selectedWf!); }}
          onRefresh={() => selectedWf && openWorkflow(selectedWf)}
        />
      )}
    </div>
  );
}
