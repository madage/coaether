import { useState, useCallback } from 'react';
import { useLang } from '../i18n/context';

interface MathConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  op?: '+' | '-';
  onConfirm: () => void;
  onCancel: () => void;
}

export function MathConfirmDialog({ open, title, description, confirmLabel, op = '+', onConfirm, onCancel }: MathConfirmDialogProps) {
  const { t } = useLang();

  const [num1] = useState(() => Math.floor(Math.random() * 20) + 1);
  const [num2] = useState(() => Math.floor(Math.random() * 20) + 1);
  const [a, b] = op === '-' ? [Math.max(num1, num2), Math.min(num1, num2)] : [num1, num2];
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState(false);

  const correctAnswer = op === '+' ? a + b : a - b;

  const handleConfirm = useCallback(() => {
    if (parseInt(answer) !== correctAnswer) {
      setError(true);
      return;
    }
    setAnswer('');
    setError(false);
    onConfirm();
  }, [answer, correctAnswer, onConfirm]);

  const handleCancel = useCallback(() => {
    setAnswer('');
    setError(false);
    onCancel();
  }, [onCancel]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 3000,
      }}
      onClick={handleCancel}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '16px',
          padding: '32px',
          width: '360px',
          maxWidth: '90vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          textAlign: 'center',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: '2.5em', marginBottom: '12px', color: '#e53935' }}>⏹</div>
        <h3 style={{ margin: '0 0 8px', color: '#1a1a2e', fontSize: '1.1em' }}>{title}</h3>
        <p style={{ margin: '0 0 20px', color: '#666', fontSize: '0.9em' }}>
          {description}
        </p>
        <div style={{ fontSize: '1.5em', fontWeight: 700, color: '#333', marginBottom: '16px' }}>
          {a} {op} {b} = ?
        </div>
        <input
          autoFocus
          value={answer}
          onChange={(e) => setAnswer(e.target.value.replace(/\D/g, '').slice(0, 4))}
          onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '12px', borderRadius: '8px', border: '2px solid',
            borderColor: error ? '#e53935' : '#ddd',
            fontSize: '1.2em', textAlign: 'center', outline: 'none',
            marginBottom: '20px',
          }}
          onFocus={(e) => { if (!error) e.currentTarget.style.borderColor = '#1976d2'; }}
          onBlur={(e) => { if (!error) e.currentTarget.style.borderColor = '#ddd'; }}
        />
        {error && (
          <p style={{ margin: '-12px 0 16px', color: '#e53935', fontSize: '0.85em' }}>
            {t('nodeStopConfirmWrong')}
          </p>
        )}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            onClick={handleCancel}
            style={{
              padding: '10px 24px', borderRadius: '8px', border: '1px solid #ddd',
              background: '#fff', cursor: 'pointer', fontSize: '0.9em', color: '#666',
            }}
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!answer.trim()}
            style={{
              padding: '10px 24px', borderRadius: '8px', border: 'none',
              background: answer.trim() ? '#e53935' : '#ccc',
              color: '#fff', cursor: answer.trim() ? 'pointer' : 'default',
              fontSize: '0.9em', fontWeight: 600,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
