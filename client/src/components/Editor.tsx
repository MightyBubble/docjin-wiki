import React, { useEffect, useRef, useState } from 'react';
import Vditor from 'vditor';
import 'vditor/dist/index.css';
import type { FileNode } from '../types';
import { VariablesPanel } from './VariablesPanel';
import { InlineTagPlugin } from '../utils/inlinePlugin';
import { MarkdownParser } from '../utils/markdownParser';

interface EditorProps {
  file: FileNode | null;
  onChange: (content: string) => void;
  workspaceId: string;
}

export const Editor: React.FC<EditorProps> = ({ file, onChange, workspaceId }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [vditor, setVditor] = useState<Vditor>();
  const lastFileIdRef = useRef<string | null>(null);
  const currentPathRef = useRef<string>('');
  const currentWorkspaceRef = useRef<string>(workspaceId);
  const pluginRef = useRef<InlineTagPlugin | null>(null);

  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    currentWorkspaceRef.current = workspaceId;
    if (pluginRef.current) {
      pluginRef.current.updateWorkspace(workspaceId);
    }
  }, [workspaceId]);

  useEffect(() => {
    currentPathRef.current = file?.path || '';
    if (pluginRef.current) {
        pluginRef.current.updatePath(file?.path || '');
    }
  }, [file?.path]);

  // ---- Vditor initialisation (once) ----
  useEffect(() => {
    if (!editorRef.current) return;

    const vditorInstance = new Vditor(editorRef.current, {
      height: '100%',
      mode: 'wysiwyg',
      outline: {
        enable: true,
        position: 'left',
      },
      toolbarConfig: {
        pin: true,
      },
      cache: {
        enable: false // Disable built-in cache because we intercept values
      },
      preview: {
        maxWidth: 800,
      },
      after: () => {
        setVditor(vditorInstance);
        pluginRef.current = new InlineTagPlugin(
          editorRef.current!,
          currentPathRef.current,
          currentWorkspaceRef.current
        );

        let attempts = 0;
        const maxAttempts = 20;
        const tryInit = () => {
          if (!pluginRef.current) return;
          const initialized = pluginRef.current.init();
          if (!initialized && attempts < maxAttempts) {
            attempts += 1;
            window.setTimeout(tryInit, 50);
          }
        };
        tryInit();
      },
      input: (value) => {
        // Clean our custom HTML tags back into {{...}} before notifying parent
        onChangeRef.current(MarkdownParser.cleanMarkdownBeforeSave(value));
      },
    });

    return () => {
      if (pluginRef.current) {
          pluginRef.current.destroy();
      }
      try { vditorInstance.destroy(); } catch(e) {}
      setVditor(undefined);
    };
  }, []);

  // ---- Sync file content → Vditor ----
  useEffect(() => {
    if (vditor) {
      if (file) {
        vditor.enable();
        
        if (file.id !== lastFileIdRef.current) {
          // When setting value from external, we don't need to inject tags manually
          // because Vditor will render them as text, and our MutationObserver (InlineTagPlugin)
          // will immediately catch the {{...}} and convert them to capsules!
          vditor.setValue(file.content || '');
          lastFileIdRef.current = file.id;
        }
      } else {
        vditor.setValue('');
        vditor.disabled();
        lastFileIdRef.current = null;
      }
    }
  }, [file, vditor]);

  return (
    <div className="flex-1 flex h-full overflow-hidden relative">
      <div className="flex-1 h-full flex flex-col">
        <div ref={editorRef} className="flex-1" />
      </div>
      <VariablesPanel content={file?.content || ''} />
    </div>
  );
};
