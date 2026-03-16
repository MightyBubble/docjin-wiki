﻿import { MarkdownParser } from './markdownParser';
import { fileService } from '../services/api';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface InlineNodeDisplay {
  label: string;
  value: string;
}

interface EmbedSuggestionState {
  suggestions: string[];
  selectedIndex: number;
}

export class InlineTagPlugin {
  private editorElement: HTMLElement;
  private currentPath: string;
  private currentWorkspace: string;
  private onEmbedNavigate: (path: string, heading?: string) => void;
  private availableFilePaths: string[];
  private observer: MutationObserver | null = null;
  private pollTimer: number | null = null;
  private isProcessing = false;
  private hasPendingProcess = false;
  // Use a map to track variable definitions found in the current document pass
  private globalVarMap = new Map<string, string>();

  constructor(
    editorElement: HTMLElement,
    currentPath: string,
    currentWorkspace: string,
    onEmbedNavigate: (path: string, heading?: string) => void,
    availableFilePaths: string[]
  ) {
    this.editorElement = editorElement;
    this.currentPath = currentPath;
    this.currentWorkspace = currentWorkspace;
    this.onEmbedNavigate = onEmbedNavigate;
    this.availableFilePaths = availableFilePaths;
  }

  public init(): boolean {
    if (this.observer) {
      return true;
    }

    const wysiwyg = this.editorElement.querySelector('.vditor-wysiwyg');
    if (!wysiwyg) return false;

    this.observer = new MutationObserver(() => {
      if (this.isProcessing) {
        this.hasPendingProcess = true;
        return;
      }
      this.processDocument();
    });

    this.observer.observe(this.editorElement, {
      characterData: true,
      childList: true,
      subtree: true
    });

    this.processDocument();
    this.pollTimer = window.setInterval(() => {
      if (!this.isProcessing) {
        this.processDocument();
      }
    }, 500);
    return true;
  }

  public destroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
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

  public updateAvailableFilePaths(newPaths: string[]) {
    this.availableFilePaths = newPaths;
  }

  public refresh() {
    if (this.isProcessing) {
      this.hasPendingProcess = true;
      return;
    }
    this.processDocument();
  }

  private getNodeEditorValue(editNode: HTMLElement): string {
    if (editNode instanceof HTMLInputElement) {
      return editNode.value;
    }

    return editNode.textContent || '';
  }

  private setNodeEditorValue(editNode: HTMLElement, value: string) {
    if (editNode instanceof HTMLInputElement) {
      editNode.value = value;
      editNode.setAttribute('value', value);
      return;
    }

    editNode.textContent = value;
  }

  private focusEditableNode(editNode: HTMLElement) {
    window.setTimeout(() => {
      editNode.focus();

      if (editNode instanceof HTMLInputElement) {
        const length = editNode.value.length;
        editNode.setSelectionRange(length, length);
        return;
      }

      const selection = window.getSelection();
      if (!selection) {
        return;
      }

      const range = document.createRange();
      range.selectNodeContents(editNode);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }, 0);
  }

  private parseInlineNodeRaw(rawText: string): { type: string; content: string } | null {
    const match = this.normalizeRawText(rawText).match(/^\{\{(var|calc|ref):\s*([^}]+)\}\}$/);
    if (!match) {
      return null;
    }

