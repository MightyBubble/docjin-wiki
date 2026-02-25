import fs from 'fs';
import path from 'path';

export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  path: string;
}

export class FileManager {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private resolveSafePath(filePath: string): string {
    const normalizedInput = filePath.replace(/\\/g, '/');
    const resolved = path.resolve(this.baseDir, normalizedInput);
    const baseWithSep = this.baseDir.endsWith(path.sep) ? this.baseDir : `${this.baseDir}${path.sep}`;

    if (resolved !== this.baseDir && !resolved.startsWith(baseWithSep)) {
      throw new Error('Invalid path');
    }

    return resolved;
  }

  getFileTree(): FileNode[] {
    return this.readDirRecursively(this.baseDir);
  }

  private readDirRecursively(dir: string): FileNode[] {
    if (!fs.existsSync(dir)) return [];
    
    const nodes: FileNode[] = [];
    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      if (item.name.startsWith('.git')) continue;

      const fullPath = path.join(dir, item.name);
      const relativePath = path.relative(this.baseDir, fullPath).replace(/\\/g, '/');

      if (item.isDirectory()) {
        nodes.push({
          id: relativePath,
          name: item.name,
          type: 'folder',
          path: relativePath,
          children: this.readDirRecursively(fullPath)
        });
      } else if (item.name.endsWith('.md')) {
        nodes.push({
          id: relativePath,
          name: item.name.replace(/\.md$/, ''),
          type: 'file',
          path: relativePath
        });
      }
    }

    // Sort: folders first, then files
    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  readFile(filePath: string): string {
    const fullPath = this.resolveSafePath(filePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error('File not found');
    }
    return fs.readFileSync(fullPath, 'utf-8');
  }

  writeFile(filePath: string, content: string): void {
    const fullPath = this.resolveSafePath(filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  rename(oldPath: string, newPath: string): void {
    const fullOldPath = this.resolveSafePath(oldPath);
    const fullNewPath = this.resolveSafePath(newPath);
    
    if (!fs.existsSync(fullOldPath)) {
      throw new Error('File or directory not found');
    }
    
    const dir = path.dirname(fullNewPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.renameSync(fullOldPath, fullNewPath);
  }

  delete(filePath: string): void {
    const fullPath = this.resolveSafePath(filePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error('File not found');
    }
    
    if (fs.statSync(fullPath).isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(fullPath);
    }
  }
}
