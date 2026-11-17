# AGENTS.md — CodeConversationSync

Instructions for every agent working in this repo: Claude Code, OMP, Codex, Droid, Maestro,
coding agents on SER10, and Google AI Studio (Build mode / Antigravity). Humans too.

## What this project is

Working name: **CodeConversationSync** (final product name TBD by the owner). Do **not**
call this product "Threadle" — that name refers to the engine code lifted into `threadle/`
(origin: `carlnordlund/Threadle`). Legacy mockup files named `ThreadleApp`/`ThreadleCorpus`
predate this rule and will be renamed when the product name lands.

A unified map of multi-host coding work: sessions (Claude Code, Codex, Droid, OMP, Maestro,
ChatGPT), Wispr Flow dictations, projects/tasks, deliverables, evidence, and decision lineage —
across 6 hosts (SER10, N5, Blood Arrow, Primary Desktop, Gemini Laptop, Icarus).

The graph engine lives **in this repo** at `threadle/` — the Threadle codebase
(`Threadle.Core`, `Threadle.CLIconsole`, `Threadle.Tests`, .NET 10) lifted wholesale
on 2026-11-16 and now **our code**: edit it, diverge it, keep its xUnit suite green.
There is no upstream dependency (origin/provenance: `threadle/PROVENANCE.md`).
This repo is one codebase: UI + corpus schema + projection/client + engine + collectors + docs. Read before starting:

- `docs/plans/2026-11-16-threadle-merge-enhancement-plan.md` — the merge plan (source of truth)
- `docs/threadle-merge-analysis.md` — the survey behind it

## Where work happens

- **Development host: SER10.** SSH in (`ssh ser10`); workspace is
  `/ser10-data/projects/threadle-workspace/` containing `CodeConversationSync/`, `Threadle/`
  (upstream clone), and `threadle-bin/` (built CLI). The root disk is 86% full — never work in `/` or `$HOME` project dirs; use `/ser10-data`.
- Laptops are thin clients. Do not build Threadle off SER10 (laptops may have no .NET SDK).
- Dependencies on SER10 are managed with **mise** (see `mise.toml`; global fragments in
  `~/.config/mise/conf.d/coldaine/`). Use mise for anything you install. No second package
  manager, no hand-made symlinks. Current state (verified 2026-11-16): the workspace
  `mise.toml` at `/ser10-data/projects/threadle-workspace/mise.toml` pins
  `dotnet = "10.0.404"` and `node = "26.12.0"`; any shell in that tree (login or plain
  SSH) gets working `dotnet --list-sdks` and `node`. Outside the workspace, `dotnet`
  falls through to a runtime-only system 9.0.20 with no SDKs — always work inside the
  workspace. If activation ever breaks, fix the mise pin (`mise use`), never paper
  over it with committed `DOTNET_ROOT` exports.

## File ownership (which tool edits which file)

AI Studio (Gemini) and SER10 agents both edit this repo, coordinated by the owner
personally — ownership below is a *which-tool-for-which-file* convention so each tool
works where it is strongest, not a conflict-avoidance regime:

