import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { GitManager } from './gitManager';
import { serverConfig } from './config';
import { WorkspaceManager } from './workspaceManager';
import { MountManager } from './mountManager';
import { MultiRootFileManager } from './multiRootFileManager';
import {
  buildWorkspaceTreeSearchIndex,
  clearWorkspaceTreeSearchIndex,
  getTreeSearchConfig,
  getTreeSearchIndexedFiles,
  getTreeSearchIndexStatus,
  refreshWorkspaceTreeSearchIndex,
  searchWorkspaceWithTreeSearch,
} from './treeSearchService';

const app = express();
const workspaceManager = new WorkspaceManager(
  serverConfig.workspacesRoot,
  serverConfig.defaultWorkspaceId,
  serverConfig.templateDataDir
);
const mountManager = new MountManager(serverConfig.workspacesRoot);

const corsOrigin =
  serverConfig.corsOrigins.length === 0 || serverConfig.corsOrigins.includes('*')
    ? true
    : serverConfig.corsOrigins;

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

if (serverConfig.enableRequestLogging) {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const workspace = getWorkspaceIdFromRequest(req);
    console.log(`${req.method} ${req.path} workspace=${workspace}`);
    next();
  });
}

function getWorkspaceIdFromRequest(req: Request): string {
  const queryWorkspace =
    typeof req.query.workspace === 'string' ? req.query.workspace : undefined;
  const bodyWorkspace =
    req.body && typeof req.body.workspace === 'string' ? req.body.workspace : undefined;
  const headerWorkspace = req.header('x-workspace-id') || undefined;

  return (queryWorkspace || bodyWorkspace || headerWorkspace || serverConfig.defaultWorkspaceId).trim();
}

function getManagers(req: Request): {
  workspaceId: string;
  workspacePath: string;
  mounts: ReturnType<MountManager['getMounts']>;
  fileManager: MultiRootFileManager;
  gitManager: GitManager;
} {
  const workspaceId = getWorkspaceIdFromRequest(req);
  const workspace = workspaceManager.getWorkspace(workspaceId);
  const mounts = mountManager.getMounts(workspaceId);
  return {
    workspaceId: workspace.id,
    workspacePath: workspace.path,
    mounts,
    fileManager: new MultiRootFileManager(workspace.path, mounts),
    gitManager: new GitManager(workspace.path),
  };
}

function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'string') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parseString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
}

function toHttpError(error: unknown): { code: number; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes('Invalid workspace id') ||
    message.includes('Invalid workspace path') ||
    message.includes('Invalid path') ||
    message.includes('Invalid mount alias') ||
    message.includes('Mount path must be absolute') ||
    message.includes('already exists') ||
    message.includes('already mounted') ||
    message.includes('Cannot rename across mounts')
  ) {
    return { code: 400, message };
  }
  if (message.includes('does not exist') || message.includes('not found') || message.includes('unavailable')) {
    return { code: 404, message };
  }
  return { code: 500, message };
}

// --- Workspace APIs ---

app.get('/api/workspaces', (_req: Request, res: Response) => {
  try {
    const workspaces = workspaceManager.listWorkspaces();
    res.json({
      workspaces: workspaces.map((workspace) => ({
        id: workspace.id,
        isDefault: workspace.isDefault,
      })),
      defaultWorkspace: workspaceManager.getDefaultWorkspaceId(),
    });
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.code).json({ error: httpError.message });
  }
});

app.post('/api/workspaces', (req: Request, res: Response) => {
  const { id, seedFromTemplate } = req.body;
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'Workspace id is required' });
    return;
  }

  try {
    const workspace = workspaceManager.createWorkspace(id, Boolean(seedFromTemplate));
    res.status(201).json({
      workspace: {
        id: workspace.id,
        isDefault: workspace.isDefault,
      },
    });
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.code).json({ error: httpError.message });
  }
});

// --- Mount APIs ---

app.get('/api/mounts', (req: Request, res: Response) => {
  try {
    const workspaceId = getWorkspaceIdFromRequest(req);
    const mounts = mountManager.getMounts(workspaceId);
    res.json({ mounts });
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.code).json({ error: httpError.message });
  }
});

app.post('/api/mounts', (req: Request, res: Response) => {
  const { alias, path: mountPath } = req.body;
  if (!alias || !mountPath) {
    res.status(400).json({ error: 'alias and path are required' });
    return;
  }

  try {
    const workspaceId = getWorkspaceIdFromRequest(req);
    const mounts = mountManager.addMount(workspaceId, alias, mountPath);
    res.status(201).json({ mounts });
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.code).json({ error: httpError.message });
  }
});

