import { useState, useRef, useEffect } from 'react';
import type { Project, ProjectStatus } from '../types';
import { useLang } from '../i18n/context';

const statusConfig: Record<ProjectStatus, { label: string; bg: string; color: string }> = {
  planning: { label: '规划中', bg: '#e3f2fd', color: '#1565c0' },
  active: { label: '进行中', bg: '#e8f5e9', color: '#2e7d32' },
  completed: { label: '已完成', bg: '#f3e5f5', color: '#6a1b9a' },
  on_hold: { label: '挂起', bg: '#fff3e0', color: '#e65100' },
};

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
  onEdit: () => void;
  onDelete: (id: string) => void;
}

export function ProjectCard({ project, onClick, onEdit, onDelete }: ProjectCardProps) {
  const { t } = useLang();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const sc = statusConfig[project.status] || statusConfig.planning;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  return (
    <div
      style={{
        background: '#fff', borderRadius: '12px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1), 0 10px 20px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.08)',
        transition: 'transform 0.2s, boxShadow 0.2s', cursor: 'pointer', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.15), 0 4px 8px rgba(0,0,0,0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.boxShadow = '';
      }}
    >
      <div style={{ height: '6px', background: project.color, flexShrink: 0 }} />

      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1, position: 'relative' }}>
        <div ref={menuRef} style={{ position: 'absolute', top: '8px', right: '12px' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '2px 6px', borderRadius: '4px', color: '#999',
              fontSize: '1.1em', lineHeight: 1, fontWeight: 700, letterSpacing: '1px',
            }}
          >
            ···
          </button>
          {menuOpen && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, zIndex: 100,
              background: '#fff', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              minWidth: '120px', padding: '4px 0', border: '1px solid #eee',
            }}>
              <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: '0.85em', color: '#333',
                }}
              >{t('profileEdit')}</button>
              <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(project.id); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: '0.85em', color: '#c62828',
                }}
              >{t('taskDelete')}</button>
            </div>
          )}
        </div>

        <div style={{
          width: '40px', height: '40px', borderRadius: '10px',
          background: project.color + '20',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.3em', marginBottom: '12px',
        }}>
          📁
        </div>

        <h3 style={{
          margin: '0 0 4px', fontSize: '1.05em', color: '#1a1a2e',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{project.name}</h3>

        {/* Status badge */}
        <span style={{
          alignSelf: 'flex-start', fontSize: '0.75em', padding: '2px 8px',
          borderRadius: '8px', background: sc.bg, color: sc.color,
          fontWeight: 500, marginBottom: '8px',
        }}>
          {sc.label}
        </span>

        <p style={{
          margin: '0 0 12px', color: '#888', fontSize: '0.83em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          flex: 1,
        }}>{project.description || '-'}</p>

        <div style={{ fontSize: '0.78em', color: '#aaa', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span>{project.task_count} tasks</span>
          {project.due_at && (
            <span>📅 {new Date(project.due_at).toLocaleDateString()}</span>
          )}
        </div>
      </div>
    </div>
  );
}
