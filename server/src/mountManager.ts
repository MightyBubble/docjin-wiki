import fs from 'fs';
import path from 'path';

export interface MountConfig {
  alias: string;
  path: string;
}

const ALIAS_RE = /^[A-Za-z0-9._-]{1,64}$/;

export class MountManager {
  private mountsDir: string;

  constructor(workspacesRoot: string) {
    this.mountsDir = path.join(workspacesRoot, '.docjin', 'mounts');
    if (!fs.existsSync(this.mountsDir)) {
      fs.mkdirSync(this.mountsDir, { recursive: true });
    }
  }

  private configPath(workspaceId: string): string {
    return path.join(this.mountsDir, `${workspaceId}.json`);
  }

  getMounts(workspaceId: string): MountConfig[] {
    const filePath = this.configPath(workspaceId);
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as MountConfig[];
  }

  addMount(workspaceId: string, alias: string, mountPath: string): MountConfig[] {
    if (!ALIAS_RE.test(alias)) {
      throw new Error(`Invalid mount alias: must match ${ALIAS_RE}`);
    }

    const resolved = path.resolve(mountPath);
    if (!path.isAbsolute(mountPath)) {
      throw new Error('Mount path must be absolute');
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error('Mount path does not exist or is not a directory');
    }

    const mounts = this.getMounts(workspaceId);

    if (mounts.some((m) => m.alias === alias)) {
      throw new Error(`Mount alias "${alias}" already exists`);
    }
    if (mounts.some((m) => path.resolve(m.path) === resolved)) {
      throw new Error('Mount path is already mounted');
    }

    mounts.push({ alias, path: resolved });
    fs.writeFileSync(this.configPath(workspaceId), JSON.stringify(mounts, null, 2), 'utf-8');
    return mounts;
  }

  removeMount(workspaceId: string, alias: string): MountConfig[] {
    const mounts = this.getMounts(workspaceId);
    const filtered = mounts.filter((m) => m.alias !== alias);
    if (filtered.length === mounts.length) {
      throw new Error(`Mount alias "${alias}" not found`);
    }
    fs.writeFileSync(this.configPath(workspaceId), JSON.stringify(filtered, null, 2), 'utf-8');
    return filtered;
  }
}
