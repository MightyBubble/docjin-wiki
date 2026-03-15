import fs from 'fs';
import { FileManager, FileNode } from './fileManager';
import { MountConfig } from './mountManager';

export class MultiRootFileManager {
  private workspaceFM: FileManager;
  private mountFMs: Map<string, { fm: FileManager; config: MountConfig }> = new Map();

  constructor(workspacePath: string, mounts: MountConfig[]) {
    this.workspaceFM = new FileManager(workspacePath);
    for (const mount of mounts) {
      try {
        this.mountFMs.set(mount.alias, {
          fm: new FileManager(mount.path),
          config: mount,
        });
      } catch {
        // mount dir may have been deleted since config was saved
        this.mountFMs.set(mount.alias, {
          fm: null as unknown as FileManager,
          config: mount,
        });
      }
    }
  }

  getFileTree(): FileNode[] {
    const workspaceTree = this.workspaceFM.getFileTree();

    const mountNodes: FileNode[] = [];
    for (const [alias, entry] of this.mountFMs) {
      const available = fs.existsSync(entry.config.path);
      if (!available || !entry.fm) {
        mountNodes.push({
          id: `@${alias}`,
          name: `@${alias}`,
          type: 'folder',
          path: `@${alias}`,
          children: [],
          isMount: true,
          unavailable: true,
        });
        continue;
      }

      const children = entry.fm.getFileTree();
      mountNodes.push({
        id: `@${alias}`,
        name: `@${alias}`,
        type: 'folder',
        path: `@${alias}`,
        children: this.prefixPaths(children, `@${alias}`),
        isMount: true,
      });
    }

    return [...workspaceTree, ...mountNodes];
  }

  private prefixPaths(nodes: FileNode[], prefix: string): FileNode[] {
    return nodes.map((node) => {
      const prefixed: FileNode = {
        ...node,
        id: `${prefix}/${node.id}`,
        path: `${prefix}/${node.path}`,
      };
      if (node.children) {
        prefixed.children = this.prefixPaths(node.children, prefix);
      }
      return prefixed;
    });
  }

  private resolvePathToManager(inputPath: string): { fm: FileManager; relativePath: string } {
    const match = inputPath.match(/^@([^/]+)\/(.+)$/);
    if (!match) {
      return { fm: this.workspaceFM, relativePath: inputPath };
    }

    const alias = match[1]!;
    const relativePath = match[2]!;
    const entry = this.mountFMs.get(alias);
    if (!entry || !entry.fm) {
      throw new Error(`Mount "@${alias}" is unavailable`);
    }
    return { fm: entry.fm, relativePath };
  }

  readFile(filePath: string): string {
    const { fm, relativePath } = this.resolvePathToManager(filePath);
    return fm.readFile(relativePath);
  }

  writeFile(filePath: string, content: string): void {
    const { fm, relativePath } = this.resolvePathToManager(filePath);
    fm.writeFile(relativePath, content);
  }

  rename(oldPath: string, newPath: string): void {
    const old = this.resolvePathToManager(oldPath);
    const nw = this.resolvePathToManager(newPath);
    if (old.fm !== nw.fm) {
      throw new Error('Cannot rename across mounts');
    }
    old.fm.rename(old.relativePath, nw.relativePath);
  }

  delete(filePath: string): void {
    const { fm, relativePath } = this.resolvePathToManager(filePath);
    fm.delete(relativePath);
  }
}