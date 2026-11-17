# Provenance: where the engine code came from

On 2026-11-16 the entire Threadle codebase (https://github.com/carlnordlund/Threadle,
commit `857721e`, v1.3 line, MIT — see `LICENSE.md`) was **lifted wholesale into
this repository** under `threadle/`. From that moment it is **our code**: maintained,
modified, and evolved here as part of this one codebase. There is no upstream
dependency, no pinned-sync, and no plan to track upstream releases — if upstream
publishes something we want, we port it by hand like any other code.

Attribution: Threadle was created by Carl Nordlund (Institute for Analytical
Sociology, Linköping University). The MIT license permits this use; `LICENSE.md`
in this directory is upstream's license text and stays.

Layout: `Threadle.Core` (graph model, analysis, file I/O), `Threadle.CLIconsole`
(CLI + JSON line protocol the app talks to), `Threadle.Tests` (xUnit suite — keep it green).
Build: `dotnet build threadle/Threadle.CLIconsole -c Release` (.NET 10 SDK).
