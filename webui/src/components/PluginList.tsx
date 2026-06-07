import { useState, useEffect, useCallback } from 'react';
import { plugins as pluginsApi } from '../api/client';
import { useLang } from '../i18n/context';
import type { PluginInfo } from '../types';

function formatUptime(seconds?: number): string {
  if (!seconds && seconds !== 0) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function stateStyle(state: string): React.CSSProperties {
  switch (state) {
    case 'running':
      return { background: '#4caf50' };
    case 'starting':
    case 'stopping':
      return { background: '#ff9800' };
    case 'stopped':
      return { background: '#9e9e9e' };
    case 'error':
      return { background: '#f44336' };
    default:
      return { background: '#9e9e9e' };
  }
}

export function PluginList() {
  const { t, lang } = useLang();
  const [list, setList] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [installTab, setInstallTab] = useState<'upload' | 'git'>('upload');
  const [installFile, setInstallFile] = useState<File | null>(null);
  const [gitUrl, setGitUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const fetchPlugins = useCallback(async () => {
    try {
      setError(null);
      const data = await pluginsApi.list();
      setList(data.plugins);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load plugins');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlugins();
  }, [fetchPlugins]);

  const handleAction = async (name: string, action: 'start' | 'stop' | 'reload' | 'remove') => {
    if (action === 'stop' && !window.confirm(t('pluginConfirmStop').replace('{name}', name))) return;
    if (action === 'reload' && !window.confirm(t('pluginConfirmReload').replace('{name}', name))) return;
    if (action === 'remove' && !window.confirm(t('pluginRemoveConfirm').replace('{name}', name))) return;

    setActionLoading(`${name}:${action}`);
    try {
      if (action === 'start') await pluginsApi.start(name);
      else if (action === 'stop') await pluginsApi.stop(name);
      else if (action === 'reload') await pluginsApi.reload(name);
      else if (action === 'remove') await pluginsApi.remove(name);
      await fetchPlugins();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleInstall = async () => {
    setInstallError(null);
    setInstalling(true);
    try {
      if (installTab === 'upload') {
        if (!installFile) {
          setInstallError('Please select a ZIP file');
          setInstalling(false);
          return;
        }
        await pluginsApi.installUpload(installFile);
      } else {
        if (!gitUrl.trim()) {
          setInstallError('Git URL is required');
          setInstalling(false);
          return;
        }
        await pluginsApi.installGit(gitUrl.trim(), gitBranch.trim() || undefined);
      }
      setShowInstall(false);
      setInstallFile(null);
      setGitUrl('');
      setGitBranch('');
      await fetchPlugins();
    } catch (e: unknown) {
      setInstallError(e instanceof Error ? e.message : 'Installation failed');
    } finally {
      setInstalling(false);
    }
  };

  const stateLabel = (s: string): string => {
    switch (s) {
      case 'running': return t('pluginRunning');
      case 'stopped': return t('pluginStopped');
      case 'error': return t('pluginError');
      case 'starting': return t('pluginStarting');
      case 'stopping': return t('pluginStopping');
      default: return s;
    }
  };

  if (loading) {
    return <div style={{ padding: 24, color: '#999' }}>{t('pluginLoading')}</div>;
  }

  return (
    <div style={{ padding: '24px', maxWidth: '900px', height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0 }}>{t('plugins')}</h2>
        <button onClick={() => { setInstallError(null); setShowInstall(true); }}
          style={{
            padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer',
            background: '#1976d2', color: '#fff', fontSize: '0.88em',
          }}>
          + {t('pluginInstall')}
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px', background: '#ffebee', borderRadius: '6px', color: '#c62828', marginBottom: '16px' }}>
          {error}
          <button onClick={fetchPlugins} style={{ marginLeft: '12px', background: 'none', border: 'none', color: '#1976d2', cursor: 'pointer', textDecoration: 'underline' }}>
            Retry
          </button>
        </div>
      )}

      {!error && list.length === 0 && (
        <div style={{ padding: '40px 0', color: '#999', textAlign: 'center' }}>{t('noPlugins')}</div>
      )}

      {showInstall && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowInstall(false)}>
          <div style={{
            background: '#fff', borderRadius: '10px', padding: '28px', width: '480px',
            maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px' }}>{t('pluginInstall')}</h3>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <button onClick={() => setInstallTab('upload')} style={{
                flex: 1, padding: '8px 0', border: 'none', borderRadius: '6px', cursor: 'pointer',
                background: installTab === 'upload' ? '#1976d2' : '#e0e0e0',
                color: installTab === 'upload' ? '#fff' : '#333',
                fontWeight: installTab === 'upload' ? 600 : 400,
              }}>{t('pluginInstallUpload')}</button>
              <button onClick={() => setInstallTab('git')} style={{
                flex: 1, padding: '8px 0', border: 'none', borderRadius: '6px', cursor: 'pointer',
                background: installTab === 'git' ? '#1976d2' : '#e0e0e0',
                color: installTab === 'git' ? '#fff' : '#333',
                fontWeight: installTab === 'git' ? 600 : 400,
              }}>{t('pluginInstallGit')}</button>
            </div>

            {installTab === 'upload' ? (
              <div style={{ marginBottom: '20px' }}>
                <p style={{ margin: '0 0 10px', color: '#666', fontSize: '0.9em' }}>{t('pluginInstallUploadHint')}</p>
                <input type="file" accept=".zip" onChange={e => setInstallFile(e.target.files?.[0] || null)}
                  style={{ width: '100%' }} />
              </div>
            ) : (
              <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ margin: 0, color: '#666', fontSize: '0.9em' }}>{t('pluginInstallGitHint')}</p>
                <input placeholder={t('pluginInstallUrlPlaceholder')} value={gitUrl} onChange={e => setGitUrl(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: '4px', width: '100%' }} />
                <input placeholder={t('pluginInstallBranchPlaceholder')} value={gitBranch} onChange={e => setGitBranch(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: '4px', width: '100%' }} />
              </div>
            )}

            {installError && (
              <div style={{ padding: '8px 12px', background: '#ffebee', borderRadius: '4px', color: '#c62828', marginBottom: '12px', fontSize: '0.88em' }}>
                {installError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowInstall(false)} disabled={installing} style={{
                padding: '8px 20px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer',
                background: '#fff', color: '#333', opacity: installing ? 0.6 : 1,
              }}>{t('cancel')}</button>
              <button onClick={handleInstall} disabled={installing || (installTab === 'upload' && !installFile)} style={{
                padding: '8px 20px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                background: '#1976d2', color: '#fff', opacity: installing ? 0.6 : 1,
              }}>{installing ? t('pluginInstalling') : t('pluginInstallButton')}</button>
            </div>
          </div>
        </div>
      )}

      {list.map((p) => (
        <div key={p.name} style={{
          background: '#fff', borderRadius: '8px', padding: '16px 20px', marginBottom: '12px',
          border: '1px solid #e0e0e0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', ...stateStyle(p.state) }} />
              <strong style={{ fontSize: '1.05em' }}>{p.label?.[lang] || p.name}</strong>
              <span style={{ color: '#999', fontSize: '0.85em' }}>v{p.version}</span>
              <span style={{
                fontSize: '0.75em', padding: '2px 8px', borderRadius: '10px',
                background: p.state === 'running' ? '#e8f5e9' : p.state === 'error' ? '#ffebee' : '#f5f5f5',
                color: p.state === 'running' ? '#2e7d32' : p.state === 'error' ? '#c62828' : '#666',
              }}>
                {stateLabel(p.state)}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {p.state !== 'running' && (
                <button onClick={() => handleAction(p.name, 'start')} disabled={actionLoading?.startsWith(p.name)}
                  style={{
                    padding: '6px 14px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.82em',
                    background: '#1976d2', color: '#fff',
                    opacity: actionLoading?.startsWith(p.name) ? 0.6 : 1,
                  }}>
                  {actionLoading === `${p.name}:start` ? '...' : t('pluginStart')}
                </button>
              )}
              {p.state === 'running' && (
                <button onClick={() => handleAction(p.name, 'stop')} disabled={actionLoading?.startsWith(p.name)}
                  style={{
                    padding: '6px 14px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.82em',
                    background: '#f44336', color: '#fff',
                    opacity: actionLoading?.startsWith(p.name) ? 0.6 : 1,
                  }}>
                  {actionLoading === `${p.name}:stop` ? '...' : t('pluginStop')}
                </button>
              )}
              {p.state === 'running' && (
                <button onClick={() => handleAction(p.name, 'reload')} disabled={actionLoading?.startsWith(p.name)}
                  style={{
                    padding: '6px 14px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', fontSize: '0.82em',
                    background: '#fff', color: '#333',
                    opacity: actionLoading?.startsWith(p.name) ? 0.6 : 1,
                  }}>
                  {actionLoading === `${p.name}:reload` ? '...' : t('pluginReload')}
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button onClick={() => handleAction(p.name, 'remove')} disabled={actionLoading?.startsWith(p.name)}
                style={{
                  padding: '4px 10px', border: '1px solid #e0e0e0', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78em',
                  background: 'transparent', color: '#999',
                  opacity: actionLoading?.startsWith(p.name) ? 0.4 : 1,
                }}>
                {actionLoading === `${p.name}:remove` ? '...' : t('pluginRemove')}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.85em', color: '#555' }}>
            {p.description?.[lang] && (
              <div style={{ gridColumn: '1 / -1', marginBottom: '4px' }}>{p.description[lang]}</div>
            )}
            {p.author && <div><span style={{ color: '#999' }}>{t('pluginAuthor')}:</span> {p.author}</div>}
            {p.port > 0 && <div><span style={{ color: '#999' }}>{t('pluginPort')}:</span> {p.port}</div>}
            {p.pid > 0 && <div><span style={{ color: '#999' }}>{t('pluginPid')}:</span> {p.pid}</div>}
            {p.state === 'running' && (
              <div><span style={{ color: '#999' }}>{t('pluginUptime')}:</span> {formatUptime(p.uptime_seconds)}</div>
            )}
            {p.error && (
              <div style={{ gridColumn: '1 / -1', color: '#c62828' }}>
                <span style={{ color: '#999' }}>Error:</span> {p.error}
              </div>
            )}
          </div>

          {/* Details expandable */}
          <details style={{ marginTop: '10px', fontSize: '0.85em' }}>
            <summary style={{ color: '#999', cursor: 'pointer' }}>Details</summary>
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <strong style={{ color: '#666' }}>{t('pluginPermissions')}</strong>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {p.permissions?.length
                    ? p.permissions.map(perm => (
                        <span key={perm} style={{
                          padding: '2px 8px', borderRadius: '10px', background: '#e3f2fd', color: '#1565c0', fontSize: '0.85em',
                        }}>{perm}</span>
                      ))
                    : <span style={{ color: '#999' }}>{t('pluginNoPerms')}</span>}
                </div>
              </div>
              <div>
                <strong style={{ color: '#666' }}>{t('pluginHooks')}</strong>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {p.hooks?.length
                    ? p.hooks.map(h => (
                        <span key={h} style={{
                          padding: '2px 8px', borderRadius: '10px', background: '#f3e5f5', color: '#7b1fa2', fontSize: '0.85em',
                        }}>{h}</span>
                      ))
                    : <span style={{ color: '#999' }}>{t('pluginNoHooks')}</span>}
                </div>
              </div>
              <div>
                <strong style={{ color: '#666' }}>{t('pluginRoutes')}</strong>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {p.api_routes?.length
                    ? p.api_routes.map(r => (
                        <span key={r} style={{
                          padding: '2px 8px', borderRadius: '10px', background: '#e8f5e9', color: '#2e7d32', fontSize: '0.85em',
                          fontFamily: 'monospace',
                        }}>{r}</span>
                      ))
                    : <span style={{ color: '#999' }}>{t('pluginNoRoutes')}</span>}
                </div>
              </div>
            </div>
          </details>
        </div>
      ))}
    </div>
  );
}
