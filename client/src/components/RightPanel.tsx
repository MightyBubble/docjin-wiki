import React, { useState } from 'react';
import type { FileNode, GitStatus } from '../types';
import classNames from 'classnames';
import { FileText, GitBranch, Check } from 'lucide-react';

interface RightPanelProps {
  file: FileNode | null;
  isOpen: boolean;
  gitStatus: GitStatus | null;
  onCommit: (message: string) => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({ file, isOpen, gitStatus, onCommit }) => {
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    setIsCommitting(true);
    await onCommit(commitMessage);
    setCommitMessage('');
    setIsCommitting(false);
  };

  return (
    <div
      className={classNames(
        "h-full border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-col flex-shrink-0 transition-all duration-300 overflow-hidden",
        {
          "w-80": isOpen, // Increased width for better commit form
          "w-0 border-l-0": !isOpen
        }
      )}
    >
      <div className="p-4 font-bold text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider whitespace-nowrap border-b border-gray-200 dark:border-gray-700">
        Info & Git
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="min-w-[280px] space-y-6">
          {file && (
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2 flex items-center">
                <FileText size={16} className="mr-2" /> File Details
              </h3>
              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                <div className="break-all">
                  <span className="font-semibold">Path:</span> {file.path}
                </div>
                {/* Removed createdAt and wordCount as they are not in the new FileNode type yet */}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2 flex items-center">
              <GitBranch size={16} className="mr-2" /> Git Status
            </h3>
            
            {gitStatus ? (
              <div className="space-y-3">
                <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center justify-between">
                  <span>Branch:</span>
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">{gitStatus.currentBranch || 'HEAD'}</span>
                </div>

                {!gitStatus.isInitialized ? (
                  <div className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-3 rounded border border-amber-200 dark:border-amber-800">
                    Git is not initialized.
                  </div>
                ) : (
                  <>
                    <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700 max-h-40 overflow-y-auto text-xs">
                      {(!gitStatus.staged?.length && !gitStatus.modified?.length && !gitStatus.untracked?.length) ? (
                        <div className="text-green-600 flex items-center">
                          <Check size={14} className="mr-1" /> Working tree clean
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {gitStatus.staged?.map(f => (
                            <div key={f} className="text-green-600 flex items-center">
                              <span className="w-4 text-center mr-1">A</span> {f}
                            </div>
                          ))}
                          {gitStatus.modified?.map(f => (
                            <div key={f} className="text-blue-600 flex items-center">
                              <span className="w-4 text-center mr-1">M</span> {f}
                            </div>
                          ))}
                          {gitStatus.untracked?.map(f => (
                            <div key={f} className="text-red-600 flex items-center">
                              <span className="w-4 text-center mr-1">?</span> {f}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {(gitStatus.hasUncommittedChanges || (gitStatus.untracked && gitStatus.untracked.length > 0)) && (
                      <div className="space-y-2">
                        <textarea
                          className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                          rows={3}
                          placeholder="Commit message..."
                          value={commitMessage}
                          onChange={(e) => setCommitMessage(e.target.value)}
                        />
                        <button
                          className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={handleCommit}
                          disabled={!commitMessage.trim() || isCommitting}
                        >
                          {isCommitting ? 'Committing...' : 'Commit Changes'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500 italic">Loading git status...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
