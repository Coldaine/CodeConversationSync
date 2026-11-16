# Enhancement Plan: Threadle plumbing into CodeConversationSync

> Status: **proposed, Phase 0 verified on SER10** · 2026-11-16 · Owner: Coldaine
> Repos: `Coldaine/CodeConversationSync` (this repo, public) + upstream `carlnordlund/Threadle` (MIT, pinned, external)
> Dev host: **SER10** (`/ser10-data/projects/threadle-workspace/`) · UI editor of choice: Google AI Studio (Build mode)
> Companion: `docs/threadle-merge-analysis.md` (the survey this plan is built on)

---

## 0. Decisions up front (and what is *not* decided)

| # | Decision | Rationale |
|---|---|---|
| D1 | **This repo stays the canonical repo**, Next.js app at root. Threadle is *not* the base repo with a UI bolted on. | AI Studio only builds/edits web apps (React client + Node server, `metadata.json`, Cloud Run-style runtime). It cannot open a .NET solution as its project, has no concept of `.sln`/`.cs`/`.bin` artifacts, and its agent context would be flooded by ~19k lines of C#. Keeping the app at root keeps Studio working at all. (See §7.) |
| D2 | **Threadle source is not vendored into this repo.** It is cloned separately on SER10 at a pinned commit; this repo contains only the client, projection, setup scripts, and docs. | Studio syncs/edits the whole repo; vendored C# invites Studio's agent to "fix" upstream code, bloats its context, and creates merge debt against upstream. A `scripts/setup-threadle.sh` clones `carlnordlund/Threadle` at the pinned SHA and builds the binary. |
| D3 | **Web stack is a free choice, not a marriage.** Next.js/React stays *for now* only because AI Studio generates/edits it. The graph/server layer is decided on merit at the Phase 2 gate (sidecar vs in-process .NET host, §6). If Studio is ever dropped, the UI can be re-evaluated; the projection + graph schema (the real asset) is stack-independent. | User is not attached to any web technology. What must survive any stack change: the corpus schema, the entity→layer mapping (§3), and the projected graph files. |
| D4 | **All development happens on SER10** over SSH. This machine (whichever laptop) is a thin client. | SER10 is the always-on host (24 cores / 58 GB RAM / 1.5 TB free on `/ser10-data`; root disk ~87% full — all work lives on `/ser10-data`, never `/`). A self-hosted Actions runner runs there but is registered to `MooseGooseConsulting`, **not** this repo (§11 H3). |
| D5 | **`main` gets PR-only protection, but only together with a `studio` integration branch** (§8, deferred to Phase 2 in v2). Bots (CodeRabbit, Greptile, + others) review PRs. | AI Studio syncs by direct push to its linked branch with AI-generated commits; whether it can target a non-default branch is **unverified (N1, §11.3)** — protecting `main` naively risks breaking Studio sync, so protection waits for the N1 experiment. Solo-owner caveat: GitHub will not let you approve your own PR, so required approvals = 0; the PR requirement exists to force bot review + CI, not human approval. |
| D6 | The UI mockup is **a mockup**. Nothing in `components/` is load-bearing where it conflicts with the graph model. Where Threadle emits data the mockup has no place for, we add UI surface (§4); where the mockup models things Threadle can't, we keep them TS-side (§5). | Explicit user direction. The mockup's value is the *domain vocabulary* (projects/tasks/sessions/Wispr/deliverables/lineage) and view concepts, not its layout. |

---

## 1. Verified facts (SER10, 2026-11-16)

- SER10 = Nobara Linux 44, user `coldaine`, `gh` logged in as `Coldaine`, podman (no docker). The `gha-runner.service` user unit is active but registered to `MooseGooseConsulting`; `repos/Coldaine/CodeConversationSync/actions/runners` is empty (v2 correction — v1 implied it served this repo).
- .NET on SER10 is via **mise**: SDKs live in `~/.local/share/mise/dotnet-root`, but dotnet was declared in no mise config, so shells fell through to a runtime-only system .NET 9. Fixed 2026-11-16 (delegated, then independently re-verified): workspace `/ser10-data/projects/threadle-workspace/mise.toml` pins `dotnet 10.0.404` + `node 26.12.0`; any shell in that tree now gets working `dotnet --list-sdks`/`node`, and mise itself exports `DOTNET_ROOT`. Dependency work on SER10 **must** go through mise, never hand-rolled symlinks or a second package manager.
- Threadle builds clean on SER10: `dotnet build Threadle.CLIconsole -c Release` → `threadle-bin/threadle` (0 warnings).
- The JSON bridge works end-to-end (Phase 0 done): `threadle --json` answered `createnodeset → createnetwork → addnode → defineattr(ext_id:string) → setattr → addlayer(lineage, directed) → addedge → getnodealters → getalledges → i(nventory)`, one JSON result per line, payloads as expected (`getnodealters` → `[2]`, `getalledges` → `[{node1:1,node2:2,value:1}]`).
- This laptop has **no** .NET SDK; never build Threadle here.
- Current repo state: `main` unprotected, no rulesets, no bot configs (verified via `gh api`). Existing CCS tests cannot run (no test runner in `package.json`; `node --test` → `ERR_MODULE_NOT_FOUND` on extensionless imports).

---

