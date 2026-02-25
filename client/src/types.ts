export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: FileNode[];
  content?: string; // Content is loaded on demand
}

export interface WorkspaceInfo {
  id: string;
  isDefault: boolean;
}

export interface GitStatus {
  isInitialized: boolean;
  currentBranch?: string;
  hasUncommittedChanges?: boolean;
  staged?: string[];
  modified?: string[];
  untracked?: string[];
  deleted?: string[];
}

export interface AppState {
  currentFile: FileNode | null;
  isSidebarOpen: boolean;
  isRightPanelOpen: boolean;
  unsavedChanges: boolean;
  gitStatus: GitStatus | null;
}
