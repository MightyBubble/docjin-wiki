import asyncio
import hashlib
import json
import os
import re
import sys
from typing import Any

from treesearch import TreeSearch
from treesearch.fts import FTS5Index
from treesearch.indexer import text_to_tree
from treesearch.parsers import SOURCE_TYPE_MAP, get_parser
from treesearch.tree import Document, assign_node_ids, flatten_tree


def fail(message: str) -> None:
    sys.stderr.buffer.write(f"{message}\n".encode("utf-8", errors="replace"))
    raise SystemExit(1)


def load_payload() -> dict[str, Any]:
    raw = sys.stdin.buffer.read().decode("utf-8")
    if not raw.strip():
        fail("TreeSearch bridge received empty payload.")

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        fail(f"TreeSearch bridge received invalid JSON: {exc}")


def build_doc_id(display_path: str) -> str:
    normalized = display_path.replace("\\", "/")
    stem = os.path.splitext(normalized.rsplit("/", 1)[-1])[0]
    digest = hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:12]
    safe_stem = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in stem) or "doc"
    return f"{safe_stem}__{digest}"


def get_line_bounds(structure: list[dict[str, Any]]) -> tuple[int, int]:
    line_starts = [
        int(node["line_start"])
        for node in flatten_tree(structure)
        if isinstance(node.get("line_start"), int)
    ]
    line_ends = [
        int(node["line_end"])
        for node in flatten_tree(structure)
        if isinstance(node.get("line_end"), int)
    ]
    first_line = min(line_starts, default=1)
    last_line = max(line_ends or line_starts or [first_line])
    return first_line, last_line


def build_document_metadata_text(display_path: str) -> str:
    path_without_ext = os.path.splitext(display_path)[0]
    normalized_path_key = "".join(ch for ch in path_without_ext if ch.isalnum())
    normalized_full_key = "".join(ch for ch in display_path if ch.isalnum())
    doc_name = os.path.splitext(os.path.basename(display_path))[0]

    def split_search_terms(value: str) -> list[str]:
        spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", value)
        spaced = re.sub(r"[^A-Za-z0-9\u4e00-\u9fff]+", " ", spaced)
        return [part.lower() for part in spaced.split() if part.strip()]

    alias_candidates: list[str] = []

    def add_alias(value: str) -> None:
        alias = value.strip().lower()
        if len(alias) < 2:
            return
        if alias in alias_candidates:
            return
        alias_candidates.append(alias)

    doc_tokens = split_search_terms(doc_name)
    path_tokens = split_search_terms(path_without_ext)

    add_alias(doc_name)
    add_alias(" ".join(doc_tokens))
    add_alias("".join(doc_tokens))
    add_alias(" ".join(path_tokens))
    add_alias("".join(path_tokens))

    for token in doc_tokens:
        add_alias(token)

    for token in path_tokens:
        add_alias(token)

    return (
        f"Document path: {display_path}\n"
        f"Document path key: {normalized_path_key}\n"
        f"Document full key: {normalized_full_key}"
        + (f"\nSearch aliases: {' | '.join(alias_candidates)}" if alias_candidates else "")
    )


def expand_query(query: str) -> str:
    variants: list[str] = []

    def add_variant(value: str) -> None:
        cleaned = value.strip()
        if not cleaned:
            return
        lowered = cleaned.lower()
        if any(existing.lower() == lowered for existing in variants):
            return
        variants.append(cleaned)

    add_variant(query)

    compact = "".join(ch for ch in query if ch.isalnum())
    if compact and compact.lower() != query.lower():
        add_variant(compact)

    parts = [part for part in re.split(r"[\\/._:\-\s]+", query) if part]
    for part in parts:
        add_variant(part)

    return " ".join(variants)


