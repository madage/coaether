import React, { useEffect, useState, useCallback } from 'react';
import { useLang } from '../i18n/context';
import { agentFolders } from '../api/client';
import { AgentList } from './AgentList';
import type { AgentFolder } from '../types';

export function AgentFolderPanel() {
  const { t } = useLang();
  const [folders, setFolders] = useState<AgentFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [foldersOpen, setFoldersOpen] = useState(true);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await agentFolders.list();
      setFolders(res.folders);
    } catch { /* silently fail */ }
  }, []);

  useEffect(() => { fetchFolders(); }, [fetchFolders]);

  const handleCreate = useCallback(async () => {
    if (!newFolderName.trim()) return;
    try {
      await agentFolders.create({ name: newFolderName.trim() });
      setNewFolderName('');
      setShowCreate(false);
      fetchFolders();
    } catch { /* silently fail */ }
  }, [newFolderName, fetchFolders]);

  const handleRename = useCallback(async (id: string) => {
    if (!editName.trim()) { setEditingFolder(null); return; }
    try {
      await agentFolders.update(id, { name: editName.trim() });
      setEditingFolder(null);
      fetchFolders();
    } catch { /* silently fail */ }
  }, [editName, fetchFolders]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await agentFolders.delete(id);
      if (selectedFolderId === id) setSelectedFolderId(null);
      fetchFolders();
    } catch { /* silently fail */ }
  }, [selectedFolderId, fetchFolders]);

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Folder sidebar */}
      <div style={{
        width: foldersOpen ? '220px' : '32px',
        minWidth: foldersOpen ? '220px' : '32px',
        borderRight: '1px solid #eee',
        background: '#fafbfc',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.2s, min-width 0.2s',
        overflow: 'hidden',
      }}>
        {/* Sidebar header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 12px',
          borderBottom: '1px solid #eee',
        }}>
          {foldersOpen && (
            <span style={{ fontSize: '0.85em', fontWeight: 600, color: '#555' }}>
              {t('agentFolders') || 'Agent Folders'}
            </span>
          )}
          <button
            onClick={() => setFoldersOpen(!foldersOpen)}
            title={foldersOpen ? 'Collapse' : 'Expand'}
            style={{
              width: '24px', height: '24px', border: 'none', background: 'transparent',
              cursor: 'pointer', fontSize: '0.85em', color: '#999',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '4px',
            }}
          >
            {foldersOpen ? '◀' : '▶'}
          </button>
        </div>

        {foldersOpen && (
          <>
            {/* "All Agents" button */}
            <button
              onClick={() => setSelectedFolderId(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 12px', margin: '4px 8px',
                border: 'none', borderRadius: '6px',
                background: selectedFolderId === null ? '#e8ecf1' : 'transparent',
                cursor: 'pointer', fontSize: '0.85em', color: '#333',
                textAlign: 'left', width: 'calc(100% - 16px)',
              }}
            >
              <span style={{ fontSize: '1em' }}>🤖</span>
              <span>{t('folderAll') || 'All Agents'}</span>
            </button>

            {/* Folder list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
              {folders.map(f => (
                <div key={f.id} style={{ position: 'relative' }}>
                  {editingFolder === f.id ? (
                    <div style={{ display: 'flex', gap: '4px', padding: '4px 4px' }}>
                      <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRename(f.id);
                          if (e.key === 'Escape') setEditingFolder(null);
                        }}
                        onBlur={() => handleRename(f.id)}
                        style={{
                          flex: 1, border: '1px solid #ccc', borderRadius: '4px',
                          padding: '4px 6px', fontSize: '0.8em',
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      onClick={() => setSelectedFolderId(f.id)}
                      onContextMenu={e => {
                        e.preventDefault();
                        setEditName(f.name);
                        setEditingFolder(f.id);
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 12px', margin: '2px 0',
                        borderRadius: '6px', cursor: 'pointer',
                        background: selectedFolderId === f.id ? '#e8ecf1' : 'transparent',
                        fontSize: '0.85em',
                      }}
                    >
                      <span style={{
                        width: '10px', height: '10px', borderRadius: '3px',
                        background: f.color, flexShrink: 0,
                      }} />
                      <span style={{
                        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', color: '#444',
                      }}>
                        {f.name}
                      </span>
                      <span style={{ fontSize: '0.75em', color: '#aaa', flexShrink: 0 }}>
                        {f.agent_count}
                      </span>
                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '2px' }} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => { setEditName(f.name); setEditingFolder(f.id); }}
                          title={t('folderRename') || 'Rename'}
                          style={{
                            width: '20px', height: '20px', border: 'none', background: 'transparent',
                            cursor: 'pointer', fontSize: '0.7em', color: '#999', borderRadius: '3px',
                          }}
                        >✎</button>
                        <button
                          onClick={() => {
                            if (window.confirm(t('folderDeleteConfirm') || 'Delete this folder?')) handleDelete(f.id);
                          }}
                          title={t('folderDelete') || 'Delete'}
                          style={{
                            width: '20px', height: '20px', border: 'none', background: 'transparent',
                            cursor: 'pointer', fontSize: '0.7em', color: '#e88', borderRadius: '3px',
                          }}
                        >✕</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {folders.length === 0 && (
                <div style={{ padding: '12px', color: '#aaa', fontSize: '0.8em', textAlign: 'center' }}>
                  {t('folderEmpty') || 'No folders yet'}
                </div>
              )}
            </div>

            {/* Create folder */}
            <div style={{ padding: '8px', borderTop: '1px solid #eee' }}>
              {showCreate ? (
                <div style={{ display: 'flex', gap: '4px' }}>
                  <input
                    autoFocus
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCreate();
                      if (e.key === 'Escape') { setShowCreate(false); setNewFolderName(''); }
                    }}
                    placeholder={t('folderNamePlaceholder') || 'Folder name...'}
                    style={{
                      flex: 1, border: '1px solid #ccc', borderRadius: '4px',
                      padding: '6px 8px', fontSize: '0.8em',
                    }}
                  />
                  <button
                    onClick={handleCreate}
                    style={{
                      padding: '6px 10px', border: 'none', borderRadius: '4px',
                      background: '#6366f1', color: '#fff', cursor: 'pointer',
                      fontSize: '0.8em', fontWeight: 600,
                    }}
                  >✓</button>
                </div>
              ) : (
                <button
                  onClick={() => { setShowCreate(true); setNewFolderName(''); }}
                  style={{
                    width: '100%', padding: '8px', border: '1px dashed #ccc', borderRadius: '6px',
                    background: 'transparent', cursor: 'pointer', fontSize: '0.8em', color: '#888',
                  }}
                >
                  + {t('folderCreate') || 'New Folder'}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Agent grid area */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <AgentList folderId={selectedFolderId} />
      </div>
    </div>
  );
}
