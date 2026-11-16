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
| D4 | **All development happens on SER10** over SSH. This machine (whichever laptop) is a thin client. | SER10 is the always-on host, already runs the self-hosted GitHub Actions runner (`gha-runner.service`), has 24 cores / 58 GB RAM / 1.5 TB free on `/ser10-data`. Root disk is 86% full — all work lives on `/ser10-data`, never `/`. |
| D5 | **`main` gets PR-only protection, but only together with a `studio` integration branch** (§8). Bots (CodeRabbit, Greptile, + others) review PRs. | AI Studio pushes directly to its linked branch with AI-generated commits and has **no branch picker and no PR flow** — protecting `main` naively breaks Studio sync outright. Solo-owner caveat: GitHub will not let you approve your own PR, so required approvals = 0; the PR requirement exists to force bot review + CI, not human approval. |
| D6 | The UI mockup is **a mockup**. Nothing in `components/` is load-bearing where it conflicts with the graph model. Where Threadle emits data the mockup has no place for, we add UI surface (§4); where the mockup models things Threadle can't, we keep them TS-side (§5). | Explicit user direction. The mockup's value is the *domain vocabulary* (projects/tasks/sessions/Wispr/deliverables/lineage) and view concepts, not its layout. |

---

## 1. Verified facts (SER10, 2026-11-16)

- SER10 = Nobara Linux 44, user `coldaine`, `gh` logged in as `Coldaine`, podman (no docker), GitHub self-hosted runner service active.
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

One `Nodeset` (`corpus`) + one `Network` (`conversation-graph`). UI string ids survive in the string attribute `ext_id` (unique, ≤255 bytes) and resolve through it (the `labelAttr`/`idAttr` pattern Threadle already supports). The TS side keeps an `ext_id ⇄ uint` map built once at load.

### 3.1 Entities → nodes

| Mockup entity (`lib/types.ts`) | `kind` attr | Node attributes (scalar only) | NOT attributes → become edges |
|---|---|---|---|
| `ProjectSummary` | `project` | name, workstreamCategory, healthStatus, startedAt*, lastActivityAt*, forgottenCount | repos[], hosts[], agents[] |
| `WorkTask` | `task` | title, status, isForgotten, startedAt*, lastActivityAt* | branches[], hosts[], agents[] |
| `Deliverable` | `deliverable` | title, status, discrepancyFlag, repo, branch, prNumber | evidenceIds[] |
| `EvidenceItem` | `evidence` | kind, verified, timestamp*, reference | — |
| `IntentionRecord` | `intention` | kind, resolved, timestamp* | sourceRef → edge to session |
| `SessionEpisode` | `session` | agent, host, repo, branch, directory, status, startedAt*, endedAt*, contentHash, agentClaimedDone, verifiedDone | projectId, taskId |
| `WisprDictation` | `wispr` | capturedOnHost, attributionStatus, timestamp*, durationSeconds | matchedSessionId, matchedProjectId |
| `LineageNode` | `lineage` | kind, status, timestamp* | parentId |
| `HostCollectorStatus` | `host` | role, lastAuditSync*, sessionsIndexed, wisprRecords, runningSessions | agentsDetected[] |
| *(new)* agent, repo | `agent`, `repo` | name | — (first-class nodes, were only strings before) |

\* Dates: Threadle has no date type → epoch-seconds `int` attributes, formatting stays in TS. Long text (transcripts, `continuationPromptSeed`, summaries) is **not** a node attribute (255-byte binary-string limit, single-valued) — it lives in the sidecar JSON store keyed by `ext_id` (§5).

### 3.2 Relations → layers (relation kind = layer; edges carry only a float)

| Layer | Mode | Connects | Replaces today's… |
|---|---|---|---|
| `contains` | 1-mode directed binary | project→task→deliverable | `projectId`/`taskId` FK chains |
| `lineage` | 1-mode directed binary | lineage parent→child; intention/session sequence | `LineageNode.parentId`, hand-sorted chains in `LineageView` |
| `attributed-to` | 1-mode directed binary | wispr→session, wispr/session→project | `matchedProjectId`, override maps |
| `evidenced-by` | 1-mode directed binary | deliverable→evidence | `evidenceIds[]` |
| `depends-on` | 1-mode directed **valued** | task→task (float = confidence/strength) | *(new capability, no mockup equivalent)* |
| `participation` | 2-mode | hyperedge per session = {host, agent, repo, project, task} | `host`/`agent` fields + `MapView` FK joins |
| `assignment` | 2-mode | hyperedge per task = {hosts, agents, repos} | `hosts[]`/`agents[]`/`repos[]` arrays |