## 2. System shape after the merge

```mermaid
flowchart LR
  subgraph SER10["SER10 (dev + runtime host)"]
    UI["Next.js UI (this repo)\nStudio-editable views"]
    API["Next server routes\napp/api/threadle/*"]
    PROJ["Projection (pure TS)\ncorpus ⇄ graph files"]
    BIN["threadle --json sidecar\n(pinned upstream build)"]
    CORE["(Phase 2 gate) alt: ASP.NET host\nreferencing Threadle.Core"]
    COLL["Host collectors (future)\nClaude Code / Codex / Droid /\nOMP / Maestro / Wispr exports"]
    STORE[("Corpus store\n.bin/.tsv + sidecar JSON\nfor edge metadata")]
    UI --> API --> PROJ
    API --> BIN
    API -.-> CORE
    COLL -->|TSV import| BIN
    PROJ <--> STORE
  end
  STUDIO["Google AI Studio\n(Build mode, Gemini)"] -->|push/pull, studio branch| GH["GitHub: CodeConversationSync\nmain protected, PR-only"]
  SER10 -->|branches + PRs| GH
  GH -->|CodeRabbit / Greptile / CI (GitHub-hosted)| GH
```

Rules that keep this sane:
- Browser code keeps consuming `ThreadleCorpus`-shaped DTOs. Views do not learn about uint ids, layers, or the sidecar.
- The sidecar is server-only, spawned/managed by Next server code on SER10 (or by the .NET host if Phase 2 chooses it). It is never exposed to Studio's preview runtime — in Studio, graph features degrade to seed/demo data behind the same API shapes (§7.3).
- One corpus = one Threadle process. Requests are serialized (the CLI is a single sequential REPL; exit code is always 0 — trust only the JSON `Success`/`Code` fields).

---

## 3. Complete entity mapping (mockup domain ⇄ Threadle graph)

> **v2 (post-critique):** this section now pins the four contracts the first draft left open —
> identity (U2), file formats (U3), field-level disposition (U1), one-relation-per-layer (U7).

One `Nodeset` (`corpus`) + one `Network` (`conversation-graph`). UI string ids survive in the string attribute `ext_id` (unique, ≤255 bytes) and resolve through it (the `labelAttr`/`idAttr` pattern Threadle already supports).

**Identity contract (U2 — non-negotiable):** the *graph* owns `uint` ids. The projection never assigns ids by array order. It takes the existing `{ext_id → uint}` map (built from one `getattrstable` call, not N `getattr` calls), allocates `max+1` for new entities, **never renumbers**, and aborts on a duplicate `ext_id` (`defineattr` imposes no uniqueness — the check is ours). A test asserts injectivity and id stability across a re-projection; violating this silently rebinds persisted edges/`an_*` attrs to wrong entities.

### 3.1 Entities → nodes

| Mockup entity (`lib/types.ts`) | `kind` attr | Node attributes (scalar only) | Edges / hyperedge members | Sidecar keys (everything else) |
|---|---|---|---|---|
| `ProjectSummary` | `project` | name, workstreamCategory, healthStatus, startedAt*, lastActivityAt*, forgottenCount | `contains`→tasks/lineage; repos[], hosts[], agents[] → `assignment`/`participation` members | currentState, latestObjective, constraints[], openQuestions[] |
| `WorkTask` | `task` | title, status, isForgotten, startedAt*, lastActivityAt* | `contains` from project; hosts[], agents[] → `assignment` members | workstreamName, objective, repo, nextAction, unresolvedQuestions[], branches[] |
| `Deliverable` | `deliverable` | title, status, discrepancyFlag, repo, branch, prNumber | `contains` from task; `evidenced-by`→evidence | requestedSummary, agentClaim, actualReality, discrepancyReason, worktreePath, lastCheckedAt |
| `EvidenceItem` | `evidence` | kind, verified, timestamp* | `evidenced-by` from deliverable | title, summary, url, host, reference (if >255B) |
| `IntentionRecord` | `intention` | kind, resolved, timestamp* | sourceRef ⇒ `raised-in` edge to session | statement |
| `SessionEpisode` | `session` | agent, host, repo, branch, directory, status, startedAt*, endedAt*, contentHash, agentClaimedDone, verifiedDone | `contains` from project/task; members of its `participation` hyperedge | title, worktree, userIntent, whatHappened, whatRemains, transcriptSnippet, analyzedBy |
| `WisprDictation` | `wispr` | capturedOnHost, attributionStatus, timestamp*, durationSeconds | `attributed-to`→session/project; `captured-on`→host (targetHost) | transcript, attributionReason, extractedIntent |
| `LineageNode` | `lineage` | kind, status, timestamp* | `lineage` parent→child; **`contains` from project (its `projectId` — `LineageView` filters on this; omitting it breaks the view)** | title, detail, host, agent |
| `HostCollectorStatus` | `host` | role, lastAuditSync*, sessionsIndexed, wisprRecords, runningSessions | agentsDetected[] → `runs-on` membership | — |
| *(new)* agent, repo | `agent`, `repo` | name | — (first-class nodes, were only strings before) | — |

**Default rule (U1):** any field not listed as a node attribute above lives in the sidecar, keyed by `ext_id`. The table is now exhaustive against `lib/types.ts`; Phase 1 implements it mechanically, and a round-trip deep-equal test (§9) proves no field is dropped.

