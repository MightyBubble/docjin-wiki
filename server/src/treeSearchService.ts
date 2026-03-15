import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { MountConfig } from './mountManager';

export interface TreeSearchSource {
  path: string;
  absolutePath: string;
  size: number;
  mtimeMs: number;
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

export interface TreeSearchQueryResult {
  query: string;
  totalDocuments: number;
  totalNodes: number;
  documents: TreeSearchDocumentResult[];
  flatNodes: TreeSearchNodeResult[];
}

export interface TreeSearchIndexConfig {
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

interface TreeSearchMeta {
  version: number;
  builtAt: string;
  config: {
    supportedExtensions: string[];
    ignoreDirs: string[];
  };
  sources: TreeSearchSource[];
  entries: TreeSearchIndexEntry[];
}

interface TreeSearchBridgePayload {
  command: 'build' | 'search';
  query?: string;
  sources?: TreeSearchSource[];
  entries?: TreeSearchIndexEntry[];
  indexDir?: string;
  dbPath?: string;
  topKDocs?: number;
  maxNodesPerDoc?: number;
  includeAncestors?: boolean;
  textMode?: string;
  mergeStrategy?: string;
}

interface TreeSearchBuildResult {
  entries: TreeSearchIndexEntry[];
  indexedCount: number;
  dbPath: string;
  stagedDir: string;
}

interface SearchWorkspaceArgs {
  query: string;
  workspacePath: string;
  mounts: MountConfig[];
  topKDocs?: number;
  maxNodesPerDoc?: number;
  includeAncestors?: boolean;
  textMode?: string;
  mergeStrategy?: string;
  autoBuild?: boolean;
  rebuild?: boolean;
}

interface EnsureIndexArgs {
  workspacePath: string;
  mounts: MountConfig[];
  force?: boolean;
}

const DEFAULT_TOP_K_DOCS = 8;
const DEFAULT_MAX_NODES_PER_DOC = 3;
const DEFAULT_INCLUDE_ANCESTORS = true;
const DEFAULT_TEXT_MODE = 'summary';
const DEFAULT_MERGE_STRATEGY = 'interleave';
const DEFAULT_AUTO_BUILD = true;
const TREESEARCH_META_VERSION = 4;

const SUPPORTED_EXTENSIONS = [
  '.md',
  '.markdown',
  '.txt',
  '.json',
  '.csv',
  '.html',
  '.htm',
  '.xml',
  '.py',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.java',
  '.go',
  '.cpp',
  '.cc',
  '.cxx',
  '.c',
  '.h',
  '.hpp',
  '.php',
  '.pdf',
  '.docx',
] as const;

const IGNORE_DIRS = [
  '.git',
  '.docjin',
  'node_modules',
  '__pycache__',
  '.venv',
  'venv',
  'dist',
  'build',
] as const;

const getTreeSearchPythonCommand = (): string =>
  process.env.DOCJIN_TREESEARCH_PYTHON?.trim() || 'python';

const getTreeSearchBridgeScriptPath = (): string =>
  path.resolve(__dirname, '..', 'scripts', 'treesearch_query.py');

const normalizeDisplayPath = (value: string): string => value.replace(/\\/g, '/');

function getIndexDir(workspacePath: string): string {
  return path.join(workspacePath, '.docjin', 'treesearch');
}

function getMetaPath(workspacePath: string): string {
  return path.join(getIndexDir(workspacePath), 'meta.json');
}

function getDbPath(workspacePath: string): string {
  return path.join(getIndexDir(workspacePath), 'index.db');
}

function getStagedDir(workspacePath: string): string {
  return path.join(getIndexDir(workspacePath), 'staged');
}

function isSupportedFile(fileName: string): boolean {
  return SUPPORTED_EXTENSIONS.includes(path.extname(fileName).toLowerCase() as (typeof SUPPORTED_EXTENSIONS)[number]);
}

function scanRootDirectory(rootPath: string, pathPrefix = ''): TreeSearchSource[] {
  const results: TreeSearchSource[] = [];
  if (!fs.existsSync(rootPath)) {
    return results;
  }

  const walk = (absoluteDir: string, displayDir: string) => {
    const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.git')) {
        continue;
      }

      if (entry.isDirectory()) {
        if (IGNORE_DIRS.includes(entry.name as (typeof IGNORE_DIRS)[number])) {
          continue;
        }

        walk(
          path.join(absoluteDir, entry.name),
          displayDir ? `${displayDir}/${entry.name}` : entry.name
        );
        continue;
      }

      if (!entry.isFile() || !isSupportedFile(entry.name)) {
        continue;
      }

      const absolutePath = path.join(absoluteDir, entry.name);
      const stats = fs.statSync(absolutePath);
      const relativePath = displayDir ? `${displayDir}/${entry.name}` : entry.name;
      const displayPath = pathPrefix ? `${pathPrefix}/${relativePath}` : relativePath;
      results.push({
        path: normalizeDisplayPath(displayPath),
        absolutePath,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
      });
    }
  };

