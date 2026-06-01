import { useRef, useEffect, useState } from 'react';
import type { Envelope, ContentBlock } from '../hooks/useMessageBus';

interface MessageStreamProps {
  messages: Envelope[];
  className?: string;
}

export function MessageStream({ messages, className = '' }: MessageStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showReasoning, setShowReasoning] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Filter out internal reasoning messages (thinking + tool_use) when hidden
  const visibleMessages = showReasoning
    ? messages
    : messages.filter(env => !isInternalEnvelope(env));

  if (messages.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#999' }}>
        <p>No messages yet. Send a message to start the conversation.</p>
      </div>
    );
  }

  return (
    <div className={className} style={{ overflow: 'auto', padding: '16px' }}>
      <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={() => setShowReasoning(!showReasoning)}
          style={{
            padding: '3px 10px',
            fontSize: '0.78em',
            border: '1px solid #e0e0e0',
            borderRadius: '4px',
            background: showReasoning ? '#e3f2fd' : '#f5f5f5',
            cursor: 'pointer',
            color: '#666',
          }}
        >
          {showReasoning ? 'Hide all reasoning' : 'Show all reasoning'}
        </button>
      </div>
      {visibleMessages.map((env, i) => {
        const isSystem = env.from === 'system://bus' || env.type === 'session.created' || env.type === 'session.joined';
        const isError = env.type === 'error';
        const hasContent = env.payload?.content && env.payload.content.length > 0;
        const showContent = hasContent && (env.type === 'message' || env.type === 'event' || env.type === 'tool.use');

        // System messages (session events)
        if (isSystem) {
          return <SystemMessage key={i} env={env} />;
        }

        // Error messages
        if (isError) {
          return <ErrorMessage key={i} env={env} />;
        }

        // Permission requests (inline display)
        if (env.type === 'permission.request') {
          return <PermissionRequestBlock key={i} env={env} />;
        }

        // Messages / events with content blocks
        if (showContent && env.payload?.content) {
          return (
            <div key={i} style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.75em', color: '#999', marginBottom: '4px' }}>
                {displayName(env)}
              </div>
              {env.payload.content.map((block, j) => (
                <ContentBlockRenderer key={j} block={block} />
              ))}
            </div>
          );
        }

        // Fallback for unknown message types
        return (
          <div key={i} style={{ marginBottom: '8px', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
            <div style={{ fontSize: '0.75em', color: '#999' }}>{env.type} from {env.from}</div>
            <pre style={{ margin: '4px 0 0', fontSize: '0.85em', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(env.payload, null, 2)}
            </pre>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

function displayName(env: Envelope): string {
  if (env.from?.startsWith('ui://')) return 'You';
  if (env.from?.includes('runtime://') || env.from?.includes('agent://')) return 'Claude';
  if (env.type === 'event' || env.type === 'tool.use') return 'Claude';
  return env.from || env.type;
}

// Helpers for grouping internal reasoning content (thinking + tool_use)
function isInternalContent(block: ContentBlock): boolean {
  return (block.type === 'progress' && block.status === 'thinking') || block.type === 'tool_use';
}

function isInternalEnvelope(env: Envelope): boolean {
  if (env.type !== 'event') return false;
  if (!env.payload?.content || env.payload.content.length === 0) return false;
  return env.payload.content.every(b => isInternalContent(b));
}

function SystemMessage({ env }: { env: Envelope }) {
  let text = '';
  if (env.type === 'session.created') {
    text = `Session created: ${env.session_id}`;
  } else if (env.type === 'session.joined') {
    text = `Joined session: ${env.session_id}`;
  } else if (env.type === 'hello') {
    text = 'Connected to bus';
  } else {
    text = `${env.type}`;
  }

  return (
    <div style={{ textAlign: 'center', margin: '8px 0', fontSize: '0.85em', color: '#999' }}>
      <span style={{ background: '#f0f0f0', padding: '2px 12px', borderRadius: '12px' }}>
        {text}
      </span>
    </div>
  );
}

function ErrorMessage({ env }: { env: Envelope }) {
  return (
    <div style={{ margin: '8px 0', padding: '8px 12px', background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: '6px' }}>
      <div style={{ fontSize: '0.85em', color: '#c62828' }}>
        Error: {env.payload?.message || env.payload?.code || 'Unknown error'}
      </div>
    </div>
  );
}

function ContentBlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'text':
      return <TextBlock block={block} />;

    case 'code':
      return <CodeBlock block={block} />;

    case 'markdown':
      return <MarkdownBlock block={block} />;

    case 'table':
      return <TableBlock block={block} />;

    case 'status':
      return <StatusBlock block={block} />;

    case 'progress':
      return <ProgressBlock block={block} />;

    case 'separator':
      return <SeparatorBlock block={block} />;

    case 'tool_use':
      return <ToolUseBlock block={block} />;

    case 'image':
      return <ImageBlock block={block} />;

    case 'card':
      return <CardBlock block={block} />;

    default:
      return (
        <div style={{ padding: '4px 0' }}>
          <span style={{ color: '#999', fontSize: '0.8em' }}>[{block.type}] </span>
          {block.content && <span>{block.content}</span>}
        </div>
      );
  }
}

function TextBlock({ block }: { block: ContentBlock }) {
  return (
    <div style={{ padding: '4px 0', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
      {block.content}
    </div>
  );
}

function CodeBlock({ block }: { block: ContentBlock }) {
  return (
    <div style={{ margin: '8px 0', borderRadius: '6px', overflow: 'hidden', border: '1px solid #e0e0e0' }}>
      {block.filename && (
        <div style={{ padding: '4px 8px', background: '#f5f5f5', fontSize: '0.8em', color: '#666', borderBottom: '1px solid #e0e0e0' }}>
          {block.filename}
        </div>
      )}
      <pre style={{
        margin: 0,
        padding: '12px',
        background: '#1a1a2e',
        color: '#e0e0e0',
        overflow: 'auto',
        fontSize: '0.85em',
        lineHeight: '1.4',
      }}>
        <code>{block.content}</code>
      </pre>
      {block.language && (
        <div style={{ padding: '2px 8px', background: '#f5f5f5', fontSize: '0.75em', color: '#999', textAlign: 'right' }}>
          {block.language}
        </div>
      )}
    </div>
  );
}

function MarkdownBlock({ block }: { block: ContentBlock }) {
  return (
    <div style={{ padding: '4px 0', lineHeight: '1.5' }}>
      {block.content?.split('\n').map((line, i) => {
        // Bold
        let rendered = line.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
        // Inline code
        rendered = rendered.replace(/`(.+?)`/g, '<code style="background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:0.9em">$1</code>');
        // Links
        rendered = rendered.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

        return (
          <div key={i} style={{ minHeight: '1.5em' }}>
            {line.startsWith('# ') ? (
              <h3 style={{ margin: '12px 0 4px' }}>{line.slice(2)}</h3>
            ) : line.startsWith('## ') ? (
              <h4 style={{ margin: '10px 0 4px' }}>{line.slice(3)}</h4>
            ) : line.startsWith('- ') ? (
              <li style={{ marginLeft: '16px' }}>{line.slice(2)}</li>
            ) : (
              <span dangerouslySetInnerHTML={{ __html: rendered }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function TableBlock({ block }: { block: ContentBlock }) {
  const headers = block.headers || [];
  const rows = block.rows || [];

  if (headers.length === 0 && rows.length === 0) return null;

  return (
    <div style={{ margin: '8px 0', overflow: 'auto', borderRadius: '6px', border: '1px solid #e0e0e0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
        {headers.length > 0 && (
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              {headers.map((h, i) => (
                <th key={i} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '2px solid #e0e0e0', fontWeight: 600 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              {(Array.isArray(row) ? row : []).map((cell, j) => (
                <td key={j} style={{ padding: '6px 12px', borderBottom: '1px solid #e0e0e0' }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBlock({ block }: { block: ContentBlock }) {
  const colorMap: Record<string, string> = {
    green: '#4caf50',
    red: '#f44336',
    yellow: '#ff9800',
    blue: '#2196f3',
    gray: '#9e9e9e',
  };
  const bgColor = block.content ? colorMap[block.content] || block.content : '#4caf50';

  return (
    <div style={{ margin: '8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{
        display: 'inline-block',
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        background: bgColor,
      }} />
      <span style={{ fontSize: '0.85em', color: '#666' }}>
        {block.filename || 'Status'}
      </span>
    </div>
  );
}

function ProgressBlock({ block }: { block: ContentBlock }) {
  const pct = block.content ? Math.min(100, Math.max(0, parseInt(block.content, 10) || 0)) : 0;

  return (
    <div style={{ margin: '8px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', color: '#666', marginBottom: '2px' }}>
        <span>{block.filename || 'Progress'}</span>
        <span>{pct}%</span>
      </div>
      <div style={{ background: '#e0e0e0', borderRadius: '4px', overflow: 'hidden', height: '8px' }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: '#4caf50',
          borderRadius: '4px',
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  );
}

function SeparatorBlock({ block }: { block: ContentBlock }) {
  return (
    <div style={{ margin: '12px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #e0e0e0' }} />
      {block.content && <span style={{ fontSize: '0.75em', color: '#bbb', whiteSpace: 'nowrap' }}>{block.content}</span>}
      {block.content && <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #e0e0e0' }} />}
    </div>
  );
}

function ToolUseBlock({ block }: { block: ContentBlock }) {
  return (
    <div style={{ margin: '8px 0', padding: '8px 12px', background: '#f3e5f5', borderRadius: '6px', border: '1px solid #ce93d8' }}>
      <div style={{ fontSize: '0.8em', color: '#7b1fa2', marginBottom: '4px' }}>
        Tool: {block.tool || block.language || 'unknown'}
      </div>
      {(block.tool_input || block.content) && (
        <pre style={{ margin: 0, fontSize: '0.85em', whiteSpace: 'pre-wrap', color: '#4a148c' }}>
          {block.tool_input || block.content}
        </pre>
      )}
      {block.status && (
        <div style={{ fontSize: '0.75em', color: '#9c27b0', marginTop: '4px' }}>
          Status: {block.status}
        </div>
      )}
    </div>
  );
}

function ImageBlock({ block }: { block: ContentBlock }) {
  if (block.url) {
    return (
      <div style={{ margin: '8px 0' }}>
        <img src={block.url} alt={block.filename || 'image'} style={{ maxWidth: '100%', borderRadius: '6px' }} />
      </div>
    );
  }
  if (block.content) {
    return <TextBlock block={block} />;
  }
  return null;
}

function CardBlock({ block }: { block: ContentBlock }) {
  return (
    <div style={{ margin: '8px 0', padding: '12px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      {block.filename && (
        <div style={{ fontWeight: 600, marginBottom: '4px' }}>{block.filename}</div>
      )}
      {block.content && (
        <div style={{ fontSize: '0.9em', color: '#333', lineHeight: '1.4' }}>{block.content}</div>
      )}
    </div>
  );
}

function PermissionRequestBlock({ env }: { env: { payload?: { tool?: string; input?: string; message?: string } } }) {
  const { tool, input, message } = env.payload || {};
  return (
    <div style={{
      margin: '12px 0',
      padding: '12px 16px',
      background: '#fff3e0',
      border: '1px solid #ffe0b2',
      borderRadius: '8px',
    }}>
      <div style={{ fontSize: '0.85em', color: '#e65100', fontWeight: 600, marginBottom: '4px' }}>
        🔧 工具请求: {tool || 'unknown'}
      </div>
      {message && (
        <div style={{ fontSize: '0.85em', color: '#bf360c', marginBottom: '6px' }}>
          {message}
        </div>
      )}
      {input && (
        <pre style={{
          margin: '4px 0 0',
          fontSize: '0.8em',
          whiteSpace: 'pre-wrap',
          color: '#555',
          background: '#fff',
          padding: '8px',
          borderRadius: '4px',
          maxHeight: '160px',
          overflow: 'auto',
        }}>
          {formatInput(input)}
        </pre>
      )}
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
