import axios from 'axios';
import type { FileNode, GitStatus, WorkspaceInfo } from '../types';
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
