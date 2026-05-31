import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

interface TerminalProps {
  onInput?: (data: string) => void;
  className?: string;
}

export function Terminal({ onInput, className = '' }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: "'Fira Code', 'Courier New', monospace",
      theme: {
        background: '#1a1a2e',
        foreground: '#e0e0e0',
        cursor: '#ffffff',
        selectionBackground: '#4a4a6a',
        black: '#000000',
        red: '#e06c75',
        green: '#98c379',
        yellow: '#d19a66',
        blue: '#61afef',
        magenta: '#c678dd',
        cyan: '#56b6c2',
        white: '#abb2bf',
        brightBlack: '#5c6370',
        brightRed: '#e06c75',
        brightGreen: '#98c379',
        brightYellow: '#d19a66',
        brightBlue: '#61afef',
        brightMagenta: '#c678dd',
        brightCyan: '#56b6c2',
        brightWhite: '#ffffff',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    fitAddonRef.current = fitAddon;

    term.open(containerRef.current);
    fitAddon.fit();

    term.onData((data) => {
      onInput?.(data);
    });

    term.write('Superco AI Agent Terminal\r\n');
    term.write('========================\r\n\r\n');
    term.write('Waiting for session...\r\n');

    xtermRef.current = term;

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, []);

  const write = (data: string) => {
    xtermRef.current?.write(data);
  };

  const clear = () => {
    xtermRef.current?.clear();
  };

  const focus = () => {
    xtermRef.current?.focus();
  };

  // Expose methods via ref or return
  (Terminal as unknown as Record<string, unknown>)._write = write;
  (Terminal as unknown as Record<string, unknown>)._clear = clear;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '400px',
        background: '#1a1a2e',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
      onClick={focus}
    />
  );
}

// Static methods for external access
Terminal.write = (data: string) => {
  (Terminal as unknown as { _write: (d: string) => void })._write?.(data);
};

Terminal.clear = () => {
  (Terminal as unknown as { _clear: () => void })._clear?.();
};
