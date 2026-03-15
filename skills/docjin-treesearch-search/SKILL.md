---
name: docjin-treesearch-search
description: Use the real TreeSearch integration in Docjin to search, build, refresh, inspect, or clear workspace indexes. Use when a user asks to find content in the Docjin wiki, verify search behavior, or extend the TreeSearch API or indexing pipeline.
---

# Docjin TreeSearch Search

## Overview

This skill tells the agent how to use and extend Docjin's real `pytreesearch` integration.
Use it for Docjin wiki retrieval work, not for custom fallback search engines.

## Rules

- Use real TreeSearch only. Do not replace it with hand-rolled lexical search or a fake compatibility layer.
- Keep the Node server as the API surface and the Python bridge as the TreeSearch executor.
- Treat the workspace index as persistent state under `server/workspaces/<workspace>/.docjin/treesearch/`.
- Preserve jumpable result paths so hits can be mapped back to the original workspace files.

## Core Files

- `server/src/treeSearchService.ts`
- `server/scripts/treesearch_query.py`
- `server/src/index.ts`
- `client/src/components/SearchPanel.tsx`
- `client/src/services/api.ts`

## Workflow

1. Inspect current API and index state first.
   - `GET /api/search/index/status`
   - `GET /api/search/index/config`
   - `GET /api/search/index/files`

2. Use or extend the persistent index lifecycle.
   - Build: `POST /api/search/index/build`
   - Refresh: `POST /api/search/index/refresh`
   - Clear: `DELETE /api/search/index`

3. Query through the real search endpoint.
   - `GET /api/search/tree`
   - Pass TreeSearch search parameters through the API instead of inventing parallel flags.

4. When changing behavior, keep both layers aligned.
   - Node service owns workspace scanning, metadata, and HTTP contracts.
   - Python bridge owns TreeSearch build/search execution.

5. Verify with real HTTP calls, not just unit reasoning.
   - Build index
   - Search a known term
   - Search a nonsense term
   - Confirm status is not dirty after refresh

## API Surface

Read [references/api-endpoints.md](references/api-endpoints.md) before changing the API.

## Acceptance

- A known query returns hit paths and node titles from the workspace.
- A nonsense query returns zero hits.
- `status`, `files`, and `config` endpoints stay consistent with the built index.
- No custom fallback search path is introduced.