app.delete('/api/mounts', (req: Request, res: Response) => {
  const { alias } = req.body;
  if (!alias) {
    res.status(400).json({ error: 'alias is required' });
    return;
  }

  try {
    const workspaceId = getWorkspaceIdFromRequest(req);
    const mounts = mountManager.removeMount(workspaceId, alias);
    res.json({ mounts });
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.code).json({ error: httpError.message });
  }
});

// --- File APIs ---

app.get('/api/files', (req: Request, res: Response) => {
  try {
    const { fileManager } = getManagers(req);
    const fileTree = fileManager.getFileTree();
    res.json({ content: fileTree });
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.code).json({ error: httpError.message });
  }
});

app.get('/api/files/read', (req: Request, res: Response) => {
  const filePath = req.query.path as string;
  if (!filePath) {
    res.status(400).json({ error: 'Path parameter is required' });
    return;
  }
  
  try {
    const { fileManager } = getManagers(req);
    const content = fileManager.readFile(filePath);
    res.json({ content });
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.code).json({ error: httpError.message });
  }
});

// --- Search APIs ---

app.get('/api/search/tree', async (req: Request, res: Response) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!query) {
    res.status(400).json({ error: 'q parameter is required' });
    return;
  }

  try {
    const { workspacePath, mounts } = getManagers(req);
    const result = await searchWorkspaceWithTreeSearch({
      query,
      workspacePath,
      mounts,
      topKDocs: parsePositiveInt(req.query.topKDocs, 8),
      maxNodesPerDoc: parsePositiveInt(req.query.maxNodesPerDoc, 3),
      includeAncestors: parseBoolean(req.query.includeAncestors, true),
      textMode: parseString(req.query.textMode, 'summary'),
      mergeStrategy: parseString(req.query.mergeStrategy, 'interleave'),
      autoBuild: parseBoolean(req.query.autoBuild, true),
      rebuild: parseBoolean(req.query.rebuild, false),
    });

    res.json(result);
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.code).json({ error: httpError.message });
  }
});

app.get('/api/search/index/status', (req: Request, res: Response) => {
  try {
    const { workspacePath, mounts } = getManagers(req);
    res.json(getTreeSearchIndexStatus(workspacePath, mounts));
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.code).json({ error: httpError.message });
  }
});

app.get('/api/search/index/files', (req: Request, res: Response) => {
  try {
    const { workspacePath } = getManagers(req);
    res.json({ files: getTreeSearchIndexedFiles(workspacePath) });
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.code).json({ error: httpError.message });
  }
});

app.get('/api/search/index/config', (req: Request, res: Response) => {
  try {
    const { workspacePath, mounts } = getManagers(req);
    res.json({
      ...getTreeSearchConfig(),
      index: getTreeSearchIndexStatus(workspacePath, mounts),
    });
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.code).json({ error: httpError.message });
  }
});

app.post('/api/search/index/build', async (req: Request, res: Response) => {
  try {
    const { workspacePath, mounts } = getManagers(req);
    const status = await buildWorkspaceTreeSearchIndex(
      workspacePath,
      mounts,
      req.body && typeof req.body.force === 'boolean' ? req.body.force : true
    );
    res.status(201).json({ status });
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.code).json({ error: httpError.message });
  }
});

app.post('/api/search/index/refresh', async (req: Request, res: Response) => {
  try {
    const { workspacePath, mounts } = getManagers(req);
    const status = await refreshWorkspaceTreeSearchIndex(workspacePath, mounts);
    res.json({ status });
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.code).json({ error: httpError.message });
  }
});

app.delete('/api/search/index', (req: Request, res: Response) => {
  try {
    const { workspacePath } = getManagers(req);
    clearWorkspaceTreeSearchIndex(workspacePath);
    res.json({ success: true });
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.code).json({ error: httpError.message });
  }
});

app.post('/api/files/write', (req: Request, res: Response) => {
  const { path: filePath, content } = req.body;
  if (!filePath || typeof content !== 'string') {
    res.status(400).json({ error: 'Path and content are required' });
    return;
  }
  
  try {
    const { fileManager } = getManagers(req);
    fileManager.writeFile(filePath, content);
    res.json({ success: true });
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.code).json({ error: httpError.message });
  }
});

