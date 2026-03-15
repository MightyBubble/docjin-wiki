import React, { useCallback, useEffect, useRef, useState } from 'react';
import Vditor from 'vditor';
import 'vditor/dist/index.css';
import type { FileNode, FileFocusTarget } from '../types';
import { VariablesPanel } from './VariablesPanel';
import { InlineTagPlugin } from '../utils/inlinePlugin';
import { MarkdownParser } from '../utils/markdownParser';

interface EditorProps {
  file: FileNode | null;
  onChange: (content: string) => void;
  workspaceId: string;
  focusTarget: FileFocusTarget | null;
  onEmbedNavigate: (path: string, heading?: string) => void;
  availableFilePaths: string[];
}

const FOCUS_HIGHLIGHT_CLASS = 'dj-focus-target';

const normalizeHeadingText = (value: string | null | undefined): string =>
  (value || '').replace(/\s+/g, ' ').trim().toLowerCase();

export const Editor: React.FC<EditorProps> = ({
  file,
  onChange,
  workspaceId,
  focusTarget,
  onEmbedNavigate,
  availableFilePaths,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [vditor, setVditor] = useState<Vditor>();
  const lastFileIdRef = useRef<string | null>(null);
  const currentPathRef = useRef<string>('');
  const currentWorkspaceRef = useRef<string>(workspaceId);
  const pluginRef = useRef<InlineTagPlugin | null>(null);
  const onChangeRef = useRef(onChange);
  const onEmbedNavigateRef = useRef(onEmbedNavigate);
  const availableFilePathsRef = useRef(availableFilePaths);
  const lastFocusedTokenRef = useRef<number | null>(null);
  const focusCleanupTimerRef = useRef<number | null>(null);
  const refreshTimerRefs = useRef<number[]>([]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onEmbedNavigateRef.current = onEmbedNavigate;
  }, [onEmbedNavigate]);

  useEffect(() => {
    availableFilePathsRef.current = availableFilePaths;
    pluginRef.current?.updateAvailableFilePaths(availableFilePaths);
  }, [availableFilePaths]);

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

  const clearScheduledRefreshes = useCallback(() => {
    refreshTimerRefs.current.forEach((timerId) => window.clearTimeout(timerId));
    refreshTimerRefs.current = [];
  }, []);

  const schedulePluginRefresh = useCallback((delays: number[] = [0, 40, 120, 260]) => {
    clearScheduledRefreshes();
    refreshTimerRefs.current = delays.map((delay) =>
      window.setTimeout(() => {
        pluginRef.current?.refresh();
      }, delay)
    );
  }, [clearScheduledRefreshes]);

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
          currentWorkspaceRef.current,
          (path, heading) => onEmbedNavigateRef.current(path, heading),
          availableFilePathsRef.current
        );

        let attempts = 0;
        const maxAttempts = 20;
        const tryInit = () => {
          if (!pluginRef.current) return;
          const initialized = pluginRef.current.init();
          if (!initialized && attempts < maxAttempts) {
            attempts += 1;
            window.setTimeout(tryInit, 50);
          } else if (initialized) {
            schedulePluginRefresh();
          }
        };
        tryInit();
      },
      input: (value) => {
        schedulePluginRefresh();
        onChangeRef.current(MarkdownParser.cleanMarkdownBeforeSave(value));
      },
    });

    return () => {
      if (pluginRef.current) {
          pluginRef.current.destroy();
      }
      clearScheduledRefreshes();
      try {
        vditorInstance.destroy();
      } catch {
        // Ignore destroy errors on fast teardown.
      }
      setVditor(undefined);
    };
  }, [clearScheduledRefreshes, schedulePluginRefresh]);

  // ---- Sync file content → Vditor ----
  useEffect(() => {
    if (vditor) {
      if (file) {
        vditor.enable();
        
        if (file.id !== lastFileIdRef.current) {
          vditor.setValue(file.content || '');
          schedulePluginRefresh();
          lastFileIdRef.current = file.id;
        }
      } else {
        vditor.setValue('');
        schedulePluginRefresh();
        vditor.disabled();
        lastFileIdRef.current = null;
      }
    }
  }, [file, schedulePluginRefresh, vditor]);

  useEffect(() => {
    if (!focusTarget || !file || !vditor) return;
    if (focusTarget.path !== file.path) return;
    if (lastFocusedTokenRef.current === focusTarget.token) return;

    let cancelled = false;
    const expectedHeading = normalizeHeadingText(focusTarget.heading);
    const maxAttempts = 16;

    const clearExistingHighlights = () => {
      editorRef.current
        ?.querySelectorAll(`.${FOCUS_HIGHLIGHT_CLASS}`)
        .forEach((node) => node.classList.remove(FOCUS_HIGHLIGHT_CLASS));
    };

    const highlightTarget = (target: HTMLElement) => {
      clearExistingHighlights();
      target.classList.add(FOCUS_HIGHLIGHT_CLASS);
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });

      if (focusCleanupTimerRef.current !== null) {
        window.clearTimeout(focusCleanupTimerRef.current);
      }

      focusCleanupTimerRef.current = window.setTimeout(() => {
        target.classList.remove(FOCUS_HIGHLIGHT_CLASS);
        target.removeAttribute('tabindex');
      }, 2200);
    };

    const findTargetElement = (): HTMLElement | null => {
      const root = editorRef.current?.querySelector('.vditor-wysiwyg');
      if (!root) return null;

      const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6')) as HTMLElement[];
      if (!headings.length) return root.firstElementChild as HTMLElement | null;

      if (!expectedHeading) {
        return headings[0];
      }

      return (
        headings.find((heading) => normalizeHeadingText(heading.textContent) === expectedHeading) ||
        headings.find((heading) => normalizeHeadingText(heading.textContent).includes(expectedHeading)) ||
        null
      );
    };

    const tryFocus = (attempt: number) => {
      if (cancelled) return;

      const target = findTargetElement();
      if (target) {
        lastFocusedTokenRef.current = focusTarget.token;
        highlightTarget(target);
        return;
      }

      if (attempt < maxAttempts) {
        window.setTimeout(() => tryFocus(attempt + 1), 100);
      }
    };

    window.setTimeout(() => tryFocus(0), 0);

    return () => {
      cancelled = true;
    };
  }, [file, focusTarget, vditor]);

  useEffect(() => () => {
    if (focusCleanupTimerRef.current !== null) {
      window.clearTimeout(focusCleanupTimerRef.current);
    }
    clearScheduledRefreshes();
  }, [clearScheduledRefreshes]);

  return (
    <div className="flex-1 flex h-full overflow-hidden relative">
      <div className="flex-1 h-full flex flex-col min-w-0">
        <div ref={editorRef} className="flex-1 dj-editor-shell" />
      </div>
      <div className="hidden lg:flex absolute left-0 bottom-0 w-[250px] h-[42%] border-t border-r border-gray-200 dark:border-gray-700 z-[3]">
        <VariablesPanel content={file?.content || ''} variant="outline" />
      </div>
    </div>
  );
};
