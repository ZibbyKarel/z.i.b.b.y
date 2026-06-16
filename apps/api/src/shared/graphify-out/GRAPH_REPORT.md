# Graph Report - /Users/zibby/Workspace/z.i.b.b.y/apps/api/src/shared  (2026-06-16)

## Corpus Check
- 25 files · ~15,744 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 105 nodes · 124 edges · 20 communities detected
- Extraction: 80% EXTRACTED · 20% INFERRED · 0% AMBIGUOUS · INFERRED: 25 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]

## God Nodes (most connected - your core abstractions)
1. `LoggerService` - 8 edges
2. `get()` - 7 edges
3. `resolveFile()` - 6 edges
4. `writeEntity()` - 5 edges
5. `list()` - 5 edges
6. `writeAtomic()` - 5 edges
7. `TraceContextService` - 5 edges
8. `ensureDir()` - 4 edges
9. `list()` - 4 edges
10. `delete()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `safeJson()` --calls--> `list()`  [INFERRED]
  /Users/zibby/Workspace/z.i.b.b.y/apps/api/src/shared/file-storage/file-utils.ts → /Users/zibby/Workspace/z.i.b.b.y/apps/api/src/shared/categories/category-manifest-store.ts
- `resolveFile()` --calls--> `InvalidId`  [INFERRED]
  /Users/zibby/Workspace/z.i.b.b.y/apps/api/src/shared/file-storage/entity-file-store.ts → /Users/zibby/Workspace/z.i.b.b.y/apps/api/src/shared/http/error-mapping.test.ts
- `withPathLock()` --calls--> `get()`  [INFERRED]
  /Users/zibby/Workspace/z.i.b.b.y/apps/api/src/shared/file-storage/file-lock.ts → /Users/zibby/Workspace/z.i.b.b.y/apps/api/src/shared/file-storage/entity-file-store.ts
- `serialize()` --calls--> `writeEntity()`  [INFERRED]
  /Users/zibby/Workspace/z.i.b.b.y/apps/api/src/shared/file-storage/markdown-entity-store.ts → /Users/zibby/Workspace/z.i.b.b.y/apps/api/src/shared/file-storage/entity-file-store.ts
- `writeFileAtomic()` --calls--> `writeAtomic()`  [INFERRED]
  /Users/zibby/Workspace/z.i.b.b.y/apps/api/src/shared/file-storage/file-utils.ts → /Users/zibby/Workspace/z.i.b.b.y/apps/api/src/shared/categories/category-manifest-store.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.17
Nodes (14): corruptError(), delete(), ensureDir(), get(), list(), resolveFile(), writeEntity(), NotFound (+6 more)

### Community 1 - "Community 1"
Cohesion: 0.29
Nodes (6): CategoryConflictError, CategoryNotFoundError, create(), delete(), list(), writeAtomic()

### Community 2 - "Community 2"
Cohesion: 0.2
Nodes (2): AllExceptionsFilter, TraceContextService

### Community 3 - "Community 3"
Cohesion: 0.31
Nodes (5): hasKeys(), isNoisyBodyRoute(), LoggingInterceptor, preview(), safeStringify()

### Community 4 - "Community 4"
Cohesion: 0.33
Nodes (1): LoggerService

### Community 5 - "Community 5"
Cohesion: 0.29
Nodes (2): LoggingModule, createTraceMiddleware()

### Community 6 - "Community 6"
Cohesion: 0.33
Nodes (3): Conflict, InvalidId, Unrelated

### Community 7 - "Community 7"
Cohesion: 0.4
Nodes (0): 

### Community 8 - "Community 8"
Cohesion: 0.4
Nodes (1): safeJson()

### Community 9 - "Community 9"
Cohesion: 0.5
Nodes (0): 

### Community 10 - "Community 10"
Cohesion: 0.5
Nodes (0): 

### Community 11 - "Community 11"
Cohesion: 1.0
Nodes (2): dataDir(), resolveDataRoot()

### Community 12 - "Community 12"
Cohesion: 0.67
Nodes (0): 

### Community 13 - "Community 13"
Cohesion: 1.0
Nodes (2): prepareWorktreeDir(), resolveWorktreeRoot()

### Community 14 - "Community 14"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Community 15"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Community 16"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Community 17"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Community 18"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Community 19"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **1 isolated node(s):** `Unrelated`
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 14`** (2 nodes): `makeErrorMapper()`, `error-mapping.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (2 nodes): `makeCategoryHandlers()`, `category-handlers.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (1 nodes): `worktree-root.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (1 nodes): `self-development.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (1 nodes): `data-dir.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TraceContextService` connect `Community 2` to `Community 5`?**
  _High betweenness centrality (0.169) - this node is a cross-community bridge._
- **Why does `list()` connect `Community 0` to `Community 2`?**
  _High betweenness centrality (0.156) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `get()` (e.g. with `withPathLock()` and `isErrnoException()`) actually correct?**
  _`get()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `resolveFile()` (e.g. with `resolveSafeFile()` and `InvalidId`) actually correct?**
  _`resolveFile()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `writeEntity()` (e.g. with `writeFileAtomic()` and `serialize()`) actually correct?**
  _`writeEntity()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `list()` (e.g. with `.catch()` and `safeJson()`) actually correct?**
  _`list()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Unrelated` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._