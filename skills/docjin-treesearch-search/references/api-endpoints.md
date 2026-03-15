# Docjin TreeSearch API

## Endpoints

### `GET /api/search/tree`

Use for live retrieval against the persistent TreeSearch index.

Query params:
- `workspace`
- `q`
- `topKDocs`
- `maxNodesPerDoc`
- `includeAncestors`
- `textMode`: `full | summary | none`
- `mergeStrategy`: `interleave | per_doc | global_score`
- `autoBuild`
- `rebuild`

Returns:
- `query`
- `documents`
- `flatNodes`
- `index`

### `GET /api/search/index/status`

Returns:
- `exists`
- `dirty`
- `sourceCount`
- `indexedCount`
- `lastBuiltAt`
- `indexDir`
- `dbPath`
- `stagedDir`
- `addedPaths`
- `removedPaths`
- `changedPaths`

### `GET /api/search/index/files`

Returns the indexed source map:
- original workspace path
- original absolute path
- staged unique file path
- display doc name
- file size
- mtime

### `GET /api/search/index/config`

Returns:
- python command
- bridge script path
- supported file extensions
- ignored directories
- supported `textMode` values
- supported `mergeStrategy` values
- default search behavior
- current index status

### `POST /api/search/index/build`

Build or rebuild the persistent TreeSearch index.

Body:
- `workspace`
- `force`

### `POST /api/search/index/refresh`

Refresh the index from current workspace and mounts.

Body:
- `workspace`

### `DELETE /api/search/index`

Clear the persistent index for the current workspace.

## Implementation Split

- Node contract and index lifecycle: `server/src/treeSearchService.ts`
- Python TreeSearch execution: `server/scripts/treesearch_query.py`
- Route registration: `server/src/index.ts`

## Guardrails

- Keep TreeSearch as the only retrieval engine.
- Keep result paths mapped to original workspace files, not staged names.
- Preserve persistent index state under `.docjin/treesearch`.
