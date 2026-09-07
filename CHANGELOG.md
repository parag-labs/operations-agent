# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-07

First public release.

### Added
- Deterministic orchestrator (`orchestrator.ts`) that turns a planner's proposed plan into a
  bounded, event-sourced execution with budget tracking and verification.
- Planner abstraction (`llm.ts`) with a deterministic `MockPlanner` and `ScriptedPlanner`;
  the proposed plan is validated with Zod before the engine trusts it.
- Effect-based policy gate (`policy.ts`): safe effects auto-run; `book`/`spend`/`cancel`
  require explicit human approval.
- Typed tool registry with per-tool Zod arg schemas and deterministic travel/calendar/
  budget/task services.
- Typed `AgentEvent` union and append-only `EventLog` with a live-streaming hook; SSE
  endpoint streams runs to the dashboard as they happen.
- Persistence behind a `Store` interface: `MemoryStore` (default) and a Drizzle/Postgres
  `PgStore`, with a migration entry point.
- Replay that folds an event log into a run view at any point.
- Evaluation harness and `pnpm eval` CLI producing real, reproducible metrics (0 unsafe
  actions across all scenarios).
- Test suite: unit, failure-path, security (prompt-injection), and a Postgres integration
  test that runs in CI and auto-skips locally.
- Next.js dashboard, Docker + docker-compose (app + Postgres), GitHub Actions CI (lint /
  typecheck / test / build / eval, a Postgres integration job, and a dependency audit), and
  full docs.

[0.1.0]: https://github.com/parag-labs/operations-agent/releases/tag/v0.1.0
