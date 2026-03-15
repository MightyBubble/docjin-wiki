import React, { Suspense, lazy, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Sidebar } from './Sidebar';
import { RightPanel } from './RightPanel';
import { Header } from './Header';
import type { FileNode, GitStatus, WorkspaceInfo, MountInfo, FileFocusTarget } from '../types';
import { fileService, gitService, workspaceService, mountService } from '../services/api';

const Editor = lazy(async () => {
  const module = await import('./Editor');
  return { default: module.Editor };
});

const findFileNodeByPath = (nodes: FileNode[], targetPath: string): FileNode | null => {
  for (const node of nodes) {
    if (node.type === 'file' && node.path === targetPath) {
      return node;
    }

    if (node.children?.length) {
      const match = findFileNodeByPath(node.children, targetPath);
      if (match) {
        return match;
      }
    }
  }

  return null;
};

const collectFilePaths = (nodes: FileNode[]): string[] => {
  const paths: string[] = [];

  for (const node of nodes) {
    if (node.type === 'file') {
      paths.push(node.path);
    }

    if (node.children?.length) {
      paths.push(...collectFilePaths(node.children));
    }
  }

  return paths;
};

const getApiErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    if (typeof response?.data?.error === 'string' && response.data.error.trim()) {
      return response.data.error;
    }
  }

  return fallback;
};

export const Layout: React.FC = () => {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string>('');
  const [currentFile, setCurrentFile] = useState<FileNode | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [, setMounts] = useState<MountInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [focusTarget, setFocusTarget] = useState<FileFocusTarget | null>(null);
  const focusTokenRef = useRef(0);
  const availableFilePaths = useMemo(() => collectFilePaths(files), [files]);

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

  const refreshMounts = useCallback(async (workspaceId: string) => {
    try {
      const data = await mountService.getMounts(workspaceId);
      setMounts(data);
    } catch (error) {
      console.error('Failed to fetch mounts:', error);
      setMounts([]);
    }
  }, []);

  const refreshWorkspaces = useCallback(async (): Promise<WorkspaceInfo[]> => {
    const payload = await workspaceService.getWorkspaces();
    setWorkspaces(payload.workspaces);
    return payload.workspaces;
  }, []);

  const loadWorkspaceData = useCallback(
    async (workspaceId: string) => {
      await Promise.all([refreshFiles(workspaceId), refreshGitStatus(workspaceId), refreshMounts(workspaceId)]);
    },
    [refreshFiles, refreshGitStatus, refreshMounts]
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

  const openFile = useCallback(async (file: FileNode, focus?: { heading?: string }) => {
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
      if (focus) {
        focusTokenRef.current += 1;
        setFocusTarget({
          path: file.path,
          heading: focus.heading,
          token: focusTokenRef.current,
        });
      } else {
        setFocusTarget(null);
      }
    } catch (error) {
      console.error('Failed to read file:', error);
      alert('Failed to read file content');
    }
  }, [currentWorkspaceId, unsavedChanges]);

  const handleFileSelect = useCallback(async (file: FileNode) => {
    await openFile(file);
  }, [openFile]);

  const handleEmbedNavigate = useCallback(async (path: string, heading?: string) => {
    const targetFile = findFileNodeByPath(files, path);
    if (!targetFile) {
      alert(`Embedded source not found: ${path}`);
      return;
    }

    await openFile(targetFile, { heading });
  }, [files, openFile]);

  const handleSearchSelect = useCallback(async (path: string, heading?: string) => {
    const targetFile = findFileNodeByPath(files, path);
    if (!targetFile) {
      alert(`Search result source not found: ${path}`);
      return;
    }

    await openFile(targetFile, { heading });
  }, [files, openFile]);

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

  const handleAddMount = async (alias: string, mountPath: string) => {
    if (!currentWorkspaceId) return;
    try {
      const updated = await mountService.addMount(alias, mountPath, currentWorkspaceId);
      setMounts(updated);
      await refreshFiles(currentWorkspaceId);
    } catch (error: unknown) {
      alert(getApiErrorMessage(error, 'Failed to add mount'));
    }
  };

  const handleRemoveMount = async (alias: string) => {
    if (!currentWorkspaceId) return;
    try {
      const updated = await mountService.removeMount(alias, currentWorkspaceId);
      setMounts(updated);
      await refreshFiles(currentWorkspaceId);
    } catch (error: unknown) {
      alert(getApiErrorMessage(error, 'Failed to remove mount'));
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
          onAddMount={handleAddMount}
          onRemoveMount={handleRemoveMount}
          onSearchSelect={handleSearchSelect}
        />
        
        <main className="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-900 relative z-0">
            {isLoading ? (
                <div className="flex items-center justify-center h-full text-gray-500">Loading...</div>
            ) : !currentWorkspaceId ? (
                <div className="flex items-center justify-center h-full text-gray-500">No workspace available</div>
            ) : (
                <Suspense fallback={<div className="flex items-center justify-center h-full text-gray-500">Loading editor...</div>}>
                  <Editor
                      file={currentFile}
                      onChange={handleContentChange}
                      workspaceId={currentWorkspaceId}
                      focusTarget={focusTarget}
                      onEmbedNavigate={handleEmbedNavigate}
                      availableFilePaths={availableFilePaths}
                  />
                </Suspense>
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