\* Dates: Threadle has no date type → epoch-seconds `int` attributes, formatting stays in TS. Long text (transcripts, `continuationPromptSeed`, summaries) is **not** a node attribute (255-byte binary-string limit, single-valued) — it lives in the sidecar JSON store keyed by `ext_id` (§5).

**File-format contract (U3):** pin Threadle's *native* formats, no invented ones. Nodeset attributes TSV: header row = `<ignored><TAB>name:Type…`, rows `nodeid<TAB>value…`. 1-mode layers: edgelist TSV `node1<TAB>node2[<TAB>value]`, `header=true`. 2-mode: `node<TAB>hyperedge`. **Creation order is fixed** — nodes+attributes with explicit ids first, then edges — because `importlayer` with `labelattr`+`addmissingnodes` manufactures fresh ids while `importnodeattributes` keys on numeric ids; the wrong order silently duplicates nodes. Sidecar: versioned JSON `{version:1, text:{ext_id:{field:value}}, edges:{…}}` (§5).

### 3.2 Relations → layers (relation kind = layer; edges carry only a float)

| Layer | Mode | Connects | Replaces today's… |
|---|---|---|---|
| `contains` | 1-mode directed binary | project→task, task→deliverable, project→lineage | `projectId`/`taskId` FK chains |
| `lineage` | 1-mode directed binary | lineage parent→child **only** | `LineageNode.parentId`, hand-sorted chains in `LineageView` |
| `attributed-to` | 1-mode directed binary | wispr→session, wispr→project, session→project | `matchedProjectId`, override maps |
| `evidenced-by` | 1-mode directed binary | deliverable→evidence | `evidenceIds[]` |
| `raised-in` | 1-mode directed binary | intention→session | `IntentionRecord.sourceRef` |
| `participation` | 2-mode | hyperedge named `sess:<ext_id>` per session = {host, agent, repo, project, task} — **sole authority for session membership** (session→project in `attributed-to` is the *attribution decision*, which may differ and may be overridden; membership ≠ attribution) | `host`/`agent` fields + `MapView` FK joins |
| `assignment` | 2-mode | hyperedge named `task:<ext_id>` per task = {hosts, agents, repos} | `hosts[]`/`agents[]`/`repos[]` arrays |

