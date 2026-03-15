import React, { useState, useEffect, useRef } from 'react';
import type { FileNode } from '../types';
import { Folder, FileText, ChevronRight, ChevronDown, Plus, Trash2, Edit2, FilePlus, FolderPlus, HardDrive, FolderOpen } from 'lucide-react';
import classNames from 'classnames';
import { fileService } from '../services/api';
import { FolderPicker } from './FolderPicker';
import { ModalDialog } from './ModalDialog';
import { SearchPanel } from './SearchPanel';

interface SidebarProps {
  files: FileNode[];
  workspaceId: string;
  currentFileId: string | null;
  onFileSelect: (file: FileNode) => void;
  isOpen: boolean;
  onRefresh: () => void;
  onAddMount: (alias: string, path: string) => Promise<void>;
  onRemoveMount: (alias: string) => Promise<void>;
  onSearchSelect: (path: string, heading?: string) => Promise<void>;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  node: FileNode | null; // null means root
}

const FileTreeItem: React.FC<{
  node: FileNode;
  currentFileId: string | null;
  onSelect: (file: FileNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  level?: number;
}> = ({ node, currentFileId, onSelect, onContextMenu, level = 0 }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isFolder = node.type === 'folder';
  const isSelected = node.id === currentFileId;

  useEffect(() => {
    if (!isFolder || !currentFileId) return;
    if (currentFileId === node.id || currentFileId.startsWith(`${node.id}/`)) {
      const timer = window.setTimeout(() => {
        setIsExpanded(true);
      }, 0);

      return () => {
        window.clearTimeout(timer);
      };
    }
  }, [currentFileId, isFolder, node.id]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFolder) {
      setIsExpanded(!isExpanded);
    } else {
      onSelect(node);
    }
  };

  const handleRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, node);
  };

  return (
    <div>
      <div
        className={classNames(
          'flex items-center py-1 px-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 text-sm select-none transition-colors group',
          {
            'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300': isSelected,
            'text-gray-700 dark:text-gray-300': !isSelected,
          }
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleRightClick}
      >
        <span className="mr-1 opacity-70">
          {isFolder ? (
            isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="w-[14px] inline-block" />
          )}
        </span>
        <span className="mr-2 text-blue-500">
          {node.isMount ? <HardDrive size={16} className={node.unavailable ? 'opacity-40' : ''} /> : isFolder ? <Folder size={16} /> : <FileText size={16} />}
        </span>
        <span className={classNames('truncate flex-1', { 'opacity-40': node.unavailable })}>{node.name}</span>
        
        {/* Hover menu trigger for touch/accessibility if needed, but we use right click mainly */}
      </div>
      {isFolder && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.id}
              node={child}
              currentFileId={currentFileId}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  files,
  workspaceId,
  currentFileId,
  onFileSelect,
  isOpen,
  onRefresh,
  onAddMount,
  onRemoveMount,
  onSearchSelect,
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, node: null });
  const [showMountForm, setShowMountForm] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [mountAlias, setMountAlias] = useState('');
  const [mountPath, setMountPath] = useState('');
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Modal dialog state
  const [modal, setModal] = useState<{
    open: boolean;
    title: string;
    mode: 'input' | 'confirm';
    message: string;
    defaultValue: string;
    confirmLabel: string;
    destructive: boolean;
    onConfirm: (value: string) => void;
  }>({ open: false, title: '', mode: 'input', message: '', defaultValue: '', confirmLabel: 'OK', destructive: false, onConfirm: () => {} });

  const closeModal = () => setModal((m) => ({ ...m, open: false }));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu({ ...contextMenu, visible: false });
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, node: FileNode | null) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      node,
    });
  };

  const handleCreateFile = () => {
    if (!workspaceId) return;
    const parentPath = contextMenu.node ? (contextMenu.node.type === 'folder' ? contextMenu.node.path : contextMenu.node.path.split('/').slice(0, -1).join('/')) : '';
    setContextMenu({ ...contextMenu, visible: false });
    setModal({
      open: true, title: 'New File', mode: 'input', message: 'File name', defaultValue: '', confirmLabel: 'Create', destructive: false,
      onConfirm: async (name) => {
        closeModal();
        const path = parentPath ? `${parentPath}/${name}` : name;
        const finalPath = path.endsWith('.md') ? path : `${path}.md`;
        try {
          await fileService.writeFile(finalPath, '# ' + name, workspaceId);
          onRefresh();
        } catch (error) {
          console.error(error);
        }
      },
    });
  };

  const handleCreateFolder = () => {
    if (!workspaceId) return;
    const parentPath = contextMenu.node ? (contextMenu.node.type === 'folder' ? contextMenu.node.path : contextMenu.node.path.split('/').slice(0, -1).join('/')) : '';
    setContextMenu({ ...contextMenu, visible: false });
    setModal({
      open: true, title: 'New Folder', mode: 'input', message: 'Folder name', defaultValue: '', confirmLabel: 'Create', destructive: false,
      onConfirm: async (name) => {
        closeModal();
        const path = parentPath ? `${parentPath}/${name}` : name;
        try {
          await fileService.writeFile(path + '/.gitkeep', '', workspaceId);
          onRefresh();
        } catch (error) {
          console.error(error);
        }
      },
    });
  };

  const handleRename = async () => {
    if (!workspaceId) return;
    if (!contextMenu.node) return;
    const newName = prompt('Enter new name:', contextMenu.node.name);
    if (!newName || newName === contextMenu.node.name) return;

    const oldPath = contextMenu.node.path;
    const parentPath = oldPath.split('/').slice(0, -1).join('/');
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;

    try {
      await fileService.rename(oldPath, newPath, workspaceId);
      onRefresh();
    } catch (error) {
      console.error(error);
      alert('Failed to rename');
    }
    setContextMenu({ ...contextMenu, visible: false });
  };

  const handleDelete = async () => {
    if (!workspaceId) return;
    if (!contextMenu.node) return;
    if (!confirm(`Are you sure you want to delete ${contextMenu.node.name}?`)) return;

    try {
      await fileService.delete(contextMenu.node.path, workspaceId);
      onRefresh();
    } catch (error) {
      console.error(error);
      alert('Failed to delete');
    }
    setContextMenu({ ...contextMenu, visible: false });
  };

  const handleMountSubmit = async () => {
    if (!mountAlias.trim() || !mountPath.trim()) return;
    await onAddMount(mountAlias.trim(), mountPath.trim());
    setMountAlias('');
    setMountPath('');
    setShowMountForm(false);
  };

  const handleUnmount = async () => {
    if (!contextMenu.node?.isMount) return;
    const alias = contextMenu.node.name.replace(/^@/, '');
    if (!confirm(`Unmount "${alias}"?`)) return;
    await onRemoveMount(alias);
    setContextMenu({ ...contextMenu, visible: false });
  };

  return (
    <div 
      className={classNames(
        "h-full border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-col flex-shrink-0 transition-all duration-300 overflow-hidden relative",
        {
          "w-64": isOpen,
          "w-0 border-r-0": !isOpen
        }
      )}
      onContextMenu={(e) => handleContextMenu(e, null)}
    >
      <div className="p-4 font-bold text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider whitespace-nowrap flex justify-between items-center">
        <span>Files</span>
        <div className="flex space-x-1">
            <button onClick={() => setShowMountForm(true)} className="hover:bg-gray-200 dark:hover:bg-gray-700 rounded p-1" title="Mount directory">
                <HardDrive size={14} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleContextMenu(e, null); }} className="hover:bg-gray-200 dark:hover:bg-gray-700 rounded p-1">
                <Plus size={14} />
            </button>
        </div>
      </div>
      <SearchPanel workspaceId={workspaceId} onResultSelect={onSearchSelect} />
      <div className="flex-1 overflow-y-auto">
        <div className="min-w-[250px] pb-10">
          {files.map((file) => (
            <FileTreeItem
              key={file.id}
              node={file}
              currentFileId={currentFileId}
              onSelect={onFileSelect}
              onContextMenu={handleContextMenu}
            />
          ))}
        </div>
      </div>

      {contextMenu.visible && (
        <div
          ref={contextMenuRef}
          className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg rounded-md py-1 z-50 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
            onClick={handleCreateFile}
          >
            <FilePlus size={14} className="mr-2" /> New File
          </button>
          <button
            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
            onClick={handleCreateFolder}
          >
            <FolderPlus size={14} className="mr-2" /> New Folder
          </button>
          {contextMenu.node && (
            <>
              <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
              {contextMenu.node.isMount ? (
                <button
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center"
                  onClick={handleUnmount}
                >
                  <HardDrive size={14} className="mr-2" /> Unmount
                </button>
              ) : (
                <>
                  <button
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                    onClick={handleRename}
                  >
                    <Edit2 size={14} className="mr-2" /> Rename
                  </button>
                  <button
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center"
                    onClick={handleDelete}
                  >
                    <Trash2 size={14} className="mr-2" /> Delete
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {showMountForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowMountForm(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-5 w-80" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-200">Mount Directory</h3>
            <input
              className="w-full mb-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="Alias (e.g. notes)"
              value={mountAlias}
              onChange={(e) => setMountAlias(e.target.value)}
              autoFocus
            />
            <div
              className="w-full mb-3 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 flex items-center justify-between cursor-pointer hover:border-blue-400 transition-colors min-h-[38px]"
              onClick={() => setShowFolderPicker(true)}
            >
              <span className={classNames('truncate', { 'text-gray-400': !mountPath })}>
                {mountPath || 'Click to select folder...'}
              </span>
              <FolderOpen size={16} className="ml-2 text-gray-400 flex-shrink-0" />
            </div>
            <div className="flex justify-end space-x-2">
              <button className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" onClick={() => setShowMountForm(false)}>Cancel</button>
              <button className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!mountAlias.trim() || !mountPath.trim()} onClick={handleMountSubmit}>Mount</button>
            </div>
          </div>
        </div>
      )}

      <FolderPicker
        open={showFolderPicker}
        onSelect={(path) => {
          setMountPath(path);
          setShowFolderPicker(false);
        }}
        onCancel={() => setShowFolderPicker(false)}
      />

      <ModalDialog
        open={modal.open}
        title={modal.title}
        mode={modal.mode}
        message={modal.message}
        defaultValue={modal.defaultValue}
        confirmLabel={modal.confirmLabel}
        destructive={modal.destructive}
        onConfirm={modal.onConfirm}
        onCancel={closeModal}
      />
    </div>
  );
};
