export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: FileNode[];
  content?: string; // Content is loaded on demand
  isMount?: boolean;
  unavailable?: boolean;
}

export interface MountInfo {
  alias: string;
  path: string;
}

export interface BrowseDirsResult {
  current: string;
  parent: string | null;
  dirs: { name: string; path: string }[];
}

export interface TreeSearchNodeResult {
  path: string;
  docName: string;
  title: string;
  score: number;
  preview: string;
  lineStart: number | null;
  lineEnd: number | null;
  ancestors: string[];
  isDocumentRoot?: boolean;
}

export interface TreeSearchDocumentResult {
  path: string;
  docName: string;
  bestScore: number;
  nodes: TreeSearchNodeResult[];
}

export interface TreeSearchResult {
  query: string;
  totalDocuments: number;
  totalNodes: number;
  documents: TreeSearchDocumentResult[];
  flatNodes: TreeSearchNodeResult[];
  index?: TreeSearchIndexStatus;
}

export interface TreeSearchIndexEntry {
  path: string;
  absolutePath: string;
  stagePath: string;
  docId: string;
  docName: string;
  size: number;
  mtimeMs: number;
}

export interface TreeSearchIndexStatus {
  exists: boolean;
  dirty: boolean;
  sourceCount: number;
  indexedCount: number;
  lastBuiltAt: string | null;
  indexDir: string;
  dbPath: string;
  stagedDir: string;
  addedPaths: string[];
  removedPaths: string[];
  changedPaths: string[];
}

export interface TreeSearchConfig {
  pythonCommand: string;
  bridgeScriptPath: string;
  supportedExtensions: string[];
  ignoreDirs: string[];
  textModes: string[];
  mergeStrategies: string[];
  defaults: {
    topKDocs: number;
    maxNodesPerDoc: number;
    includeAncestors: boolean;
    textMode: string;
    mergeStrategy: string;
    autoBuild: boolean;
  };
  index: TreeSearchIndexStatus;
}

export interface WorkspaceInfo {
  id: string;
  isDefault: boolean;
}

export interface FileFocusTarget {
  path: string;
  heading?: string;
  token: number;
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
