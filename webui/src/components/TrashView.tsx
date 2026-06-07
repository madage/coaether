import { useEffect, useState, useCallback } from 'react';
import { useLang } from '../i18n/context';
import { tasks as tasksApi, projects as projectsApi } from '../api/client';
import { useResourceSync } from '../hooks/useResourceSync';
import type { Task, TaskStatus, Project } from '../types';
import { MathConfirmDialog } from './MathConfirmDialog';

const statusKeys: Record<TaskStatus, string> = {
  todo: 'taskStatusTodo',
  in_progress: 'taskStatusInProgress',
  blocked: 'taskStatusBlocked',
  review: 'taskStatusReview',
  done: 'taskStatusDone',
};

const statusColors: Record<TaskStatus, { bg: string; color: string }> = {
  todo: { bg: '#e0e0e0', color: '#616161' },
  in_progress: { bg: '#bbdefb', color: '#1565c0' },
  blocked: { bg: '#d1c4e9', color: '#4527a0' },
  review: { bg: '#ffe0b2', color: '#e65100' },
  done: { bg: '#c8e6c9', color: '#2e7d32' },
};

export function TrashView() {
  const { t, lang } = useLang();
  const [trashList, setTrashList] = useState<Task[]>([]);
  const [projectTrash, setProjectTrash] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);

  const fetchTrash = useCallback(async () => {
    try {
      const [taskRes, projectRes] = await Promise.all([
        tasksApi.listTrash(),
        projectsApi.listTrash(),
      ]);
      setTrashList(taskRes.tasks);
      setProjectTrash(projectRes.projects);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrash();
  }, [fetchTrash]);

  useResourceSync('tasks', fetchTrash);
  useResourceSync('projects', fetchTrash);

  const handleRestore = useCallback(async (id: string) => {
    try {
      await tasksApi.restore(id);
      setTrashList((prev) => prev.filter((t) => t.id !== id));
    } catch {
      alert('Failed to restore task');
    }
  }, []);

  const handleProjectRestore = useCallback(async (id: string) => {
    try {
      await projectsApi.restore(id);
      setProjectTrash((prev) => prev.filter((p) => p.id !== id));
    } catch {
      alert('Failed to restore project');
    }
  }, []);

  const handlePermanentDelete = useCallback((id: string) => {
    setDeleteTaskId(id);
  }, []);

  const handleProjectPermanentDelete = useCallback((id: string) => {
    setDeleteProjectId(id);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTaskId) return;
    const id = deleteTaskId;
    setDeleteTaskId(null);
    try {
      await tasksApi.permanentDelete(id);
      setTrashList((prev) => prev.filter((t) => t.id !== id));
    } catch {
      alert('Failed to delete task');
    }
  }, [deleteTaskId]);

  const handleProjectDeleteConfirm = useCallback(async () => {
    if (!deleteProjectId) return;
    const id = deleteProjectId;
    setDeleteProjectId(null);
    try {
      await projectsApi.permanentDelete(id);
      setProjectTrash((prev) => prev.filter((p) => p.id !== id));
    } catch {
      alert('Failed to delete project');
    }
  }, [deleteProjectId]);

  if (loading) {
    return (
      <div style={{ padding: '24px', color: '#999', textAlign: 'center' }}>{t('loading')}...</div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 20px' }}>{t('navTrash')}</h2>

      {trashList.length === 0 && projectTrash.length === 0 && (
        <div style={{ textAlign: 'center', color: '#999', marginTop: '48px', fontSize: '0.95em' }}>
          {t('taskTrashEmpty')}
        </div>
      )}

      {/* Project trash */}
      {projectTrash.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '1em', color: '#666' }}>
            {lang === 'zh' ? '已删除的项目' : 'Deleted Projects'}
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
              <thead>
                <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px', borderBottom: '2px solid #ddd' }}>{t('projectName')}</th>
                  <th style={{ padding: '10px 12px', borderBottom: '2px solid #ddd' }}>{t('taskActions')}</th>
                </tr>
              </thead>
              <tbody>
                {projectTrash.map((project) => (
                  <tr key={project.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          width: '10px', height: '10px', borderRadius: '50%',
                          background: project.color, display: 'inline-block',
                        }} />
                        <span style={{ fontWeight: 500 }}>{project.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => handleProjectRestore(project.id)}
                          style={{
                            padding: '3px 10px', fontSize: '0.75em', borderRadius: '4px',
                            border: '1px solid #ddd', background: '#fafafa', cursor: 'pointer', color: '#2e7d32',
                          }}
                        >
                          {t('taskRestore')}
                        </button>
                        <button
                          onClick={() => handleProjectPermanentDelete(project.id)}
                          style={{
                            padding: '3px 10px', fontSize: '0.75em', borderRadius: '4px',
                            border: '1px solid #ddd', background: '#fafafa', cursor: 'pointer', color: '#c62828',
                          }}
                        >
                          {t('taskPermanentDelete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Task trash */}
      {trashList.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
            <thead>
              <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px', borderBottom: '2px solid #ddd' }}>{t('taskTitle')}</th>
                <th style={{ padding: '10px 12px', borderBottom: '2px solid #ddd' }}>{t('taskStatus')}</th>
                <th style={{ padding: '10px 12px', borderBottom: '2px solid #ddd' }}>{t('taskActions')}</th>
              </tr>
            </thead>
            <tbody>
              {trashList.map((task) => {
                const sc = statusColors[task.status];
                return (
                  <tr key={task.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 500 }}>{task.title}</div>
                      {task.description && (
                        <div style={{ fontSize: '0.85em', color: '#999', marginTop: '2px' }}>
                          {task.description.length > 60 ? task.description.slice(0, 60) + '...' : task.description}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          fontSize: '0.8em', padding: '2px 8px', borderRadius: '10px',
                          background: sc.bg, color: sc.color, fontWeight: 500,
                        }}
                      >
                        {t(statusKeys[task.status] as any)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => handleRestore(task.id)}
                          style={{
                            padding: '3px 10px', fontSize: '0.75em', borderRadius: '4px',
                            border: '1px solid #ddd', background: '#fafafa', cursor: 'pointer', color: '#2e7d32',
                          }}
                        >
                          {t('taskRestore')}
                        </button>
                        <button
                          onClick={() => handlePermanentDelete(task.id)}
                          style={{
                            padding: '3px 10px', fontSize: '0.75em', borderRadius: '4px',
                            border: '1px solid #ddd', background: '#fafafa', cursor: 'pointer', color: '#c62828',
                          }}
                        >
                          {t('taskPermanentDelete')}
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

      <MathConfirmDialog
        open={deleteTaskId !== null}
        title={t('taskPermanentDelete')}
        description={lang === 'zh' ? '此操作不可恢复，请完成验证：' : 'This cannot be undone. Complete the verification:'}
        confirmLabel={t('taskPermanentDelete')}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTaskId(null)}
      />
      <MathConfirmDialog
        open={deleteProjectId !== null}
        title={lang === 'zh' ? '永久删除项目' : 'Permanently Delete Project'}
        description={lang === 'zh' ? '此操作不可恢复，请完成验证：' : 'This cannot be undone. Complete the verification:'}
        confirmLabel={t('taskPermanentDelete')}
        onConfirm={handleProjectDeleteConfirm}
        onCancel={() => setDeleteProjectId(null)}
      />
    </div>
  );
}