| Owner | Paths |
|---|---|
| **AI Studio (Gemini)** | `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `components/*.tsx`, `hooks/`, `metadata.json` |
| **SER10 agents** | `threadle/**` (our engine code), `lib/threadle-projection.ts`, `lib/server/**`, `app/api/threadle/**`, `scripts/**`, `docs/**`, `.github/**`, `.coderabbit.yaml`, tests; plus the workspace-level `../mise.toml` on SER10 (not in this repo) |
| **Shared — PR only, never direct-push edits** | `lib/types.ts` (the corpus schema), `lib/threadle-engine.ts`, `package.json` |
| **Never commit** | `threadle/**/bin`, `threadle/**/obj`, `threadle-bin/`, `data/`, `node_modules/`, `.next/` (the `threadle/` source itself IS committed — it is our engine) |

- AI Studio: do not edit SER10-owned paths. If a UI change needs a new API/prop, describe it
  in your summary instead of inventing it in `lib/server/` or `lib/types.ts`.
- SER10 agents: do not hand-edit Studio-owned components except trivial, PR-described fixes.
  Propose substantial UI changes as prompts/PR descriptions for Studio.
- Schema changes (`lib/types.ts`) are contract changes: they require matching updates to
  `lib/threadle-projection.ts` and its tests in the same PR.

## Git workflow

- `main` is protected: **PR-only, no direct pushes, no force pushes** (required approvals = 0;
  CI + bot reviews are the gate — the owner cannot approve their own PRs).
- **AI Studio works on the `studio` branch only.** It has no branch picker and no PR flow;
  pointing it at `main` will break once protection is on. Work flows `studio` → PR → `main`.
- Everyone else: short-lived `feat/*` / `fix/*` branches → PR → `main`. Small, frequent,
  well-described commits (Studio's conflict dialog is per-file; giant renames hurt).
- Review bots (CodeRabbit via `.coderabbit.yaml`, Greptile) review every PR. Treat bot
  comments as review comments: fix or reply with reasoning, don't ignore.
- Never commit secrets, transcripts, or corpus data. `GEMINI_API_KEY` comes from the
  environment / AI Studio Secrets, never from a file in this repo.

## Threadle (the engine)

- Engine source: `threadle/` in this repo (see `threadle/PROVENANCE.md` for origin).
  Build: `dotnet build threadle/Threadle.CLIconsole -c Release -o threadle-bin`
  (.NET 10 SDK; on SER10 the workspace mise pin provides it). Edit freely — it is our
  code now; there is no upstream to stay in sync with. Keep `threadle/Threadle.Tests` green.
- Interop is the CLI's JSON mode: `threadle --json`, one JSON object per stdin line
  (`{"command":…,"assign":…,"args":{…}}`), one JSON result per stdout line. Args are all
  strings. **The process exit code is always 0** — success is only the JSON `Success`/`Code`.
- Model constraints that shape all code here: node ids are `uint` (string ids live in the
  `ext_id` node attribute); edges carry a single float and *no* timestamps/provenance (edge
  metadata lives in `data/corpus-text.json` sidecar, keyed by `(layer, from_ext, to_ext)`);
  node attributes are typed (char/int/float/bool/string), single-valued, ≤255 total.
  Dates are epoch-seconds ints. Long text never goes in node attributes.
- Analysis results are stored as node attributes; **our code** names them with the
  `an_<analysis>_<layer>` convention (upstream defaults are unprefixed). Never mix
  analysis attributes into domain attributes.

## Runtime rules (SER10, recorded owner decisions)

- The app binds **`127.0.0.1` only** (access via SSH tunnel). No auth exists; do not
  widen the bind address without adding auth first.
- Threadle has **no database and no encryption** — corpus persistence is its `.bin`/TSV
  files plus our JSON sidecar. The `data/` tree must live in the **gocryptfs-encrypted**
  vault on SER10 (mounted only while the app runs; key never in this repo). Never write
  transcripts or corpus files outside the vault, and never commit them.
- Threadle analysis calls must pass `attrname=an_<analysis>_<layer>` explicitly
  (upstream defaults are unprefixed and collide across layers).

## Commands (on SER10, in the repo root)

```bash
npm run dev        # UI dev server
npm run build      # production build / typecheck gate
npm test           # engine + projection tests (node test runner via tsx)
./scripts/build-threadle.sh   # dotnet build threadle/Threadle.CLIconsole (in-repo engine)
```
## Testing rules

- New projection/client code ships with tests in the same PR. Golden-line fixtures for the
  Threadle JSON protocol live with the client; protocol changes (ours to make) must land
  as one PR touching CLI + fixtures + TS client together.
- Tests must run green on SER10 (`npm test`) before a PR is marked ready. PR CI runs on
  **GitHub-hosted runners** — never the SER10 self-hosted runner on `pull_request`
  (public repo: that would run untrusted code on the home network). The SER10 runner is
  for trusted `push`/`workflow_dispatch` jobs only.

## Repo hardening reminders

- [ ] Install CodeRabbit + Greptile GitHub Apps on this repo (web-only, owner action)
- [ ] Add `.github/workflows/ci.yml` (GitHub-hosted runners), then enable the `main` ruleset
- [ ] Cut the `studio` branch and re-link AI Studio before protection goes live
Tracked as a GitHub issue ("Repo hardening checklist") — keep it updated, don't duplicate it here.
