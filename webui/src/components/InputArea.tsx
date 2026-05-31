import { useState, useRef, useCallback } from 'react';

interface InputAreaProps {
  onSend: (text: string) => boolean;
  disabled?: boolean;
  placeholder?: string;
  pendingPermissions?: number;
  onPermissionResponse?: (approved: boolean) => void;
}

export function InputArea({ onSend, disabled = false, placeholder = 'Type a message...', pendingPermissions = 0, onPermissionResponse }: InputAreaProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasPending = pendingPermissions > 0;

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    // If permissions are pending, treat input as permission response
    if (hasPending && onPermissionResponse) {
      if (trimmed === '1' || trimmed.toLowerCase() === 'allow' || trimmed.toLowerCase() === 'y') {
        onPermissionResponse(true);
      } else if (trimmed === '2' || trimmed.toLowerCase() === 'deny' || trimmed.toLowerCase() === 'n') {
        onPermissionResponse(false);
      } else {
        // Unknown input for pending permission, clear and re-prompt
        setText('');
        return;
      }
      setText('');
      inputRef.current?.focus();
      return;
    }

    const ok = onSend(trimmed);
    if (ok) {
      setText('');
      inputRef.current?.focus();
    }
  }, [text, disabled, onSend, hasPending, onPermissionResponse]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const inputPlaceholder = hasPending
    ? '输入 1=允许, 2=拒绝 后回车'
    : (disabled ? 'Connect to start chatting...' : placeholder);

  return (
    <div>
      {hasPending && (
        <div style={{
          padding: '8px 16px',
          background: '#fff3e0',
          borderTop: '1px solid #ffe0b2',
          fontSize: '0.85em',
          color: '#e65100',
        }}>
          ⚡ 工具需要许可 — 输入 <b>1</b> 允许, <b>2</b> 拒绝
        </div>
      )}
      <div style={{
        display: 'flex',
        gap: '8px',
        padding: '12px 16px',
        borderTop: '1px solid #e0e0e0',
        background: '#fff',
      }}>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={inputPlaceholder}
          disabled={disabled}
          rows={2}
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid #ccc',
            fontSize: '0.95em',
            fontFamily: 'inherit',
            resize: 'none',
            outline: 'none',
            background: disabled ? '#f5f5f5' : '#fff',
          }}
        />
        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          style={{
            alignSelf: 'flex-end',
            padding: '10px 20px',
            background: disabled || !text.trim() ? '#ccc' : '#1976d2',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: disabled || !text.trim() ? 'default' : 'pointer',
            fontSize: '0.95em',
            fontWeight: 500,
            transition: 'background 0.2s',
          }}
        >
          {hasPending ? '确认' : 'Send'}
        </button>
      </div>
    </div>
  );
}
