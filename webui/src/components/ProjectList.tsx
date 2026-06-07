import { useEffect, useState, useCallback } from 'react';
import { useLang } from '../i18n/context';
import { projects as projectsApi, tasks as tasksApi } from '../api/client';
import { useResourceSync } from '../hooks/useResourceSync';
import { ProjectCard } from './ProjectCard';
import { ProjectForm } from './ProjectForm';
import { ProjectDetail } from './ProjectDetail';
import { TaskCard } from './TaskCard';
import { TaskForm } from './TaskForm';
import type { Project, Task, TaskStatus, ProjectStatus, CreateProjectReq, UpdateProjectReq, AssigneeType } from '../types';
import { useWorkspace } from '../hooks/WorkspaceContext';

export function ProjectList() {
  const { t, lang } = useLang();
  const { role } = useWorkspace();
  const isObserver = role === 'observer';
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [detailProject, setDetailProject] = useState<Project | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');

  const [showUnassigned, setShowUnassigned] = useState(false);
  const [unassignedTasks, setUnassignedTasks] = useState<Task[]>([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [editingUnassignedTask, setEditingUnassignedTask] = useState<Task | null>(null);

  const fetchProjects = useCallback(async (status?: string) => {
    try {
      const [res, unassignedRes] = await Promise.all([
        status ? projectsApi.list(status) : projectsApi.list(),
        tasksApi.list({ projectId: 'none' }),
      ]);
      setProjectList(res.projects);
      setUnassignedCount(unassignedRes.tasks.length);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects(filterStatus || undefined);
  }, [fetchProjects, filterStatus]);

  useResourceSync('projects', () => fetchProjects(filterStatus || undefined));

  const handleCreate = useCallback(async (data: { name: string; description: string; color: string; assignee_id?: string | null | undefined; assignee_type?: string | null | undefined; status?: ProjectStatus; started_at?: string | null | undefined; due_at?: string | null | undefined }) => {
    try {
      // Convert null to undefined for API type compatibility
      const apiData: CreateProjectReq = {
        name: data.name,
        description: data.description,
        color: data.color,
        assignee_id: data.assignee_id ?? undefined,
        assignee_type: data.assignee_type as AssigneeType | undefined,
        status: data.status,
        started_at: data.started_at ?? undefined,
        due_at: data.due_at ?? undefined,
      };
      await projectsApi.create(apiData);
      setShowCreate(false);
      fetchProjects(filterStatus || undefined);
    } catch {
      alert('Failed to create project');
    }
  }, [fetchProjects, filterStatus]);

  const handleUpdate = useCallback(async (id: string, data: { name?: string; description?: string; color?: string; assignee_id?: string | null | undefined; assignee_type?: string | null | undefined; status?: ProjectStatus; started_at?: string | null | undefined; due_at?: string | null | undefined }) => {
    try {
      const apiData: UpdateProjectReq = {
        name: data.name,
        description: data.description,
        color: data.color,
        assignee_id: data.assignee_id ?? undefined,
        assignee_type: data.assignee_type as AssigneeType | null | undefined,
        status: data.status,
        started_at: data.started_at ?? undefined,
        due_at: data.due_at ?? undefined,
      };
      await projectsApi.update(id, apiData);
      setEditingProject(null);
      setDetailProject(null);
      fetchProjects(filterStatus || undefined);
    } catch {
      alert('Failed to update project');
    }
  }, [fetchProjects, filterStatus]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await projectsApi.delete(id);
      setDetailProject(null);
      fetchProjects(filterStatus || undefined);
    } catch {
      alert('Failed to delete project');
    }
  }, [fetchProjects, filterStatus]);

  const handleNoProjectClick = useCallback(async () => {
    try {
      const res = await tasksApi.list({ projectId: 'none' });
      setUnassignedTasks(res.tasks);
      setShowUnassigned(true);
    } catch {}
  }, []);

  const handleUnassignedTaskDelete = useCallback(async (id: string) => {
    try {
      await tasksApi.delete(id);
      setUnassignedTasks((prev) => prev.filter((t) => t.id !== id));
      const res = await tasksApi.list({ projectId: 'none' });
      setUnassignedCount(res.tasks.length);
    } catch {
      alert('Failed to delete task');
    }
  }, []);

  const handleUnassignedTaskStatusChange = useCallback(async (id: string, status: TaskStatus) => {
    try {
      const updated = await tasksApi.setStatus(id, status);
      setUnassignedTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch {
      alert('Failed to update status');
    }
  }, []);

  const handleUnassignedTaskUpdate = useCallback(async (data: { title: string; description: string; status?: TaskStatus; project_id?: string | null }) => {
    if (!editingUnassignedTask) return;
    try {
      const updateData: Record<string, unknown> = {};
      if (data.title !== editingUnassignedTask.title) updateData.title = data.title;
      if (data.description !== editingUnassignedTask.description) updateData.description = data.description;
      if (data.status && data.status !== editingUnassignedTask.status) updateData.status = data.status;
      if (data.project_id !== editingUnassignedTask.project_id) updateData.project_id = data.project_id ?? null;
      if (Object.keys(updateData).length > 0) {
        await tasksApi.update(editingUnassignedTask.id, updateData);
      }
      setEditingUnassignedTask(null);
      const res = await tasksApi.list({ projectId: 'none' });
      setUnassignedTasks(res.tasks);
      setUnassignedCount(res.tasks.length);
    } catch (err) {
      console.error('Failed to update task', err);
      alert('Failed to update task');
    }
  }, [editingUnassignedTask]);

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '8px' }}>
        <h2 style={{ margin: 0 }}>{t('navProjects')}</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Status filter */}
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: '6px', border: '1px solid #ddd',
              fontSize: '0.85em', background: '#fff',
            }}
          >
            <option value="">全部状态</option>
            <option value="planning">规划中</option>
            <option value="active">进行中</option>
            <option value="completed">已完成</option>
            <option value="on_hold">挂起</option>
          </select>
          {!isObserver && (
            <button onClick={() => setShowCreate(true)}
              style={{
                padding: '8px 20px', background: '#1976d2', color: '#fff',
                border: 'none', borderRadius: '8px', cursor: 'pointer',
                fontSize: '0.95em', fontWeight: 600,
              }}
            >+ {t('projectCreate')}</button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px',
      }}>
        {/* No Project card */}
        <div onClick={handleNoProjectClick}
          style={{
            background: '#fff', borderRadius: '12px', border: '2px dashed #ddd',
            transition: 'transform 0.2s, boxShadow 0.2s', cursor: 'pointer',
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.15), 0 4px 8px rgba(0,0,0,0.1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
        >
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3em', marginBottom: '12px' }}>📂</div>
            <h3 style={{ margin: '0 0 4px', fontSize: '1.05em', color: '#999' }}>{t('noProject')}</h3>
            <p style={{ margin: '0 0 12px', color: '#bbb', fontSize: '0.83em', flex: 1 }}>{lang === 'zh' ? '未归属到任何项目的任务' : 'Tasks without a project'}</p>
            <div style={{ fontSize: '0.78em', color: '#ccc' }}>{unassignedCount} {lang === 'zh' ? '个任务' : 'tasks'}</div>
          </div>
        </div>

        {projectList.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onClick={() => setDetailProject(project)}
            onEdit={() => setEditingProject(project)}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {/* Create form */}
      {showCreate && <ProjectForm onClose={() => setShowCreate(false)} onSave={handleCreate} />}

      {/* Edit form */}
      {editingProject && (
        <ProjectForm
          initial={editingProject}
          onClose={() => setEditingProject(null)}
          onSave={(data) => handleUpdate(editingProject.id, data)}
        />
      )}

      {/* Detail modal */}
      {detailProject && (
        <ProjectDetail
          project={detailProject}
          onClose={() => setDetailProject(null)}
          onDelete={handleDelete}
        />
      )}

      {/* Unassigned tasks modal */}
      {showUnassigned && (
        <div onClick={() => setShowUnassigned(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
          }}
        >
          <div onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: '16px', padding: '32px',
              width: '640px', maxWidth: '90vw', maxHeight: '85vh', overflow: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5em' }}>📂</div>
                <h2 style={{ margin: 0, color: '#999' }}>{t('noProject')}</h2>
              </div>
              <button onClick={() => setShowUnassigned(false)}
                style={{ width: '36px', height: '36px', borderRadius: '50%', border: 'none', background: '#f5f5f5', cursor: 'pointer', fontSize: '1.2em', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}
              >✕</button>
            </div>

            {unassignedTasks.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#999', padding: '24px', fontSize: '0.9em' }}>{t('taskEmpty')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {unassignedTasks.map((task) => (
                  <TaskCard key={task.id} task={task}
                    onEdit={(t) => setEditingUnassignedTask(t)}
                    onDelete={handleUnassignedTaskDelete}
                    onStatusChange={handleUnassignedTaskStatusChange}
                    projectsMap={{}}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Unassigned task edit form */}
      {editingUnassignedTask && (
        <TaskForm
          task={editingUnassignedTask}
          onClose={() => setEditingUnassignedTask(null)}
          onSave={handleUnassignedTaskUpdate}
        />
      )}
    </div>
  );
}