def wrap_with_document_root(
    structure: list[dict[str, Any]],
    doc_name: str,
    display_path: str,
) -> list[dict[str, Any]]:
    first_line, last_line = get_line_bounds(structure)
    metadata_text = build_document_metadata_text(display_path)
    wrapped = [
        {
            "title": doc_name,
            "summary": metadata_text,
            "text": metadata_text,
            "line_start": first_line,
            "line_end": last_line,
            "nodes": structure,
        }
    ]
    assign_node_ids(wrapped)
    return wrapped


async def parse_source_to_document(source: dict[str, Any]) -> tuple[Document, dict[str, Any]] | None:
    display_path = str(source["path"])
    absolute_path = str(source["absolutePath"])
    extension = os.path.splitext(display_path)[1].lower()
    parser = get_parser(extension)
    parse_kwargs = {
        "if_add_doc_description": True,
        "if_add_node_text": True,
        "if_add_node_summary": True,
        "if_add_node_id": True,
    }

    try:
        if parser is None:
            result = await text_to_tree(text_path=absolute_path, **parse_kwargs)
        else:
            result = await parser(absolute_path, **parse_kwargs)
    except Exception as exc:  # pragma: no cover - bridge-level guard
        sys.stderr.buffer.write(
            f"TreeSearch skipped {display_path}: {exc}\n".encode("utf-8", errors="replace")
        )
        return None

    doc_name = str(result.get("doc_name") or os.path.splitext(os.path.basename(display_path))[0])
    doc_id = build_doc_id(display_path)
    structure = wrap_with_document_root(list(result.get("structure", [])), doc_name, display_path)
    doc_description = str(result.get("doc_description", "")).strip()
    if display_path not in doc_description:
        doc_description = f"{display_path}. {doc_description}".strip(". ")

    document = Document(
        doc_id=doc_id,
        doc_name=doc_name,
        structure=structure,
        doc_description=doc_description,
        metadata={"source_path": absolute_path},
        source_type=SOURCE_TYPE_MAP.get(extension, "text"),
    )
    entry = {
        "path": display_path,
        "absolutePath": absolute_path,
        "stagePath": doc_id,
        "docId": doc_id,
        "docName": doc_name,
        "size": int(source.get("size", 0)),
        "mtimeMs": float(source.get("mtimeMs", 0)),
    }
    return document, entry


async def build_documents(sources: list[dict[str, Any]], db_path: str) -> tuple[list[dict[str, Any]], int]:
    parsed = await asyncio.gather(*(parse_source_to_document(source) for source in sources))
    entries: list[dict[str, Any]] = []
    indexed_count = 0

    fts = FTS5Index(db_path=db_path)
    fts.clear()
    try:
        for item in parsed:
            if item is None:
                continue
            document, entry = item
            fts.save_document(document)
            fts.index_document(document, force=True)
            entries.append(entry)
            indexed_count += 1
        if indexed_count > 0:
            fts.optimize()
    finally:
        fts.close()

    return entries, indexed_count


def command_build(payload: dict[str, Any]) -> dict[str, Any]:
    sources = payload.get("sources", [])
    index_dir = str(payload.get("indexDir", "")).strip()
    if not isinstance(sources, list):
        fail("TreeSearch build expects a sources list.")
    if not index_dir:
        fail("TreeSearch build expects indexDir.")

    os.makedirs(index_dir, exist_ok=True)
    staged_dir = os.path.join(index_dir, "staged")
    os.makedirs(staged_dir, exist_ok=True)
    db_path = os.path.join(index_dir, "index.db")

    entries, indexed_count = asyncio.run(build_documents(sources, db_path))

    return {
        "entries": entries,
        "indexedCount": indexed_count,
        "dbPath": os.path.abspath(db_path),
        "stagedDir": os.path.abspath(staged_dir),
    }


