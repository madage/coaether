interface PermissionDialogProps {
  toolName: string;
  toolInput: string;
  promptText: string;
  onAllow: () => void;
  onDeny: () => void;
}

export function PermissionDialog({ toolName, toolInput, promptText, onAllow, onDeny }: PermissionDialogProps) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '480px',
        width: '90%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}>
        <div style={{ fontSize: '1.1em', fontWeight: 600, marginBottom: '4px', color: '#1a1a2e' }}>
          Permission Required
        </div>

        <div style={{ fontSize: '0.85em', color: '#666', marginBottom: '16px' }}>
          {promptText}
        </div>

        <div style={{
          background: '#f5f5f5',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '16px',
        }}>
          <div style={{ fontSize: '0.8em', color: '#7b1fa2', fontWeight: 600, marginBottom: '8px' }}>
            Tool: {toolName || 'Unknown'}
          </div>

          {toolInput && (
            <pre style={{
              margin: 0,
              fontSize: '0.8em',
              whiteSpace: 'pre-wrap',
              color: '#333',
              maxHeight: '240px',
              overflow: 'auto',
              lineHeight: '1.4',
            }}>
              {formatInput(toolInput)}
            </pre>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onDeny}
            style={{
              padding: '10px 20px',
              background: '#fff',
              color: '#666',
              border: '1px solid #ddd',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9em',
            }}
          >
            Deny
          </button>
          <button
            onClick={onAllow}
            style={{
              padding: '10px 20px',
              background: '#1976d2',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9em',
              fontWeight: 600,
            }}
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}

function formatInput(input: string): string {
  try {
    const parsed = JSON.parse(input);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return input;
  }
}
