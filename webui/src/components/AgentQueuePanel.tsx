import { useState, useEffect, useCallback } from 'react';
import { useLang } from '../i18n/context';
import { agentQueue as agentQueueApi, tasks as tasksApi } from '../api/client';
import { useResourceSync } from '../hooks/useResourceSync';
import { TaskDetail } from './TaskDetail';
import type { AgentQueueItem, Task } from '../types';

const statusColors: Record<string, string> = {
  queued: '#9e9e9e',
  claimed: '#1976d2',
  processing: '#f9a825',
  completed: '#388e3c',
  failed: '#d32f2f',
};

export function AgentQueuePanel() {
  const { t, lang } = useLang();
  const [queue, setQueue] = useState<AgentQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskTitles, setTaskTitles] = useState<Record<string, string>>({});
  const [taskDetailTask, setTaskDetailTask] = useState<Task | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await agentQueueApi.list();
      setQueue(res.queue);
      // Fetch task titles for unique task IDs
      const taskIds = [...new Set(res.queue.map(q => q.task_id))];
      const titles: Record<string, string> = {};
      await Promise.all(taskIds.map(async (tid) => {
        try {
          const task = await tasksApi.get(tid);
          titles[tid] = task.title;
        } catch {
          titles[tid] = tid.slice(0, 8);
        }
      }));
      setTaskTitles(prev => ({ ...prev, ...titles }));
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  const statusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      queued: t('agentQueueQueued') || 'Queued',
      claimed: t('agentQueueClaimed') || 'Claimed',
      processing: t('agentQueueProcessing') || 'Processing',
      completed: t('agentQueueCompleted') || 'Completed',
      failed: t('agentQueueFailed') || 'Failed',
    };
    return labels[status] || status;
  };

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  useResourceSync('task_agent_queue', fetchQueue);

  const grouped = queue.reduce<Record<string, AgentQueueItem[]>>((acc, item) => {
    const group = item.status;
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});

  const statusOrder = ['queued', 'claimed', 'processing', 'completed', 'failed'];

  if (loading) {
    return (
      <div style={{ padding: '24px', color: '#999', textAlign: 'center' }}>
        {t('loading')}...
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '1.15em', color: '#1a1a2e' }}>
          {t('agentQueue') || 'Agent Queue'}
          {queue.length > 0 && (
            <span style={{ color: '#999', fontSize: '0.8em', fontWeight: 400, marginLeft: '8px' }}>
              ({queue.length})
            </span>
          )}
        </h3>
      </div>

      {queue.length === 0 && (
        <div style={{ textAlign: 'center', color: '#999', padding: '48px 24px', fontSize: '0.95em' }}>
          {t('agentQueueEmpty') || 'No queued tasks.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {statusOrder.map(status => {
          const items = grouped[status];
          if (!items || items.length === 0) return null;
          return (
            <div key={status}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                marginBottom: '8px', padding: '0 4px',
              }}>
                <span style={{
                  width: '10px', height: '10px', borderRadius: '50%',
                  background: statusColors[status] || '#999',
                  display: 'inline-block',
                }} />
                <span style={{ fontWeight: 600, fontSize: '0.9em', color: '#555' }}>
                  {statusLabel(status)}
                </span>
                <span style={{ color: '#999', fontSize: '0.8em' }}>({items.length})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {items.map(item => (
                  <div key={item.id}
                    onClick={() => {
                      // Fetch full task and open detail
                      tasksApi.get(item.task_id).then(t => setTaskDetailTask(t)).catch(() => {});
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '10px 14px', background: '#fafafa', borderRadius: '6px',
                      border: '1px solid #eee', cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f0f4ff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fafafa'; }}
                  >
                    <span style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: statusColors[item.status] || '#999',
                      flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.88em', fontWeight: 500, color: '#333' }}>
                        {taskTitles[item.task_id] || item.task_id.slice(0, 8)}...
                      </div>
                      <div style={{ fontSize: '0.75em', color: '#999', marginTop: '2px' }}>
                        {item.agent_profile_id.slice(0, 8)}... | {new Date(item.created_at).toLocaleString()}
                      </div>
                    </div>
                    <span style={{
                      fontSize: '0.75em', fontWeight: 600,
                      color: statusColors[item.status] || '#999',
                      padding: '2px 8px', borderRadius: '4px',
                      background: (statusColors[item.status] || '#999') + '18',
                    }}>
                      {statusLabel(item.status)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {taskDetailTask && (
        <TaskDetail
          task={taskDetailTask}
          onClose={() => setTaskDetailTask(null)}
          onDelete={() => { setTaskDetailTask(null); fetchQueue(); }}
          onRefresh={() => { fetchQueue(); }}
        />
      )}
    </div>
  );
}

