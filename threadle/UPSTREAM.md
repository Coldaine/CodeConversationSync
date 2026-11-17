# Vendored upstream: Threadle

Wholesale copy of https://github.com/carlnordlund/Threadle at commit
`857721e` (Merge pull request #39, v1.3 line), copied 2026-11-16 with **no
modifications** (only `bin/`/`obj/` build output excluded). MIT license:
see `LICENSE.md` in this directory. This code is the graph engine ("plumbing")
for CodeConversationSync; the Next.js app lives at the repo root.

Rules (see ../AGENTS.md):
- Do not edit vendored files in place. Engine changes go through a deliberate
  upstream-sync: replace this tree from a newer pinned upstream commit and
  record the bump here + in docs/plans.
- Build: `dotnet build threadle/Threadle.CLIconsole -c Release`
  (needs the .NET 10 SDK; on SER10 the workspace mise.toml provides it).
