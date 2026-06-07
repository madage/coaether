import React, { useState, useEffect } from 'react';

interface Annotation {
  id: string;
  task_id: string;
  content: string;
  color: string;
  created_at: string;
}

interface AnnotationTabProps {
  taskId?: string;
  taskTitle?: string;
}

const COLORS = [
  { value: '#ffeb3b', label: '黄色' },
  { value: '#4caf50', label: '绿色' },
  { value: '#2196f3', label: '蓝色' },
  { value: '#f44336', label: '红色' },
  { value: '#9c27b0', label: '紫色' },
];

export function AnnotationTab({ taskId }: AnnotationTabProps) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [content, setContent] = useState('');
  const [color, setColor] = useState('#ffeb3b');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (taskId) {
      fetch(`/api/plugins/task-annotator/annotations?task_id=${taskId}`)
        .then((r) => r.json())
        .then((data) => {
          setAnnotations(data.annotations || []);
          if (data.annotations?.[0]) {
            setContent(data.annotations[0].content);
            setColor(data.annotations[0].color);
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [taskId]);

  const handleSave = async () => {
    if (!taskId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/plugins/task-annotator/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, content, color }),
      });
      const data = await res.json();
      if (data.status === 'saved') {
        setAnnotations((prev) => {
          const exists = prev.find((a) => a.task_id === taskId);
          if (exists) {
            return prev.map((a) =>
              a.task_id === taskId ? { ...a, content, color } : a,
            );
          }
          return [...prev, { id: '', task_id: taskId, content, color, created_at: new Date().toISOString() }];
        });
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 16, color: '#999' }}>加载中...</div>;
  }

  return (
    <div style={{ padding: '16px 0' }}>
      <h4 style={{ margin: '0 0 12px', color: '#333', fontSize: '0.95em' }}>
        任务标注
      </h4>

      <div style={{ marginBottom: 12 }}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="输入标注内容..."
          rows={3}
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: '6px',
            border: '1px solid #ddd',
            fontSize: '0.9em',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: '0.85em', color: '#666' }}>颜色:</span>
        {COLORS.map((c) => (
          <button
            key={c.value}
            onClick={() => setColor(c.value)}
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              border: color === c.value ? '2px solid #333' : '2px solid transparent',
              background: c.value,
              cursor: 'pointer',
            }}
            title={c.label}
          />
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          padding: '8px 20px',
          borderRadius: '6px',
          border: 'none',
          background: saving ? '#ccc' : '#1976d2',
          color: '#fff',
          cursor: saving ? 'not-allowed' : 'pointer',
          fontSize: '0.9em',
        }}
      >
        {saving ? '保存中...' : '保存标注'}
      </button>

      {annotations.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h5 style={{ margin: '0 0 8px', color: '#666', fontSize: '0.85em' }}>历史记录</h5>
          {annotations.map((a) => (
            <div
              key={a.id}
              style={{
                padding: '8px 12px',
                borderLeft: `4px solid ${a.color}`,
                background: '#f9f9f9',
                borderRadius: '0 6px 6px 0',
                marginBottom: 6,
                fontSize: '0.85em',
              }}
            >
              <div style={{ color: '#333' }}>{a.content || '(空)'}</div>
              <div style={{ color: '#999', fontSize: '0.8em', marginTop: 4 }}>{a.created_at}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
