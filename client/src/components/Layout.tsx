import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { Editor } from './Editor';
import { RightPanel } from './RightPanel';
import { Header } from './Header';
import type { FileNode, GitStatus, WorkspaceInfo } from '../types';
import { fileService, gitService, workspaceService } from '../services/api';

export const Layout: React.FC = () => {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string>('');
  const [currentFile, setCurrentFile] = useState<FileNode | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshFiles = useCallback(async (workspaceId: string) => {
    try {
      const data = await fileService.getFiles(workspaceId);
      setFiles(data);
    } catch (error) {
      console.error('Failed to fetch files:', error);
      setFiles([]);
    }
  }, []);

  const refreshGitStatus = useCallback(async (workspaceId: string) => {
    try {
      const status = await gitService.getStatus(workspaceId);
      setGitStatus(status);
    } catch (error) {
      console.error('Failed to fetch git status:', error);
      setGitStatus(null);
    }
  }, []);

  const refreshWorkspaces = useCallback(async (): Promise<WorkspaceInfo[]> => {
    const payload = await workspaceService.getWorkspaces();
    setWorkspaces(payload.workspaces);
    return payload.workspaces;
  }, []);

  const loadWorkspaceData = useCallback(
    async (workspaceId: string) => {
      await Promise.all([refreshFiles(workspaceId), refreshGitStatus(workspaceId)]);
    },
    [refreshFiles, refreshGitStatus]
  );

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        const loadedWorkspaces = await refreshWorkspaces();
        const fallbackWorkspaceId =
          loadedWorkspaces.find((workspace) => workspace.isDefault)?.id || loadedWorkspaces[0]?.id || '';
        setCurrentWorkspaceId(fallbackWorkspaceId);

        if (fallbackWorkspaceId) {
          await loadWorkspaceData(fallbackWorkspaceId);
        }
      } catch (error) {
        console.error('Failed to initialize layout:', error);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [loadWorkspaceData, refreshWorkspaces]);

  // Responsive check
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
        setIsRightPanelOpen(false);
      } else {
        setIsSidebarOpen(true);
        setIsRightPanelOpen(true);
      }
    };

    // Initial check
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleWorkspaceChange = async (workspaceId: string) => {
    if (!workspaceId || workspaceId === currentWorkspaceId) return;

    if (unsavedChanges) {
      if (!confirm('You have unsaved changes. Discard them and switch workspace?')) {
        return;
      }
    }

    setCurrentWorkspaceId(workspaceId);
    setCurrentFile(null);
    setUnsavedChanges(false);
    setIsLoading(true);
    try {
      await loadWorkspaceData(workspaceId);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateWorkspace = async () => {
    const input = prompt('New workspace id (letters, numbers, ., _, -):');
    if (!input) return;
    const workspaceId = input.trim();
    if (!workspaceId) return;

    try {
      await workspaceService.createWorkspace(workspaceId, true);
      await refreshWorkspaces();
      await handleWorkspaceChange(workspaceId);
    } catch (error) {
      console.error('Failed to create workspace:', error);
      alert('Failed to create workspace');
    }
  };

  const handleFileSelect = async (file: FileNode) => {
    if (!currentWorkspaceId) return;

    if (unsavedChanges) {
      if (!confirm('You have unsaved changes. Discard them?')) {
        return;
      }
    }
    
    try {
      const content = await fileService.readFile(file.path, currentWorkspaceId);
      setCurrentFile({ ...file, content });
      setUnsavedChanges(false);
    } catch (error) {
      console.error('Failed to read file:', error);
      alert('Failed to read file content');
    }
  };

  const handleContentChange = (content: string) => {
    if (!currentFile) return;
    setCurrentFile(prev => prev ? { ...prev, content } : null);
    setUnsavedChanges(true);
  };

  const handleSave = async () => {
    if (!currentFile || !currentFile.content || !currentWorkspaceId) return;
    
    try {
      await fileService.writeFile(currentFile.path, currentFile.content, currentWorkspaceId);
      setUnsavedChanges(false);
      await refreshGitStatus(currentWorkspaceId);
    } catch (error) {
      console.error('Failed to save file:', error);
      alert('Failed to save file');
    }
  };

  const handleGitInit = async () => {
    if (!currentWorkspaceId) return;

    try {
      await gitService.init(currentWorkspaceId);
      await refreshGitStatus(currentWorkspaceId);
    } catch (error) {
      console.error('Failed to init git:', error);
      alert('Failed to initialize git');
    }
  };

  const handleGitCommit = async (message: string) => {
    if (!currentWorkspaceId) return;

    try {
      await gitService.commit(message, currentWorkspaceId);
      await refreshGitStatus(currentWorkspaceId);
    } catch (error) {
      console.error('Failed to commit:', error);
      alert('Failed to commit changes');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
      <Header
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        toggleRightPanel={() => setIsRightPanelOpen(!isRightPanelOpen)}
        isSidebarOpen={isSidebarOpen}
        isRightPanelOpen={isRightPanelOpen}
        unsavedChanges={unsavedChanges}
        onSave={handleSave}
        gitStatus={gitStatus}
        onGitInit={handleGitInit}
        workspaces={workspaces}
        currentWorkspaceId={currentWorkspaceId}
        onWorkspaceChange={handleWorkspaceChange}
        onWorkspaceCreate={handleCreateWorkspace}
      />
      
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          files={files}
          workspaceId={currentWorkspaceId}
          currentFileId={currentFile?.id || null}
          onFileSelect={handleFileSelect}
          isOpen={isSidebarOpen}
          onRefresh={() => {
            if (currentWorkspaceId) {
              refreshFiles(currentWorkspaceId);
            }
          }}
        />
        
        <main className="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-900 relative z-0">
            {isLoading ? (
                <div className="flex items-center justify-center h-full text-gray-500">Loading...</div>
            ) : !currentWorkspaceId ? (
                <div className="flex items-center justify-center h-full text-gray-500">No workspace available</div>
            ) : (
                <Editor
                    file={currentFile}
                    onChange={handleContentChange}
                    workspaceId={currentWorkspaceId}
                />
            )}
        </main>

        <RightPanel
          file={currentFile}
          isOpen={isRightPanelOpen}
          gitStatus={gitStatus}
          onCommit={handleGitCommit}
        />
      </div>
    </div>
  );
};
