import fs from 'fs';
import path from 'path';

export interface WorkspaceInfo {
  id: string;
  path: string;
  isDefault: boolean;
}

function copyDirectoryRecursive(sourceDir: string, targetDir: string): void {
  fs.mkdirSync(targetDir, { recursive: true });

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'workspaces') {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourcePath, targetPath);
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
  }
}

export class WorkspaceManager {
  private readonly workspacesRoot: string;
  private readonly defaultWorkspaceId: string;
  private readonly templateDataDir: string;

  constructor(workspacesRoot: string, defaultWorkspaceId: string, templateDataDir: string) {
    this.workspacesRoot = path.resolve(workspacesRoot);
    this.defaultWorkspaceId = defaultWorkspaceId;
    this.templateDataDir = path.resolve(templateDataDir);

    fs.mkdirSync(this.workspacesRoot, { recursive: true });
    this.ensureDefaultWorkspace();
  }

  listWorkspaces(): WorkspaceInfo[] {
    fs.mkdirSync(this.workspacesRoot, { recursive: true });

    const ids = fs
      .readdirSync(this.workspacesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((id) => this.isValidWorkspaceId(id));

    if (!ids.includes(this.defaultWorkspaceId)) {
      this.ensureDefaultWorkspace();
      ids.push(this.defaultWorkspaceId);
    }

    ids.sort((a, b) => {
      if (a === this.defaultWorkspaceId) return -1;
      if (b === this.defaultWorkspaceId) return 1;
      return a.localeCompare(b);
    });

    return ids.map((id) => ({
      id,
      path: this.resolveWorkspacePath(id),
      isDefault: id === this.defaultWorkspaceId,
    }));
  }

  getDefaultWorkspaceId(): string {
    return this.defaultWorkspaceId;
  }

  createWorkspace(id: string, seedFromTemplate = false): WorkspaceInfo {
    const normalizedId = this.normalizeWorkspaceId(id);
    const workspacePath = this.resolveWorkspacePath(normalizedId);

    if (fs.existsSync(workspacePath)) {
      throw new Error(`Workspace "${normalizedId}" already exists`);
    }

    fs.mkdirSync(workspacePath, { recursive: true });

    if (seedFromTemplate && fs.existsSync(this.templateDataDir)) {
      copyDirectoryRecursive(this.templateDataDir, workspacePath);
    }

    return {
      id: normalizedId,
      path: workspacePath,
      isDefault: normalizedId === this.defaultWorkspaceId,
    };
  }

  getWorkspace(id?: string): WorkspaceInfo {
    const normalizedId = id ? this.normalizeWorkspaceId(id) : this.defaultWorkspaceId;
    const workspacePath = this.resolveWorkspacePath(normalizedId);

    if (!fs.existsSync(workspacePath) || !fs.statSync(workspacePath).isDirectory()) {
      throw new Error(`Workspace "${normalizedId}" does not exist`);
    }

    return {
      id: normalizedId,
      path: workspacePath,
      isDefault: normalizedId === this.defaultWorkspaceId,
    };
  }

  private ensureDefaultWorkspace(): void {
    const defaultPath = this.resolveWorkspacePath(this.defaultWorkspaceId);
    if (fs.existsSync(defaultPath)) {
      return;
    }

    fs.mkdirSync(defaultPath, { recursive: true });

    // Seed default workspace from template data when available.
    if (fs.existsSync(this.templateDataDir)) {
      copyDirectoryRecursive(this.templateDataDir, defaultPath);
    }
  }

  private normalizeWorkspaceId(id: string): string {
    const trimmed = id.trim();
    if (!this.isValidWorkspaceId(trimmed)) {
      throw new Error(
        'Invalid workspace id. Use 1-64 chars: letters, numbers, dot, underscore, hyphen.'
      );
    }
    return trimmed;
  }

  private isValidWorkspaceId(id: string): boolean {
    return /^[A-Za-z0-9._-]{1,64}$/.test(id);
  }

  private resolveWorkspacePath(id: string): string {
    const resolved = path.resolve(this.workspacesRoot, id);
    const rootWithSep = this.workspacesRoot.endsWith(path.sep)
      ? this.workspacesRoot
      : `${this.workspacesRoot}${path.sep}`;
    if (resolved !== this.workspacesRoot && !resolved.startsWith(rootWithSep)) {
      throw new Error('Invalid workspace path');
    }
    return resolved;
  }
}

