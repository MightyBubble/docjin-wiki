

export interface ParsedVariable {
  name: string;
  value: string;
}

export interface ParsedReference {
  path: string;
  varName: string;
  originalText: string;
}

export class MarkdownParser {
  // Extract {{var:name=value}}
  static parseVariables(content: string): ParsedVariable[] {
    const vars: ParsedVariable[] = [];
    // Match both raw {{var:X=Y}} and wrapped <span class="dj-node-edit">{{var:X=Y}}</span>
    const regex = /\{\{var:\s*([^=}]+)=([^}]+)\}\}/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      vars.push({ name: match[1].trim(), value: match[2].trim() });
    }
    return vars;
  }

  // Extract {{ref:path::var}} or {{ref:var}}
  static parseReferences(content: string): ParsedReference[] {
    const refs: ParsedReference[] = [];
    const regex = /\{\{ref:\s*([^}]+)\}\}/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const inner = match[1].trim();
      const parts = inner.split('::');
      if (parts.length === 2) {
          refs.push({ path: parts[0].trim(), varName: parts[1].trim(), originalText: match[0] });
      } else if (parts.length === 1) {
          refs.push({ path: '.', varName: parts[0].trim(), originalText: match[0] });
      }
    }
    return refs;
  }

  static extractSection(content: string, heading: string): string {
    const escapedHeading = heading.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const headingRegex = new RegExp('^(#{1,6})\\s+' + escapedHeading + '\\s*$', 'm');
    const match = content.match(headingRegex);
    if (!match) return `*[Heading "${heading}" not found]*`;

    const level = match[1].length;
    const startIndex = match.index!;

    const nextHeadingRegex = new RegExp('^#{1,' + level + '}\\s+', 'm');
    const remainingContent = content.substring(startIndex + match[0].length);
    const nextMatch = remainingContent.match(nextHeadingRegex);

    if (nextMatch) {
      return content.substring(startIndex, startIndex + match[0].length + nextMatch.index!).trim();
    } else {
      return content.substring(startIndex).trim();
    }
  }

  // Restore HTML wrappers back to pure {{...}} before saving
  static cleanMarkdownBeforeSave(htmlOrMd: string): string {
    let cleaned = htmlOrMd.replace(/<span[^>]*class="dj-node"[^>]*>.*?<span[^>]*class="dj-node-edit"[^>]*>(\{\{.*?\}\})<\/span>.*?<\/span>/g, '$1');
    cleaned = cleaned.replace(/<span[^>]*class="dj-node"[^>]*>(\{\{.*?\}\})<\/span>/g, '$1');
    
    // Clean embed divs
    cleaned = cleaned.replace(/<div[^>]*class="dj-embed"[^>]*data-raw="(\{\{.*?\}\})"[^>]*>.*?<\/div>/g, '$1');
    cleaned = cleaned.replace(/<div[^>]*class="dj-embed"[^>]*>.*?<div[^>]*class="dj-embed-content"[^>]*>.*?<\/div>.*?<\/div>/g, '');
    
    return cleaned;
  }
}
