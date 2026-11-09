# Storage and embedding stack for a local-first personal knowledge-graph memory (Electron/Node, Windows 11, Oct 2026)

Research note: roughly 17 searches/fetches. Most sources are secondary; where a primary source was fetched this is stated. Several sub-questions (benchmarks, DuckPGQ/Cozo/Surreal/Oxigraph/Neo4j details, rerankers, DPAPI) were NOT verified and are listed under Gaps.

## SQLite options in Node/Electron (better-sqlite3 vs node:sqlite vs libsql), FTS5, sqlite-vec, graph-in-SQLite

### Takeaway
SQLite remains the lowest-risk core. node:sqlite is now a release candidate (no flag, no native rebuild) but has no built-in encryption, so better-sqlite3 (or its multiple-ciphers fork) is still the practical Electron choice. sqlite-vec revived in March 2026 but is still pre-v1; its ANN indexes are alpha only, so brute-force KNN is the stable mode, and at 100k vectors that is likely tens of ms.

### Cited Findings
- node:sqlite is "Stability 1.2, Release candidate" as of v25.7.0. The `--experimental-sqlite` flag was removed in v22.13.0 / v23.4.0. `loadExtension()` exists (v22.13/23.5) but is disabled unless `allowExtension: true` is set on the constructor. The fetched page did not mention FTS5 (page truncated). — [Node.js docs (primary)](https://nodejs.org/api/sqlite.html)
- A secondary source claims node:sqlite is "stable from Node 23", which conflicts with the official "release candidate" label. The official doc wins. — [GitHub issue, microsoft/AI-Engineering-Coach #84](https://github.com/microsoft/AI-Engineering-Coach/issues/84)
- better-sqlite3 is a native module needing per-ABI prebuilds. Recent releases added Node 25 / Electron 39+ prebuilds and Electron 37 support. Past ABI-mismatch crashes in Electron are reported. — [better-sqlite3 issues via search result](https://github.com/WiseLibs/better-sqlite3/issues/1062) (secondary summary; not verified on the releases page)
- A 2026 Japanese comparison says node:sqlite has no built-in encryption and recommends better-sqlite3-multiple-ciphers as first choice for encrypted Electron DBs. It also claims node-sqlite3 was archived in July 2026 (unverified). — [codenote.net](https://codenote.net/ja/posts/electron-encrypted-sqlite-libraries-comparison/)
- A PhotoStructure comparison says the synchronous SQLite libraries have similar performance. — [photostructure library-comparison](https://photostructure.github.io/node-sqlite/documents/library-comparison.html)
- sqlite-vec (asg017) is dual-licensed Apache-2.0/MIT, pure C with no dependencies, and the README says it is pre-v1 ("expect breaking changes"). It stores float/int8/binary vectors in `vec0` virtual tables. Sponsors include Mozilla, Fly.io, Turso, SQLite Cloud and Shinkai. — [sqlite-vec GitHub (primary)](https://github.com/asg017/sqlite-vec)
- Release history: v0.1.7 (17 Mar 2026) "revived the project after a long hiatus" and added DELETE support. v0.1.8 fixed the npm install. v0.1.9 (31 Mar 2026) is the latest stable. v0.1.10-alpha.1..4 (31 Mar to 18 May 2026) add new ANN indexes (rescore, DiskANN, ivf). ivf is "experimental, not enabled", DiskANN deletes are expensive, and docs were "coming soon". — [sqlite-vec releases (primary)](https://github.com/asg017/sqlite-vec/releases)
- The npm platform package `sqlite-vec-windows-x64` is at 0.1.9, last updated 2026-03-31. — [depscope](https://depscope.dev/pkg/npm/sqlite-vec-windows-x64)
- Performance: one third-party write-up (on sibling project sqlite-vector) measured 100k x 384-dim float32 full scan at 67.84 ms for sqlite-vec on an M1 Pro. — [Marco Bambini substack](https://marcobambini.substack.com/p/the-state-of-vector-search-in-sqlite). A DEV post claims under 12 ms (p99 28 ms) at 100k but is unverified/anecdotal. — [DEV](https://dev.to/hypernexus/sqlite-vector-search-the-dependency-free-ai-memory-stack-that-outperforms-pinecone-5d27)

### Inferences
- 100k x 768 float32 is about 300 MB of raw vectors, and brute force there is plausibly 50-150 ms on a Ryzen 6600H, borderline for a 100 ms target. Mitigations: truncate Matryoshka dims to 256 (EmbeddingGemma supports 512/256/128), use int8 or binary quantization with rescore, or pre-filter via FTS5/graph/metadata before the vector scan. At tens of thousands of items, brute force is comfortably fast. This is my estimate, not a measurement.
- Because the ANN indexes are alpha and sqlite-vec is pre-v1 and was dormant before March 2026, treat it as replaceable. Keep embeddings in an ordinary BLOB column so a fallback (in-JS brute force with a typed array, or another index) can be swapped in.
- Loading sqlite-vec in Electron means loading a DLL via `loadExtension`; the DLL is not an Electron-ABI-bound addon, so Electron compatibility should be fine. Not verified by any source found; test it.
- Graph-in-SQLite (nodes/edges tables with indexes on src/dst/type, recursive CTEs for 1-3 hop traversal) is a standard pattern. At 100k-1M edges single-user, this should meet 100 ms. No source fetched; this is general knowledge.

### Gaps
- No primary source on FTS5 being compiled into node:sqlite, better-sqlite3 (it is by default per my prior knowledge, unverified here), or libsql.
- libsql / Turso status in Oct 2026 not researched.
- No sqlite-graph extension investigated; no measured sqlite-vec number at 100k x 768 on a comparable CPU.
- No Electron-specific sqlite-vec issue reports found.

## Embedded graph databases (Kuzu, FalkorDB(Lite), DuckPGQ, Neo4j, Cozo, SurrealDB, Oxigraph)

### Takeaway
Kuzu was archived on 10 Oct 2025 (final v0.11.3, MIT). Community forks exist (LadybugDB most active). FalkorDBLite does not support native Windows. CozoDB appears dormant. Given that churn, an embedded graph DB is a higher risk than graph-in-SQLite for this use case.

### Cited Findings
- Kuzu's GitHub repo was archived 10 Oct 2025, read-only, with v0.11.3 as the last release. The stated reason was "Kuzu is working on something new." — [Register](https://www.theregister.com/2025/10/14/kuzudb_abandoned/) and [OneUptime](https://oneuptime.com/blog/post/2026-08-12-kuzu-archived-pin-0-11-3-fork-or-migrate/view)
- LadybugDB ("the database formerly known as Kuzu") is active; latest release as of 12 Aug 2026 is v0.19.1. Node package is `@ladybugdb/core`, with a `@ladybugdb/core-win32-x64` platform package (v0.18.3 seen). The older name `lbug` also appears in docs. — [OneUptime](https://oneuptime.com/blog/post/2026-08-12-kuzu-archived-pin-0-11-3-fork-or-migrate/view), [Ladybug install docs](https://docs.ladybugdb.com/installation), [jsDelivr README](https://cdn.jsdelivr.net/npm/@ladybugdb/core-win32-x64@0.18.3/README.md)
- Other forks: RyuGraph (Predictable Labs); the openCypher CypherDB fork was itself archived. These claims come from a search summary of secondary sources. — [PuppyGraph blog](https://www.puppygraph.com/blog/what-is-kuzudb)
- A vendor post exists on migrating from Kuzu to FalkorDB. — [FalkorDB blog](https://www.falkordb.com/blog/kuzudb-to-falkordb-migration/)
- FalkorDBLite has a TypeScript package (`npm install falkordblite`, Node 20+). It spawns an embedded redis-server with the FalkorDB module as a sub-process. Supported: Linux x64 and macOS arm64; Windows users must use WSL2 or a remote server. — [FalkorDB docs](https://docs.falkordb.com/operations/falkordblite/falkordblite-ts)
- CozoDB: DBDB.io says the repository has not been updated since 2024 and is considered abandoned; no explicit archive flag found. — [DBDB.io](https://dbdb.io/db/cozodb)
- DuckPGQ is a CWI DuckDB extension described as a research project, work in progress; installable as a community extension since DuckDB 1.0. Windows build and Node API support for it were not confirmed. — [cwida/duckdb-pgq](https://github.com/cwida/duckdb-pgq)

### Inferences
- LadybugDB is the only embedded property-graph option with Windows x64 Node binaries I found, but it is young (package popularity low per socket.dev) and its fork lineage adds bus-factor risk. Use only if Cypher-style multi-hop analytics become necessary.
- FalkorDBLite is effectively ruled out for a Windows-native Electron app (sub-process plus no Windows support).

### Gaps
- Not researched: Neo4j embedded (JVM-only in my prior knowledge, unverified), SurrealDB embedded (Node/WASM and RocksDB/SurrealKV backends), Oxigraph (RDF/SPARQL, npm WASM), the Ladybug license text, and DuckPGQ on Windows/Node. Cozo's exact last release unconfirmed.

## Local embedding models in Node (transformers.js/ONNX, Ollama) versus API embeddings; rerankers

### Takeaway
EmbeddingGemma-300M (768d, Matryoshka, 2K context, ONNX/transformers.js support with q8/q4) is the strongest small multilingual option I could confirm, and bge-small-en-v1.5 (384d) is the lightweight option. I could not obtain reliable CPU latency numbers for either, so measure on the target laptop. OpenAI text-embedding-3-small costs $0.02/M tokens, which is cheap, but it sends memory content off-device.

### Cited Findings
- EmbeddingGemma: 308M params, "highest-ranking text-only multilingual embedding model under 500M" on MTEB at release, 2048 token context, native 768 dims truncatable to 512/256/128, under 200 MB RAM when quantized, ONNX weights at `onnx-community/embeddinggemma-300m-ONNX`, transformers.js dtypes fp32/q8/q4. No numeric MTEB scores or base-model license appeared on the fetched page. — [Hugging Face blog](https://huggingface.co/blog/embeddinggemma); paper [arXiv 2509.20354](https://arxiv.org/abs/2509.20354v2)
- bge-small-en-v1.5 MTEB average reported as about 63-64.3 and all-MiniLM-L6-v2 about 56.3 to 62, depending on source and MTEB version. Sources are low-grade aggregators; the figures are inconsistent. — [thegtmdirectory](https://thegtmdirectory.com/models/baai-bge-small-en/bge-small-en-v1.5), [Codesota](https://codesota.com/academy/lessons/1-1-text-embeddings)
- A weak-sourced guide lists all-MiniLM-L6-v2 at about 590 docs/s on CPU with quantized ONNX (hardware: Ryzen 9 7950X, per the guide). — [markaicode](https://markaicode.com/benchmarks/sentence-transformers-production-benchmark-latency/) (unverified method)
- OpenAI text-embedding-3-small is $0.02 per million input tokens ($0.01 batch); text-embedding-3-large is $0.13/M. Trackers show verification dates between April and August 2026. No newer OpenAI embedding model surfaced. — [costbench](https://www.costbench.com/software/embedding-apis/openai-embeddings/), [pricepertoken](https://pricepertoken.com/embedding/model/openai-text-embedding-3-small)

### Inferences
- With short memory items (under 100 tokens), a 33M-param model like bge-small should embed in roughly tens of ms on a 6-core CPU via ONNX Runtime. The 300M EmbeddingGemma is several times heavier, probably 50-200 ms per short item, which is acceptable for background indexing but not necessarily for per-query embedding. Both are my estimates, not measurements.
- Storage cost: 768d float32 is 3 KB/item (about 300 MB at 100k); 384d is half. Matryoshka truncation to 256d fits the latency budget.
- Local embeddings keep all data on-device (no network, no per-token cost); API embeddings add 100-500 ms network latency and privacy exposure. Once a model is chosen, changing it requires re-embedding everything, so store the model name/dims per row.

### Gaps
- No verified CPU latency per embedding for bge-small, MiniLM, nomic-embed v1.5/v2, EmbeddingGemma in Node.
- No MTEB leaderboard numbers read directly; nomic v1.5/v2 scores not found.
- Ollama (Windows, CPU embedding speed) not researched.
- Local reranker options (bge-reranker-base/v2-m3, jina-reranker, mxbai-rerank in ONNX) not researched.
- Newer API embedding models (Google Gemini embedding, Voyage, Cohere) not researched.

## Encryption at rest and backup/export on Windows

### Takeaway
Best-supported route: better-sqlite3-multiple-ciphers (SQLCipher-compatible mode), with the key held via Electron `safeStorage` (DPAPI-backed on Windows) rather than a hardcoded or user-typed key. Whether the search covered DPAPI itself: it did not, so that part is unverified here.

### Cited Findings
- better-sqlite3-multiple-ciphers (MIT) is recommended as the first choice for encrypted Electron SQLite in 2026, with a SQLCipher-compatible mode. @journeyapps/sqlcipher reportedly dropped Windows support in v6.0.0. — [codenote.net](https://codenote.net/en/posts/electron-encrypted-sqlite-libraries-prototyping-macos-windows/)
- Third-party mirrors host Electron win32-x64 prebuilds of better-sqlite3-multiple-ciphers (e.g., v11.3.0 for Electron v125), but this is not the official release page, and the author did not verify prebuilds on target ABIs. — [Glama mirror](https://glama.ai/mcp/servers/@dbcodeio/public/blob/88993fce1f968c3f826cfefaa7632de110e435e2/packages/better-sqlite3/better-sqlite3-multiple-ciphers-v11.3.0-electron-v125-win32-x64.tar.gz)
- Package scale: about 11k downloads/month, 173 stars. — [ecosyste.ms](https://packages.ecosyste.ms/registries/npmjs.org/packages/better-sqlite3-multiple-ciphers)

### Inferences
- Cipher choice interacts with sqlite-vec: loading the extension into a multiple-ciphers build needs a test, as the SQLite core is a custom build. Unverified.
- A BitLocker/Windows 11 Home note: Home edition has "device encryption" rather than full BitLocker management on some hardware; this is from general knowledge and not sourced here. Full-disk encryption protects a lost laptop but not a running logged-in session or malware.
- Backup: SQLite `VACUUM INTO` / better-sqlite3 `.backup()` for consistent snapshots, plus an export to JSON/Markdown for portability (general knowledge, unsourced).

### Gaps
- No source fetched for DPAPI / Electron safeStorage behavior, SQLCipher vs multiple-ciphers performance overhead, or BitLocker on Home edition.

## Recommendation (synthesis; not independently sourced beyond the above)

- Core: one SQLite file via better-sqlite3 (or better-sqlite3-multiple-ciphers if encryption is wanted from day one), FTS5 for keyword search, nodes/edges tables with recursive CTEs for graph traversal.
- Vectors: sqlite-vec 0.1.9 stable brute-force `vec0`, with 256-384d vectors and int8/binary quantization if latency requires. Keep a BLOB fallback.
- Embeddings: local via transformers.js/ONNX in a worker thread or utility process. Start with bge-small-en-v1.5 (fast, 384d) or EmbeddingGemma-300M q8 truncated to 256d if multilingual or higher quality is needed; benchmark both on the 6600H first. Make the API (text-embedding-3-small) an opt-in fallback.
- Hybrid retrieval: FTS5 plus vector with reciprocal rank fusion, graph expansion from the top hits, and an optional reranker only on the top 20-50.
- Main risks: sqlite-vec is pre-v1 and had a long hiatus; native-module ABI breakage on Electron upgrades; embedding model lock-in (re-embed on change); brute-force vector latency beyond about 100k x 768; fork-lineage risk of any embedded graph DB (Kuzu/Ladybug).
- Fallbacks: if sqlite-vec fails, do in-process brute force on a Float32Array (or int8) mirror loaded at startup; if graph queries outgrow CTEs, trial LadybugDB (`@ladybugdb/core`, Windows x64 package exists); node:sqlite is an option to drop native rebuilds if encryption is handled otherwise.
