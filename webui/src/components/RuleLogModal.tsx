import { useState, useEffect } from 'react';
import { useLang } from '../i18n/context';
import { rules as rulesApi } from '../api/client';
import type { TaskRuleLog } from '../types';

interface Props {
  ruleId: string;
  onClose: () => void;
}

export function RuleLogModal({ ruleId, onClose }: Props) {
  const { t, lang } = useLang();
  const [logs, setLogs] = useState<TaskRuleLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchLogs = async () => {
      try {
        const res = await rulesApi.listLogs(ruleId);
        if (!cancelled) setLogs(res.logs || []);
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchLogs();
    return () => { cancelled = true; };
  }, [ruleId]);

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
          width: '680px', maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0 }}>{t('ruleLogTitle') || 'Execution Logs'}</h3>
          <button onClick={onClose} style={{
            width: '32px', height: '32px', borderRadius: '50%', border: 'none',
            background: '#f5f5f5', cursor: 'pointer', fontSize: '1em',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666',
          }}>✕</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '48px 24px', fontSize: '0.9em' }}>
            {t('loading')}...
          </div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '48px 24px', fontSize: '0.9em' }}>
            {t('ruleLogEmpty') || 'No execution logs yet.'}
          </div>
        ) : (
          <div style={{ overflow: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85em' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #eee' }}>
                  <th style={{ textAlign: 'left', padding: '8px 10px', color: '#555', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {t('ruleLogTime') || 'Time'}
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', color: '#555', fontWeight: 600 }}>
                    {t('ruleLogTask') || 'Task'}
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', color: '#555', fontWeight: 600 }}>
                    {t('ruleLogEvent') || 'Event'}
                  </th>
                  <th style={{ textAlign: 'center', padding: '8px 10px', color: '#555', fontWeight: 600 }}>
                    {t('ruleLogMatched') || 'Matched'}
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', color: '#555', fontWeight: 600 }}>
                    {t('ruleLogResult') || 'Result'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: '#888', fontSize: '0.9em' }}>
                      {new Date(log.created_at).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td style={{ padding: '8px 10px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.9em' }}>
                      {log.task_id.slice(0, 8)}...
                    </td>
                    <td style={{ padding: '8px 10px', color: '#555' }}>{log.trigger_event}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
                        fontSize: '0.85em', fontWeight: 600,
                        background: log.matched ? '#e8f5e9' : '#fbe9e7',
                        color: log.matched ? '#2e7d32' : '#c62828',
                      }}>
                        {log.matched ? '✓' : '✗'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', color: '#666', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.result || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