    return {
      type: match[1],
      content: match[2],
    };
  }

  private beginNodeEditing(span: HTMLElement, editNode: HTMLElement) {
    span.setAttribute('data-editing', 'true');
    span.setAttribute('contenteditable', 'false');
    this.setNodeEditorValue(editNode, span.getAttribute('data-raw') || this.getNodeEditorValue(editNode));
    this.focusEditableNode(editNode);
  }

  private finishNodeEditing(span: HTMLElement, editNode: HTMLElement, options?: { revert?: boolean }) {
    if (options?.revert) {
      this.setNodeEditorValue(editNode, span.getAttribute('data-raw') || '');
    }

    const currentText = this.normalizeRawText(this.getNodeEditorValue(editNode));
    if (!options?.revert && (!currentText || !this.parseInlineNodeRaw(currentText))) {
      span.setAttribute('data-editing', 'true');
      span.setAttribute('contenteditable', 'false');
      this.focusEditableNode(editNode);
      return false;
    }

    span.setAttribute('data-editing', 'false');
    span.setAttribute('contenteditable', 'false');

    window.setTimeout(() => {
      this.refresh();
    }, 0);

    return true;
  }

  private isolateEditorInput(inputNode: HTMLElement) {
    const stopPropagation = (event: Event) => {
      event.stopPropagation();
    };

    const eventTypes = [
      'mouseup',
      'dblclick',
      'focusin',
      'focusout',
      'keyup',
      'beforeinput',
      'paste',
      'copy',
      'cut',
      'compositionstart',
      'compositionend',
      'selectstart',
    ];

    for (const eventType of eventTypes) {
      inputNode.addEventListener(eventType, stopPropagation);
    }
  }

  private bindNodeEditing(span: HTMLElement, editNode: HTMLElement) {
    this.isolateEditorInput(editNode);

    span.addEventListener('mousedown', (event) => {
      if (event.target === editNode) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.beginNodeEditing(span, editNode);
    });

    editNode.addEventListener('mousedown', (event) => {
      event.stopPropagation();
    });

    editNode.addEventListener('focus', (event) => {
      event.stopPropagation();
      span.setAttribute('data-editing', 'true');
    });

    editNode.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    editNode.addEventListener('keydown', (event) => {
      event.stopPropagation();

      if (event.key === 'Escape') {
        event.preventDefault();
        this.finishNodeEditing(span, editNode, { revert: true });
        editNode.blur();
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        if (this.finishNodeEditing(span, editNode)) {
          editNode.blur();
        }
      }
    });

    editNode.addEventListener('input', (event) => {
      event.stopPropagation();
    });

    editNode.addEventListener('blur', (event) => {
      event.stopPropagation();
      this.finishNodeEditing(span, editNode);
    });
  }

  private applyNodeDisplay(node: HTMLElement, display: InlineNodeDisplay) {
    node.setAttribute('data-has-label', display.label ? 'true' : 'false');
    node.setAttribute('data-label', display.label);
    node.setAttribute('data-value', display.value);
    node.setAttribute('data-result', display.label ? `${display.label} ${display.value}` : display.value);
  }

  private normalizeRawText(value: string): string {
    return value.replace(/[\u00a0\u200b\ufeff]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private getEmbedEditorValue(editNode: HTMLElement): string {
    if (editNode instanceof HTMLInputElement) {
      return editNode.value;
    }

    return editNode.textContent || '';
  }

  private setEmbedEditorValue(editNode: HTMLElement, value: string) {
    if (editNode instanceof HTMLInputElement) {
      editNode.value = value;
      editNode.setAttribute('value', value);
      return;
    }

    editNode.textContent = value;
  }

  private focusEmbedEditor(editNode: HTMLElement) {
    window.setTimeout(() => {
      editNode.focus();

      if (editNode instanceof HTMLInputElement) {
        const length = editNode.value.length;
        editNode.setSelectionRange(length, length);
      }
    }, 0);
  }

  private parseEmbedPath(rawText: string): string | null {
    const match = rawText.match(/^\{\{embed:\s*([^}]+)\}\}$/);
    return match ? match[1].trim() : null;
  }

  private findStandaloneEmbedHost(node: Text, rawText: string): HTMLElement | null {
    const paragraph = node.parentElement?.closest('p');
    if (!paragraph) {
      return null;
    }

    const normalizedBlockText = this.normalizeRawText(paragraph.textContent || '');
    if (normalizedBlockText !== this.normalizeRawText(rawText)) {
      return null;
    }

    return paragraph as HTMLElement;
  }

  private replaceStandaloneEmbed(
    host: HTMLElement,
    rawText: string,
    pathWithAnchor: string,
    depth: number,
    editable: boolean
  ) {
    const { embedDiv, contentDiv } = this.createEmbedNode(rawText, pathWithAnchor, depth, editable);
    host.replaceWith(embedDiv);
    this.loadEmbed(pathWithAnchor, contentDiv, depth);
  }

  private getEmbedSuggestions(rawText: string): EmbedSuggestionState {
    const match = rawText.match(/^\{\{embed:\s*([^#}]*)/);
    const partialPath = match ? match[1].trim().toLowerCase() : '';

    if (!partialPath) {
      return {
        suggestions: this.availableFilePaths.slice(0, 8),
        selectedIndex: 0,
      };
    }

    const suggestions = this.availableFilePaths
      .filter((path) => path.toLowerCase().includes(partialPath))
      .slice(0, 8);

    return {
      suggestions,
      selectedIndex: suggestions.length > 0 ? 0 : -1,
    };
  }

  private applyEmbedSuggestion(rawText: string, selectedPath: string): string {
    const match = rawText.match(/^\{\{embed:\s*([^#}]*)?(#[^}]*)?\}\}$/);
    if (!match) {
      return `{{embed: ${selectedPath}}}`;
    }

    const anchor = match[2] || '';
    return `{{embed: ${selectedPath}${anchor}}}`;
  }

  private async processDocument() {
    this.isProcessing = true;
    try {
      const wysiwyg = this.editorElement.querySelector('.vditor-wysiwyg');
      if (!wysiwyg) return;

      // 1. Pre-scan ALL vars from the DOM text to build global map
      this.globalVarMap.clear();
      const existingVarNodes = Array.from(wysiwyg.querySelectorAll('.dj-node[data-type="var"]')) as HTMLElement[];
      for (const varNode of existingVarNodes) {
        const editNode = varNode.querySelector('.dj-node-edit') as HTMLElement | null;
        const rawVarText = this.normalizeRawText(
          editNode ? this.getNodeEditorValue(editNode) : (varNode.getAttribute('data-raw') || '')
        );
        const match = rawVarText.match(/^\{\{var:\s*([^=}]+)=([^}]+)\}\}$/);
        if (match) {
          this.globalVarMap.set(match[1].trim(), match[2].trim());
        }
      }

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
        const standalonePath = this.parseEmbedPath(this.normalizeRawText(text));
        const standaloneHost = standalonePath ? this.findStandaloneEmbedHost(node, text) : null;
        if (standalonePath && standaloneHost) {
          this.replaceStandaloneEmbed(standaloneHost, this.normalizeRawText(text), standalonePath, 0, true);
          continue;
        }

        mainRegex.lastIndex = 0;
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
             const { embedDiv, contentDiv } = this.createEmbedNode(match[0], content, 0, true);
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
             span.setAttribute('data-editing', 'false');

             const editSpan = document.createElement('input');
             editSpan.className = 'dj-node-edit';
             editSpan.type = 'text';
             editSpan.spellcheck = false;
             this.setNodeEditorValue(editSpan, match[0]);
             
             this.bindNodeEditing(span, editSpan);
             span.appendChild(editSpan);
             fragment.appendChild(span);

             // Calculate result immediately
             const result = await this.calculateDisplay(type, content);
             this.applyNodeDisplay(span, result);
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

      const existingNodes = Array.from(wysiwyg.querySelectorAll('.dj-node')) as HTMLElement[];
      const stableNodes: Array<{ node: HTMLElement; type: 'ref' | 'calc'; content: string }> = [];

      for (const nodeEl of existingNodes) {
          if (nodeEl.getAttribute('data-editing') === 'true') {
              continue;
          }

          const editSpan = nodeEl.querySelector('.dj-node-edit');
          if (!editSpan) continue;

          const currentText = this.normalizeRawText(this.getNodeEditorValue(editSpan as HTMLElement));
          const rawText = this.normalizeRawText(nodeEl.getAttribute('data-raw') || '');
          if (currentText !== rawText) {
              nodeEl.setAttribute('data-raw', currentText);
              mainRegex.lastIndex = 0;
              const match = mainRegex.exec(currentText);
              if (match) {
                  if (match[1] === 'embed') {
                      const { embedDiv, contentDiv } = this.createEmbedNode(currentText, match[2], 0, true);
                      nodeEl.replaceWith(embedDiv);
                      this.loadEmbed(match[2], contentDiv);
                      continue;
                  }
                  nodeEl.className = `dj-node dj-${match[1]}`;
                  nodeEl.setAttribute('data-type', match[1]);
                  const result = await this.calculateDisplay(match[1], match[2]);
                  this.applyNodeDisplay(nodeEl, result);
              } else {
                  this.applyNodeDisplay(nodeEl, { label: '', value: '...' });
              }
              continue;
          }

          const type = nodeEl.getAttribute('data-type');
          if (type === 'ref' || type === 'calc') {
              mainRegex.lastIndex = 0;
              const match = mainRegex.exec(currentText);
              if (match) {
                  stableNodes.push({ node: nodeEl, type: type as 'ref' | 'calc', content: match[2] });
              }
          }
      }

      for (const item of stableNodes) {
          if (item.type !== 'ref') continue;
          const result = await this.calculateDisplay('ref', item.content);
          this.applyNodeDisplay(item.node, result);
      }

      for (const item of stableNodes) {
          if (item.type !== 'calc') continue;
          const result = await this.calculateDisplay('calc', item.content);
          this.applyNodeDisplay(item.node, result);
      }

      const existingEmbeds = Array.from(wysiwyg.querySelectorAll('.dj-embed')) as HTMLElement[];
      for (const embedNode of existingEmbeds) {
          if (embedNode.getAttribute('data-editing') === 'true') {
              continue;
          }

          const editNode = embedNode.querySelector('.dj-embed-edit');
          if (!editNode) {
              continue;
          }

          const currentText = this.normalizeRawText(this.getEmbedEditorValue(editNode as HTMLElement));
          const rawText = this.normalizeRawText(embedNode.getAttribute('data-raw') || '');
          if (currentText && currentText !== rawText) {
              this.syncEditedEmbed(embedNode, currentText);
          }
      }

    } finally {
      window.setTimeout(() => {
        this.isProcessing = false;
        if (this.hasPendingProcess) {
          this.hasPendingProcess = false;
          this.processDocument();
        }
      }, 0);
      }
  }

  private syncEditedEmbed(embedNode: HTMLElement, rawText: string) {
      const pathWithAnchor = this.parseEmbedPath(rawText);
      if (!pathWithAnchor) {
          embedNode.setAttribute('data-raw', rawText);
          embedNode.setAttribute('data-invalid', 'true');
          const errorNode = embedNode.querySelector('.dj-embed-error');
          if (errorNode) {
              errorNode.textContent = 'Invalid embed syntax. Use {{embed: path}} or {{embed: path#heading}}.';
          }
          return false;
      }

      const depth = Number.parseInt(embedNode.getAttribute('data-depth') || '0', 10) || 0;
      const editable = embedNode.getAttribute('data-editable') === 'true';
      const { embedDiv, contentDiv } = this.createEmbedNode(rawText, pathWithAnchor, depth, editable);
      embedNode.replaceWith(embedDiv);
      this.loadEmbed(pathWithAnchor, contentDiv, depth);
      return true;
  }

  private renderEmbedSuggestions(
      rawText: string,
      suggestionsHost: HTMLElement,
      state: EmbedSuggestionState,
      onPick: (path: string) => void
  ) {
      suggestionsHost.innerHTML = '';
      if (state.suggestions.length === 0) {
          suggestionsHost.hidden = true;
          return;
      }

      const currentPath = this.parseEmbedPath(rawText)?.split('#')[0]?.trim() || '';

      state.suggestions.forEach((path, index) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'dj-embed-suggestion';
          if (index === state.selectedIndex) {
              button.classList.add('is-active');
          }
          button.textContent = path;
          button.title = path;
          if (path === currentPath) {
              button.classList.add('is-current');
          }
          button.addEventListener('mousedown', (event) => {
              event.preventDefault();
              event.stopPropagation();
              onPick(path);
          });
          suggestionsHost.appendChild(button);
      });

      suggestionsHost.hidden = false;
  }

  private createEmbedNode(raw: string, pathWithAnchor: string, depth = 0, editable = true) {
      const [rawPath, rawAnchor] = pathWithAnchor.split('#');
      const path = rawPath.trim();
      const anchor = rawAnchor?.trim();

      const embedDiv = document.createElement('div');
      embedDiv.className = depth > 0 ? 'dj-embed dj-embed-nested' : 'dj-embed';
      embedDiv.setAttribute('contenteditable', 'false');
      if (editable && depth === 0) {
          embedDiv.setAttribute('data-block', '0');
      }
      embedDiv.setAttribute('data-raw', raw);
      embedDiv.setAttribute('data-depth', String(depth));
      embedDiv.setAttribute('data-editable', editable ? 'true' : 'false');
      embedDiv.setAttribute('data-editing', 'false');
      embedDiv.setAttribute('data-invalid', 'false');

      const headerDiv = document.createElement('div');
      headerDiv.className = 'dj-embed-header';

      const metaDiv = document.createElement('div');
      metaDiv.className = 'dj-embed-meta';

      const labelSpan = document.createElement('span');
      labelSpan.className = 'dj-embed-label';
      labelSpan.textContent = anchor ? 'Embedded block' : 'Embedded document';

      const sourceButton = document.createElement('button');
      sourceButton.type = 'button';
      sourceButton.className = 'dj-embed-source';
      sourceButton.textContent = anchor ? `${path}#${anchor}` : path;
      sourceButton.title = editable ? 'Click to edit embed source' : sourceButton.textContent;

      metaDiv.appendChild(labelSpan);
      metaDiv.appendChild(sourceButton);

      const actionGroup = document.createElement('div');
      actionGroup.className = 'dj-embed-actions';

      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'dj-embed-open';
      openButton.textContent = anchor ? 'Open block' : 'Open doc';
      openButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.onEmbedNavigate(path, anchor);
      });

      actionGroup.appendChild(openButton);
      headerDiv.appendChild(metaDiv);
      headerDiv.appendChild(actionGroup);

      const editDiv = document.createElement('input');
      editDiv.className = 'dj-embed-edit';
      editDiv.type = 'text';
      editDiv.spellcheck = false;
      editDiv.disabled = !editable;
      this.isolateEditorInput(editDiv);
      this.setEmbedEditorValue(editDiv, raw);

      const suggestionsDiv = document.createElement('div');
      suggestionsDiv.className = 'dj-embed-suggestions';
      suggestionsDiv.hidden = true;

      const errorDiv = document.createElement('div');
      errorDiv.className = 'dj-embed-error';

      const contentDiv = document.createElement('div');
      contentDiv.className = 'dj-embed-content dj-markdown';

      if (editable) {
          let suggestionState: EmbedSuggestionState = { suggestions: [], selectedIndex: -1 };
          let blurTimer: number | null = null;
          const pickSuggestion = (selectedPath: string) => {
              const currentRaw = this.normalizeRawText(this.getEmbedEditorValue(editDiv));
              const nextRaw = this.applyEmbedSuggestion(currentRaw, selectedPath);
              this.setEmbedEditorValue(editDiv, nextRaw);
              suggestionState = this.getEmbedSuggestions(nextRaw);
              this.renderEmbedSuggestions(nextRaw, suggestionsDiv, suggestionState, pickSuggestion);
              this.focusEmbedEditor(editDiv);
          };

          const refreshSuggestions = () => {
              const currentRaw = this.normalizeRawText(this.getEmbedEditorValue(editDiv));
              embedDiv.setAttribute('data-raw', currentRaw || raw);
              embedDiv.setAttribute('data-invalid', 'false');
              errorDiv.textContent = '';
              suggestionState = this.getEmbedSuggestions(currentRaw);
              this.renderEmbedSuggestions(currentRaw, suggestionsDiv, suggestionState, pickSuggestion);
          };

          const beginEditing = () => {
              embedDiv.setAttribute('data-editing', 'true');
              this.setEmbedEditorValue(editDiv, embedDiv.getAttribute('data-raw') || raw);
              refreshSuggestions();
              this.focusEmbedEditor(editDiv);
          };

          const commitEditing = () => {
              if (blurTimer !== null) {
                  window.clearTimeout(blurTimer);
                  blurTimer = null;
              }
              embedDiv.setAttribute('data-editing', 'false');
              suggestionsDiv.hidden = true;
              const currentRaw = this.normalizeRawText(this.getEmbedEditorValue(editDiv));
              if (!currentRaw) {
                  this.setEmbedEditorValue(editDiv, embedDiv.getAttribute('data-raw') || raw);
                  return;
              }
              const synced = this.syncEditedEmbed(embedDiv, currentRaw);
              if (!synced) {
                  embedDiv.setAttribute('data-editing', 'true');
                  this.focusEmbedEditor(editDiv);
              }
          };

          sourceButton.addEventListener('click', (event) => {
              event.preventDefault();
              event.stopPropagation();
              beginEditing();
          });

          editDiv.addEventListener('mousedown', (event) => {
              event.stopPropagation();
          });

          editDiv.addEventListener('click', (event) => {
              event.stopPropagation();
          });

          editDiv.addEventListener('focus', (event) => {
              event.stopPropagation();
              embedDiv.setAttribute('data-editing', 'true');
              refreshSuggestions();
          });

          editDiv.addEventListener('input', (event) => {
              event.stopPropagation();
              refreshSuggestions();
          });

          editDiv.addEventListener('keydown', (event) => {
              event.stopPropagation();
              if (event.key === 'Escape') {
                  event.preventDefault();
                  embedDiv.setAttribute('data-editing', 'false');
                  suggestionsDiv.hidden = true;
                  this.setEmbedEditorValue(editDiv, embedDiv.getAttribute('data-raw') || raw);
                  editDiv.blur();
                  return;
              }

              if (event.key === 'ArrowDown' && suggestionState.suggestions.length > 0) {
                  event.preventDefault();
                  suggestionState.selectedIndex =
                      (suggestionState.selectedIndex + 1) % suggestionState.suggestions.length;
                  this.renderEmbedSuggestions(
                      this.normalizeRawText(this.getEmbedEditorValue(editDiv)),
                      suggestionsDiv,
                      suggestionState,
                      pickSuggestion
                  );
                  return;
              }

              if (event.key === 'ArrowUp' && suggestionState.suggestions.length > 0) {
                  event.preventDefault();
                  suggestionState.selectedIndex =
                      (suggestionState.selectedIndex - 1 + suggestionState.suggestions.length) %
                      suggestionState.suggestions.length;
                  this.renderEmbedSuggestions(
                      this.normalizeRawText(this.getEmbedEditorValue(editDiv)),
                      suggestionsDiv,
                      suggestionState,
                      pickSuggestion
                  );
                  return;
              }

              if (event.key === 'Enter') {
                  if (suggestionState.selectedIndex >= 0 && suggestionState.suggestions[suggestionState.selectedIndex]) {
                      event.preventDefault();
                      const nextRaw = this.applyEmbedSuggestion(
                          this.normalizeRawText(this.getEmbedEditorValue(editDiv)),
                          suggestionState.suggestions[suggestionState.selectedIndex]
                      );
                      this.setEmbedEditorValue(editDiv, nextRaw);
                      suggestionState = this.getEmbedSuggestions(nextRaw);
                      this.renderEmbedSuggestions(nextRaw, suggestionsDiv, suggestionState, pickSuggestion);
                      if (nextRaw === this.normalizeRawText(this.getEmbedEditorValue(editDiv))) {
                          editDiv.blur();
                      }
                      return;
                  }

                  event.preventDefault();
                  editDiv.blur();
              }
          });

          editDiv.addEventListener('blur', (event) => {
              event.stopPropagation();
              blurTimer = window.setTimeout(() => {
                  commitEditing();
              }, 120);
          });
      } else {
          sourceButton.disabled = true;
      }

      embedDiv.appendChild(headerDiv);
      if (editable) {
          embedDiv.appendChild(editDiv);
          embedDiv.appendChild(suggestionsDiv);
          embedDiv.appendChild(errorDiv);
      }
      embedDiv.appendChild(contentDiv);

      return { embedDiv, contentDiv };
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
          const embedVarMap = new Map<string, string>();
          for (const variable of MarkdownParser.parseVariables(finalContent)) {
            embedVarMap.set(variable.name, variable.value);
          }
          this.processNodesSync(container, depth + 1, embedVarMap, path);

      } catch {
          container.innerHTML = `<span class="text-red-500 italic">Error loading embed: ${path}</span>`;
      }
  }

  // A synchronous or scoped version of node processing just for rendering inner content of embeds
  private processNodesSync(root: HTMLElement, currentDepth: number, localVarMap?: Map<string, string>, sourcePath?: string) {
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
        const standalonePath = this.parseEmbedPath(this.normalizeRawText(text));
        const standaloneHost = standalonePath ? this.findStandaloneEmbedHost(node, text) : null;
        if (standalonePath && standaloneHost) {
          this.replaceStandaloneEmbed(standaloneHost, this.normalizeRawText(text), standalonePath, currentDepth, false);
          continue;
        }

        mainRegex.lastIndex = 0;
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
             const { embedDiv, contentDiv } = this.createEmbedNode(match[0], content, currentDepth, false);
             fragment.appendChild(embedDiv);

             // Recursive load
             this.loadEmbed(content, contentDiv, currentDepth);
          } else {
             const span = document.createElement('span');
             span.className = `dj-node dj-${type}`;
             span.setAttribute('data-type', type);
             
             // In read-only mode (inside embed), we just show the pill, no edit span
             this.applyNodeDisplay(span, { label: '', value: '...' });
             fragment.appendChild(span);

             // Calculate result
             this.calculateDisplay(type, content, localVarMap, sourcePath).then(result => {
                 this.applyNodeDisplay(span, result);
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

  private async calculateDisplay(type: string, content: string, localVarMap?: Map<string, string>, sourcePath?: string): Promise<InlineNodeDisplay> {
      if (type === 'var') {
          const parts = content.split('=');
          if (parts.length >= 2) {
              const name = parts[0].trim();
              const value = parts.slice(1).join('=').trim();
              if (localVarMap) {
                localVarMap.set(name, value);
              } else {
                this.globalVarMap.set(name, value);
              }
              return { label: name, value };
          }
          return { label: '', value: content.trim() };
      }
      
      if (type === 'ref') {
          const parts = content.split('::');
          const path = parts.length > 1 ? parts[0].trim() : '.';
          const varName = parts.length > 1 ? parts[1].trim() : parts[0].trim();
          const isLocalPath = path === '.' || !path || (sourcePath ? path === sourcePath : path === this.currentPath);
          
          if (isLocalPath) {
              const localValue = localVarMap?.get(varName);
              const globalValue = this.globalVarMap.get(varName);
              const resolved = localValue ?? globalValue ?? '?';
              if (resolved !== '?') {
                if (localVarMap) {
                  localVarMap.set(varName, resolved);
                }
                this.globalVarMap.set(varName, resolved);
              }
              return { label: varName, value: resolved };
          } else {
             try {
                const fileContent = await fileService.readFile(path, this.currentWorkspace);
                const vars = MarkdownParser.parseVariables(fileContent);
                const found = vars.find(v => v.name === varName);
                if (found) {
                   if (localVarMap) {
                     localVarMap.set(varName, found.value);
                   }
                   this.globalVarMap.set(varName, found.value);
                   return { label: varName, value: found.value };
                }
             } catch {
                return { label: varName, value: '?' };
             }
             return { label: varName, value: '?' };
          }
      }

      if (type === 'calc') {
          let expr = content;
          const mergedVars = new Map(this.globalVarMap);
          if (localVarMap) {
            for (const [k, v] of localVarMap.entries()) {
              mergedVars.set(k, v);
            }
          }
          for (const [k, v] of mergedVars.entries()) {
              expr = expr.replace(new RegExp(`\\b${k}\\b`, 'g'), v);
          }
          try {
              const res = new Function('return ' + expr)();
              return { label: '', value: String(res) };
          } catch {
              return { label: '', value: 'NaN' };
          }
      }
      return { label: '', value: content.trim() };
  }
}
