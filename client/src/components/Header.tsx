import React from 'react';
import { Menu, PanelRight, Plus, Save } from 'lucide-react';
import classNames from 'classnames';

import type { GitStatus, WorkspaceInfo } from '../types';

interface HeaderProps {
  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  isSidebarOpen: boolean;
  isRightPanelOpen: boolean;
  unsavedChanges: boolean;
  onSave: () => void;
  gitStatus: GitStatus | null;
  onGitInit: () => void;
  workspaces: WorkspaceInfo[];
  currentWorkspaceId: string;
  onWorkspaceChange: (workspaceId: string) => void;
  onWorkspaceCreate: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  toggleSidebar,
  toggleRightPanel,
  isSidebarOpen,
  isRightPanelOpen,
  unsavedChanges,
  onSave,
  gitStatus,
  onGitInit,
  workspaces,
  currentWorkspaceId,
  onWorkspaceChange,
  onWorkspaceCreate,
}) => {
  return (
    <div className="h-12 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between px-4 flex-shrink-0 z-10">
      <div className="flex items-center min-w-0">
        <button
          onClick={toggleSidebar}
          className={classNames(
            "p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mr-2",
            { "bg-gray-100 dark:bg-gray-700": isSidebarOpen }
          )}
          title="Toggle Sidebar"
        >
          <Menu size={18} className="text-gray-600 dark:text-gray-300" />
        </button>
        <h1 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mr-3 whitespace-nowrap">Docjin Wiki</h1>

        <div className="hidden md:flex items-center gap-2 min-w-0">
          <select
            value={currentWorkspaceId}
            onChange={(e) => onWorkspaceChange(e.target.value)}
            className="h-8 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 text-xs text-gray-700 dark:text-gray-200 max-w-[180px]"
            title="Switch workspace"
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.id}
                {workspace.isDefault ? ' (default)' : ''}
              </option>
            ))}
          </select>

          <button
            onClick={onWorkspaceCreate}
            className="h-8 px-2 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
            title="Create workspace"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        {gitStatus && !gitStatus.isInitialized && (
          <button
            onClick={onGitInit}
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors mr-2"
          >
            Init Git
          </button>
        )}
        
        {unsavedChanges && (
          <div className="flex items-center mr-4">
            <span className="w-2 h-2 rounded-full bg-red-500 mr-2 animate-pulse"></span>
            <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">Unsaved changes</span>
          </div>
        )}
        
        <button
          onClick={onSave}
          className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300"
          title="Save"
        >
          <Save size={18} />
        </button>

        <button
          onClick={toggleRightPanel}
          className={classNames(
            "p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
            { "bg-gray-100 dark:bg-gray-700": isRightPanelOpen }
          )}
          title="Toggle Info Panel"
        >
          <PanelRight size={18} className="text-gray-600 dark:text-gray-300" />
        </button>
      </div>
    </div>
  );
};
