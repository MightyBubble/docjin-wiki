import React from 'react';
import {
  Database,
  Loader2,
  RefreshCcw,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import type { TreeSearchConfig, TreeSearchIndexEntry, TreeSearchIndexStatus } from '../types';

interface TreeSearchModalProps {
  open: boolean;
  onClose: () => void;
  status: TreeSearchIndexStatus | null;
  config: TreeSearchConfig | null;
  indexedFiles: TreeSearchIndexEntry[];
  isLoading: boolean;
  message: string;
  onBuild: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onReload: () => Promise<void>;
  onClear: () => Promise<void>;
}

export const TreeSearchModal: React.FC<TreeSearchModalProps> = ({
  open,
  onClose,
  status,
  config,
  indexedFiles,
  isLoading,
  message,
  onBuild,
  onRefresh,
  onReload,
  onClear,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 px-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div>
            <div className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
              <Sparkles size={17} className="text-blue-500" />
              TreeSearch Console
            </div>
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Real TreeSearch index lifecycle and runtime state
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[1.1fr_1.4fr]">
          <div className="overflow-y-auto border-b border-gray-200 p-5 dark:border-gray-700 md:border-b-0 md:border-r">
            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="Index" value={status?.exists ? 'Built' : 'Missing'} />
              <MetricCard label="Dirty" value={status?.dirty ? 'Yes' : 'No'} />
              <MetricCard label="Sources" value={String(status?.sourceCount ?? '-')} />
              <MetricCard label="Indexed" value={String(status?.indexedCount ?? '-')} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton
                onClick={onBuild}
                disabled={isLoading}
                primary
                icon={isLoading ? <Loader2 size={13} className="animate-spin" /> : <Database size={13} />}
                label="Build"
              />
              <ActionButton
                onClick={onRefresh}
                disabled={isLoading}
                icon={<RefreshCcw size={13} />}
                label="Refresh"
              />
              <ActionButton
                onClick={onReload}
                disabled={isLoading}
                icon={<Wrench size={13} />}
                label="Reload"
              />
              <ActionButton
                onClick={onClear}
                disabled={isLoading}
                destructive
                icon={<Trash2 size={13} />}
                label="Clear"
              />
            </div>

            {message ? (
              <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-300">
                {message}
              </div>
            ) : null}

            <div className="mt-4 rounded-2xl border border-gray-200 px-4 py-3 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
              <div className="font-semibold text-gray-900 dark:text-gray-100">Runtime</div>
              <div className="mt-2">Python: {config?.pythonCommand || 'python'}</div>
              <div className="mt-1">Modes: {config?.textModes.join(', ') || '-'}</div>
              <div className="mt-1">Merge: {config?.mergeStrategies.join(', ') || '-'}</div>
              <div className="mt-1">
                Defaults: top docs {config?.defaults.topKDocs ?? '-'}, nodes/doc {config?.defaults.maxNodesPerDoc ?? '-'}
              </div>
              {status?.lastBuiltAt ? (
                <div className="mt-1">Last built: {new Date(status.lastBuiltAt).toLocaleString()}</div>
              ) : null}
            </div>

            {(status?.addedPaths.length || status?.changedPaths.length || status?.removedPaths.length) ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <div className="font-semibold">Pending index changes</div>
                {status && status.addedPaths.length > 0 ? <div className="mt-2">Added: {status.addedPaths.slice(0, 5).join(', ')}</div> : null}
                {status && status.changedPaths.length > 0 ? <div className="mt-1">Changed: {status.changedPaths.slice(0, 5).join(', ')}</div> : null}
                {status && status.removedPaths.length > 0 ? <div className="mt-1">Removed: {status.removedPaths.slice(0, 5).join(', ')}</div> : null}
              </div>
            ) : null}
          </div>

          <div className="min-h-0 overflow-y-auto p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Indexed Files
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Indexed documents with stable TreeSearch document ids
                </div>
              </div>
              <div className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                {indexedFiles.length}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {indexedFiles.length > 0 ? (
                indexedFiles.map((file) => (
                  <div
                    key={file.path}
                    className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-300"
                  >
                    <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {file.path}
                    </div>
                    <div className="mt-2 truncate">Doc: {file.docName}</div>
                    <div className="mt-1 truncate">Doc ID: {file.docId || file.stagePath}</div>
                    <div className="mt-1 truncate">Source: {file.absolutePath}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  No indexed files yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-2xl bg-gray-50 px-4 py-3 dark:bg-gray-900/60">
    <div className="text-[11px] uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">{label}</div>
    <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</div>
  </div>
);

const ActionButton: React.FC<{
  onClick: () => void | Promise<void>;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
  destructive?: boolean;
}> = ({ onClick, disabled, icon, label, primary = false, destructive = false }) => {
  const className = primary
    ? 'bg-blue-600 text-white hover:bg-blue-700'
    : destructive
      ? 'border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20'
      : 'border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700';

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {icon}
      {label}
    </button>
  );
};
