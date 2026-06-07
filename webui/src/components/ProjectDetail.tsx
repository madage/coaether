import { useEffect, useState } from 'react';
import type { Project, Task, TaskStatus, ProjectStatus } from '../types';
import { tasks as tasksApi } from '../api/client';
import { useLang } from '../i18n/context';
import { TaskCard } from './TaskCard';
import { TaskDetail } from './TaskDetail';

interface ProjectDetailProps {
  project: Project;
  onClose: () => void;
  onDelete: (id: string) => void;
}

const statusConfig: Record<ProjectStatus, { label: string; bg: string; color: string }> = {
  planning: { label: '规划中', bg: '#e3f2fd', color: '#1565c0' },
  active: { label: '进行中', bg: '#e8f5e9', color: '#2e7d32' },
  completed: { label: '已完成', bg: '#f3e5f5', color: '#6a1b9a' },
  on_hold: { label: '挂起', bg: '#fff3e0', color: '#e65100' },
};

const statusKeys: Record<TaskStatus, string> = {
  todo: 'taskStatusTodo',
  in_progress: 'taskStatusInProgress',
  blocked: 'taskStatusBlocked',
  review: 'taskStatusReview',
  done: 'taskStatusDone',
};

export function ProjectDetail({ project, onClose, onDelete }: ProjectDetailProps) {
  const { t, lang } = useLang();
  const [taskList, setTaskList] = useState<Task[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deleteVerify, setDeleteVerify] = useState<{
    taskId: string; a: number; b: number; op: '+' | '-'; answer: number;
  } | null>(null);
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyError] = useState(false);

  useEffect(() => {
    tasksApi.list({ projectId: project.id }).then((res) => setTaskList(res.tasks)).catch(() => {});
  }, [project.id]);

  // Compute progress stats
  const totalTasks = taskList.length;
  const doneTasks = taskList.filter(t => t.status === 'done').length;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const statusCounts = taskList.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleDetailDelete = async (id: string) => {
    try {
      await tasksApi.delete(id);
      setEditingTask(null);
      const res = await tasksApi.list({ projectId: project.id });
      setTaskList(res.tasks);
    } catch {
      alert('Failed to delete task');
    }
  };

  const handleTaskDelete = (id: string) => {
    const a = Math.floor(Math.random() * 20) + 1;
    const b = Math.floor(Math.random() * 20) + 1;
    const op = Math.random() > 0.5 ? '+' : '-';
    const answer = op === '+' ? a + b : Math.max(a, b) - Math.min(a, b);
    const [na, nb] = op === '+' ? [a, b] : [Math.max(a, b), Math.min(a, b)];
    setDeleteVerify({ taskId: id, a: na, b: nb, op, answer });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteVerify) return;
    try {
      await tasksApi.delete(deleteVerify.taskId);
      setTaskList((prev) => prev.filter((t) => t.id !== deleteVerify.taskId));
      setDeleteVerify(null);
    } catch {
      alert('Failed to delete task');
    }
  };

  const handleTaskStatusChange = async (id: string, status: TaskStatus) => {
    try {
      const updated = await tasksApi.setStatus(id, status);
      setTaskList((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch {
      alert('Failed to update status');
    }
  };

  const sc = statusConfig[project.status] || statusConfig.planning;

  return (
    <div onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
      }}
    >
      <div onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '16px', padding: '32px',
          width: '680px', maxWidth: '90vw', maxHeight: '85vh', overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '12px',
              background: project.color + '20',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5em',
            }}>
              📁
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ margin: 0, color: '#1a1a2e' }}>{project.name}</h2>
                <span style={{
                  fontSize: '0.75em', padding: '2px 8px', borderRadius: '8px',
                  background: sc.bg, color: sc.color, fontWeight: 500,
                }}>{sc.label}</span>
              </div>
              {project.description && (
                <p style={{ margin: '4px 0 0', color: '#888', fontSize: '0.9em' }}>{project.description}</p>
              )}
            </div>
          </div>
          <button onClick={onClose}
            style={{ width: '36px', height: '36px', borderRadius: '50%', border: 'none', background: '#f5f5f5', cursor: 'pointer', fontSize: '1.2em', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}
          >✕</button>
        </div>

        {/* Project info bar */}
        <div style={{
          background: '#f9f9f9', borderRadius: '8px', padding: '12px 16px',
          display: 'flex', gap: '20px', fontSize: '0.85em', marginBottom: '16px', flexWrap: 'wrap',
        }}>
          <div><span style={{ color: '#999' }}>状态</span> <span style={{ fontWeight: 500, background: sc.bg, color: sc.color, padding: '1px 6px', borderRadius: '4px' }}>{sc.label}</span></div>
          <div><span style={{ color: '#999' }}>{t('projectColor')}</span> <span style={{ color: project.color, fontWeight: 500 }}>●</span></div>
          <div><span style={{ color: '#999' }}>任务</span> <span style={{ color: '#333', fontWeight: 500 }}>{totalTasks}</span></div>
          <div><span style={{ color: '#999' }}>完成</span> <span style={{ color: '#2e7d32', fontWeight: 500 }}>{doneTasks}/{totalTasks} ({progressPct}%)</span></div>
          {project.started_at && <div><span style={{ color: '#999' }}>开始</span> <span style={{ color: '#333', fontWeight: 500 }}>{new Date(project.started_at).toLocaleDateString()}</span></div>}
          {project.due_at && <div><span style={{ color: '#999' }}>截止</span> <span style={{ color: '#333', fontWeight: 500 }}>{new Date(project.due_at).toLocaleDateString()}</span></div>}
        </div>

        {/* Progress bar */}
        {totalTasks > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ height: '8px', borderRadius: '4px', background: '#e0e0e0', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progressPct}%`, background: '#2e7d32', borderRadius: '4px', transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        {/* Status breakdown */}
        {totalTasks > 0 && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {(['todo', 'in_progress', 'blocked', 'review', 'done'] as TaskStatus[]).map(s => {
              const count = statusCounts[s] || 0;
              if (count === 0) return null;
              return (
                <span key={s} style={{
                  fontSize: '0.78em', padding: '3px 10px', borderRadius: '12px',
                  background: s === 'todo' ? '#e0e0e0' : s === 'in_progress' ? '#bbdefb' : s === 'blocked' ? '#d1c4e9' : s === 'review' ? '#ffe0b2' : '#c8e6c9',
                  color: s === 'todo' ? '#616161' : s === 'in_progress' ? '#1565c0' : s === 'blocked' ? '#4527a0' : s === 'review' ? '#e65100' : '#2e7d32',
                  fontWeight: 500,
                }}>
                  {t(statusKeys[s] as any)} {count}
                </span>
              );
            })}
          </div>
        )}

        {/* Task list */}
        <h3 style={{ margin: '0 0 12px', color: '#333', fontSize: '1em' }}>{lang === 'zh' ? '任务' : 'Tasks'}</h3>

        {taskList.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '24px', fontSize: '0.9em' }}>{t('taskEmpty')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {taskList.map((task) => (
              <TaskCard key={task.id} task={task}
                onEdit={(t) => setEditingTask(t)}
                onDelete={handleTaskDelete}
                onStatusChange={handleTaskStatusChange}
                projectsMap={{ [project.id]: { name: project.name, color: project.color } }}
                creatorName={task.creator_name}
              />
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #eee', paddingTop: '16px', marginTop: '16px' }}>
          <button onClick={() => onDelete(project.id)}
            style={{ padding: '8px 20px', background: '#fbe9e7', color: '#d32f2f', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9em' }}
          >{t('taskDelete')}</button>
        </div>
      </div>

      {/* Task detail view */}
      {editingTask && (
        <TaskDetail
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onDelete={handleDetailDelete}
          onRefresh={async () => {
            const res = await tasksApi.list({ projectId: project.id });
            setTaskList(res.tasks);
          }}
        />
      )}

      {/* Delete verification */}
      {deleteVerify && (
        <div onClick={() => setDeleteVerify(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100,
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
            <input value={verifyInput} onChange={(e) => { }} onKeyDown={(e) => { if (e.key === 'Enter') handleDeleteConfirm(); }}
              style={{
                width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd',
                fontSize: '1.1em', textAlign: 'center', boxSizing: 'border-box', outline: 'none', marginBottom: '8px',
              }} autoFocus />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '12px' }}>
              <button onClick={() => setDeleteVerify(null)}
                style={{ padding: '10px 20px', borderRadius: '6px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer', color: '#666', fontSize: '0.95em' }}
              >{t('cancel')}</button>
              <button onClick={handleDeleteConfirm}
                style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', background: '#c62828', color: '#fff', cursor: 'pointer', fontSize: '0.95em' }}
              >{t('taskDelete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
