import React, { useMemo } from 'react';
import { Variable, Link } from 'lucide-react';
import { MarkdownParser } from '../utils/markdownParser';

interface VariablesPanelProps {
  content: string;
}

export const VariablesPanel: React.FC<VariablesPanelProps> = ({ content }) => {
  const { variables, references } = useMemo(() => {
    return {
      variables: MarkdownParser.parseVariables(content),
      references: MarkdownParser.parseReferences(content)
    };
  }, [content]);

  return (
    <div className="w-64 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex flex-col h-full overflow-hidden hidden md:flex">
      <div className="p-3 font-bold text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider whitespace-nowrap border-b border-gray-200 dark:border-gray-700">
        Variables
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6 text-sm">
        <div>
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center">
            <Variable size={16} className="mr-2 text-blue-500" />
            Declared Variables
          </h3>
          {variables.length > 0 ? (
            <ul className="space-y-2">
              {variables.map((v, i) => (
                <li key={i} className="bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700 flex justify-between">
                  <span className="font-mono text-xs text-blue-600 dark:text-blue-400">{v.name}</span>
                  <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{v.value}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 italic text-xs">No variables declared in this file.</p>
          )}
        </div>

        <div>
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center mt-4">
            <Link size={16} className="mr-2 text-purple-500" />
            References
          </h3>
          {references.length > 0 ? (
            <ul className="space-y-2">
              {references.map((r, i) => (
                <li key={i} className="bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700">
                  <div className="font-mono text-xs text-purple-600 dark:text-purple-400 mb-1">{r.varName}</div>
                  <div className="text-[10px] text-gray-500 truncate" title={r.path}>from: {r.path || 'this file'}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 italic text-xs">No references found.</p>
          )}
        </div>
      </div>
    </div>
  );
};