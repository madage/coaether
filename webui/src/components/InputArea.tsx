import { useState, useRef, useCallback } from 'react';

interface InputAreaProps {
  onSend: (text: string) => boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function InputArea({ onSend, disabled = false, placeholder = 'Type a message...' }: InputAreaProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    const ok = onSend(trimmed);
    if (ok) {
      setText('');
      inputRef.current?.focus();
    }
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Enter to send (Shift+Enter for newline)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
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
        placeholder={disabled ? 'Connect to start chatting...' : placeholder}
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
        Send
      </button>
    </div>
  );
}
