import { createContext, useContext, type ReactNode } from 'react';
import { useDashboardWS } from './useDashboardWS';
import type { Node, Session } from '../types';

interface DashboardWSContextValue {
  nodes: Node[];
  sessions: Session[];
  connected: boolean;
  subscribeResource: (cb: (resource: string) => void) => () => void;
  subscribeNotification: (cb: (notification: { type: string; title: string; message: string }) => void) => () => void;
}

const DashboardWSContext = createContext<DashboardWSContextValue | null>(null);

export function DashboardWSProvider({ children }: { children: ReactNode }) {
  const value = useDashboardWS();
  return (
    <DashboardWSContext.Provider value={value}>
      {children}
    </DashboardWSContext.Provider>
  );
}

export function useDashboardWSContext(): DashboardWSContextValue {
  const ctx = useContext(DashboardWSContext);
  if (!ctx) {
    throw new Error('useDashboardWSContext must be used within <DashboardWSProvider>');
  }
  return ctx;
}