2-mode projection (`projecttwomode`, Newman/Count) then yields "projects sharing a host/agent/repo" overlap — the cross-host topology `MapView` currently hand-computes per render.

### 3.3 What each existing view consumes after the merge

| View | Today | After |
|---|---|---|
| `TimelineView` (1,305 ln) | seed corpus + TS bar math | Same TS math (dormancy, zoom) over API corpus; graph adds nothing here — **do not force it** |
| `ProjectsView` | FK counting in `computeProjectMetrics` | Metrics partly from graph: degree (in/out per layer), component membership |
| `MapView` | recomputes host↔project↔repo edges from FKs every render | `getalledges`/`getnodealters` per layer + 2-mode projection; node size = centrality (§4) |
| `LineageView` | filters + sorts `lineageNodes` | `shortestpath(..., returnpath=true)` ancestry; eccentricity for chain depth |
| `SessionsView` | seed + localStorage ingest | Real sessions from collectors; attribution = graph edges, overridable (edges are mutable, FK fields were not) |
| `DetailDrawer` | resolves parents by FK walk | `getalterdetails` ego table + graph-position panel (§4) |
| `IngestModal` | Gemini classify → localStorage | Gemini classify → commit to graph; community detection suggests grouping (§4) |

---

## 4. Threadle out-of-the-box data that needs a NEW home in the UI

This is the mockup's biggest blind spot: Threadle analyses **write results back as node attributes** (`attrname=`), so every analysis below produces a new per-node column the mockup has no surface for. Rule: analyses land as attributes prefixed `an_…` and get homes in a new **Insights** surface (project/session detail + a diagnostics view), never silently mixed into domain attributes.