def command_search(payload: dict[str, Any]) -> dict[str, Any]:
    query = str(payload.get("query", "")).strip()
    db_path = str(payload.get("dbPath", "")).strip()
    entries = payload.get("entries", [])
    top_k_docs = int(payload.get("topKDocs", 8))
    max_nodes_per_doc = int(payload.get("maxNodesPerDoc", 3))
    include_ancestors = bool(payload.get("includeAncestors", True))
    text_mode = str(payload.get("textMode", "summary"))
    merge_strategy = str(payload.get("mergeStrategy", "interleave"))

    if not query:
        return {
            "query": "",
            "totalDocuments": 0,
            "totalNodes": 0,
            "documents": [],
            "flatNodes": [],
        }

    if not db_path or not os.path.exists(db_path):
        fail("TreeSearch search expects an existing dbPath.")

    expanded_query = expand_query(query)
    ts = TreeSearch(db_path=db_path)
    ts.load_index(db_path)
    result = ts.search(
        expanded_query,
        top_k_docs=top_k_docs,
        max_nodes_per_doc=max_nodes_per_doc,
        include_ancestors=include_ancestors,
        text_mode=text_mode,
        merge_strategy=merge_strategy,
    )

    fts = FTS5Index(db_path=db_path)
    try:
        raw_doc_rank = {
            str(item.get("doc_id", "")): float(item.get("best_score", 0.0))
            for item in fts.search_with_aggregation(expanded_query, group_by_doc=True, top_k=max(top_k_docs * 4, 20))
        }
        raw_node_rank = {
            (str(item.get("doc_id", "")), str(item.get("node_id", ""))): float(item.get("fts_score", 0.0))
            for item in fts.search(expanded_query, top_k=max(top_k_docs * max_nodes_per_doc * 4, 40))
        }
    finally:
        fts.close()

    entry_map = {str(entry.get("docId", "")): entry for entry in entries}
    root_node_map = {
        doc.doc_id: str(doc.structure[0].get("node_id", "")) if doc.structure else ""
        for doc in ts.documents
    }

    documents: list[tuple[float, dict[str, Any]]] = []
    flat_nodes: list[tuple[float, float, dict[str, Any]]] = []

    for doc_result in result.get("documents", []):
        doc_id = str(doc_result.get("doc_id", ""))
        source_info = entry_map.get(doc_id)
        if not source_info:
            continue

        root_node_id = root_node_map.get(doc_id, "")
        doc_rank = raw_doc_rank.get(doc_id, 0.0)
        nodes = []
        for node in doc_result.get("nodes", []):
            node_id = str(node.get("node_id", ""))
            preview = str(node.get("summary") or node.get("text") or "").strip()
            item = {
                "path": source_info["path"],
                "docName": source_info["docName"],
                "title": str(node.get("title", "")).strip(),
                "score": float(node.get("score", 0.0)),
                "preview": preview,
                "lineStart": node.get("line_start"),
                "lineEnd": node.get("line_end"),
                "ancestors": list(node.get("ancestors", [])),
                "isDocumentRoot": node_id == root_node_id,
            }
            nodes.append(item)
            flat_nodes.append((raw_node_rank.get((doc_id, node_id), 0.0), doc_rank, item))

        if not nodes:
            continue

        documents.append(
            (
                doc_rank,
                {
                "path": source_info["path"],
                "docName": source_info["docName"],
                "bestScore": doc_rank or max(node["score"] for node in nodes),
                "nodes": nodes,
                },
            )
        )

    flat_nodes.sort(key=lambda item: (-item[0], -item[1], item[2]["path"], item[2]["lineStart"] or 0))
    documents.sort(key=lambda item: (-item[0], item[1]["path"]))

    return {
        "query": query,
        "totalDocuments": len(documents),
        "totalNodes": len(flat_nodes),
        "documents": [document for _rank, document in documents],
        "flatNodes": [node for _node_rank, _doc_rank, node in flat_nodes],
    }


def main() -> None:
    payload = load_payload()
    command = str(payload.get("command", "")).strip().lower()
    if command == "build":
        result = command_build(payload)
    elif command == "search":
        result = command_search(payload)
    else:
        fail(f"Unsupported TreeSearch bridge command: {command or '<empty>'}")

    sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))


if __name__ == "__main__":
    main()
