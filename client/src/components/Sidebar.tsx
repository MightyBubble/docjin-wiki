import React, { useState, useEffect, useRef } from 'react';
import type { FileNode } from '../types';
import { Folder, FileText, ChevronRight, ChevronDown, Plus, Trash2, Edit2, FilePlus, FolderPlus } from 'lucide-react';
import classNames from 'classnames';
import { fileService } from '../services/api';

interface SidebarProps {
  files: FileNode[];
  workspaceId: string;
  currentFileId: string | null;
  onFileSelect: (file: FileNode) => void;
  isOpen: boolean;
  onRefresh: () => void;
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
          {isFolder ? <Folder size={16} /> : <FileText size={16} />}
        </span>
        <span className="truncate flex-1">{node.name}</span>
        
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
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, node: null });
  const contextMenuRef = useRef<HTMLDivElement>(null);

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

  const handleCreateFile = async () => {
    if (!workspaceId) return;
    const parentPath = contextMenu.node ? (contextMenu.node.type === 'folder' ? contextMenu.node.path : contextMenu.node.path.split('/').slice(0, -1).join('/')) : '';
    const name = prompt('Enter file name:');
    if (!name) return;
    
    const path = parentPath ? `${parentPath}/${name}` : name;
    // Ensure .md extension if not present
    const finalPath = path.endsWith('.md') ? path : `${path}.md`;

    try {
      await fileService.writeFile(finalPath, '# ' + name, workspaceId);
      onRefresh();
    } catch (error) {
      console.error(error);
      alert('Failed to create file');
    }
    setContextMenu({ ...contextMenu, visible: false });
  };

  const handleCreateFolder = async () => {
    if (!workspaceId) return;
    const parentPath = contextMenu.node ? (contextMenu.node.type === 'folder' ? contextMenu.node.path : contextMenu.node.path.split('/').slice(0, -1).join('/')) : '';
    const name = prompt('Enter folder name:');
    if (!name) return;

    const path = parentPath ? `${parentPath}/${name}` : name;
    try {
      await fileService.writeFile(path + '/.gitkeep', '', workspaceId);
      onRefresh();
    } catch (error) {
      console.error(error);
      alert('Failed to create folder');
    }
    setContextMenu({ ...contextMenu, visible: false });
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
            <button onClick={(e) => { e.stopPropagation(); handleContextMenu(e, null); }} className="hover:bg-gray-200 dark:hover:bg-gray-700 rounded p-1">
                <Plus size={14} />
            </button>
        </div>
      </div>
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
        </div>
      )}
    </div>
  );
};
