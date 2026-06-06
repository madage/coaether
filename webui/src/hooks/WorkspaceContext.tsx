import { createContext, useContext } from 'react';
import type { WorkspaceRole } from '../types';

interface WorkspaceContextType {
  role: WorkspaceRole | null;
  workspaceId: string | null;
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  role: null,
  workspaceId: null,
});

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

export default WorkspaceContext;