| Threadle capability (CLI command) | Output | New UI home |
|---|---|---|
| `communitydetection` (Leiden/Louvain/LP/LPAm/GirvanNewman) | `an_community` per node | **IngestModal**: "suggested grouping" for unassigned sessions; **MapView**: color nodes by community. Directly attacks the seed corpus's stated problem ("group sessions into workstreams without merging same-repo tasks") — structural, not semantic; Gemini stays the semantic judge, community is a *hint* with accept/reject |
| `degree`, `getdegree` | `an_degree_in/out` | MapView node sizing; ProjectsView "most connected" sort |
| `betweennesscentrality`, `closenesscentrality`, `harmoniccentrality`, `eigenvectorcentrality`, `pagerank` | `an_*` scores | **DetailDrawer → "Graph position" panel**: which projects/hosts/agents are bridges/hubs; a Rankings table in Insights (e.g. the host everything flows through = single point of failure) |
| `components` | `an_component` | **Forgotten-work panel** (with existing TS dormancy): isolated tasks/sessions in their own component = likely abandoned; feeds `isForgotten` instead of hand-set flags |
| `coreness` | `an_core` | Insights: core vs periphery of the work graph |
| `clusteringcoefficient`, `transitivity`, `density`, `getlayerstats`, `diameter`, `eccentricity` | layer-level stats | **Diagnostics view** (new): per-layer cards (edges, density, diameter) — this is also the corpus health page; replaces hand-wavy `HostCollectorStatus` numbers with measured ones |
| `shortestpath` / `shortestpaths`, `shortestpathsattributes`, `rwfpt` (random-walk first passage) | distances | LineageView "how did we get here"; Insights: distance between project categories/hosts ("how far is SER10 work from N5 work") |
| `dyadcensus`, `triadiccensus`, `assortativity`, `degreeassortativity` | network-level structure | Diagnostics view (research-grade; collapsed by default) |
| `edgebetweennesscentrality` | new layer of critical bridges | MapView highlight: sessions/deliverables bridging two projects (cross-project contamination detector) |
| `getalterdetails` | ego×alter×layer table | DetailDrawer: full alters table for any node (the mockup's drawer hand-walks FKs today) |
| `getattrsummary`, `getattrstable` | attribute distributions/columns | Diagnostics: status/kind/host distributions without writing TS counting code |
| `getnodehyperedges`, `gethyperedgenodes`, `getallhyperedges` | session/task membership rosters | SessionsView: "who/what participated" per session (the mockup shows only single host+agent strings) |
| `export` (GraphML/GEXF/Pajek), `savefile`/`loadfile`, `pack` | files | **Export actions** in TopBar: GraphML/GEXF for Gephi, `.bin` corpus snapshot = the real persistence story (§5); `info`/`getestimatedbytes`/`systeminfo` → Diagnostics footer |
| `subnet`, `filter`, `mergelayers`, `symmetrize`, `dichotomize`, `projecttwomode` | derived layers/networks | Power-user "derived view" operations behind Insights; not v1 UI, but the API client must not preclude them |

**Explicitly no home (do not surface):** `generate`/`generateattr`/`rewire` (synthetic network generators — would pollute a real corpus), `getrandomnode/edge/alter` (sampling internals). They stay available to scripts/tests only.

---

## 5. Mockup data Threadle cannot hold — and where it lives instead

Threadle edges carry **one float and nothing else**: no timestamps, no provenance, no roles. Node attributes are single-valued, ≤255 per nodeset. So:

| Mockup data | Problem | Home |
|---|---|---|
| Transcript text, `whatHappened`, Wispr transcripts, `continuationPromptSeed`, summaries | long text | **Sidecar JSON store** on SER10 (`data/corpus-text.json`, keyed by `ext_id`); node holds only `contentHash` + pointer |
| Relation metadata (when a wispr was attributed, by whom, confidence reason; evidence→deliverable link context) | no edge attributes | Sidecar JSON store as edge records `(layer, from_ext, to_ext, meta)`; float value holds confidence where numeric |
| `UserOverrides` (sessionProjectMap, deliverableStatusMap, resolvedIntentionIds) | user state, not graph fact | Keep as explicit override records (today: localStorage; after: server-side JSON on SER10). Overrides *project onto* graph edges at load; they are never written into the `.bin` |
| Gemini analysis (`app/api/analyze`) | not graph at all | Stays a Next server route (Studio-compatible); its output becomes ingest proposals committed through the projection |
| Timeline swimlanes, zoom, bar spans, filters, continuation packets | view math | Stays in `lib/threadle-engine.ts` (pure TS, testable) — this file is an asset, keep it |

Persistence story after merge: graph (`.bin` via `savefile`, nodeset sidecar file in same dir) + `corpus-text.json` + `overrides.json`, all under `/ser10-data/projects/threadle-workspace/data/`, all git-ignored except seed fixtures. The seed corpus becomes a one-time import fixture and is then deleted as a data source.

---

## 6. Server integration: decision gate (Phase 2)

| Option | Shape | For | Against |
|---|---|---|---|
| **A. Sidecar (proven)** | Next server spawns `threadle --json`, serialized line protocol, typed TS client (`lib/server/threadle-client.ts`) | Zero C# work; all 101 commands incl. future upstream; Phase 0 already green on SER10 | Stringly `args` (all values stringified), single sequential process, errors only via JSON `Success/Code` (exit code always 0), no request ids → strict in-order matching, restart-on-crash handling on us |
| **B. In-process .NET host** | Small ASP.NET Core service referencing `Threadle.Core` directly, JSON HTTP API | Typed API, real concurrency story, no process babysitting; SER10 runs .NET natively and we may install anything | New C# codebase to own; only Core is callable — some model API is `internal` (must use `Network.Add*` wrappers); global statics (`UserSettings`, CWD) need isolation care in a web host; Studio can't run it either |
| C. Port to TS | — | — | Discards the plumbing that is the entire point. Rejected. |

**Gate:** build A first (it is 90% client code and already smoke-tested). Move to B only if A's serialization/concurrency actually hurts (measured: ingest batch latency, concurrent UI queries). The projection (§3) and graph files are identical under A and B, so the gate is cheap to cross later. **Blazor/full-.NET UI was considered and rejected** while AI Studio remains a UI editor: Studio generates React/Node (or Android/Kotlin) only, so a .NET UI would cut Studio out entirely (D1/D3).

---

## 7. Working with Google AI Studio (researched, 2026-11-16)

Sources: official Build-mode docs (`aistudio.google.com/docs/aistudio-build-mode`) + AI Developers forum.

### 7.1 How it actually interacts with Git
- Create by prompt, **Import from GitHub** (Add files menu), or link an existing repo in **Settings → GitHub**. Sync is two-way: Studio pushes its commits (AI-generated messages) and pulls external changes; conflicts get a **per-file side-by-side "keep Studio / keep GitHub" dialog** — no real merge tool, no rebase, no branch operations.
- There is **no branch picker and no PR concept** in Studio. (Forum, 2026-08: users explicitly requesting target-branch selection and push-to-existing-repo; Google reply points at the docs' two-way sync.) Treat Studio as *a committer to one linked branch*, nothing more.
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
| **SER10 agents (this plan)** | `lib/threadle-projection.ts`, `lib/server/**`, `app/api/threadle/**`, `app/api/analyze/route.ts` (contract only), `scripts/**`, `docs/**`, `.github/**`, `mise.toml`, `.coderabbit.yaml`, tests | Studio: must not rewrite; listed in `AGENTS.md` as off-limits |
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
3. **Then protect `main`** (ruleset, so bypass rules are explicit): require a PR, required approvals **0** (solo owner can't approve own PRs; bots + CI are the gate), require the CI status check, block force-pushes and branch deletion, require branches up to date before merge. Repo admins *not* exempted except a documented emergency bypass.
   ```bash
   gh api -X POST repos/Coldaine/CodeConversationSync/rulesets --input ruleset-main.json   # payload in docs/plans/appendix, Phase 1
   ```
4. **Cut `studio` branch** from `main` at protection time; user re-links AI Studio (Settings → GitHub) to the repo and works there; PRs `studio → main` get bot review. Day-to-day SER10 work uses short-lived `feat/*`/`fix/*` branches → PR → `main` as well. Nobody — human, Studio, or agent — pushes to `main` directly after this point.
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
- `scripts/setup-threadle.sh` (clone upstream @ pinned SHA `857721e`, `dotnet build`; honors the workspace mise pin), `.gitignore` additions (`threadle-bin/`, `data/`, upstream clone dir). `.coderabbit.yaml` already landed with this plan. No Dependabot — Renovate is already active (§8).
- **Check:** `npm test` green on SER10; projecting the seed corpus yields a graph the real `threadle --json` loads without error (`loadscript` replay) — counts match the corpus (projects/tasks/sessions/…).

### Phase 2 — Server integration (decision gate §6)
- `lib/server/threadle-client.ts`: spawn with mise-resolved binary path, serialized request queue, per-command timeout, restart-on-crash, strict error mapping from `Success/Code` (never exit code). Golden-line tests against recorded JSON protocol fixtures.
- `app/api/threadle/{graph,lineage,insights}/route.ts`: `getalledges`/`getnodealters`/`shortestpath` behind `ThreadleCorpus`-shaped DTOs; feature-detect for Studio preview (seed fallback).
- MapView + LineageView read from these routes behind a flag (`NEXT_PUBLIC_GRAPH_SOURCE=threadle|seed`).
- **Check:** on SER10, Map topology renders from the sidecar with the binary stopped/started mid-session (client recovers); Studio preview still renders seed data.

### Phase 3 — Persistence & ingest for real
- Corpus load/save via `savefile`/`loadfile` (`.bin` + nodeset sidecar) + `corpus-text.json` + `overrides.json` under `data/`; seed-data demoted to import fixture, then removed as a runtime source.
- IngestModal commits through projection (Gemini proposes → user confirms → graph write); `UserOverrides` projection at load (§5).
- Insights surface v1 (§4): community suggestions in Ingest, components-based forgotten-work panel, DetailDrawer graph-position panel, Diagnostics layer stats.
- **Check:** ingest a real transcript on SER10, restart the app + sidecar, corpus (incl. override) survives; forgotten-work panel flags a deliberately isolated task.

### Phase 4 — Collectors (the actual "sync" in CodeConversationSync)
- Per-host collectors (start with SER10 itself, the role the seed data already assigns it): read Claude Code/Codex/Droid/OMP/Maestro local histories + Wispr exports read-only, emit Threadle TSV + text sidecar entries, hot-import via sidecar. Incremental by `contentHash` (session attr), never full re-scans.
- Other hosts (N5, Blood Arrow, Primary Desktop, Gemini Laptop, Icarus) ship the same collector; SER10 aggregates. This is where "CodeConversationSync" earns its name — and it is deliberately *after* the graph/UI merge, not before.
- **Check:** a coding session done on Blood Arrow appears in SER10's UI with correct project attribution and lineage, without manual ingest.

### Phase 5 — Hardening & upstream hygiene
- CI required on `main` (GitHub-hosted runners for all PR checks per §8; SER10 self-hosted runner only on trusted `push`/`workflow_dispatch` jobs), CodeRabbit+Greptile active and tuned (dismiss-noise pass), Renovate kept as the sole dependency bot.
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
Analysis (writes `an_…` attrs): `degree`, `components`, `communitydetection`, `pagerank`, `betweennesscentrality`, `closenesscentrality`, `harmoniccentrality`, `eigenvectorcentrality`, `coreness`, `clusteringcoefficient`, `edgebetweennesscentrality`.
Derived/export: `projecttwomode`, `subnet`, `filter`, `export` (gexf/graphml/pajek), `pack`/`unpack`.
Full 101-command registry: `Threadle/Threadle.CLIconsole/Runtime/CommandDispatcher.cs`.
