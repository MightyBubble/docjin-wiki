import { MarkdownParser } from './markdownParser';
import { fileService } from '../services/api';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export class InlineTagPlugin {
  private editorElement: HTMLElement;
  private currentPath: string;
  private currentWorkspace: string;
  private observer: MutationObserver | null = null;
  private isProcessing = false;
  // Use a map to track variable definitions found in the current document pass
  private globalVarMap = new Map<string, string>();

  constructor(editorElement: HTMLElement, currentPath: string, currentWorkspace: string) {
    this.editorElement = editorElement;
    this.currentPath = currentPath;
    this.currentWorkspace = currentWorkspace;
  }

  public init(): boolean {
    if (this.observer) {
      return true;
    }

    const wysiwyg = this.editorElement.querySelector('.vditor-wysiwyg');
    if (!wysiwyg) return false;

    this.observer = new MutationObserver(() => {
      if (this.isProcessing) return;
      this.processDocument();
    });

    this.observer.observe(wysiwyg, {
      characterData: true,
      childList: true,
      subtree: true
    });

    this.processDocument();
    return true;
  }

  public destroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
  }

  public updatePath(newPath: string) {
    this.currentPath = newPath;
    this.processDocument();
  }

  public updateWorkspace(newWorkspace: string) {
    this.currentWorkspace = newWorkspace;
    this.processDocument();
  }

  private async processDocument() {
    this.isProcessing = true;
    try {
      const wysiwyg = this.editorElement.querySelector('.vditor-wysiwyg');
      if (!wysiwyg) return;

      // 1. Pre-scan ALL vars from the DOM text to build global map
      this.globalVarMap.clear();
      const textWalker = document.createTreeWalker(wysiwyg, NodeFilter.SHOW_TEXT, null);
      let textNode;
      const varRegex = /\{\{var:\s*([^=}]+)=([^}]+)\}\}/g;
      
      while ((textNode = textWalker.nextNode())) {
        const text = textNode.textContent || '';
        let match;
        while ((match = varRegex.exec(text)) !== null) {
            const name = match[1].trim();
            const val = match[2].trim();
            this.globalVarMap.set(name, val);
        }
      }

      // 2. Process nodes to create UI
      const nodesToReplace: Text[] = [];
      const walker = document.createTreeWalker(wysiwyg, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
            // Do not replace inside already processed nodes or code blocks
            if (node.parentElement?.closest('.dj-node') || node.parentElement?.closest('.dj-embed') || node.parentElement?.closest('code')) {
                return NodeFilter.FILTER_REJECT;
            }
            if (node.textContent && node.textContent.includes('{{') && node.textContent.includes('}}')) {
                return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_SKIP;
        }
      });

      while ((textNode = walker.nextNode())) {
        nodesToReplace.push(textNode as Text);
      }

      const mainRegex = /\{\{(var|calc|ref|embed):\s*([^}]+)\}\}/g;

      for (const node of nodesToReplace) {
        const text = node.textContent || '';
        if (!mainRegex.test(text)) continue;

        mainRegex.lastIndex = 0;
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        let match;
        let hasChanges = false;

        while ((match = mainRegex.exec(text)) !== null) {
          hasChanges = true;
          if (match.index > lastIndex) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
          }

          const type = match[1];
          const content = match[2];

          if (type === 'embed') {
             // Create a block element for embed
             const embedDiv = document.createElement('div');
             embedDiv.className = 'dj-embed';
             embedDiv.setAttribute('contenteditable', 'false');
             embedDiv.setAttribute('data-raw', match[0]);
             
             const contentDiv = document.createElement('div');
             contentDiv.className = 'dj-embed-content';
             embedDiv.appendChild(contentDiv);
             fragment.appendChild(embedDiv);

             // Kick off load async
             this.loadEmbed(content, contentDiv);
          } else {
             // Create span capsule for var/ref/calc
             const span = document.createElement('span');
             span.className = `dj-node dj-${type}`;
             span.setAttribute('data-type', type);
             span.setAttribute('data-raw', match[0]);
             span.setAttribute('contenteditable', 'false');

             const editSpan = document.createElement('span');
             editSpan.className = 'dj-node-edit';
             editSpan.setAttribute('contenteditable', 'true');
             editSpan.textContent = match[0];
             
             span.appendChild(editSpan);
             fragment.appendChild(span);

             // Calculate result immediately
             const result = await this.calculateResult(type, content);
             span.setAttribute('data-result', result);
          }

          lastIndex = mainRegex.lastIndex;
        }

        if (hasChanges) {
          if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
          }
          node.parentNode?.replaceChild(fragment, node);
        }
      }

      // Also update existing nodes if they were modified by the user
      const existingNodes = wysiwyg.querySelectorAll('.dj-node');
      existingNodes.forEach(async (nodeEl) => {
          const editSpan = nodeEl.querySelector('.dj-node-edit');
          if (editSpan) {
              const currentText = editSpan.textContent || '';
              const rawText = nodeEl.getAttribute('data-raw');
              if (currentText !== rawText) {
                  // User edited
                  nodeEl.setAttribute('data-raw', currentText);
                  mainRegex.lastIndex = 0;
                  const match = mainRegex.exec(currentText);
                  if (match) {
                      nodeEl.className = `dj-node dj-${match[1]}`;
                      nodeEl.setAttribute('data-type', match[1]);
                      const result = await this.calculateResult(match[1], match[2]);
                      nodeEl.setAttribute('data-result', result);
                  } else {
                      nodeEl.setAttribute('data-result', '...');
                  }
              } else {
                  // Text same, but value might have changed (e.g. calc re-evaluate due to global var update)
                  const type = nodeEl.getAttribute('data-type');
                  if (type === 'calc' || type === 'ref') {
                      mainRegex.lastIndex = 0;
                      const match = mainRegex.exec(currentText);
                      if (match) {
                          const result = await this.calculateResult(type, match[2]);
                          nodeEl.setAttribute('data-result', result);
                      }
                  }
              }
          }
      });

    } finally {
      setTimeout(() => { this.isProcessing = false; }, 0);
    }
  }

  private async loadEmbed(pathWithAnchor: string, container: HTMLElement, depth: number = 0) {
      const maxDepth = 3;
      if (depth >= maxDepth) {
          container.innerHTML = `<div class="text-red-500 italic">Error: Max embed depth reached (${maxDepth})</div>`;
          return;
      }

      const parts = pathWithAnchor.split('#');
      const path = parts[0].trim();
      const anchor = parts[1]?.trim();
      
      container.innerHTML = '<span class="text-gray-400 italic">Loading...</span>';
      try {
          const content = await fileService.readFile(path, this.currentWorkspace);
          let finalContent = content;
          if (anchor) {
              finalContent = MarkdownParser.extractSection(content, anchor);
          }
          
          // Render markdown to HTML
          const rawHtml = await marked.parse(finalContent);
          const cleanHtml = DOMPurify.sanitize(rawHtml);
          container.innerHTML = cleanHtml;
          
          // Process nested tags inside the embed!
          // We can just create a temporary div and reuse our main tag parsing logic,
          // but that would mutate the innerHTML. Since we just injected it, it's safe.
          this.processNodesSync(container, depth + 1);

      } catch (e) {
          container.innerHTML = `<span class="text-red-500 italic">Error loading embed: ${path}</span>`;
      }
  }

  // A synchronous or scoped version of node processing just for rendering inner content of embeds
  private processNodesSync(root: HTMLElement, currentDepth: number) {
      // Very similar to processDocument but without mutating the main editor DOM state
      // Just plain regex replace on text nodes.
      const nodesToReplace: Text[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
            if (node.parentElement?.closest('code')) return NodeFilter.FILTER_REJECT;
            if (node.textContent && node.textContent.includes('{{') && node.textContent.includes('}}')) {
                return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_SKIP;
        }
      });

      let textNode;
      while ((textNode = walker.nextNode())) {
        nodesToReplace.push(textNode as Text);
      }

      const mainRegex = /\{\{(var|calc|ref|embed):\s*([^}]+)\}\}/g;

      for (const node of nodesToReplace) {
        const text = node.textContent || '';
        if (!mainRegex.test(text)) continue;

        mainRegex.lastIndex = 0;
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        let match;
        let hasChanges = false;

        while ((match = mainRegex.exec(text)) !== null) {
          hasChanges = true;
          if (match.index > lastIndex) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
          }

          const type = match[1];
          const content = match[2];

          if (type === 'embed') {
             const embedDiv = document.createElement('div');
             embedDiv.className = 'dj-embed ml-4 border-l-2 border-blue-200 pl-4'; // Add indentation for nested
             const contentDiv = document.createElement('div');
             contentDiv.className = 'dj-embed-content';
             embedDiv.appendChild(contentDiv);
             fragment.appendChild(embedDiv);

             // Recursive load
             this.loadEmbed(content, contentDiv, currentDepth);
          } else {
             const span = document.createElement('span');
             span.className = `dj-node dj-${type}`;
             span.setAttribute('data-type', type);
             
             // In read-only mode (inside embed), we just show the pill, no edit span
             span.setAttribute('data-result', '...'); 
             fragment.appendChild(span);

             // Calculate result
             this.calculateResult(type, content).then(result => {
                 span.setAttribute('data-result', result);
             });
          }

          lastIndex = mainRegex.lastIndex;
        }

        if (hasChanges) {
          if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
          }
          node.parentNode?.replaceChild(fragment, node);
        }
      }
  }

  private async calculateResult(type: string, content: string): Promise<string> {
      if (type === 'var') {
          const parts = content.split('=');
          if (parts.length >= 2) return `饾憮 ${parts[0].trim()} = ${parts.slice(1).join('=').trim()}`;
          return content;
      }
      
      if (type === 'ref') {
          const parts = content.split('::');
          const path = parts.length > 1 ? parts[0].trim() : '.';
          const varName = parts.length > 1 ? parts[1].trim() : parts[0].trim();
          
          if (path === '.' || path === this.currentPath || !path) {
              return `鈫?${this.globalVarMap.get(varName) || '?'}`;
          } else {
             try {
                const fileContent = await fileService.readFile(path, this.currentWorkspace);
                const vars = MarkdownParser.parseVariables(fileContent);
                const found = vars.find(v => v.name === varName);
                if (found) {
                   return `鈫?${found.value}`;
                }
             } catch(e) {}
             return `鈫??`;
          }
      }

      if (type === 'calc') {
          let expr = content;
          for (const [k, v] of this.globalVarMap.entries()) {
              expr = expr.replace(new RegExp(`\\b${k}\\b`, 'g'), v);
          }
          try {
              const res = new Function('return ' + expr)();
              return `鈭?${res}`;
          } catch (e) {
              return 'calc error';
          }
      }
      return content;
  }
}

