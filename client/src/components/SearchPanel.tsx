import React, { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  Settings2,
  Search,
  X,
} from 'lucide-react';
import type { TreeSearchConfig, TreeSearchIndexEntry, TreeSearchIndexStatus, TreeSearchNodeResult } from '../types';
import { treeSearchService } from '../services/api';
import { TreeSearchModal } from './TreeSearchModal';

interface SearchPanelProps {
  workspaceId: string;
  onResultSelect: (path: string, heading?: string) => Promise<void>;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({ workspaceId, onResultSelect }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TreeSearchNodeResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [status, setStatus] = useState<TreeSearchIndexStatus | null>(null);
  const [config, setConfig] = useState<TreeSearchConfig | null>(null);
  const [indexedFiles, setIndexedFiles] = useState<TreeSearchIndexEntry[]>([]);
  const [isIndexLoading, setIsIndexLoading] = useState(false);
  const [indexMessage, setIndexMessage] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadIndexState = useCallback(async () => {
    if (!workspaceId) {
      setStatus(null);
      setConfig(null);
      setIndexedFiles([]);
      return;
    }

    setIsIndexLoading(true);
    try {
      const [nextStatus, nextConfig, nextFiles] = await Promise.all([
        treeSearchService.getStatus(workspaceId),
        treeSearchService.getConfig(workspaceId),
        treeSearchService.getFiles(workspaceId),
      ]);
      setStatus(nextStatus);
      setConfig(nextConfig);
      setIndexedFiles(nextFiles);
      setIndexMessage('');
    } catch (loadError) {
      const message =
        typeof loadError === 'object' &&
        loadError !== null &&
        typeof (loadError as { response?: { data?: { error?: string } } }).response?.data?.error ===
          'string'
          ? (loadError as { response?: { data?: { error?: string } } }).response!.data!.error!
          : 'Failed to load TreeSearch state';
      setIndexMessage(message);
    } finally {
      setIsIndexLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    setResults([]);
    setHasSearched(false);
    setError('');
    void loadIndexState();
  }, [loadIndexState]);

  const runSearch = async () => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || !workspaceId) {
      setResults([]);
      setHasSearched(false);
      setError('');
      return;
    }

    setIsLoading(true);
    setError('');
    setHasSearched(true);
    try {
      const payload = await treeSearchService.search(trimmedQuery, workspaceId, {
        topKDocs: 8,
        maxNodesPerDoc: 3,
        textMode: 'summary',
        mergeStrategy: 'interleave',
        includeAncestors: true,
        autoBuild: true,
      });
      setResults(payload.flatNodes);
      if (payload.index) {
        setStatus(payload.index);
      }
      setIndexMessage('');
    } catch (searchError) {
      const message =
        typeof searchError === 'object' &&
        searchError !== null &&
        typeof (searchError as { response?: { data?: { error?: string } } }).response?.data?.error ===
          'string'
          ? (searchError as { response?: { data?: { error?: string } } }).response!.data!.error!
          : 'Search failed';
      setError(message);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await runSearch();
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setError('');
    setHasSearched(false);
  };

  const handleBuild = async () => {
    if (!workspaceId) return;
    setIsIndexLoading(true);
    try {
      const nextStatus = await treeSearchService.build(workspaceId, true);
      setStatus(nextStatus);
      setIndexMessage('Index rebuilt.');
      const nextFiles = await treeSearchService.getFiles(workspaceId);
      setIndexedFiles(nextFiles);
    } catch (buildError) {
      const message =
        typeof buildError === 'object' &&
        buildError !== null &&
        typeof (buildError as { response?: { data?: { error?: string } } }).response?.data?.error ===
          'string'
          ? (buildError as { response?: { data?: { error?: string } } }).response!.data!.error!
          : 'Index build failed';
      setIndexMessage(message);
    } finally {
      setIsIndexLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!workspaceId) return;
    setIsIndexLoading(true);
    try {
      const nextStatus = await treeSearchService.refresh(workspaceId);
      setStatus(nextStatus);
      setIndexMessage('Index refreshed.');
      const nextFiles = await treeSearchService.getFiles(workspaceId);
      setIndexedFiles(nextFiles);
    } catch (refreshError) {
      const message =
        typeof refreshError === 'object' &&
        refreshError !== null &&
        typeof (refreshError as { response?: { data?: { error?: string } } }).response?.data?.error ===
          'string'
          ? (refreshError as { response?: { data?: { error?: string } } }).response!.data!.error!
          : 'Index refresh failed';
      setIndexMessage(message);
    } finally {
      setIsIndexLoading(false);
    }
  };

  const handleClearIndex = async () => {
    if (!workspaceId) return;
    if (!window.confirm('Clear the TreeSearch index for this workspace?')) {
      return;
    }

    setIsIndexLoading(true);
    try {
      await treeSearchService.clear(workspaceId);
      setStatus(await treeSearchService.getStatus(workspaceId));
      setIndexedFiles([]);
      setIndexMessage('Index cleared.');
    } catch (clearError) {
      const message =
        typeof clearError === 'object' &&
        clearError !== null &&
        typeof (clearError as { response?: { data?: { error?: string } } }).response?.data?.error ===
          'string'
          ? (clearError as { response?: { data?: { error?: string } } }).response!.data!.error!
          : 'Index clear failed';
      setIndexMessage(message);
    } finally {
      setIsIndexLoading(false);
    }
  };

  return (
    <div className="px-3 pb-3 border-b border-gray-200 dark:border-gray-800">
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <Search size={16} className="text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search this wiki with TreeSearch"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
          {query && !isLoading ? (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              title="Clear"
            >
              <X size={14} />
            </button>
          ) : null}
          {isLoading ? <Loader2 size={14} className="animate-spin text-blue-500" /> : null}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <Settings2 size={13} />
            TreeSearch Console
          </button>
        </div>
      </form>

      {error ? <div className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</div> : null}

      {hasSearched && !isLoading ? (
        <div className="mt-3 max-h-72 overflow-y-auto space-y-2">
          {results.length > 0 ? (
            results.map((result, index) => (
              <button
                key={`${result.path}:${result.title}:${result.lineStart ?? index}`}
                type="button"
                onClick={() =>
                  onResultSelect(result.path, result.isDocumentRoot ? undefined : result.title)
                }
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-500 dark:hover:bg-gray-800/80"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                      {result.title || result.docName}
                    </div>
                    <div className="truncate text-[11px] uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                      {result.path}
                    </div>
                  </div>
                  <div className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                    {result.score.toFixed(2)}
                  </div>
                </div>
                {result.ancestors.length > 0 ? (
                  <div className="mt-1 truncate text-[11px] text-gray-500 dark:text-gray-400">
                    {result.ancestors.join(' / ')}
                  </div>
                ) : null}
                <div className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-gray-600 dark:text-gray-300">
                  {result.preview}
                </div>
              </button>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
              No hits for this query yet.
            </div>
          )}
        </div>
      ) : null}

      <TreeSearchModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        status={status}
        config={config}
        indexedFiles={indexedFiles}
        isLoading={isIndexLoading}
        message={indexMessage}
        onBuild={handleBuild}
        onRefresh={handleRefresh}
        onReload={loadIndexState}
        onClear={handleClearIndex}
      />
    </div>
  );
};
