import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { FileManager } from './fileManager';
import { GitManager } from './gitManager';
import { serverConfig } from './config';
import { WorkspaceManager } from './workspaceManager';

const app = express();
const workspaceManager = new WorkspaceManager(
  serverConfig.workspacesRoot,
  serverConfig.defaultWorkspaceId,
  serverConfig.templateDataDir
);

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
  fileManager: FileManager;
  gitManager: GitManager;
} {
  const workspaceId = getWorkspaceIdFromRequest(req);
  const workspace = workspaceManager.getWorkspace(workspaceId);
  return {
    workspaceId: workspace.id,
    workspacePath: workspace.path,
    fileManager: new FileManager(workspace.path),
    gitManager: new GitManager(workspace.path),
  };
}

function toHttpError(error: unknown): { code: number; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes('Invalid workspace id') ||
    message.includes('Invalid workspace path') ||
    message.includes('Invalid path')
  ) {
    return { code: 400, message };
  }
  if (message.includes('does not exist') || message.includes('not found')) {
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

app.listen(serverConfig.port, () => {
  console.log(`Server is running on port ${serverConfig.port}`);
  console.log(`Workspaces root: ${serverConfig.workspacesRoot}`);
  console.log(`Default workspace: ${serverConfig.defaultWorkspaceId}`);
});
