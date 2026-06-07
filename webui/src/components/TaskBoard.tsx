import { useEffect, useState, useCallback } from 'react';
import { useLang, type TranslationKey } from '../i18n/context';
import { tasks as tasksApi, projects as projectsApi, workspaceMembers as workspaceMembersApi, agentProfiles as agentProfilesApi } from '../api/client';
import { useResourceSync } from '../hooks/useResourceSync';
import { useWorkspace } from '../hooks/WorkspaceContext';
import { TaskCard } from './TaskCard';
import { TaskForm } from './TaskForm';
import { TaskDetail } from './TaskDetail';
import type { Task, TaskStatus, Project, UpdateTaskReq, Priority, AssigneeType } from '../types';

const columns: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'review', 'done'];

const columnLabels: Record<TaskStatus, TranslationKey> = {
  todo: 'taskStatusTodo',
  in_progress: 'taskStatusInProgress',
  blocked: 'taskStatusBlocked',
  review: 'taskStatusReview',
  done: 'taskStatusDone',
};

const columnColors: Record<TaskStatus, string> = {
  todo: '#e0e0e0',
  in_progress: '#bbdefb',
  blocked: '#d1c4e9',
  review: '#ffe0b2',
  done: '#c8e6c9',
};

export function TaskBoard() {
  const { t, lang } = useLang();
  const { role, workspaceId } = useWorkspace();
  const isObserver = role === 'observer';
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string; color: string }[]>([]);

  // Filters
  const [filterProjectId, setFilterProjectId] = useState<string>("");
  const [filterPriority, setFilterPriority] = useState<string>("");
  const [filterTag, setFilterTag] = useState<string>("");
  const [filterAssigneeId, setFilterAssigneeId] = useState<string>("");

  // Subtask counts & assignee names (simple approach: compute client-side)
  const [subtaskCounts, setSubtaskCounts] = useState<Record<string, number>>({});
  const [assigneeNames, setAssigneeNames] = useState<Record<string, string>>({});

  // Delete verification state
  const [deleteVerify, setDeleteVerify] = useState<{
    taskId: string; a: number; b: number; op: '+' | '-'; answer: number;
  } | null>(null);
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyError, setVerifyError] = useState(false);

  const fetchTasks = useCallback(async (params?: { projectId?: string; priority?: string; tag?: string; assigneeId?: string }) => {
    try {
      const res = await tasksApi.list({
        projectId: params?.projectId,
        priority: params?.priority || undefined,
        tag: params?.tag || undefined,
        assigneeId: params?.assigneeId || undefined,
      });
      setTaskList(res.tasks);
      // Compute subtask counts
      const counts: Record<string, number> = {};
      for (const task of res.tasks) {
        if (task.parent_id) {
          counts[task.parent_id] = (counts[task.parent_id] || 0) + 1;
        }
      }
      setSubtaskCounts(counts);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks({
      projectId: filterProjectId || undefined,
      priority: filterPriority || undefined,
      tag: filterTag || undefined,
      assigneeId: filterAssigneeId || undefined,
    });
  }, [filterProjectId, filterPriority, filterTag, filterAssigneeId, fetchTasks]);

  useEffect(() => {
    projectsApi.list().then((res) => setProjects(res.projects)).catch(() => {});
    // Build a combined map of user/agent id -> name for assignee display
    if (workspaceId) {
      workspaceMembersApi.list(workspaceId).then(res => {
        const names: Record<string, string> = {};
        res.members.forEach(m => { names[m.user_id] = m.username; });
        agentProfilesApi.list().then(ar => {
          ar.profiles.forEach(p => { names[p.id] = p.name; });
          setAssigneeNames(names);
        }).catch(() => setAssigneeNames(names));
      }).catch(() => {});
    }
  }, [workspaceId]);

  useResourceSync('tasks', () => fetchTasks({
    projectId: filterProjectId || undefined,
    priority: filterPriority || undefined,
    tag: filterTag || undefined,
    assigneeId: filterAssigneeId || undefined,
  }));

  const grouped = taskList.reduce(
    (acc, task) => {
      if (!acc[task.status]) acc[task.status] = [];
      acc[task.status].push(task);
      return acc;
    },
    {} as Record<string, Task[]>,
  );

  const handleCreate = useCallback(async (data: { title: string; description: string; status?: TaskStatus; project_id?: string | null; parent_id?: string | null; assignee_id?: string | null; assignee_type?: AssigneeType | null; priority?: Priority; tags?: string[]; due_at?: string | null }) => {
    try {
      await tasksApi.create({
        title: data.title,
        description: data.description || undefined,
        project_id: data.project_id || undefined,
        parent_id: data.parent_id || undefined,
        assignee_id: data.assignee_id || undefined,
        assignee_type: data.assignee_type || undefined,
        priority: data.priority,
        tags: data.tags,
        due_at: data.due_at || undefined,
      });
      setShowForm(false);
      fetchTasks();
    } catch {
      alert('Failed to create task');
    }
  }, [fetchTasks]);

  const handleDetailDelete = useCallback(async (id: string) => {
    try {
      await tasksApi.delete(id);
      setEditingTask(null);
      fetchTasks({
        projectId: filterProjectId || undefined,
        priority: filterPriority || undefined,
        tag: filterTag || undefined,
        assigneeId: filterAssigneeId || undefined,
      });
    } catch {
      alert('Failed to delete task');
    }
  }, [fetchTasks, filterProjectId, filterPriority, filterTag, filterAssigneeId]);

  const handleDelete = useCallback(async (id: string) => {
    const a = Math.floor(Math.random() * 20) + 1;
    const b = Math.floor(Math.random() * 20) + 1;
    const op = Math.random() > 0.5 ? '+' : '-';
    const answer = op === '+' ? a + b : Math.max(a, b) - Math.min(a, b);
    const [na, nb] = op === '+' ? [a, b] : [Math.max(a, b), Math.min(a, b)];
    setDeleteVerify({ taskId: id, a: na, b: nb, op, answer });
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
      await tasksApi.delete(deleteVerify.taskId);
      setTaskList((prev) => prev.filter((t) => t.id !== deleteVerify.taskId));
      setDeleteVerify(null);
      setVerifyInput('');
      setVerifyError(false);
    } catch {
      alert('Failed to delete task');
    }
  }, [deleteVerify, verifyInput]);

  const handleStatusChange = useCallback(async (id: string, status: TaskStatus) => {
    try {
      const updated = await tasksApi.setStatus(id, status);
      setTaskList((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch {
      alert('Failed to update status');
    }
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '24px', color: '#999', textAlign: 'center' }}>{t('loading')}...</div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: taskList.length === 0 ? '600px' : '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <h2 style={{ margin: 0 }}>{t('navTasks')}</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Project filter */}
          <select value={filterProjectId} onChange={(e) => setFilterProjectId(e.target.value)} style={filterSelectStyle}>
            <option value="">{t('noProject')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Priority filter */}
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} style={filterSelectStyle}>
            <option value="">优先级</option>
            <option value="urgent">🔴 urgent</option>
            <option value="high">🟠 high</option>
            <option value="medium">🔵 medium</option>
            <option value="low">⚪ low</option>
          </select>

          {/* Tag filter */}
          <input
            placeholder="标签"
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            style={{ ...filterSelectStyle, maxWidth: '100px' }}
          />

          {/* View toggle */}
          <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid #ddd' }}>
            <button
              onClick={() => setView('kanban')}
              style={{
                padding: '6px 14px', border: 'none',
                background: view === 'kanban' ? '#1976d2' : '#fff',
                color: view === 'kanban' ? '#fff' : '#666', cursor: 'pointer', fontSize: '0.85em',
              }}
            >
              {t('taskViewKanban')}
            </button>
            <button
              onClick={() => setView('list')}
              style={{
                padding: '6px 14px', border: 'none',
                background: view === 'list' ? '#1976d2' : '#fff',
                color: view === 'list' ? '#fff' : '#666', cursor: 'pointer', fontSize: '0.85em',
              }}
            >
              {t('taskViewList')}
            </button>
          </div>
          {!isObserver && (
            <button
              onClick={() => setShowForm(true)}
              style={{
                padding: '6px 16px', background: '#1976d2', color: '#fff',
                border: 'none', borderRadius: '6px', cursor: 'pointer',
                fontSize: '0.95em', fontWeight: 600,
              }}
            >
              + {t('taskCreate')}
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {taskList.length === 0 && (
        <div style={{ textAlign: 'center', color: '#999', marginTop: '48px', fontSize: '0.95em' }}>
          {t('taskEmpty')}
        </div>
      )}

      {/* Kanban view */}
      {view === 'kanban' && taskList.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', overflow: 'auto', paddingBottom: '12px', minHeight: '400px' }}>
          {columns.map((col) => {
            const tasks = grouped[col] || [];
            return (
              <div key={col} style={{ flex: '0 0 260px', minWidth: '240px' }}>
                <div
                  style={{
                    padding: '10px 14px', borderRadius: '12px 12px 0 0',
                    background: columnColors[col], fontWeight: 600, fontSize: '0.85em',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <span>{t(columnLabels[col])}</span>
                  <span style={{ background: 'rgba(0,0,0,0.1)', borderRadius: '10px', padding: '0 8px', fontSize: '0.85em' }}>
                    {tasks.length}
                  </span>
                </div>
                <div
                  style={{
                    background: '#fff', borderRadius: '0 0 12px 12px', padding: '8px',
                    minHeight: '120px', display: 'flex', flexDirection: 'column', gap: '8px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  }}
                >
                  {tasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onEdit={(t) => setEditingTask(t)}
                      onDelete={handleDelete}
                      onStatusChange={handleStatusChange}
                      projectsMap={Object.fromEntries(projects.map(p => [p.id, { name: p.name, color: p.color }]))}
                      subtaskCount={subtaskCounts[task.id]}
                      assigneeName={task.assignee_id ? (assigneeNames[task.assignee_id] || task.assignee_id.slice(0, 8)) : undefined}
                      creatorName={task.creator_name}
                      assigneeNamesMap={assigneeNames}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List view */}
      {view === 'list' && taskList.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
            <thead>
              <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px', borderBottom: '2px solid #ddd' }}>{t('taskTitle')}</th>
                <th style={{ padding: '10px 12px', borderBottom: '2px solid #ddd' }}>优先级</th>
                <th style={{ padding: '10px 12px', borderBottom: '2px solid #ddd' }}>{t('taskStatus')}</th>
                <th style={{ padding: '10px 12px', borderBottom: '2px solid #ddd' }}>创建者</th>
                <th style={{ padding: '10px 12px', borderBottom: '2px solid #ddd' }}>负责人</th>
                <th style={{ padding: '10px 12px', borderBottom: '2px solid #ddd' }}>执行人</th>
                <th style={{ padding: '10px 12px', borderBottom: '2px solid #ddd' }}>截止</th>
                <th style={{ padding: '10px 12px', borderBottom: '2px solid #ddd' }}>{t('created')}</th>
                <th style={{ padding: '10px 12px', borderBottom: '2px solid #ddd' }}>{t('taskActions')}</th>
              </tr>
            </thead>
            <tbody>
              {taskList.map((task) => {
                const sc = {
                  todo: { bg: '#e0e0e0', color: '#616161' },
                  in_progress: { bg: '#bbdefb', color: '#1565c0' },
                  blocked: { bg: '#d1c4e9', color: '#4527a0' },
                  review: { bg: '#ffe0b2', color: '#e65100' },
                  done: { bg: '#c8e6c9', color: '#2e7d32' },
                }[task.status];
                const isOverdue = task.due_at && new Date(task.due_at) < new Date() && task.status !== 'done';
                return (
                  <tr key={task.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 500 }}>{task.title}</div>
                      {task.description && (
                        <div style={{ fontSize: '0.85em', color: '#999', marginTop: '2px' }}>
                          {task.description.length > 60 ? task.description.slice(0, 60) + '...' : task.description}
                        </div>
                      )}
                      {task.tags && task.tags.length > 0 && (
                        <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                          {task.tags.slice(0, 3).map(tag => (
                            <span key={tag} style={{ fontSize: '0.7em', padding: '1px 6px', borderRadius: '6px', background: '#e3f2fd', color: '#1565c0' }}>{tag}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: '0.8em', textTransform: 'uppercase', fontWeight: 600, color: task.priority === 'urgent' ? '#c62828' : task.priority === 'high' ? '#e65100' : task.priority === 'medium' ? '#1565c0' : '#757575' }}>
                        {task.priority}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: '0.8em', padding: '2px 8px', borderRadius: '10px', background: sc.bg, color: sc.color, fontWeight: 500 }}>
                        {t(columnLabels[task.status])}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#888', fontSize: '0.85em' }}>
                      {task.creator_name || '-'}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#666', fontSize: '0.85em' }}>
                      {task.assignee_id ? (assigneeNames[task.assignee_id] || task.assignee_id.slice(0, 8)) : '-'}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#777', fontSize: '0.85em' }}>
                      {task.assignees && task.assignees.length > 0
                        ? task.assignees.map(a => assigneeNames[a.assignee_id] || a.assignee_id.slice(0, 6)).join(', ')
                        : '-'}
                    </td>
                    <td style={{ padding: '10px 12px', color: isOverdue ? '#c62828' : '#999', fontSize: '0.85em', fontWeight: isOverdue ? 600 : 400, whiteSpace: 'nowrap' }}>
                      {task.due_at ? new Date(task.due_at).toLocaleDateString() : '-'}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#999', fontSize: '0.85em', whiteSpace: 'nowrap' }}>
                      {new Date(task.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => setEditingTask(task)} style={actionBtnStyle}>
                          {t('profileEdit')}
                        </button>
                        <button onClick={() => handleDelete(task.id)} style={{ ...actionBtnStyle, color: '#c62828' }}>
                          {t('taskDelete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete verification modal */}
      {deleteVerify && (
        <div onClick={() => { setDeleteVerify(null); setVerifyError(false); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
          }}
        >
          <div onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: '12px', padding: '28px',
              width: '360px', maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', textAlign: 'center',
            }}
          >
            <h3 style={{ margin: '0 0 8px', color: '#333' }}>{t('taskConfirmDelete')}</h3>
            <p style={{ color: '#666', fontSize: '0.9em', marginBottom: '20px' }}>
              {lang === 'zh' ? '请回答以下验证问题：' : 'Answer the following to confirm:'}
            </p>
            <div style={{ fontSize: '1.4em', fontWeight: 700, color: '#333', marginBottom: '16px' }}>
              {deleteVerify.a} {deleteVerify.op} {deleteVerify.b} = ?
            </div>
            <input value={verifyInput} onChange={(e) => { setVerifyInput(e.target.value); setVerifyError(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleDeleteConfirm(); }}
              style={{
                width: '100%', padding: '10px', borderRadius: '6px',
                border: verifyError ? '1px solid #c62828' : '1px solid #ddd',
                fontSize: '1.1em', textAlign: 'center', boxSizing: 'border-box', outline: 'none', marginBottom: '8px',
              }} autoFocus />
            {verifyError && (
              <div style={{ color: '#c62828', fontSize: '0.85em', marginBottom: '8px' }}>
                {lang === 'zh' ? '答案错误，请重试' : 'Wrong answer, try again'}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '12px' }}>
              <button onClick={() => { setDeleteVerify(null); setVerifyError(false); }} style={btnSecondaryStyle}>
                {t('cancel')}
              </button>
              <button onClick={handleDeleteConfirm} style={{ ...btnPrimaryStyle, background: '#c62828' }}>
                {t('taskDelete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <TaskForm onClose={() => setShowForm(false)} onSave={handleCreate} />
      )}

      {/* Edit detail */}
      {editingTask && (
        <TaskDetail
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onDelete={handleDetailDelete}
          onRefresh={() => fetchTasks({
            projectId: filterProjectId || undefined,
            priority: filterPriority || undefined,
            tag: filterTag || undefined,
            assigneeId: filterAssigneeId || undefined,
          })}
        />
      )}
    </div>
  );
}

const filterSelectStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: '6px', border: '1px solid #ddd',
  fontSize: '0.85em', background: '#fff', maxWidth: '140px',
};

const actionBtnStyle: React.CSSProperties = {
  padding: '3px 10px', fontSize: '0.75em', borderRadius: '4px',
  border: '1px solid #ddd', background: '#fafafa', cursor: 'pointer', color: '#555',
};

const btnSecondaryStyle: React.CSSProperties = {
  padding: '10px 20px', borderRadius: '6px', border: '1px solid #ddd',
  background: '#fff', cursor: 'pointer', color: '#666', fontSize: '0.95em',
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: '10px 20px', borderRadius: '6px', border: 'none',
  background: '#1976d2', color: '#fff', cursor: 'pointer', fontSize: '0.95em',
};
