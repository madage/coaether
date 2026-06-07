import { useState, useEffect, useRef, useCallback } from 'react';
import { useLang } from '../i18n/context';
import { tasks as tasksApi, projects as projectsApi, workspaceMembers as workspaceMembersApi, agentProfiles as agentProfilesApi } from '../api/client';
import { useWorkspace } from '../hooks/WorkspaceContext';
import type { Task, TaskStatus, Project, Priority, AssigneeType, WorkspaceMember, AgentProfile } from '../types';

interface TaskDetailProps {
  task: Task;
  onClose: () => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}

const statusOptions: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'review', 'done'];
const priorityOptions: Priority[] = ['urgent', 'high', 'medium', 'low'];

export function TaskDetail({ task, onClose, onDelete, onRefresh }: TaskDetailProps) {
  const { t, lang } = useLang();
  const { workspaceId } = useWorkspace();
  const [currentTask, setCurrentTask] = useState<Task>(task);
  const [title, setTitle] = useState(task.title);
  const titleRef = useRef<HTMLInputElement>(null);

  // Reference data
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

  // Assignee picker state
  const [showAddAssignee, setShowAddAssignee] = useState(false);
  const [newAssigneeType, setNewAssigneeType] = useState<AssigneeType>('user');
  const [newAssigneeId, setNewAssigneeId] = useState('');

  // Tag input
  const [tagInput, setTagInput] = useState('');

  // Saving indicator
  const [saving, setSaving] = useState(false);

  // Delete verification
  const [showDeleteVerify, setShowDeleteVerify] = useState(false);

  const isOverdue = currentTask.due_at && new Date(currentTask.due_at) < new Date() && currentTask.status !== 'done';

  useEffect(() => {
    const load = async () => {
      const [projRes, taskRes] = await Promise.all([
        projectsApi.list().catch(() => ({ projects: [] as Project[] })),
        tasksApi.list({ parentId: 'none' }).catch(() => ({ tasks: [] as Task[] })),
      ]);
      setProjects(projRes.projects);
      setAllTasks(taskRes.tasks.filter(t => t.id !== task.id));

      tasksApi.listSubtasks(task.id).then(res => setSubtasks(res.tasks)).catch(() => {});

      const names: Record<string, string> = {};
      if (workspaceId) {
        const membersRes = await workspaceMembersApi.list(workspaceId).catch(() => ({ members: [] as WorkspaceMember[] }));
        setMembers(membersRes.members);
        membersRes.members.forEach(m => { names[m.user_id] = m.username; });
      }
      const profilesRes = await agentProfilesApi.list().catch(() => ({ profiles: [] as AgentProfile[] }));
      setAgentProfiles(profilesRes.profiles);
      profilesRes.profiles.forEach(p => { names[p.id] = p.name; });
      setNameMap(names);
    };
    load();
  }, [workspaceId, task.id]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showAddAssignee && !showDeleteVerify) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose, showAddAssignee, showDeleteVerify]);

  const saveField = useCallback(async (update: Record<string, unknown>) => {
    setSaving(true);
    try {
      const updated = await tasksApi.update(currentTask.id, update);
      // The API might not return creator_name in the response, preserve it
      setCurrentTask(prev => ({ ...updated, creator_name: prev.creator_name }));
      onRefresh();
    } catch (err) {
      console.error('Failed to update task', err);
      alert('Failed to update task');
    } finally {
      setSaving(false);
    }
  }, [currentTask.id, onRefresh]);

  const handleTitleSave = useCallback(() => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== currentTask.title) {
      saveField({ title: trimmed });
    } else {
      setTitle(currentTask.title);
    }
  }, [title, currentTask.title, saveField]);

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleRef.current?.blur();
    }
  };

  const handleStatusChange = (status: TaskStatus) => {
    setCurrentTask(prev => ({ ...prev, status }));
    saveField({ status });
  };

  const handlePriorityChange = (priority: Priority) => {
    setCurrentTask(prev => ({ ...prev, priority }));
    saveField({ priority });
  };

  const handleAssigneeChange = (assigneeId: string | null, assigneeType: AssigneeType | null) => {
    setCurrentTask(prev => ({ ...prev, assignee_id: assigneeId ?? undefined, assignee_type: assigneeType ?? undefined }));
    saveField({
      assignee_id: assigneeId ?? null,
      assignee_type: assigneeType ?? null,
    });
  };

  const handleProjectChange = (projectId: string | null) => {
    setCurrentTask(prev => ({ ...prev, project_id: projectId ?? undefined }));
    saveField({ project_id: projectId ?? null });
  };

  const handleParentChange = (parentId: string | null) => {
    setCurrentTask(prev => ({ ...prev, parent_id: parentId ?? undefined }));
    saveField({ parent_id: parentId ?? null });
  };

  const handleDueAtChange = (dueAt: string) => {
    const val = dueAt ? dueAt + 'T00:00:00Z' : null;
    setCurrentTask(prev => ({ ...prev, due_at: val ?? undefined }));
    saveField({ due_at: val });
  };

  const handleAddAssignee = async () => {
    if (!newAssigneeId) return;
    try {
      await tasksApi.addAssignee(currentTask.id, {
        assignee_id: newAssigneeId,
        assignee_type: newAssigneeType,
      });
      const refreshed = await tasksApi.get(currentTask.id);
      setCurrentTask(refreshed);
      setShowAddAssignee(false);
      setNewAssigneeId('');
      onRefresh();
    } catch (err) {
      console.error('Failed to add assignee', err);
    }
  };

  const handleRemoveAssignee = async (assigneeId: string) => {
    try {
      await tasksApi.removeAssignee(currentTask.id, assigneeId);
      const refreshed = await tasksApi.get(currentTask.id);
      setCurrentTask(refreshed);
      onRefresh();
    } catch (err) {
      console.error('Failed to remove assignee', err);
    }
  };

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (!tag || (currentTask.tags || []).includes(tag)) {
      setTagInput('');
      return;
    }
    const newTags = [...(currentTask.tags || []), tag];
    setCurrentTask(prev => ({ ...prev, tags: newTags }));
    saveField({ tags: newTags });
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    const newTags = (currentTask.tags || []).filter(t => t !== tag);
    setCurrentTask(prev => ({ ...prev, tags: newTags }));
    saveField({ tags: newTags });
  };

  const handleDeleteClick = () => {
    setShowDeleteVerify(true);
  };

  const handleDeleteConfirm = async () => {
    setShowDeleteVerify(false);
    onDelete(currentTask.id);
  };

  const sc = (() => {
    const map: Record<TaskStatus, { bg: string; color: string }> = {
      todo: { bg: '#e0e0e0', color: '#616161' },
      in_progress: { bg: '#bbdefb', color: '#1565c0' },
      blocked: { bg: '#d1c4e9', color: '#4527a0' },
      review: { bg: '#ffe0b2', color: '#e65100' },
      done: { bg: '#c8e6c9', color: '#2e7d32' },
    };
    return map[currentTask.status] || map.todo;
  })();

  const pc = (() => {
    const map: Record<Priority, { bg: string; color: string }> = {
      urgent: { bg: '#ffcdd2', color: '#c62828' },
      high: { bg: '#ffe0b2', color: '#e65100' },
      medium: { bg: '#bbdefb', color: '#1565c0' },
      low: { bg: '#e0e0e0', color: '#757575' },
    };
    return map[currentTask.priority] || map.medium;
  })();

  const statusLabel: Record<TaskStatus, string> = {
    todo: t('taskStatusTodo'),
    in_progress: t('taskStatusInProgress'),
    blocked: t('taskStatusBlocked'),
    review: t('taskStatusReview'),
    done: t('taskStatusDone'),
  };

  const statusColors: Record<TaskStatus, { bg: string; color: string }> = {
    todo: { bg: '#e0e0e0', color: '#616161' },
    in_progress: { bg: '#bbdefb', color: '#1565c0' },
    blocked: { bg: '#d1c4e9', color: '#4527a0' },
    review: { bg: '#ffe0b2', color: '#e65100' },
    done: { bg: '#c8e6c9', color: '#2e7d32' },
  };

  const editableSelectStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    borderRadius: '6px',
    border: '1px solid #ddd',
    fontSize: '0.85em',
    background: '#fff',
    boxSizing: 'border-box',
  };

  const sidebarLabelStyle: React.CSSProperties = {
    fontSize: '0.75em',
    fontWeight: 600,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '4px',
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        zIndex: 1000, overflowY: 'auto', padding: '30px 20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '16px',
          width: '880px', maxWidth: '95vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          overflow: 'hidden', marginTop: '20px',
        }}
      >
        {/* Header bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 24px', borderBottom: '1px solid #eee',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.85em', color: '#999' }}>
              {saving ? 'Saving...' : `#${currentTask.id.slice(0, 8)}`}
            </span>
            <span style={{
              fontSize: '0.75em', padding: '2px 8px', borderRadius: '10px',
              background: sc.bg, color: sc.color, fontWeight: 500,
            }}>
              {statusLabel[currentTask.status]}
            </span>
          </div>
          <button onClick={onClose}
            style={{
              width: '32px', height: '32px', borderRadius: '50%', border: 'none',
              background: '#f5f5f5', cursor: 'pointer', fontSize: '1.1em',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666',
            }}
          >✕</button>
        </div>

        {/* Main content: two columns */}
        <div style={{ display: 'flex', gap: '0', minHeight: '400px' }}>
          {/* LEFT COLUMN: Title, creator, description, subtasks */}
          <div style={{ flex: '1', padding: '24px', minWidth: 0 }}>
            {/* Editable Title */}
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              style={{
                width: '100%', fontSize: '1.5em', fontWeight: 700, color: '#1a1a2e',
                border: 'none', outline: 'none', padding: '0', marginBottom: '8px',
                background: 'transparent', fontFamily: 'inherit',
                borderBottom: '2px solid transparent',
              }}
              onFocus={(e) => { e.currentTarget.style.borderBottomColor = '#1976d2'; }}
              onBlurCapture={(e) => { e.currentTarget.style.borderBottomColor = 'transparent'; handleTitleSave(); }}
            />

            {/* Creator info (read-only) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', fontSize: '0.85em', color: '#888' }}>
              <span>✏️ {currentTask.creator_name || 'Unknown'}</span>
              <span>·</span>
              <span>📅 {new Date(currentTask.created_at).toLocaleDateString()}</span>
              {currentTask.updated_at !== currentTask.created_at && (
                <>
                  <span>·</span>
                  <span>updated {new Date(currentTask.updated_at).toLocaleDateString()}</span>
                </>
              )}
            </div>

            {/* Description (read-only) */}
            <div style={{ marginBottom: '24px' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '0.85em', color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {t('taskDescription')}
              </h4>
              <div style={{
                background: '#f9f9f9', borderRadius: '8px', padding: '16px',
                fontSize: '0.95em', lineHeight: 1.6, color: '#333',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                border: '1px solid #eee',
                minHeight: '60px',
              }}>
                {currentTask.description || <span style={{ color: '#ccc', fontStyle: 'italic' }}>No description</span>}
              </div>
            </div>

            {/* Subtasks */}
            {subtasks.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '0.85em', color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Subtasks ({subtasks.length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {subtasks.map(st => {
                    const ssc = statusColors[st.status];
                    return (
                      <div key={st.id} style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 12px', background: '#f9f9f9', borderRadius: '8px',
                        border: '1px solid #eee',
                      }}>
                        <span style={{
                          width: '10px', height: '10px', borderRadius: '50%',
                          background: ssc.color, flexShrink: 0,
                        }} />
                        <span style={{ flex: 1, fontSize: '0.9em', color: '#333' }}>
                          {st.title}
                        </span>
                        {st.assignee_id && (
                          <span style={{ fontSize: '0.8em', color: '#888' }}>
                            👤 {nameMap[st.assignee_id] || st.assignee_id.slice(0, 6)}
                          </span>
                        )}
                        <span style={{
                          fontSize: '0.7em', padding: '1px 6px', borderRadius: '6px',
                          background: ssc.bg, color: ssc.color, fontWeight: 500,
                        }}>
                          {statusLabel[st.status]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Due date for overdue tasks */}
            {isOverdue && (
              <div style={{
                padding: '10px 14px', background: '#fff3e0', borderRadius: '8px',
                border: '1px solid #ffe0b2', fontSize: '0.85em', color: '#e65100',
                marginBottom: '16px',
              }}>
                ⚠ This task is past due ({new Date(currentTask.due_at!).toLocaleDateString()})
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Sidebar with editable fields */}
          <div style={{
            width: '280px', padding: '24px', borderLeft: '1px solid #eee',
            display: 'flex', flexDirection: 'column', gap: '16px', flexShrink: 0,
          }}>
            {/* Status */}
            <div>
              <div style={sidebarLabelStyle}>Status</div>
              <select
                value={currentTask.status}
                onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
                style={editableSelectStyle}
              >
                {statusOptions.map(s => (
                  <option key={s} value={s}>{statusLabel[s]}</option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <div style={sidebarLabelStyle}>Priority</div>
              <select
                value={currentTask.priority}
                onChange={(e) => handlePriorityChange(e.target.value as Priority)}
                style={editableSelectStyle}
              >
                {priorityOptions.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Assignee (Responsible Person) */}
            <div>
              <div style={sidebarLabelStyle}>Assignee</div>
              <select
                value={currentTask.assignee_id ? `${currentTask.assignee_type || 'user'}:${currentTask.assignee_id}` : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    handleAssigneeChange(null, null);
                  } else {
                    const [type, id] = val.split(':');
                    handleAssigneeChange(id, type as AssigneeType);
                  }
                }}
                style={editableSelectStyle}
              >
                <option value="">Unassigned</option>
                <optgroup label="Users">
                  {members.map(m => (
                    <option key={`user:${m.user_id}`} value={`user:${m.user_id}`}>
                      👤 {m.username}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Agents">
                  {agentProfiles.map(a => (
                    <option key={`agent_profile:${a.id}`} value={`agent_profile:${a.id}`}>
                      {a.avatar || '🤖'} {a.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Delegated Assignees */}
            <div>
              <div style={sidebarLabelStyle}>Delegated Assignees</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {(currentTask.assignees || []).map(a => (
                  <div key={a.assignee_id} style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '4px 8px', borderRadius: '6px', background: '#f5f5f5',
                    fontSize: '0.85em',
                  }}>
                    <span style={{ flex: 1, color: '#333' }}>
                      {nameMap[a.assignee_id] || a.assignee_id.slice(0, 8)}
                    </span>
                    <button
                      onClick={() => handleRemoveAssignee(a.assignee_id)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#c62828', padding: '0 2px', fontSize: '1em', lineHeight: 1,
                      }}
                      title="Remove assignee"
                    >✕</button>
                  </div>
                ))}
                {showAddAssignee ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                    <select
                      value={newAssigneeType}
                      onChange={(e) => { setNewAssigneeType(e.target.value as AssigneeType); setNewAssigneeId(''); }}
                      style={editableSelectStyle}
                    >
                      <option value="user">User</option>
                      <option value="agent_profile">Agent</option>
                    </select>
                    <select
                      value={newAssigneeId}
                      onChange={(e) => setNewAssigneeId(e.target.value)}
                      style={editableSelectStyle}
                    >
                      <option value="">Select...</option>
                      {(newAssigneeType === 'user' ? members : agentProfiles).map((item: WorkspaceMember | AgentProfile) => {
                        const id = 'user_id' in item ? (item as WorkspaceMember).user_id : (item as AgentProfile).id;
                        const name = 'username' in item ? (item as WorkspaceMember).username : (item as AgentProfile).name;
                        const icon = 'username' in item ? '👤' : ((item as AgentProfile).avatar || '🤖');
                        return (
                          <option key={id} value={id}>{icon} {name}</option>
                        );
                      })}
                    </select>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={handleAddAssignee}
                        style={{
                          flex: 1, padding: '4px 8px', borderRadius: '4px', border: 'none',
                          background: '#1976d2', color: '#fff', cursor: 'pointer', fontSize: '0.8em',
                        }}
                      >Add</button>
                      <button onClick={() => setShowAddAssignee(false)}
                        style={{
                          padding: '4px 8px', borderRadius: '4px', border: '1px solid #ddd',
                          background: '#fff', cursor: 'pointer', fontSize: '0.8em',
                        }}
                      >Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowAddAssignee(true)}
                    style={{
                      padding: '4px 8px', borderRadius: '4px', border: '1px dashed #ccc',
                      background: 'transparent', cursor: 'pointer', fontSize: '0.8em', color: '#888',
                      textAlign: 'center', marginTop: '2px',
                    }}
                  >+ Add assignee</button>
                )}
              </div>
            </div>

            {/* Tags */}
            <div>
              <div style={sidebarLabelStyle}>Tags</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px' }}>
                {(currentTask.tags || []).map(tag => (
                  <span key={tag} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '3px',
                    padding: '2px 6px', borderRadius: '6px', background: '#e3f2fd',
                    color: '#1565c0', fontSize: '0.8em',
                  }}>
                    {tag}
                    <button onClick={() => handleRemoveTag(tag)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1565c0', padding: 0, fontSize: '1em', lineHeight: 1 }}
                    >×</button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                  placeholder="Add tag..."
                  style={{
                    flex: 1, padding: '4px 8px', borderRadius: '4px', border: '1px solid #ddd',
                    fontSize: '0.8em', outline: 'none',
                  }}
                />
                <button onClick={handleAddTag}
                  style={{
                    padding: '4px 8px', borderRadius: '4px', border: '1px solid #ddd',
                    background: '#f5f5f5', cursor: 'pointer', fontSize: '0.8em',
                  }}
                >Add</button>
              </div>
            </div>

            {/* Due Date */}
            <div>
              <div style={sidebarLabelStyle}>Due Date</div>
              <input
                type="date"
                value={currentTask.due_at ? currentTask.due_at.slice(0, 10) : ''}
                onChange={(e) => handleDueAtChange(e.target.value)}
                style={{
                  ...editableSelectStyle,
                  color: isOverdue ? '#c62828' : '#333',
                }}
              />
            </div>

            {/* Project */}
            <div>
              <div style={sidebarLabelStyle}>Project</div>
              <select
                value={currentTask.project_id || ''}
                onChange={(e) => handleProjectChange(e.target.value || null)}
                style={editableSelectStyle}
              >
                <option value="">No project</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Parent Task */}
            <div>
              <div style={sidebarLabelStyle}>Parent Task</div>
              <select
                value={currentTask.parent_id || ''}
                onChange={(e) => handleParentChange(e.target.value || null)}
                style={editableSelectStyle}
              >
                <option value="">None (top-level)</option>
                {allTasks.map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>

            {/* Timestamps (read-only) */}
            <div style={{ borderTop: '1px solid #eee', paddingTop: '12px', marginTop: '4px' }}>
              <div style={{ fontSize: '0.8em', color: '#999', lineHeight: 1.6 }}>
                <div>Created: {new Date(currentTask.created_at).toLocaleString()}</div>
                <div>Updated: {new Date(currentTask.updated_at).toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 24px', borderTop: '1px solid #eee', background: '#fafafa',
        }}>
          <button onClick={handleDeleteClick}
            style={{
              padding: '6px 16px', borderRadius: '6px', border: '1px solid #ffcdd2',
              background: '#fff', color: '#c62828', cursor: 'pointer', fontSize: '0.85em',
            }}
          >Delete task</button>
          <button onClick={onClose}
            style={{
              padding: '6px 16px', borderRadius: '6px', border: '1px solid #ddd',
              background: '#fff', color: '#666', cursor: 'pointer', fontSize: '0.85em',
            }}
          >Close</button>
        </div>
      </div>

      {/* Delete verification modal */}
      {showDeleteVerify && (
        <div onClick={() => setShowDeleteVerify(false)}
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
            <h3 style={{ margin: '0 0 8px', color: '#333' }}>Delete task</h3>
            <p style={{ color: '#666', fontSize: '0.9em', marginBottom: '20px' }}>
              Are you sure you want to delete this task? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button onClick={() => setShowDeleteVerify(false)}
                style={{
                  padding: '10px 20px', borderRadius: '6px', border: '1px solid #ddd',
                  background: '#fff', cursor: 'pointer', color: '#666', fontSize: '0.95em',
                }}
              >Cancel</button>
              <button onClick={handleDeleteConfirm}
                style={{
                  padding: '10px 20px', borderRadius: '6px', border: 'none',
                  background: '#c62828', color: '#fff', cursor: 'pointer', fontSize: '0.95em',
                }}
              >Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