  walk(rootPath, '');
  return results;
}

function collectTreeSearchSources(workspacePath: string, mounts: MountConfig[]): TreeSearchSource[] {
  const workspaceSources = scanRootDirectory(workspacePath);
  const mountSources = mounts.flatMap((mount) =>
    scanRootDirectory(mount.path, `@${mount.alias}`)
  );

  const combined = [...workspaceSources, ...mountSources];
  combined.sort((a, b) => a.path.localeCompare(b.path));
  return combined;
}

function loadMeta(workspacePath: string): TreeSearchMeta | null {
  const metaPath = getMetaPath(workspacePath);
  if (!fs.existsSync(metaPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as TreeSearchMeta;
}

function saveMeta(workspacePath: string, meta: TreeSearchMeta): void {
  const metaPath = getMetaPath(workspacePath);
  fs.mkdirSync(path.dirname(metaPath), { recursive: true });
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
}

function computeDiff(current: TreeSearchSource[], indexed: TreeSearchSource[]): {
  addedPaths: string[];
  removedPaths: string[];
  changedPaths: string[];
} {
  const currentMap = new Map(current.map((entry) => [entry.path, entry]));
  const indexedMap = new Map(indexed.map((entry) => [entry.path, entry]));

  const addedPaths: string[] = [];
  const removedPaths: string[] = [];
  const changedPaths: string[] = [];

  for (const [entryPath, currentEntry] of currentMap) {
    const previous = indexedMap.get(entryPath);
    if (!previous) {
      addedPaths.push(entryPath);
      continue;
    }

    if (
      previous.absolutePath !== currentEntry.absolutePath ||
      previous.size !== currentEntry.size ||
      Math.trunc(previous.mtimeMs) !== Math.trunc(currentEntry.mtimeMs)
    ) {
      changedPaths.push(entryPath);
    }
  }

  for (const entryPath of indexedMap.keys()) {
    if (!currentMap.has(entryPath)) {
      removedPaths.push(entryPath);
    }
  }

  addedPaths.sort();
  removedPaths.sort();
  changedPaths.sort();

  return { addedPaths, removedPaths, changedPaths };
}

function runTreeSearchBridge<T>(payload: TreeSearchBridgePayload): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn(getTreeSearchPythonCommand(), [getTreeSearchBridgeScriptPath()], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to launch TreeSearch bridge: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `TreeSearch bridge exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout) as T);
      } catch (error) {
        reject(
          new Error(
            `TreeSearch bridge returned invalid JSON: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        );
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

async function buildIndex(workspacePath: string, mounts: MountConfig[]): Promise<TreeSearchBuildResult> {
  const sources = collectTreeSearchSources(workspacePath, mounts);
  fs.mkdirSync(getIndexDir(workspacePath), { recursive: true });

  const buildResult = await runTreeSearchBridge<TreeSearchBuildResult>({
    command: 'build',
    sources,
    indexDir: getIndexDir(workspacePath),
  });

  saveMeta(workspacePath, {
    version: TREESEARCH_META_VERSION,
    builtAt: new Date().toISOString(),
    config: {
      supportedExtensions: [...SUPPORTED_EXTENSIONS],
      ignoreDirs: [...IGNORE_DIRS],
    },
    sources,
    entries: buildResult.entries,
  });

  return buildResult;
}

async function ensureIndex({
  workspacePath,
  mounts,
  force = false,
}: EnsureIndexArgs): Promise<{ meta: TreeSearchMeta; status: TreeSearchIndexStatus }> {
  let meta = loadMeta(workspacePath);
  const currentSources = collectTreeSearchSources(workspacePath, mounts);
  const diff = computeDiff(currentSources, meta?.sources || []);
  const isVersionStale = meta?.version !== TREESEARCH_META_VERSION;
  const exists = Boolean(meta && fs.existsSync(getDbPath(workspacePath)));
  const dirty =
    force ||
    !exists ||
    isVersionStale ||
    diff.addedPaths.length > 0 ||
    diff.removedPaths.length > 0 ||
    diff.changedPaths.length > 0;

  if (!meta || dirty) {
    await buildIndex(workspacePath, mounts);
    meta = loadMeta(workspacePath);
  }

  if (!meta) {
    throw new Error('TreeSearch index metadata is unavailable');
  }

  return {
    meta,
    status: getTreeSearchIndexStatus(workspacePath, mounts, meta, currentSources),
  };
}

export function getTreeSearchConfig(): TreeSearchIndexConfig {
  return {
    pythonCommand: getTreeSearchPythonCommand(),
    bridgeScriptPath: getTreeSearchBridgeScriptPath(),
    supportedExtensions: [...SUPPORTED_EXTENSIONS],
    ignoreDirs: [...IGNORE_DIRS],
    textModes: ['full', 'summary', 'none'],
    mergeStrategies: ['interleave', 'per_doc', 'global_score'],
    defaults: {
      topKDocs: DEFAULT_TOP_K_DOCS,
      maxNodesPerDoc: DEFAULT_MAX_NODES_PER_DOC,
      includeAncestors: DEFAULT_INCLUDE_ANCESTORS,
      textMode: DEFAULT_TEXT_MODE,
      mergeStrategy: DEFAULT_MERGE_STRATEGY,
      autoBuild: DEFAULT_AUTO_BUILD,
    },
  };
}

export function getTreeSearchIndexStatus(
  workspacePath: string,
  mounts: MountConfig[],
  metaOverride?: TreeSearchMeta | null,
  currentSourcesOverride?: TreeSearchSource[]
): TreeSearchIndexStatus {
  const meta = metaOverride === undefined ? loadMeta(workspacePath) : metaOverride;
  const currentSources = currentSourcesOverride || collectTreeSearchSources(workspacePath, mounts);
  const diff = computeDiff(currentSources, meta?.sources || []);
  const exists = Boolean(meta && meta.version === TREESEARCH_META_VERSION && fs.existsSync(getDbPath(workspacePath)));

  return {
    exists,
    dirty:
      !exists ||
      diff.addedPaths.length > 0 ||
      diff.removedPaths.length > 0 ||
      diff.changedPaths.length > 0,
    sourceCount: currentSources.length,
    indexedCount: meta?.entries.length || 0,
    lastBuiltAt: meta?.builtAt || null,
    indexDir: getIndexDir(workspacePath),
    dbPath: getDbPath(workspacePath),
    stagedDir: getStagedDir(workspacePath),
    addedPaths: diff.addedPaths,
    removedPaths: diff.removedPaths,
    changedPaths: diff.changedPaths,
  };
}

export function getTreeSearchIndexedFiles(workspacePath: string): TreeSearchIndexEntry[] {
  const meta = loadMeta(workspacePath);
  return meta?.entries || [];
}

export async function buildWorkspaceTreeSearchIndex(
  workspacePath: string,
  mounts: MountConfig[],
  force = true
): Promise<TreeSearchIndexStatus> {
  await ensureIndex({ workspacePath, mounts, force });
  return getTreeSearchIndexStatus(workspacePath, mounts);
}

export async function refreshWorkspaceTreeSearchIndex(
  workspacePath: string,
  mounts: MountConfig[]
): Promise<TreeSearchIndexStatus> {
  return buildWorkspaceTreeSearchIndex(workspacePath, mounts, true);
}

export function clearWorkspaceTreeSearchIndex(workspacePath: string): void {
  const indexDir = getIndexDir(workspacePath);
  if (fs.existsSync(indexDir)) {
    fs.rmSync(indexDir, { recursive: true, force: true });
  }
}

export async function searchWorkspaceWithTreeSearch({
  query,
  workspacePath,
  mounts,
  topKDocs = DEFAULT_TOP_K_DOCS,
  maxNodesPerDoc = DEFAULT_MAX_NODES_PER_DOC,
  includeAncestors = DEFAULT_INCLUDE_ANCESTORS,
  textMode = DEFAULT_TEXT_MODE,
  mergeStrategy = DEFAULT_MERGE_STRATEGY,
  autoBuild = DEFAULT_AUTO_BUILD,
  rebuild = false,
}: SearchWorkspaceArgs): Promise<TreeSearchQueryResult & { index: TreeSearchIndexStatus }> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return {
      query: '',
      totalDocuments: 0,
      totalNodes: 0,
      documents: [],
      flatNodes: [],
      index: getTreeSearchIndexStatus(workspacePath, mounts),
    };
  }

  const statusBefore = getTreeSearchIndexStatus(workspacePath, mounts);
  if (!statusBefore.exists && !autoBuild) {
    throw new Error('TreeSearch index has not been built yet');
  }

  const { meta, status } = await ensureIndex({
    workspacePath,
    mounts,
    force: rebuild || (autoBuild && statusBefore.dirty),
  });

  const result = await runTreeSearchBridge<TreeSearchQueryResult>({
    command: 'search',
    query: trimmedQuery,
    dbPath: getDbPath(workspacePath),
    entries: meta.entries,
    topKDocs,
    maxNodesPerDoc,
    includeAncestors,
    textMode,
    mergeStrategy,
  });

  return {
    ...result,
    index: status,
  };
}
