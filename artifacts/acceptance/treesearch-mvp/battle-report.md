# TreeSearch MVP Battle Report

Date: 2026-03-16
Feature: Docjin TreeSearch MVP

## Scenario Card

### Intent
- Player goal: 在游戏设计 wiki 中快速定位“战士基础攻击”相关章节，并能一键跳回原始 Markdown 文档。
- Gameplay domain: 游戏文档 / TDD wiki 检索。

### Determinism Inputs
- Seed: `workspace=default`
- Map: `server/workspaces/default/**/*.md`
- Clock profile: 单次 HTTP 查询
- Initial entities:
  - `Hero/Warrior.md`
  - `Hero/Mage.md`
  - `Demo/CombatSystem.md`

### Action Script
1. 调用 `DELETE /api/search/index?workspace=default`
2. 调用 `POST /api/search/index/build?workspace=default`
3. 调用 `GET /api/search/index/status?workspace=default`
4. 调用 `GET /api/search/index/files?workspace=default`
5. 调用 `GET /api/search/index/config?workspace=default`
6. 调用 `GET /api/search/tree?workspace=default&q=战士 基础攻击&topKDocs=5&maxNodesPerDoc=3`
7. 调用 `POST /api/search/index/refresh?workspace=default`
8. 调用 `GET /api/search/tree?workspace=default&q=不存在的技能树术语&topKDocs=5&maxNodesPerDoc=3`

### Expected Outcomes
- Primary success condition: 完整索引 API 可用，且成功查询返回结构化节点结果，首条命中为 `Demo/CombatSystem.md` 中的“战士 (Warrior) 的属性”。
- Failure branch condition: 明显不存在的术语返回 `totalDocuments=0` 且 `totalNodes=0`。
- Key metrics:
  - 状态接口：`exists=true`, `dirty=false`
  - 文件接口：`indexedCount=12`
  - 成功查询：`totalDocuments=4`
  - 成功查询：`totalNodes=6`
  - 失败查询：`totalDocuments=0`

## Battle Log

### Round 1: Summon TreeSearch
- `pytreesearch==0.6.2` 已安装到本机 Python 3.11 用户环境。
- 后端通过 `server/scripts/treesearch_query.py` 调用真实 `TreeSearch`。
- 为规避重复文件名碰撞，bridge 会把当前工作区文件映射为唯一 staged 文件名，再交给 TreeSearch 建索引和检索。

### Round 2: Build the Index
- `DELETE /api/search/index` 成功清空旧索引。
- `POST /api/search/index/build` 成功重建持久化索引。
- `GET /api/search/index/status` 返回 `exists=true`, `dirty=false`。
- `GET /api/search/index/files` 返回 12 条索引文件映射。
- `GET /api/search/index/config` 返回支持扩展名、默认搜索参数和当前索引状态。

### Round 3: Strike Query
- Query: `战士 基础攻击`
- Result: 命中 3 份文档、6 个节点。
- Top hit:
  - `Demo/CombatSystem.md`
  - 标题：`战士 (Warrior) 的属性`
  - 行号：`9-15`
- Follow-up hits:
  - `Hero/Mage.md` -> `基础属性`
  - `Hero/Warrior.md` -> `战士 (Warrior)`
  - `Hero/Warrior.md` -> `基础属性`

### Round 4: Refresh and Verify Whiff
- `POST /api/search/index/refresh` 成功刷新索引，状态仍为 `dirty=false`。
- Query: `不存在的技能树术语`
- Result: `totalDocuments=0`, `totalNodes=0`
- Outcome: 假阳性守门逻辑生效，明显不存在的术语不会继续污染 UI 结果列表。

## Operator Notes
- 当前实现是真 TreeSearch，并提供完整索引生命周期端点，而不是仅有查询端点。
- 为保证 Windows 中文路径和重复文件名稳定性，增加了 Node index manager + Python staging 层。
- 默认工作区中的外部参考文档也会被索引；如果后续要做“只搜设计文档”模式，可以在 Node 层增加 scope 过滤。
