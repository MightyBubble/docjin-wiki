import React, { useState, useEffect, useCallback } from 'react';
import { Folder, ChevronRight, ArrowUp, Loader2, HardDrive, FolderPlus } from 'lucide-react';
import { mountService } from '../services/api';
import { ModalDialog } from './ModalDialog';

interface FolderPickerProps {
  open: boolean;
  onSelect: (path: string) => void;
  onCancel: () => void;
}

export const FolderPicker: React.FC<FolderPickerProps> = ({ open, onSelect, onCancel }) => {
  const [current, setCurrent] = useState('');
  const [parent, setParent] = useState<string | null>(null);
  const [dirs, setDirs] = useState<{ name: string; path: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);

  const loadDir = useCallback(async (dirPath?: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await mountService.browseDirs(dirPath);
      setCurrent(result.current);
      setParent(result.parent);
      setDirs(result.dirs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load directory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setCurrent('');
      setParent(null);
      setDirs([]);
      setError('');
      loadDir();
    }
  }, [open, loadDir]);

  if (!open) return null;

  const breadcrumbs = current
    ? current.replace(/\\/g, '/').split('/').filter(Boolean)
    : [];

  const handleBreadcrumbClick = (index: number) => {
    const segments = breadcrumbs.slice(0, index + 1);
    const targetPath = segments[0].endsWith(':')
      ? segments[0] + '/' + segments.slice(1).join('/')
      : '/' + segments.join('/');
    loadDir(targetPath);
  };

  const handleCreateFolder = async (name: string) => {
    if (!current) return;
    const sep = current.endsWith('\\') || current.endsWith('/') ? '' : '/';
    const newPath = current + sep + name;
    try {
      await mountService.createDir(newPath);
      setShowNewFolder(false);
      await loadDir(current);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create folder');
      setShowNewFolder(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]" onClick={onCancel}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[480px] max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Select Folder</h3>
          {current && (
            <button
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-500 flex items-center gap-1"
              onClick={() => setShowNewFolder(true)}
            >
              <FolderPlus size={14} />
              New Folder
            </button>
          )}
        </div>

        {/* Breadcrumb */}
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center text-xs text-gray-500 dark:text-gray-400 min-h-[36px] overflow-x-auto gap-0.5 flex-shrink-0">
          <button
            className="hover:text-blue-500 font-medium flex-shrink-0"
            onClick={() => loadDir()}
          >
            <HardDrive size={14} />
          </button>
          {breadcrumbs.map((seg, i) => (
            <React.Fragment key={i}>
              <ChevronRight size={12} className="flex-shrink-0 mx-0.5 opacity-50" />
              <button
                className="hover:text-blue-500 truncate max-w-[120px] flex-shrink-0"
                onClick={() => handleBreadcrumbClick(i)}
              >
                {seg}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Directory list */}
        <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-32 text-red-400 text-sm px-4 text-center">
              {error}
            </div>
          ) : (
            <div className="py-1">
              {parent !== null && (
                <button
                  className="w-full text-left px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                  onClick={() => loadDir(parent)}
                >
                  <ArrowUp size={16} className="mr-2 text-gray-400" />
                  ..
                </button>
              )}
              {dirs.length === 0 && parent === null && (
                <div className="text-center text-gray-400 text-sm py-8">No directories found</div>
              )}
              {dirs.map((dir) => (
                <button
                  key={dir.path}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                  onClick={() => loadDir(dir.path)}
                >
                  <Folder size={16} className="mr-2 text-blue-400" />
                  {dir.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate mr-3 flex-1" title={current}>
            {current || 'Select a folder'}
          </div>
          <div className="flex space-x-2 flex-shrink-0">
            <button
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!current}
              onClick={() => onSelect(current)}
            >
              Select
            </button>
          </div>
        </div>
      </div>

      <ModalDialog
        open={showNewFolder}
        title="New Folder"
        mode="input"
        message="Folder name"
        onConfirm={handleCreateFolder}
        onCancel={() => setShowNewFolder(false)}
        confirmLabel="Create"
      />
    </div>
  );
};
