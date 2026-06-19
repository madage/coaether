import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLang } from '../i18n/context';
import { nodes, agents, agentProfiles, agentFolders } from '../api/client';
import JSZip from 'jszip';
import type { Node, Agent } from '../types';

interface BatchImportDialogProps {
  onClose: () => void;
  onImported: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.4)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: '#fff', borderRadius: '12px', padding: '24px',
  width: '560px', maxWidth: '90vw', maxHeight: '85vh',
  overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: '8px',
  border: '1px solid #ddd', fontSize: '0.9em', boxSizing: 'border-box', outline: 'none',
};

const capabilityNameKeys: Record<string, string> = {
  create_sub_task: 'toolName_create_sub_task',
  propose_decomposition_plan: 'toolName_propose_decomposition_plan',
  assign_task: 'toolName_assign_task',
  review_task: 'toolName_review_task',
  add_comment: 'toolName_add_comment',
  get_task_detail: 'toolName_get_task_detail',
  list_sub_tasks: 'toolName_list_sub_tasks',
  update_task_status: 'toolName_update_task_status',
  search_agent_profiles: 'toolName_search_agent_profiles',
};

interface ImportFileEntry {
  fileName: string;
  data: any;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
}

export function BatchImportDialog({ onClose, onImported }: BatchImportDialogProps) {
  const { t, lang } = useLang();
  const [nodeList, setNodeList] = useState<Node[]>([]);
  const [selectedNode, setSelectedNode] = useState('');
  const [agentList, setAgentList] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [files, setFiles] = useState<ImportFileEntry[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nodes.list().then(res => setNodeList(res.nodes)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedNode) { setAgentList([]); setSelectedAgent(''); return; }
    setLoadingAgents(true);
    setSelectedAgent('');
    agents.list(selectedNode).then(res => {
      setAgentList(res.agents.filter(a => a.enabled));
    }).catch(() => setAgentList([])).finally(() => setLoadingAgents(false));
  }, [selectedNode]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const entries: ImportFileEntry[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      if (file.name.endsWith('.zip')) {
        try {
          const zip = await JSZip.loadAsync(file);
          const jsonFiles = Object.keys(zip.files).filter(name =>
            name.endsWith('.json') && !name.startsWith('__MACOSX') && !name.startsWith('.')
          );
          for (const name of jsonFiles) {
            try {
              const text = await zip.files[name].async('string');
              const data = JSON.parse(text);
              entries.push({ fileName: name, data, status: 'pending' });
            } catch {
              entries.push({ fileName: name, data: null, status: 'error', error: lang === 'zh' ? 'JSON 解析失败' : 'JSON parse failed' });
            }
          }
          if (jsonFiles.length === 0) {
            entries.push({ fileName: file.name, data: null, status: 'error', error: lang === 'zh' ? '压缩包内没有 JSON 文件' : 'No JSON files in archive' });
          }
        } catch {
          entries.push({ fileName: file.name, data: null, status: 'error', error: lang === 'zh' ? '无法解压该文件' : 'Cannot extract archive' });
        }
      } else if (file.name.endsWith('.json')) {
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          entries.push({ fileName: file.name, data, status: 'pending' });
        } catch {
          entries.push({ fileName: file.name, data: null, status: 'error', error: lang === 'zh' ? 'JSON 解析失败' : 'JSON parse failed' });
        }
      } else {
        entries.push({ fileName: file.name, data: null, status: 'error', error: lang === 'zh' ? '不支持的文件格式' : 'Unsupported file format' });
      }
    }

    setFiles(prev => [...prev, ...entries]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [lang]);

  const handleProcess = useCallback(async () => {
    if (files.length === 0) return;

    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setProcessing(true);
    const updated = [...files];
    const total = pendingFiles.length;
    let done = 0;

    for (const entry of pendingFiles) {
      const idx = updated.indexOf(entry);
      updated[idx] = { ...entry, status: 'processing' };
      setFiles([...updated]);
      setProgress({ done, total });

      try {
        const data = entry.data;
        if (!data || !data.name) {
          updated[idx] = { ...entry, status: 'error', error: lang === 'zh' ? '缺少必须的 name 字段' : 'Missing required name field' };
          setFiles([...updated]);
          done++;
          setProgress({ done, total });
          continue;
        }

        // Create agent profile
        const res = await agentProfiles.create({
          name: data.name?.trim() || '',
          description: data.description?.trim() || '',
          system_prompt: data.system_prompt?.trim() || '',
          instructions: data.instructions?.trim() || '',
          agent_id: selectedAgent || '',
          node_id: selectedNode || '',
          tags: Array.isArray(data.tags) ? data.tags : [],
          max_concurrency: typeof data.max_concurrency === 'number' ? data.max_concurrency : 1,
          capabilities: Array.isArray(data.capabilities)
            ? data.capabilities.filter((c: string) => c in capabilityNameKeys)
            : undefined,
        });

        // Apply extra fields
        const extraFields: Record<string, any> = {};
        if (Array.isArray(data.skills) && data.skills.length > 0) extraFields.skills = data.skills;
        if (data.completion_behavior) extraFields.completion_behavior = data.completion_behavior;
        if (typeof data.max_review_loops === 'number') extraFields.max_review_loops = data.max_review_loops;
        if (typeof data.max_depth === 'number') extraFields.max_depth = data.max_depth;
        if (typeof data.review_sample_rate === 'number') extraFields.review_sample_rate = data.review_sample_rate;
        if (typeof data.review_timeout === 'number') extraFields.review_timeout = data.review_timeout;

        if (res.id && Object.keys(extraFields).length > 0) {
          await agentProfiles.update(res.id, extraFields).catch(() => {});
        }

        // Auto-create folders
        const folders = Array.isArray(data.folders) ? data.folders : [];
        if (res.id && folders.length > 0) {
          try {
            const allFolders = await agentFolders.list();
            for (const folderName of folders) {
              let match: any = allFolders.folders.find((f: any) => f.name === folderName);
              if (!match) {
                const created = await agentFolders.create({ name: folderName });
                match = { id: created.id };
              }
              await agentFolders.addItem(match.id, res.id).catch(() => {});
            }
          } catch {}
        }

        updated[idx] = { ...entry, status: 'success' };
      } catch (err) {
        updated[idx] = { ...entry, status: 'error', error: err instanceof Error ? err.message : 'Failed' };
      }

      done++;
      setFiles([...updated]);
    }

    setProgress({ done: total, total });
    setProcessing(false);
    onImported();
  }, [files, selectedNode, selectedAgent, lang, onImported]);

  const successCount = files.filter(f => f.status === 'success').length;
  const errorCount = files.filter(f => f.status === 'error').length;
  const canStart = files.some(f => f.status === 'pending') && !processing;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 16px', color: '#1a1a2e', fontSize: '1.1em' }}>
          {lang === 'zh' ? '批量导入智能体' : 'Batch Import Agents'}
        </h2>

        {/* Node selector */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600, color: '#333', fontSize: '0.85em' }}>
            {t('agentNode')} <span style={{ fontWeight: 400, fontSize: '0.85em', color: '#999' }}>({lang === 'zh' ? '可选' : 'optional'})</span>
          </label>
          <select
            value={selectedNode}
            onChange={e => setSelectedNode(e.target.value)}
            style={{ ...inputStyle, background: '#fff' }}
          >
            <option value="">{lang === 'zh' ? '选择节点...' : 'Select node...'}</option>
            {nodeList.filter(n => n.status === 'online' || n.status === 'busy').map(n => (
              <option key={n.id} value={n.id}>{n.name} ({n.status})</option>
            ))}
          </select>
        </div>

        {/* Agent runtime selector */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600, color: '#333', fontSize: '0.85em' }}>
            {t('agentRuntime')} <span style={{ fontWeight: 400, fontSize: '0.85em', color: '#999' }}>({lang === 'zh' ? '可选' : 'optional'})</span>
          </label>
          <select
            value={selectedAgent}
            onChange={e => setSelectedAgent(e.target.value)}
            style={{ ...inputStyle, background: '#fff' }}
          >
            <option value="">
              {!selectedNode
                ? (lang === 'zh' ? '选择运行时...' : 'Select runtime...')
                : loadingAgents
                  ? (lang === 'zh' ? '加载中...' : 'Loading...')
                  : agentList.length === 0
                    ? (lang === 'zh' ? '该节点没有可用 Agent' : 'No agents on this node')
                    : (lang === 'zh' ? '选择运行时...' : 'Select runtime...')}
            </option>
            {agentList.map(a => (<option key={a.id} value={a.id}>{a.name}</option>))}
          </select>
        </div>

        {/* File picker */}
        <div style={{ marginBottom: '12px' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.zip"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '8px 16px', background: '#fff', color: '#1976d2',
              border: '1px dashed #1976d2', borderRadius: '6px', cursor: 'pointer',
              fontSize: '0.85em', width: '100%',
            }}
          >📥 {lang === 'zh' ? '选择 JSON 或 ZIP 文件' : 'Select JSON or ZIP files'}</button>
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div style={{
            maxHeight: '240px', overflowY: 'auto', marginBottom: '12px',
            border: '1px solid #eee', borderRadius: '8px', padding: '8px',
          }}>
            {files.map((f, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '4px 8px', fontSize: '0.8em',
                borderBottom: i < files.length - 1 ? '1px solid #f5f5f5' : 'none',
              }}>
                <span style={{
                  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: f.status === 'error' ? '#c62828' : '#333',
                }}>{f.fileName}</span>
                <span style={{ marginLeft: '8px', whiteSpace: 'nowrap' }}>
                  {f.status === 'pending' && <span style={{ color: '#999' }}>⏳</span>}
                  {f.status === 'processing' && <span style={{ color: '#1976d2' }}>⏳</span>}
                  {f.status === 'success' && <span style={{ color: '#4caf50' }}>✓</span>}
                  {f.status === 'error' && (
                    <span style={{ color: '#c62828', fontSize: '0.9em' }} title={f.error}>
                      ✕ {f.error}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Progress */}
        {processing && (
          <div style={{ marginBottom: '12px', fontSize: '0.85em', color: '#666', textAlign: 'center' }}>
            {lang === 'zh' ? `导入中... ${progress.done}/${progress.total}` : `Importing... ${progress.done}/${progress.total}`}
            <div style={{
              background: '#eee', borderRadius: '4px', height: '4px', marginTop: '6px',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
                height: '100%', background: '#1976d2', transition: 'width 0.3s',
              }} />
            </div>
          </div>
        )}

        {/* Summary */}
        {!processing && (successCount > 0 || errorCount > 0) && (
          <div style={{
            marginBottom: '12px', padding: '8px 12px', borderRadius: '6px',
            background: errorCount > 0 ? '#fff3e0' : '#e8f5e9',
            fontSize: '0.85em',
          }}>
            {lang === 'zh'
              ? `完成：成功 ${successCount} 个${errorCount > 0 ? `，失败 ${errorCount} 个` : ''}`
              : `Done: ${successCount} succeeded${errorCount > 0 ? `, ${errorCount} failed` : ''}`}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            style={{
              padding: '8px 20px', background: '#f5f5f5', color: '#666',
              border: '1px solid #ddd', borderRadius: '6px', cursor: processing ? 'not-allowed' : 'pointer',
              fontSize: '0.9em',
            }}
          >{t('cancel')}</button>
          <button
            type="button"
            onClick={handleProcess}
            disabled={!canStart}
            style={{
              padding: '8px 20px', background: '#1976d2', color: '#fff',
              border: 'none', borderRadius: '6px', cursor: canStart ? 'pointer' : 'not-allowed',
              fontSize: '0.9em', fontWeight: 600, opacity: canStart ? 1 : 0.5,
            }}
          >
            {processing
              ? (lang === 'zh' ? '导入中...' : 'Importing...')
              : (lang === 'zh' ? '开始导入' : 'Start Import')}
          </button>
        </div>
      </div>
    </div>
  );
}