app.post('/api/files/rename', (req: Request, res: Response) => {
  const { oldPath, newPath } = req.body;
  if (!oldPath || !newPath) {
    res.status(400).json({ error: 'OldPath and newPath are required' });
    return;
  }
  
  try {
    const { fileManager } = getManagers(req);
    fileManager.rename(oldPath, newPath);
    res.json({ success: true });
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.code).json({ error: httpError.message });
  }
});

app.post('/api/files/delete', (req: Request, res: Response) => {
  const { path: filePath } = req.body;
  if (!filePath) {
    res.status(400).json({ error: 'Path parameter is required' });
    return;
  }
  
  try {
    const { fileManager } = getManagers(req);
    fileManager.delete(filePath);
    res.json({ success: true });
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.code).json({ error: httpError.message });
  }
});

// --- Git APIs ---

app.get('/api/git/status', async (req: Request, res: Response) => {
  try {
    const { gitManager } = getManagers(req);
    const status = await gitManager.getStatus();
    res.json(status);
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.code).json({ error: httpError.message });
  }
});

app.post('/api/git/init', async (req: Request, res: Response) => {
  try {
    const { gitManager } = getManagers(req);
    const result = await gitManager.initRepo();
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.code).json({ error: httpError.message });
  }
});

app.get('/api/git/log', async (req: Request, res: Response) => {
  try {
    const { gitManager } = getManagers(req);
    const filePath = req.query.path as string | undefined;
    const log = await gitManager.getLog(filePath);
    res.json(log);
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.code).json({ error: httpError.message });
  }
});

app.post('/api/git/commit', async (req: Request, res: Response) => {
  try {
    const { gitManager } = getManagers(req);
    const { message } = req.body;
    const result = await gitManager.commit(message);
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    const httpError = toHttpError(error);
    res.status(httpError.code).json({ error: httpError.message });
  }
});

// --- Directory browsing API ---

const HIDDEN_DIRS = new Set([
  '$Recycle.Bin', 'System Volume Information', '$WINDOWS.~BT', '$WinREAgent',
  'Recovery', 'PerfLogs', 'Config.Msi', 'Documents and Settings',
]);

function getWindowsDrives(): { name: string; path: string }[] {
  try {
    const output = execSync('wmic logicaldisk get name', { encoding: 'utf-8' });
    const drives: { name: string; path: string }[] = [];
    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (/^[A-Z]:$/.test(trimmed)) {
        drives.push({ name: trimmed + '\\', path: trimmed + '\\' });
      }
    }
    return drives;
  } catch {
    return [{ name: 'C:\\', path: 'C:\\' }];
  }
}

app.get('/api/browse-dirs', (req: Request, res: Response) => {
  const dirPath = typeof req.query.path === 'string' ? req.query.path : '';

  // No path → return drive letters (Windows)
  if (!dirPath) {
    const drives = getWindowsDrives();
    res.json({ current: '', parent: null, dirs: drives });
    return;
  }

  const resolved = path.resolve(dirPath);

  if (!fs.existsSync(resolved)) {
    res.status(404).json({ error: 'Path does not exist' });
    return;
  }

  if (!fs.statSync(resolved).isDirectory()) {
    res.status(400).json({ error: 'Path is not a directory' });
    return;
  }

  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const dirs: { name: string; path: string }[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      if (HIDDEN_DIRS.has(entry.name)) continue;
      dirs.push({
        name: entry.name,
        path: path.join(resolved, entry.name),
      });
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name));

    const parsed = path.parse(resolved);
    const parent = parsed.root === resolved ? null : path.dirname(resolved);

    res.json({ current: resolved, parent, dirs });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

app.post('/api/browse-dirs/mkdir', (req: Request, res: Response) => {
  const { path: dirPath } = req.body;
  if (!dirPath || typeof dirPath !== 'string') {
    res.status(400).json({ error: 'path is required' });
    return;
  }

  const resolved = path.resolve(dirPath);

  if (fs.existsSync(resolved)) {
    res.status(400).json({ error: 'Directory already exists' });
    return;
  }

  try {
    fs.mkdirSync(resolved, { recursive: true });
    res.status(201).json({ path: resolved });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

app.listen(serverConfig.port, () => {
  console.log(`Server is running on port ${serverConfig.port}`);
  console.log(`Workspaces root: ${serverConfig.workspacesRoot}`);
  console.log(`Default workspace: ${serverConfig.defaultWorkspaceId}`);
});
