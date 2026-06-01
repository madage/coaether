import type { AgentProfile } from '../types';

interface AgentCardProps {
  profile: AgentProfile;
  runtimeName?: string;
  onClick: () => void;
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  boxShadow: '0 4px 6px rgba(0,0,0,0.1), 0 10px 20px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.08)',
  transition: 'transform 0.2s, boxShadow 0.2s',
  cursor: 'pointer',
  overflow: 'hidden',
};

export function AgentCard({ profile, runtimeName, onClick }: AgentCardProps) {
  return (
    <div
      style={cardStyle}
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
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: '3em', marginBottom: '12px' }}>{profile.avatar}</div>
        <h3 style={{ margin: '0 0 4px', fontSize: '1.1em', color: '#1a1a2e' }}>{profile.name}</h3>
        <p style={{
          margin: '0 0 8px', color: '#888', fontSize: '0.8em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{profile.description}</p>
        <div style={{ fontSize: '0.75em', color: '#aaa' }}>
          <span style={{ color: profile.enabled ? '#4caf50' : '#9e9e9e' }}>●</span>
          {' '}{runtimeName || profile.agent_id}
        </div>
      </div>
    </div>
  );
}