One relation per layer (U7): `shortestpath`/ancestry over `lineage` must never traverse intention or attribution edges. Hyperedge names are `<prefix>:<ext_id>` (≤255 UTF-8 bytes, checked). ~~`depends-on` (task→task)~~ — **cut in v2 (O2):** no producer, no consumer; add it when a collector can infer dependencies. Topology reads always pass `direction=both` explicitly (Threadle's default is `out`, which silently drops inbound neighbours).

2-mode projection (`projecttwomode`, Newman/Count) then yields "projects sharing a host/agent/repo" overlap — the cross-host topology `MapView` currently hand-computes per render.

### 3.3 What each existing view consumes after the merge (shrunk in v2, O5)

Only three surfaces change before the graph is the source of truth; everything else keeps rendering the DTO unchanged — that is the point of the DTO promise.

| View | After (v1 of the merge) |
|---|---|
| *(new)* corpus route consumer (`ThreadleApp`) | `GET /api/threadle/corpus` (§6.1) replaces seed+localStorage composition |
| `MapView` | `getalledges`/`getnodealters(direction=both)` per layer + 2-mode projection; node size = `an_degree_*` |
| `LineageView` | `shortestpath(..., returnpath=true)` over `lineage` only |
| Timeline / Projects / Sessions / DetailDrawer / IngestModal | **Unchanged in v1** (DTO-fed). Graph-powered metrics/ego-tables/community hints are Phase 3, gated on the corpus route being live |

---

## 4. Threadle out-of-the-box data that needs a NEW home in the UI (cut to v1 three, v2)

The mockup has no surface for analysis results, and Threadle analyses write results back as node attributes. **Factual correction (critique):** Threadle does *not* name them `an_…` — defaults are `pagerank`, `degree`/`degree_in|out`, `<layer>_community`, `<layer>_coreness`, etc. (`Threadle.Core/Analysis/Analyses.cs`). The `an_<analysis>_<layer>` prefix is therefore a **client obligation**: every analysis call from our code MUST pass `attrname=an_<analysis>_<layer>` explicitly (constants in one TS module), or results collide across layers and the UI reads attributes that never exist.

### 4.1 v1 — the three that answer an existing question

| Capability | Output (with our `attrname`) | UI home |
|---|---|---|
| `communitydetection` (Leiden/Louvain) | `an_community_<layer>` | **IngestModal** "suggested grouping" for unassigned sessions + MapView community coloring. Attacks the seed corpus's stated problem; structural hint only — Gemini/user remains the semantic judge (accept/reject) |
| `components` | `an_component_<layer>` | **Forgotten-work panel** (with existing TS dormancy): isolated tasks/sessions = likely abandoned; feeds `isForgotten` instead of hand-set flags |
| `degree` / `getdegree` | `an_degree_<layer>` (+in/out) | **MapView node sizing**; ProjectsView "most connected" sort |

### 4.2 Backlog (post-Phase-3 — named so they are not lost, explicitly not v1 scope)

Centrality suite (`pagerank`, `betweenness/closeness/harmonic/eigenvector`, `coreness`, `edgebetweennesscentrality`) → DetailDrawer "graph position" + rankings; layer stats (`getlayerstats`, `density`, `diameter`, `clusteringcoefficient`, `transitivity`) → a Diagnostics page (v1 gets only `info`/`getlayerstats` `EstimatedMemory` in the API `meta` — no monitoring page for a hundreds-node corpus, O6); censuses/assortativity → Diagnostics research section; `shortestpaths`/`rwfpt` distances → LineageView extras; `getalterdetails` ego tables → DetailDrawer; `getattrsummary` distributions; hyperedge rosters (`getnodehyperedges` etc.) → SessionsView; `export` GraphML/GEXF (Gephi) — the one real loss from cutting, mitigated because `savefile` covers persistence; derived-layer ops (`subnet`, `filter`, `mergelayers`, `symmetrize`, `dichotomize`, `projecttwomode` beyond MapView's use).

**Explicitly no home (do not surface):** `generate`/`generateattr`/`rewire` (synthetic generators — would pollute a real corpus), `getrandomnode/edge/alter` (sampling internals). Scripts/tests only. Note: `getestimatedbytes` is **not** a CLI command (Core-only; surfaced via `info`/`getlayerstats.EstimatedMemory`).

---

## 5. Mockup data Threadle cannot hold — and where it lives instead

Threadle edges carry **one float and nothing else**: no timestamps, no provenance, no roles. Node attributes are single-valued, ≤255 per nodeset. So:

| Mockup data | Problem | Home |
|---|---|---|
| Transcript text, `whatHappened`, Wispr transcripts, `continuationPromptSeed`, summaries | long text | **Sidecar JSON store** on SER10 (`data/corpus-text.json`, keyed by `ext_id`); node holds only `contentHash` + pointer |
| Relation metadata (when a wispr was attributed, by whom, confidence reason; evidence→deliverable link context) | no edge attributes | Sidecar JSON store as edge records `(layer, from_ext, to_ext, meta)`; float value holds confidence where numeric |
| `UserOverrides` (sessionProjectMap, deliverableStatusMap, resolvedIntentionIds) | user state, not graph fact | Server-side `overrides.json` on SER10, applied **only in the read DTO** (U6): attribution overrides rewrite `attributed-to` edges in the DTO; status/resolved overrides patch DTO fields; response carries `meta.overridesApplied`. Graph analyses always run on raw graph values — this is declared, so Diagnostics can never silently contradict the screen without the flag saying why |
| Gemini analysis (`app/api/analyze`) | not graph at all | Stays a Next server route (Studio-compatible); its output becomes ingest proposals committed through the projection |
| Timeline swimlanes, zoom, bar spans, filters, continuation packets | view math | Stays in `lib/threadle-engine.ts` (pure TS, testable) — this file is an asset, keep it |

Persistence story after merge: graph (`.bin` via `savefile`, nodeset sidecar file in same dir) + `corpus-text.json` + `overrides.json`, all under `/ser10-data/projects/threadle-workspace/data/`, all git-ignored except seed fixtures. The seed corpus becomes a one-time import fixture and is then deleted as a data source.

**Durability contract (U5):** a commit = mutate graph → `savefile` → write sidecar → *then* respond. Startup = `loadfile` + sidecar reconcile against `getalledges`. Unsaved state does not exist; there is no write-behind cache to lose in the Phase 2 crash test.

---

## 6. Server integration: decision gate (Phase 2)

| Option | Shape | For | Against |
|---|---|---|---|
| **A. Sidecar (proven)** | Next server spawns `threadle --json`, serialized line protocol, typed TS client (`lib/server/threadle-client.ts`) | Zero C# work; all 103 commands incl. future upstream; Phase 0 already green on SER10 | Stringly `args` (all values stringified), single sequential process, errors only via JSON `Success/Code` (exit code always 0), no request ids → strict in-order matching, restart-on-crash handling on us |
| **B. In-process .NET host** | Small ASP.NET Core service referencing `Threadle.Core` directly, JSON HTTP API | Typed API, real concurrency story, no process babysitting; SER10 runs .NET natively and we may install anything | New C# codebase to own; only Core is callable — some model API is `internal` (must use `Network.Add*` wrappers); global statics (`UserSettings`, CWD) need isolation care in a web host; Studio can't run it either |
| C. Port to TS | — | — | Discards the plumbing that is the entire point. Rejected. |

**Gate:** build A first (it is 90% client code and already smoke-tested). Move to B only if A's serialization/concurrency actually hurts (measured: ingest batch latency, concurrent UI queries). The projection (§3) and graph files are identical under A and B, so the gate is cheap to cross later. **Blazor/full-.NET UI was considered and rejected** while AI Studio remains a UI editor: Studio generates React/Node (or Android/Kotlin) only, so a .NET UI would cut Studio out entirely (D1/D3).

### 6.1 HTTP contract (U4 — the missing piece of v1)

Browser code consumes DTOs only; these routes are the entire client-visible surface. Server binds `127.0.0.1` on SER10 (see §11, H2 default); no auth while loopback-only.

| Route | Contract |
|---|---|
| `GET /api/threadle/corpus` | `200 {corpus: ThreadleCorpus, meta:{source:"graph"\|"seed", overridesApplied:boolean, estimatedMemory?:string}}`. Source is decided **server-side at runtime** (sidecar reachable + corpus loaded ⇒ `graph`, else seed) — no build-time `NEXT_PUBLIC_*` flag. This route is what replaces `ThreadleApp`'s seed+localStorage composition; without it every view keeps rendering seed data |
| `GET /api/threadle/graph?layers=…` | Per-layer edges/alters for MapView (`direction=both` forced server-side) |
| `GET /api/threadle/lineage?project=<ext_id>` | `shortestpath(returnpath=true)` ancestry over `lineage` |
| `POST /api/threadle/commit` | Typed op list (`upsertSession`, `attributeWispr`, `linkEvidence`, `setDeliverableStatus`, …), each op carrying the entity `contentHash` it was based on; stale hash ⇒ `409 {code:"StaleContentHash"}`. Executes under the durability contract (§5): mutate → save → respond. This is the write path IngestModal and overrides POST to |
| Errors | Uniform `{error:{code,message}}` with HTTP status; Threadle `Success:false` maps to `502 {code:<threadle Code>}` — never leak raw process state |

---

## 7. Working with Google AI Studio (researched, 2026-11-16)

Sources: official Build-mode docs (`aistudio.google.com/docs/aistudio-build-mode`) + AI Developers forum.

### 7.1 How it actually interacts with Git
- Create by prompt, **Import from GitHub** (Add files menu), or link an existing repo in **Settings → GitHub**. Sync is two-way: Studio pushes its commits (AI-generated messages) and pulls external changes; conflicts get a **per-file side-by-side "keep Studio / keep GitHub" dialog** — no real merge tool, no rebase, no branch operations.
- **Unverified (N1): which branch Studio syncs.** Docs describe push/pull with no branch operations and no PR concept; forum users (2026-08) explicitly request target-branch selection, and other descriptions suggest the link follows the repo's default branch. v1's claim of "no branch picker" is *not* established. Treat Studio as *a committer to one linked branch* and validate with the Phase 1 throwaway-repo experiment (§9/§10) before the `studio` design is load-bearing.
- Its world model is a web app: React client + Node server runtime, npm packages auto-installed, secrets via the Secrets panel (`GEMINI_API_KEY` injected server-side), deploy = Cloud Run. Files outside that model (`.cs`, `.sln`, `.bin`, lockfiles it didn't create) are inert cargo it may still rewrite when "managing files across the stack."

### 7.2 Consequences for this repo
1. **Repo root must remain the Next app** (D1) — `package.json`, `metadata.json`, `app/` at root, or Studio import/preview breaks.
2. **Studio's linked branch must not be `main`** once protection is on (D5/§8): a protected `main` rejects Studio's direct pushes and its conflict dialog cannot do PRs. Studio links to **`studio` branch**; `studio → main` happens via PR (bots + CI review, human merges).
3. **File ownership must be explicit** (§7.3): Studio's agent rewrites whole files and resolves conflicts by picking a side. Any file both Studio and SER10 agents edit *will* eventually lose one side's work. Ownership is enforced by convention + `AGENTS.md` + CodeRabbit path rules, and by keeping SER10-owned code in paths Studio has no reason to touch.
4. Studio cannot run the Threadle sidecar (Node runtime, no .NET, no local binaries; deployed app = Cloud Run container). In Studio preview, `/api/threadle/*` must return graceful demo/seed responses (feature-detect sidecar availability). **SER10 is the only place the full app works** — acceptable: Studio is an editor here, not the runtime.
5. Studio pulls external changes — so SER10 agents must push small, frequent, well-described commits to `studio`-bound PRs; giant renames guarantee a painful per-file conflict dialog for the user.

### 7.3 File ownership matrix

| Owner | Paths | Rule |
|---|---|---|
| **AI Studio (Gemini)** | `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `components/*.tsx`, `hooks/`, `metadata.json`, visual content of views | SER10 agents: propose UI changes as PRs/prompts for Studio, don't hand-edit these except trivial fixes noted in the PR |
| **SER10 agents (this plan)** | `lib/threadle-projection.ts`, `lib/server/**`, `app/api/threadle/**`, `app/api/analyze/route.ts` (contract only), `scripts/**`, `docs/**`, `.github/**`, `.coderabbit.yaml`, tests | Studio: must not rewrite; listed in `AGENTS.md` as off-limits |
| **Shared (negotiate via PR)** | `lib/types.ts`, `lib/threadle-engine.ts`, `lib/seed-data.ts` (until deleted), `package.json` | Corpus schema lives in `lib/types.ts` — changes here are schema changes: PR-only, never direct Studio push (Studio works on `studio`, so this is automatic if §8 holds) |
| **Nobody (generated/external)** | Threadle upstream source, `threadle-bin/`, `data/`, `node_modules/`, `.next/` | Never committed (see `.gitignore` additions in Phase 1) |

---

## 8. Branch protection + review bots (the public-repo play)

Repo is public deliberately: free bot review. Order matters — **bots first, protection last**, or the first PR gets no reviews.

1. **Install bots (manual, web-only — cannot be done via `gh`/API; repo owner clicks through):**
   - [ ] CodeRabbit: install GitHub App (coderabbit.ai → Add repository `Coldaine/CodeConversationSync`). Config committed as `.coderabbit.yaml` (Phase 1) with path instructions mirroring §7.3 (e.g. auto-flag edits to `lib/server/**` claiming UI changes, request changes if `lib/types.ts` changes without projection/test updates).
   - [ ] Greptile: install GitHub App (greptile.com → enable repository). No repo config file; review style set in its dashboard.
   - Already active (found 2026-11-16): **Renovate** — it has open dependency PRs #1–#5 on this repo, so dependency updates are covered; do not add Dependabot on top without disabling one of them. Consider later: Codecov (once tests run in CI), Socket (supply chain).
2. **CI before protection — GitHub-hosted runners, NOT the SER10 self-hosted runner.** This repo is public: a self-hosted runner executing `pull_request` code is arbitrary code execution on the home network (fork PRs, Renovate PRs, and AI-Studio-pushed code all count as untrusted). GitHub-hosted runners are free for public repos, so PR CI (`npm ci`, typecheck, engine/projection tests, Threadle JSON golden-line test with `actions/setup-dotnet` for .NET 10) runs there — which also removes the "SER10 offline ⇒ required check never reports ⇒ `main` deadlocked" failure mode. The SER10 self-hosted runner is reserved for trusted triggers only (`push` to `main`, `workflow_dispatch` — never `pull_request`/`pull_request_target` with checkout) for jobs that genuinely need the LAN/GPU/corpus. Security note for the existing runner: audit which repos it serves today; a runner registered for any public repo has this exposure already.
3. **Protect `main` — deferred to Phase 2 (v2 shrink, O4).** Rulesets before the graph works only add Studio friction, and they depend on the unverified Studio-branch behaviour (N1). Sequence when Phase 2 lands: ruleset requiring a PR, required approvals **0** (solo owner can't approve own PRs; bots + CI are the gate), CI status check required, force-pushes and branch deletion blocked. Payload lives at `docs/plans/ruleset-main.json` (created in that phase, not referenced before it exists).
4. **`studio` branch already exists** (created 2026-11-16 from `main` @ `f9e0506`); user re-links AI Studio (Settings → GitHub) per the N1 experiment outcome; PRs `studio → main` get bot review. Day-to-day SER10 work uses short-lived `feat/*`/`fix/*` branches → PR → `main`. Nobody pushes to `main` directly once protection lands.
5. **Tracking:** a GitHub issue ("Repo hardening checklist") holds the checkboxes above so the reminders survive outside this doc.

*Impact statement (researched):* with `main` protected and Studio on `studio`, Studio keeps working exactly as today (push/pull + conflict dialog, against `studio`). The only new user action is merging reviewed `studio → main` PRs. If Studio is ever unlinked, `studio` is deleted and protection stays as pure win.

---

## 9. Phases (each ends with a verifiable check on SER10)

### Phase 0 — Foundations ✅ (done 2026-11-16)
- [x] Both repos cloned on SER10 under `/ser10-data/projects/threadle-workspace/`; Threadle built; JSON protocol smoke passed.
- [x] mise activation fixed the box-idiomatic way: workspace `mise.toml` pins dotnet 10.0.404 + node 26.12.0 (delegated to a subagent, independently re-verified from a fresh plain SSH shell: SDKs listed, Threadle rebuilt, `--json` smoke passed).
- [ ] This plan + `AGENTS.md` merged (via PR, dogfooding §8 once CI exists; before CI, direct PR merge with 0 checks).
- **Check:** fresh `ssh ser10` shell: `cd workspace/CodeConversationSync && git log --oneline -1` shows this plan.

### Phase 1 — Projection & schema (pure TS, no UI change, no sidecar yet)
- `lib/threadle-projection.ts`: `corpus → {nodeset.tsv, layers/*.tsv, hyperedges.tsv, text-sidecar.json}` and inverse; implements §3 exactly. Fix the test setup first (add a runner that handles extensionless TS imports, e.g. `tsx --test`; wire `npm test`).
- Port the existing engine-test intents (shared-repo tasks stay separate; overrides preserve attribution) + projection round-trip tests on the seed corpus.
- `scripts/setup-threadle.sh` (clone upstream @ pinned SHA `857721e`, `dotnet build`; honors the workspace mise pin), `.gitignore` additions (`threadle-bin/`, `data/` only — the upstream clone lives at workspace level, outside this repo). `.coderabbit.yaml` already landed with this plan. No Dependabot — Renovate is already active (§8).
- **Check (executable, U8):** `npm test` green on SER10; project the seed corpus → load via real `threadle --json` → assert: total `getallnodes` count equals corpus entity count, `ext_id` set-equality (no phantom nodes — `addedge`/`importlayer` default `addmissingnodes=true` can silently manufacture kind-less nodes), every node has non-empty `kind`, per-layer edge counts match, id map stable across a second projection, and the inverse projection **deep-equals** the original `ThreadleCorpus`. Binary round-trip: `savefile` → `loadfile` → deep-equal again (N3). Timing experiment on a 1,000-node/5,000-edge synthetic corpus decides loadscript-vs-TSV as the canonical import path (N5).

### Phase 2 — Server integration (decision gate §6)
- `lib/server/threadle-client.ts`: spawn with mise-resolved binary path, serialized request queue, per-command timeout, restart-on-crash, strict error mapping from `Success/Code` (never exit code). Golden-line tests against recorded JSON protocol fixtures.
- `app/api/threadle/{corpus,graph,lineage,commit}/route.ts` implementing §6.1; runtime source detection (no build-time flag); Studio preview (sidecar absent) returns seed with `meta.source="seed"` and still builds (N7 smoke).
- MapView + LineageView read from these routes.
- **Check:** on SER10, Map topology renders from the sidecar with the binary stopped/started mid-session (client recovers, committed data intact per U5); latency harness produces the numbers for the §6 gate (N2: ingest batch p95, 5 concurrent reads, restart time); `communitydetection` determinism probe with/without `randomseed` (N4).

### Phase 3 — Persistence & ingest for real
- Corpus load/save via `savefile`/`loadfile` (`.bin` + nodeset sidecar) + `corpus-text.json` + `overrides.json` under `data/`; seed-data demoted to import fixture, then removed as a runtime source.
- IngestModal commits through `POST /api/threadle/commit` (Gemini proposes → user confirms → graph write under U5 durability); overrides via the same route, applied in the read DTO (§5/U6).
- v1 insights only (§4.1): community suggestions in Ingest, components-based forgotten-work panel, degree-based Map sizing. No Diagnostics page, no graph-position panel (backlog §4.2).
- **Check:** ingest a real transcript on SER10, restart app + sidecar, corpus (incl. override, visible via `meta.overridesApplied`) survives byte-identical; forgotten-work panel flags a deliberately isolated task; Studio-branch experiment (N1) result recorded here before any ruleset work.

### Phase 4 — Collectors (**deferred programme, v2 — does not gate the merge**)
- This is a separate programme (per-agent history parsers × 6 hosts, scheduling, privacy), not a phase of the merge. Its only merge-gating artifact is produced in Phase 1: a SER10-emitted TSV fixture proving collectors can write the U3 formats.
- Sketch when it starts: per-host collectors (SER10 first) read Claude Code/Codex/Droid/OMP/Maestro histories + Wispr exports read-only, emit Threadle TSV + sidecar entries, hot-import; incremental by `contentHash`, never full re-scans. Privacy/exclusion policy (H5, §11) must be settled before any non-owner data is collected.
- **Check (future):** a coding session done on Blood Arrow appears in SER10's UI with correct attribution and lineage, without manual ingest.

### Phase 5 — Hardening & upstream hygiene
- CI required on `main` (GitHub-hosted runners for all PR checks per §8), CodeRabbit+Greptile active and tuned after 2 weeks of real PRs (N6), Renovate kept as the sole dependency bot. **SER10 self-hosted runner is out of scope for this repo (v2 correction):** `gha-runner.service` is registered to `MooseGooseConsulting`, and `repos/Coldaine/CodeConversationSync/actions/runners` is empty — no runner bullet until H3 (§11) is decided.
- Threadle upstream pin upgrade procedure documented (bump SHA in `scripts/setup-threadle.sh`, replay golden-line tests). If we ever need Core changes, fork as `Coldaine/Threadle` and point the script at it — never patch the local clone in place.
- Optional Option-B (.NET host) evaluation with Phase 2–4 latency numbers in hand.

---

## 10. Risks & open questions

| Risk/question | Handling |
|---|---|
| Studio rewrites a SER10-owned file and the conflict dialog loses work | §7.3 ownership + small commits + `studio` branch contains the blast radius; worst case is one PR's diff, recoverable from git |
| Sidecar protocol drifts with upstream upgrades | Pin SHA; golden-line fixtures fail loudly in CI before any upgrade merges |
| Edge-metadata sidecar drifts from graph (two stores) | Projection is the single writer; sidecar entries are keyed `(layer,from,to)` and validated against `getalledges` in tests; a reconcile command is a Phase 3 deliverable, not an afterthought |
| Solo-owner PR protection becomes ceremony without review value | Bots + CI are the reviewers; if bot noise > signal after 2 weeks, tune `.coderabbit.yaml`/Greptile settings before loosening protection |
| Threadle's scale design is overkill for hundreds of nodes | Accepted (analysis §4): we buy the multilayer model, algorithms, and binary persistence — not speed. Option B keeps an exit if the sidecar tax dominates |
| Q: Does Studio's GitHub link target a branch we choose, or always the default branch? | **Must verify in Studio UI when re-linking** (§8 step 4). If it insists on the default branch, set the repo default to `studio` temporarily and keep `main` as the protected integration branch (PRs target `main` regardless of default). |
| Q: Naming/trademark | This repo already calls itself "Threadle" (pre-merge, user's own project). Upstream is MIT code, not a name grant — don't publish binaries or a site under upstream's name/branding without asking Carl Nordlund. Internal/dev use as-is. |

---

## 11. Decisions: human-only, agent-inferred, and not-yet-decidable (v2)

Triaged by the critique's strict test: a human decision must be (a) not inferable from code/requirements **and** (b) decidable well today.

### 11.1 For the owner to weigh in on (short list)

| # | Decision | Options / trade-off | Default if unanswered |
|---|---|---|---|
| H1 | Is AI Studio still the UI editor in 6 months? | Keep: ownership matrix + `studio` branch + per-file conflict dialog are a permanent two-editor tax. Drop: agents own `components/`, all of §7's gymnastics vanish | Keep, but **freeze Studio edits to `components/` during Phases 1–3** while the API contract forms |
| H2 | Who can reach the app on SER10, and who may write? | Loopback-only (no auth needed) vs LAN (needs auth) vs public (auth+TLS). Corpus = transcripts of all coding sessions, incl. code; the plan has no auth anywhere else | Bind `127.0.0.1`, SSH-tunnel access, no write API beyond loopback |
| H3 | Repo home: `Coldaine` (personal) or `MooseGooseConsulting` (org)? | Not cosmetic: the SER10 runner is registered to the org; this repo (personal) has zero runners. Stay personal ⇒ GitHub-hosted CI only; move ⇒ runner reuse but org overhead | Stay personal, GitHub-hosted CI only, SER10 runner out of scope |
| H4 | Threadle naming: heads-up to Carl Nordlund now, rename later, or internal-only indefinitely? | Relationship cost vs surprise later; MIT covers code, not the name | One-paragraph heads-up now; keep the name; publish nothing under it |
| H5 | Transcript data-at-rest policy (bites at Phase 4) | Plaintext on `/ser10-data` vs encrypted vs per-project/client exclusion list. Collectors will read agent histories that may contain client code | Plaintext + documented exclusion list + no transcripts in git (already in AGENTS.md); revisit before collecting any non-owner data |

### 11.2 Agent decides (inferable — do not escalate)

Test runner `tsx --test` + `npm test`; epoch-second int dates; drop `NEXT_PUBLIC_GRAPH_SOURCE` (runtime `meta.source` instead); `attrname=an_<analysis>_<layer>` constants in one module; `depends-on` cut; reuse the existing `studio` branch; `EstimatedMemory` via `info`/`getlayerstats` (no `getestimatedbytes` command); no `.gitignore` entry for the workspace-level upstream clone; ruleset payload at `docs/plans/ruleset-main.json` when created; topology reads always `direction=both`; `ext_id→uint` map from one `getattrstable` call.

### 11.3 Not yet decidable (work first, then decide)

| # | Question | Artifact/experiment that makes it decidable | Produced in |
|---|---|---|---|
| N1 | Can Studio target a non-default branch? | 15-min throwaway-repo experiment: link, push from Studio, observe which branch gets the commit / whether Settings exposes a branch field | Phase 1 |
| N2 | Sidecar (A) vs .NET host (B)? | Latency harness numbers (ingest p95, concurrent reads, restart time) | Phase 2 gate |
| N3 | Does `savefile`/`loadfile` round-trip the whole corpus? | Binary round-trip deep-equal test | Phase 1 check |
| N4 | Are `an_*` results deterministic across restarts? | `communitydetection` twice, with/without `randomseed`, diff | Phase 2 check |
| N5 | Canonical import path: loadscript replay vs bulk TSV import? | Timing on 1k-node/5k-edge synthetic corpus | Phase 1 check |
| N6 | Bot signal-to-noise | 2 weeks of real PRs | Phase 5 |
| N7 | Does the app build/render in Studio preview with sidecar code present but binary absent? | Studio preview smoke with sidecar env unset | Phase 2 |

---

## Appendix A — SER10 environment (verified)

```bash
ssh ser10
cd /ser10-data/projects/threadle-workspace   # CodeConversationSync/  Threadle/  threadle-bin/  mise.toml
# mise.toml here pins dotnet 10.0.404 + node 26.12.0 — any shell in this tree activates them.
# Outside this tree, `dotnet` falls through to a runtime-only system 9.0.20 (no SDKs): stay in the workspace.
dotnet build Threadle/Threadle.CLIconsole/Threadle.CLIconsole.csproj -c Release -o threadle-bin
printf '%s\n' '{"command":"createnodeset","assign":"ns","args":{"name":"corpus"}}' 'exit' | ./threadle-bin/threadle --json
```

## Appendix B — Threadle CLI surface used by this plan

State: `createnodeset`, `createnetwork`, `addnode`, `defineattr`, `setattr(s)`, `addlayer`, `addedge`, `addhyper`, `addaff`, `loadfile`, `savefile`, `loadscript`, `importlayer`, `importnodeattributes`, `i` (inventory), `info`.
Query: `getnodealters`, `getalledges`, `getallnodes`, `getattr(s)`, `getattrstable`, `getalterdetails`, `getnodehyperedges`, `gethyperedgenodes`, `getlayerstats`, `getattrsummary`, `shortestpath(s)`.
Analysis (client MUST pass `attrname=an_<analysis>_<layer>`; Threadle's defaults are unprefixed): `degree`, `components`, `communitydetection`, `pagerank`, `betweennesscentrality`, `closenesscentrality`, `harmoniccentrality`, `eigenvectorcentrality`, `coreness`, `clusteringcoefficient`, `edgebetweennesscentrality`.
Derived/export: `projecttwomode`, `subnet`, `filter`, `export` (gexf/graphml/pajek), `pack`/`unpack`.
Full 103-command registry: `Threadle/Threadle.CLIconsole/Runtime/CommandDispatcher.cs`.
