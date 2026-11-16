# AGENTS.md — CodeConversationSync

Instructions for every agent working in this repo: Claude Code, OMP, Codex, Droid, Maestro,
coding agents on SER10, and Google AI Studio (Build mode / Antigravity). Humans too.

## What this project is

A unified map of multi-host coding work: sessions (Claude Code, Codex, Droid, OMP, Maestro,
ChatGPT), Wispr Flow dictations, projects/tasks, deliverables, evidence, and decision lineage —
across 6 hosts (SER10, N5, Blood Arrow, Primary Desktop, Gemini Laptop, Icarus).

The graph engine is **Threadle** (upstream `carlnordlund/Threadle`, MIT, .NET 10) used as an
external, pinned dependency. This repo holds the UI, the corpus schema, the TypeScript
projection/client for Threadle, collectors, and docs. Read before starting:

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

## File ownership (critical — Google AI Studio is a co-editor)

AI Studio syncs the whole repo, rewrites whole files, and resolves conflicts by picking a
side per file. Ownership prevents silent loss:

| Owner | Paths |
|---|---|
| **AI Studio (Gemini)** | `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `components/*.tsx`, `hooks/`, `metadata.json` |
| **SER10 agents** | `lib/threadle-projection.ts`, `lib/server/**`, `app/api/threadle/**`, `scripts/**`, `docs/**`, `.github/**`, `.coderabbit.yaml`, tests; plus the workspace-level `../mise.toml` on SER10 (not in this repo) |
| **Shared — PR only, never direct-push edits** | `lib/types.ts` (the corpus schema), `lib/threadle-engine.ts`, `package.json` |
| **Never commit** | Threadle upstream source, `threadle-bin/`, `data/`, `node_modules/`, `.next/` |

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

- Upstream: `https://github.com/carlnordlund/Threadle`, pinned in `scripts/setup-threadle.sh`.
  Build on SER10: `dotnet build Threadle.CLIconsole -c Release -o ../threadle-bin`.
  Never patch the upstream clone in place; if Core changes are ever needed, fork first.
- Interop is the CLI's JSON mode: `threadle --json`, one JSON object per stdin line
  (`{"command":…,"assign":…,"args":{…}}`), one JSON result per stdout line. Args are all
  strings. **The process exit code is always 0** — success is only the JSON `Success`/`Code`.
- Model constraints that shape all code here: node ids are `uint` (string ids live in the
  `ext_id` node attribute); edges carry a single float and *no* timestamps/provenance (edge
  metadata lives in `data/corpus-text.json` sidecar, keyed by `(layer, from_ext, to_ext)`);
  node attributes are typed (char/int/float/bool/string), single-valued, ≤255 total.
  Dates are epoch-seconds ints. Long text never goes in node attributes.
- Analysis results are written back as node attributes with the `an_` prefix
  (`an_community`, `an_pagerank`, …). Never mix them into domain attributes.

## Commands (on SER10, in the repo root)

```bash
npm run dev        # UI dev server
npm run build      # production build / typecheck gate
npm test           # engine + projection tests (node test runner via tsx)
./scripts/setup-threadle.sh   # clone + build pinned Threadle into ../threadle-bin
```

## Testing rules

- New projection/client code ships with tests in the same PR. Golden-line fixtures for the
  Threadle JSON protocol live with the client; if upstream's protocol changes, fixtures fail
  first — that's the point.
- Tests must run green on SER10 (`npm test`) before a PR is marked ready. PR CI runs on
  **GitHub-hosted runners** — never the SER10 self-hosted runner on `pull_request`
  (public repo: that would run untrusted code on the home network). The SER10 runner is
  for trusted `push`/`workflow_dispatch` jobs only.

## Repo hardening reminders

- [ ] Install CodeRabbit + Greptile GitHub Apps on this repo (web-only, owner action)
- [ ] Add `.github/workflows/ci.yml` (GitHub-hosted runners), then enable the `main` ruleset
- [ ] Cut the `studio` branch and re-link AI Studio before protection goes live
Tracked as a GitHub issue ("Repo hardening checklist") — keep it updated, don't duplicate it here.
