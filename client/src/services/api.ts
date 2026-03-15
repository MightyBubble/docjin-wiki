import axios from 'axios';
import type {
  FileNode,
  GitStatus,
  WorkspaceInfo,
  MountInfo,
  BrowseDirsResult,
  TreeSearchResult,
  TreeSearchConfig,
  TreeSearchIndexEntry,
  TreeSearchIndexStatus,
} from '../types';
import { clientConfig } from '../config';

const api = axios.create({
  baseURL: clientConfig.apiBaseUrl,
  timeout: clientConfig.apiTimeoutMs,
});

export const fileService = {
  getFiles: async (workspace = 'default'): Promise<FileNode[]> => {
    const response = await api.get('/files', { params: { workspace } });
    return response.data.content || response.data;
  },

  readFile: async (path: string, workspace = 'default'): Promise<string> => {
    const response = await api.get('/files/read', { params: { path, workspace } });
    return response.data.content || response.data;
  },

  writeFile: async (path: string, content: string, workspace = 'default'): Promise<void> => {
    await api.post('/files/write', { path, content, workspace });
  },

  rename: async (oldPath: string, newPath: string, workspace = 'default'): Promise<void> => {
    await api.post('/files/rename', { oldPath, newPath, workspace });
  },

  delete: async (path: string, workspace = 'default'): Promise<void> => {
    await api.post('/files/delete', { path, workspace });
  }
};

export const gitService = {
  getStatus: async (workspace = 'default'): Promise<GitStatus> => {
    const response = await api.get('/git/status', { params: { workspace } });
    return response.data.content || response.data;
  },

  init: async (workspace = 'default'): Promise<void> => {
    await api.post('/git/init', { workspace });
  },

  commit: async (message: string, workspace = 'default'): Promise<void> => {
    await api.post('/git/commit', { message, workspace });
  }
};

export const workspaceService = {
  getWorkspaces: async (): Promise<{ workspaces: WorkspaceInfo[]; defaultWorkspace: string }> => {
    const response = await api.get('/workspaces');
    return response.data;
  },

  createWorkspace: async (id: string, seedFromTemplate = false): Promise<void> => {
    await api.post('/workspaces', { id, seedFromTemplate });
  }
};

export const mountService = {
  getMounts: async (workspace = 'default'): Promise<MountInfo[]> => {
    const response = await api.get('/mounts', { params: { workspace } });
    return response.data.mounts || [];
  },

  addMount: async (alias: string, mountPath: string, workspace = 'default'): Promise<MountInfo[]> => {
    const response = await api.post('/mounts', { alias, path: mountPath, workspace });
    return response.data.mounts || [];
  },

  removeMount: async (alias: string, workspace = 'default'): Promise<MountInfo[]> => {
    const response = await api.delete('/mounts', { data: { alias, workspace } });
    return response.data.mounts || [];
  },

  browseDirs: async (dirPath?: string): Promise<BrowseDirsResult> => {
    const params = dirPath ? { path: dirPath } : {};
    const response = await api.get('/browse-dirs', { params });
    return response.data;
  },

  createDir: async (dirPath: string): Promise<void> => {
    await api.post('/browse-dirs/mkdir', { path: dirPath });
  },
};

export const treeSearchService = {
  search: async (
    query: string,
    workspace = 'default',
    options?: {
      topKDocs?: number;
      maxNodesPerDoc?: number;
      includeAncestors?: boolean;
      textMode?: string;
      mergeStrategy?: string;
      autoBuild?: boolean;
      rebuild?: boolean;
    }
  ): Promise<TreeSearchResult> => {
    const response = await api.get('/search/tree', {
      params: {
        q: query,
        workspace,
        topKDocs: options?.topKDocs,
        maxNodesPerDoc: options?.maxNodesPerDoc,
        includeAncestors: options?.includeAncestors,
        textMode: options?.textMode,
        mergeStrategy: options?.mergeStrategy,
        autoBuild: options?.autoBuild,
        rebuild: options?.rebuild,
      },
    });
    return response.data;
  },

  getStatus: async (workspace = 'default'): Promise<TreeSearchIndexStatus> => {
    const response = await api.get('/search/index/status', { params: { workspace } });
    return response.data;
  },

  getFiles: async (workspace = 'default'): Promise<TreeSearchIndexEntry[]> => {
    const response = await api.get('/search/index/files', { params: { workspace } });
    return response.data.files || [];
  },

  getConfig: async (workspace = 'default'): Promise<TreeSearchConfig> => {
    const response = await api.get('/search/index/config', { params: { workspace } });
    return response.data;
  },

  build: async (workspace = 'default', force = true): Promise<TreeSearchIndexStatus> => {
    const response = await api.post('/search/index/build', { workspace, force });
    return response.data.status;
  },

  refresh: async (workspace = 'default'): Promise<TreeSearchIndexStatus> => {
    const response = await api.post('/search/index/refresh', { workspace });
    return response.data.status;
  },

  clear: async (workspace = 'default'): Promise<void> => {
    await api.delete('/search/index', { data: { workspace } });
  },
};
