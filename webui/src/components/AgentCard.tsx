import type { AgentProfile } from '../types';

interface AgentCardProps {
  profile: AgentProfile;
  runtimeName?: string;
  nodeName?: string;
  onClick: () => void;
  onToggle?: (id: string, enabled: boolean) => void;
  onRemoveFromFolder?: (id: string) => void;
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  boxShadow: '0 4px 6px rgba(0,0,0,0.1), 0 10px 20px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.08)',
  transition: 'transform 0.2s, boxShadow 0.2s, opacity 0.2s',
  cursor: 'pointer',
  overflow: 'hidden',
};

export function AgentCard({ profile, runtimeName, nodeName, onClick, onToggle, onRemoveFromFolder }: AgentCardProps) {
  const disabled = !profile.enabled;

  return (
    <div
      style={{
        ...cardStyle,
        opacity: disabled ? 0.55 : 1,
        position: 'relative',
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.15), 0 4px 8px rgba(0,0,0,0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.boxShadow = '';
      }}
    >
      {/* Remove from folder button */}
      {onRemoveFromFolder && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onRemoveFromFolder(profile.id);
          }}
          style={{
            position: 'absolute',
            top: '8px',
            left: '10px',
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.06)',
            cursor: 'pointer',
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.8em',
            color: '#999',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#ff4444';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0,0,0,0.06)';
            e.currentTarget.style.color = '#999';
          }}
          title="从文件夹中移除"
        >✕</div>
      )}

      {/* Top-right toggle */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          onToggle?.(profile.id, !profile.enabled);
        }}
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          width: '36px',
          height: '20px',
          borderRadius: '10px',
          background: disabled ? '#ccc' : '#4caf50',
          cursor: 'pointer',
          transition: 'background 0.2s',
          zIndex: 1,
        }}
        title={disabled ? '点击启用' : '点击禁用'}
      >
        <div style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: '#fff',
          position: 'absolute',
          top: '2px',
          left: disabled ? '2px' : '18px',
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>

      <div style={{ padding: '20px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: '3em', marginBottom: '8px' }}>{profile.avatar}</div>
        <h3 style={{
          margin: '0 0 4px', fontSize: '1.1em',
          color: disabled ? '#999' : '#1a1a2e',
        }}>{profile.name}</h3>
        <p style={{
          margin: '0 0 8px', color: disabled ? '#bbb' : '#888', fontSize: '0.8em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{profile.description}</p>
        <div style={{ fontSize: '0.75em', color: '#aaa' }}>
          <span style={{ color: profile.enabled ? '#4caf50' : '#9e9e9e' }}>●</span>
          {' '}{runtimeName || profile.agent_id}
        </div>
        {nodeName && (
          <div style={{ fontSize: '0.75em', color: '#bbb', marginTop: '2px' }}>
            {nodeName}
          </div>
        )}
      </div>
    </div>
  );
}
