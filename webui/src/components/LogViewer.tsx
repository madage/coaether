import { useState, useEffect, useCallback } from 'react';
import { logs as logsApi } from '../api/client';
import type { AgentToolLogItem, AccessLogItem, TokenUsageItem, SystemEventItem, PaginatedResp } from '../types';
import { useLang } from '../i18n/context';

type LogTab = 'agent' | 'access' | 'token' | 'system';

interface TabDef { key: LogTab; label: string; icon: string }

export function LogViewer() {
  const { t } = useLang();
  const [tab, setTab] = useState<LogTab>('agent');
  const [page, setPage] = useState(1);
  const [pathFilter, setPathFilter] = useState('');
  const size = 30;

  const tabs: TabDef[] = [
    { key: 'agent', label: t('logAgentAudit'), icon: '🤖' },
    { key: 'access', label: t('logAccess'), icon: '🌐' },
    { key: 'token', label: t('logTokenUsage'), icon: '💰' },
    { key: 'system', label: t('logSystemEvents'), icon: '⚡' },
  ];

  const [agentData, setAgentData] = useState<PaginatedResp<AgentToolLogItem> | null>(null);
  const [accessData, setAccessData] = useState<PaginatedResp<AccessLogItem> | null>(null);
  const [tokenData, setTokenData] = useState<PaginatedResp<TokenUsageItem> | null>(null);
  const [systemData, setSystemData] = useState<PaginatedResp<SystemEventItem> | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      switch (tab) {
        case 'agent': {
          const r = await logsApi.agentTool(page, size);
          setAgentData(r);
          break;
        }
        case 'access': {
          const r = await logsApi.access(page, size, pathFilter || undefined);
          setAccessData(r);
          break;
        }
        case 'token': {
          const r = await logsApi.tokenUsage(page, size);
          setTokenData(r);
          break;
        }
        case 'system': {
          const r = await logsApi.systemEvents(page, size);
          setSystemData(r);
          break;
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [tab, page, pathFilter, size]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => { setPage(1); }, [tab, pathFilter]);

  const currentData = tab === 'agent' ? agentData : tab === 'access' ? accessData : tab === 'token' ? tokenData : systemData;
  const totalPages = currentData ? Math.ceil(currentData.total / currentData.size) : 0;

  const statusColor = (s: string) => {
    if (s === 'allowed' || s === 'completed') return '#2e7d32';
    if (s === 'denied' || s === 'error' || s === 'failed') return '#c62828';
    return '#555';
  };

  return (
    <div style={{ padding: '24px 32px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <h2 style={{ margin: '0 0 16px', fontSize: '1.3em', color: '#333' }}>{t('navLogs')}</h2>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid #e0e0e0' }}>
        {tabs.map(tb => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            style={{
              padding: '8px 16px', border: 'none', background: 'none',
              cursor: 'pointer', fontSize: '0.9em',
              color: tab === tb.key ? '#1976d2' : '#999',
              borderBottom: tab === tb.key ? '2px solid #1976d2' : '2px solid transparent',
              fontWeight: tab === tb.key ? 600 : 400,
            }}
          >
            {tb.icon} {tb.label}
          </button>
        ))}
      </div>

      {/* Path filter (access logs only) */}
      {tab === 'access' && (
        <input
          placeholder={t('logFilterPath')}
          value={pathFilter}
          onChange={(e) => setPathFilter(e.target.value)}
          style={{
            width: '240px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #ddd',
            fontSize: '0.85em', marginBottom: '12px',
          }}
        />
      )}

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>{t('loading')}...</div>
        ) : !currentData || currentData.items.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>{t('logNoData')}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85em' }}>
            <thead>
              <tr style={{ background: '#f5f5f5', position: 'sticky', top: 0 }}>
                {tab === 'agent' && (
                  <><th style={th}>{t('logTime')}</th><th style={th}>{t('logAgent')}</th><th style={th}>{t('logTool')}</th><th style={th}>{t('logStatus')}</th><th style={th}>{t('logReason')}</th></>
                )}
                {tab === 'access' && (
                  <><th style={th}>{t('logTime')}</th><th style={th}>{t('logUser')}</th><th style={th}>{t('logMethod')}</th><th style={th}>{t('logPath')}</th><th style={th}>{t('logStatus')}</th><th style={th}>{t('logLatency')}</th></>
                )}
                {tab === 'token' && (
                  <><th style={th}>{t('logTime')}</th><th style={th}>{t('logAgent')}</th><th style={th}>{t('logStage')}</th><th style={th}>{t('logPromptTokens')}</th><th style={th}>{t('logCompletionTokens')}</th><th style={th}>{t('logTotalTokens')}</th></>
                )}
                {tab === 'system' && (
                  <><th style={th}>{t('logTime')}</th><th style={th}>{t('logEventType')}</th><th style={th}>{t('logDetail')}</th></>
                )}
              </tr>
            </thead>
            <tbody>
              {tab === 'agent' && (currentData as PaginatedResp<AgentToolLogItem>).items.map((it) => (
                <tr key={it.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={td}>{new Date(it.created_at).toLocaleString()}</td>
                  <td style={td}>{it.agent_name || truncate(it.agent_id, 8)}</td>
                  <td style={td}><code style={{ fontSize: '0.85em', background: '#f0f0f0', padding: '1px 4px', borderRadius: 3 }}>{it.tool_name}</code></td>
                  <td style={td}><span style={{ color: statusColor(it.status), fontWeight: 500 }}>{it.status}</span></td>
                  <td style={td}><span style={{ color: '#999', fontSize: '0.85em' }}>{it.deny_reason || '-'}</span></td>
                </tr>
              ))}
              {tab === 'access' && (currentData as PaginatedResp<AccessLogItem>).items.map((it) => (
                <tr key={it.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={td}>{new Date(it.created_at).toLocaleString()}</td>
                  <td style={td}>{it.username || '-'}</td>
                  <td style={td}><span style={{ fontWeight: 600, color: methodColor(it.method) }}>{it.method}</span></td>
                  <td style={td}><span style={{ fontSize: '0.85em' }}>{it.path}</span></td>
                  <td style={td}><span style={{ color: it.status >= 400 ? '#c62828' : it.status >= 300 ? '#e65100' : '#2e7d32' }}>{it.status}</span></td>
                  <td style={td}>{it.latency_ms}ms</td>
                </tr>
              ))}
              {tab === 'token' && (currentData as PaginatedResp<TokenUsageItem>).items.map((it) => (
                <tr key={it.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={td}>{new Date(it.created_at).toLocaleString()}</td>
                  <td style={td}>{it.agent_name || '-'}</td>
                  <td style={td}>{it.stage}</td>
                  <td style={td}>{it.prompt_tokens.toLocaleString()}</td>
                  <td style={td}>{it.completion_tokens.toLocaleString()}</td>
                  <td style={td}><span style={{ fontWeight: 600 }}>{it.total_tokens.toLocaleString()}</span></td>
                </tr>
              ))}
              {tab === 'system' && (currentData as PaginatedResp<SystemEventItem>).items.map((it) => (
                <tr key={it.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={td}>{new Date(it.created_at).toLocaleString()}</td>
                  <td style={td}><span style={{
                    fontSize: '0.75em', padding: '1px 6px', borderRadius: 4,
                    background: it.event_type === 'escalation' ? '#f8d7da' : '#d4edda',
                    color: it.event_type === 'escalation' ? '#721c24' : '#155724',
                  }}>{it.event_type}</span></td>
                  <td style={td}>{it.title}<br/><span style={{ color: '#999', fontSize: '0.8em' }}>{it.detail}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {currentData && currentData.total > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '12px 0', borderTop: '1px solid #e0e0e0', marginTop: 8 }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={pageBtn(page <= 1)}>
            ← {t('logPrevPage')}
          </button>
          <span style={{ fontSize: '0.85em', color: '#666' }}>
            {t('logPageInfo').replace('{page}', String(page)).replace('{total}', String(currentData.total))}
          </span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={pageBtn(page >= totalPages)}>
            {t('logNextPage')} →
          </button>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '8px 10px', fontWeight: 600, color: '#555',
  fontSize: '0.8em', textTransform: 'uppercase', letterSpacing: '0.5px',
};

const td: React.CSSProperties = {
  padding: '8px 10px', color: '#333', verticalAlign: 'top',
};

function pageBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '4px 12px', borderRadius: 4, border: '1px solid #ddd',
    background: disabled ? '#f5f5f5' : '#fff', color: disabled ? '#ccc' : '#1976d2',
    cursor: disabled ? 'default' : 'pointer', fontSize: '0.85em',
  };
}

function methodColor(m: string) {
  if (m === 'GET') return '#2e7d32';
  if (m === 'POST') return '#1976d2';
  if (m === 'PUT' || m === 'PATCH') return '#e65100';
  if (m === 'DELETE') return '#c62828';
  return '#555';
}

function truncate(s: string, n: number) { return s.length <= n ? s : s.slice(0, n); }
