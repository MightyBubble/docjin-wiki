import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { fileService } from '../services/api';
import { MarkdownParser } from './markdownParser';
import ReactMarkdown from 'react-markdown';
import { Variable, Calculator, Link as LinkIcon, FileText } from 'lucide-react';

// Keep track of roots to avoid memory leaks
const roots = new WeakMap<HTMLElement, Root>();

function renderReact(element: HTMLElement, component: React.ReactNode) {
  let root = roots.get(element);
  if (!root) {
    root = createRoot(element);
    roots.set(element, root);
  }
  root.render(component);
}

const EmbedBlock: React.FC<{ source: string, currentPath: string }> = ({ source }) => {
  const [content, setContent] = React.useState<string>('Loading...');

  React.useEffect(() => {
    const fetchContent = async () => {
      const parts = source.split('#');
      const targetPath = parts[0].trim();
      const heading = parts[1]?.trim();

      if (!targetPath) {
        setContent('*[Error: Empty embed path]*');
        return;
      }

      try {
        const rawContent = await fileService.readFile(targetPath);
        if (heading) {
          setContent(MarkdownParser.extractSection(rawContent, heading));
        } else {
          setContent(rawContent);
        }
      } catch (e) {
        setContent(`*[Error: Failed to embed ${targetPath}]*`);
      }
    };
    fetchContent();
  }, [source]);

  return (
    <div className="border border-indigo-200 dark:border-indigo-900 rounded-lg overflow-hidden my-2">
      <div className="bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1.5 text-xs text-indigo-600 dark:text-indigo-400 font-mono flex items-center border-b border-indigo-200 dark:border-indigo-900">
        <FileText size={14} className="mr-1.5" />
        Embedded: {source}
      </div>
      <div className="p-4 bg-white dark:bg-gray-800 prose dark:prose-invert max-w-none prose-sm">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
};

const VarBlock: React.FC<{ source: string }> = ({ source }) => {
  const lines = source.split('\n').filter(l => l.trim());
  
  return (
    <div className="border border-green-200 dark:border-green-900 rounded-lg overflow-hidden my-2 inline-block min-w-[200px]">
      <div className="bg-green-50 dark:bg-green-900/30 px-3 py-1.5 text-xs text-green-600 dark:text-green-400 font-mono flex items-center border-b border-green-200 dark:border-green-900">
        <Variable size={14} className="mr-1.5" />
        Variables Defined
      </div>
      <div className="p-3 bg-white dark:bg-gray-800 text-sm">
        <ul className="space-y-1 font-mono">
          {lines.map((line, i) => {
            const eqIdx = line.indexOf('=');
            if (eqIdx > 0) {
              return (
                <li key={i} className="flex justify-between space-x-4">
                  <span className="text-green-600 dark:text-green-400">{line.substring(0, eqIdx).trim()}</span>
                  <span className="text-gray-600 dark:text-gray-300">{line.substring(eqIdx + 1).trim()}</span>
                </li>
              );
            }
            return <li key={i} className="text-red-500 text-xs">Invalid: {line}</li>;
          })}
        </ul>
      </div>
    </div>
  );
};

const CalcBlock: React.FC<{ source: string, currentPath: string, vditor: any }> = ({ source, currentPath, vditor }) => {
  const [result, setResult] = React.useState<string>('Computing...');

  React.useEffect(() => {
    const compute = async () => {
      // 1. Get current file content from Vditor
      const currentContent = vditor.getValue();
      const localVars = MarkdownParser.parseVariables(currentContent);
      
      const varMap = new Map<string, string>();
      localVars.forEach(v => varMap.set(v.name, v.value));

      // 2. We also need to parse refs to fetch cross-file vars if needed, but for simplicity
      // let's grab all `ref` blocks from current content
      const refs = MarkdownParser.parseReferences(currentContent);
      
      for (const ref of refs) {
        if (ref.path === '.' || ref.path === currentPath) {
          // already local
        } else {
          try {
            const targetContent = await fileService.readFile(ref.path);
            const targetVars = MarkdownParser.parseVariables(targetContent);
            const found = targetVars.find(v => v.name === ref.varName);
            if (found) {
               // Make it available under both full path and simple name if no collision
               varMap.set(ref.varName, found.value);
            }
          } catch(e) {}
        }
      }

      let expr = source.trim();
      for (const [k, v] of varMap.entries()) {
        expr = expr.replace(new RegExp(`\\b${k}\\b`, 'g'), v);
      }

      try {
        const res = new Function('return ' + expr)();
        setResult(String(res));
      } catch(e) {
        setResult(`Error: ${expr}`);
      }
    };
    compute();
  }, [source, currentPath, vditor]);

  return (
    <span className="inline-flex items-center border border-amber-200 dark:border-amber-900 rounded-md overflow-hidden mx-1 shadow-sm align-middle">
      <span className="bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400 font-mono flex items-center border-r border-amber-200 dark:border-amber-900">
        <Calculator size={12} className="mr-1" />
        {source.trim()}
      </span>
      <span className="px-2 py-0.5 bg-white dark:bg-gray-800 text-amber-700 dark:text-amber-300 font-mono text-sm font-bold">
        {result}
      </span>
    </span>
  );
};

const RefBlock: React.FC<{ source: string, currentPath: string }> = ({ source, currentPath }) => {
  const [val, setVal] = React.useState<string>('...');

  React.useEffect(() => {
    const fetchRef = async () => {
      const parts = source.trim().split('::');
      if (parts.length < 2) {
        setVal('Invalid ref');
        return;
      }
      const targetPath = parts[0] || currentPath;
      const varName = parts[1];

      try {
        const content = await fileService.readFile(targetPath);
        const vars = MarkdownParser.parseVariables(content);
        const found = vars.find(v => v.name === varName);
        if (found) {
          setVal(found.value);
        } else {
          setVal(`Not found: ${varName}`);
        }
      } catch (e) {
        setVal('File error');
      }
    };
    fetchRef();
  }, [source, currentPath]);

  return (
    <span className="inline-flex items-center border border-purple-200 dark:border-purple-900 rounded-md overflow-hidden mx-1 shadow-sm align-middle">
      <span className="bg-purple-50 dark:bg-purple-900/30 px-2 py-0.5 text-xs text-purple-600 dark:text-purple-400 font-mono flex items-center border-r border-purple-200 dark:border-purple-900">
        <LinkIcon size={12} className="mr-1" />
        {source.trim()}
      </span>
      <span className="px-2 py-0.5 bg-white dark:bg-gray-800 text-purple-700 dark:text-purple-300 font-mono text-sm font-bold">
        {val}
      </span>
    </span>
  );
};

export const getCustomRenders = (pathRef: { current: string }) => {
  const handleRender = (Component: React.FC<any>) => (element: HTMLElement, vditor: any) => {
    const codeElements = element.querySelectorAll(`code.language-${Component.name.replace('Block', '').toLowerCase()}`);
    
    codeElements.forEach((el) => {
      if (el.parentElement?.classList.contains('vditor-wysiwyg__pre') || el.parentElement?.classList.contains('vditor-ir__marker--pre')) {
        return;
      }
      const source = el.textContent || '';
      
      let container = el.parentElement?.querySelector('.vditor-custom-render-container') as HTMLElement;
      if (!container) {
         container = document.createElement('div');
         container.className = 'vditor-custom-render-container';
         el.parentElement?.appendChild(container);
         (el as HTMLElement).style.display = 'none';
      }
      
      renderReact(container, <Component source={source} currentPath={pathRef.current} vditor={vditor} />);
    });
  };

  return [
    { language: 'embed', render: handleRender(EmbedBlock) },
    { language: 'var', render: handleRender(VarBlock) },
    { language: 'calc', render: handleRender(CalcBlock) },
    { language: 'ref', render: handleRender(RefBlock) }
  ];
};