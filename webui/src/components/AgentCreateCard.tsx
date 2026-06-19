import React from 'react';

interface AgentCreateCardProps {
  onClick: () => void;
  label?: string;
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  boxShadow: '0 4px 6px rgba(0,0,0,0.1), 0 10px 20px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.08)',
  transition: 'transform 0.2s, boxShadow 0.2s',
  cursor: 'pointer',
  border: '2px dashed #ddd',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '200px',
};

export function AgentCreateCard({ onClick, label }: AgentCreateCardProps) {
  return (
    <div
      style={cardStyle}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.15), 0 4px 8px rgba(0,0,0,0.1)';
        e.currentTarget.style.borderColor = '#1976d2';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.boxShadow = '';
        e.currentTarget.style.borderColor = '#ddd';
      }}
    >
      <div style={{ textAlign: 'center', color: '#bbb' }}>
        <div style={{ fontSize: '4em', lineHeight: 1, marginBottom: '12px' }}>+</div>
        <div style={{ fontSize: '0.95em' }}>{label || '添加新的智能体'}</div>
      </div>
    </div>
  );
}
