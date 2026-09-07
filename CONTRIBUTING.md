# Contributing

Thanks for taking a look. This is a personal portfolio project, but it follows the workflow
I'd use on a team.

## Setup

```bash
pnpm install
pnpm dev
```

Requirements: Node 20+ and pnpm 9+. No API keys and no database needed — the default planner
is a deterministic mock and the default store is in-memory.

## Before you push

CI runs exactly these; all must be green:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

A separate CI job spins up Postgres and runs the integration test; locally it auto-skips
unless you set `DATABASE_URL`.

## Ground rules

- **The engine stays framework-free.** Nothing in `src/engine/` may import from `src/app` or
  `src/db`. The dependency arrow points app → engine only.
- **Keep the core rule intact.** The planner proposes; deterministic code validates and
  executes. Any new tool must declare an honest `effect` and go through the policy gate.
  Dangerous effects (`book`/`spend`/`cancel`) must require approval.
- **Validate every boundary.** Model output and tool args are parsed with Zod before the
  typed core touches them.
- **Determinism.** Use the injected clock and id counter — no `Math.random()` or bare
  `Date.now()` in engine logic a test can't control. The mock planner must stay pure.
- **Never fabricate eval numbers.** The README table is produced by `pnpm eval`. If behavior
  changes, re-run it and paste the real output.
- **Types over comments.** Prefer making an invalid state unrepresentable (branded ids,
  discriminated unions, effect unions) to documenting that it shouldn't happen.

## Commit style

Small, focused commits with imperative subjects. One concern per commit.
