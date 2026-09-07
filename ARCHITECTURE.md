# Architecture

Operations Agent has two halves separated by a hard boundary:

1. **A deterministic engine** (`src/engine/`) with no framework dependencies — the planner
   abstraction, tool registry, policy gate, orchestrator, event log, replay, and evaluation.
   This is the tested core.
2. **A thin Next.js shell** (`src/app`, `src/db`) that streams runs over SSE and persists
   them.

## The core rule

> The LLM reasons and proposes. Deterministic application code validates and executes.

Only the planner (`llm.ts`) runs a model, and all it produces is a *proposal* — a structured
list of tool calls. It cannot execute anything. The orchestrator validates that proposal,
authorizes each step, and runs the safe ones; dangerous ones wait for a human.

## Request lifecycle

```
goal + budget
    ↓
Planner.propose()              # LLM (or MockPlanner) — proposes a plan
    ↓
proposedPlanSchema.parse()     # Zod — validate untrusted model output
    ↓
for each step:
    authorize(tool, effect)    # policy gate — allow / needs_approval / deny
        allow          → execute (args validated by the tool's own Zod schema)
        needs_approval → ask human; execute only if approved, else hold as pending
        deny           → reject, record, continue
    ↓
compute budget, verify against limit
    ↓
emit RunCompleted / awaiting_approval / failed
```

Every arrow emits a typed event onto an append-only log.

## Modules

| Module | Responsibility |
|--------|----------------|
| `ids.ts` | Branded id types + a deterministic monotonic counter. |
| `tools.ts` | `Tool` interface (name, effect, Zod schema, run) and the `ToolRegistry` that validates args before invoking. |
| `services.ts` | Deterministic travel/calendar/budget/task logic and the `defaultTools()` registry with effects mapped to the safety matrix. |
| `events.ts` | The `AgentEvent` discriminated union and the append-only `EventLog` (with an `onAppend` hook for live streaming). |
| `llm.ts` | The `Planner` interface, the deterministic `MockPlanner`, and `ScriptedPlanner`; the proposed-plan Zod schema. |
| `policy.ts` | `authorize()` — the deterministic gate returning allow / needs_approval / deny. |
| `orchestrator.ts` | `run()` — bounded, event-sourced execution of a plan. |
| `replay.ts` | Fold an event log into a `RunView` at any point. |
| `evaluate.ts` | Repeatable scored scenarios; derives metrics purely from event logs. |

## Why deterministic services

The spec is explicit: not every "agent" needs to be an LLM. Travel search, budget math,
calendar holds and task creation are deterministic functions. Making them models would add
nondeterminism and cost for no benefit — and would make the eval numbers unstable. Only the
planning step, which genuinely benefits from language understanding, is a model.

## Event sourcing & realtime

`run()` appends immutable events; the `RunResult` and every UI view are derived from them.
The `EventLog` takes an `onAppend` callback, which the SSE route uses to push each event to
the browser the moment it happens. The same log, persisted, powers replay and the run
history — there is one source of truth.

## Bounded execution

`AgentLimits` caps `maxSteps`, `maxToolCalls`, `tokenBudget`, and `costBudgetUsd`. The
planner's token estimate is checked against the budget before execution; steps beyond
`maxSteps` are dropped; tool calls beyond `maxToolCalls` are rejected. Nothing can loop or
spend without bound.

## Persistence boundary

`Store` is an interface with two implementations:

- `MemoryStore` — default, zero-dependency, used by the demo and unit tests.
- `PgStore` — Drizzle over `postgres`, used when `DATABASE_URL` is set and exercised by the
  CI integration job.

The engine never imports either directly; the app selects one via `getStore()`. This is why
the unit suite stays database-free while the Postgres path is still proven in CI.

## Determinism

The clock and id counter are injectable, and `MockPlanner` is a pure function of its input.
That's what makes the eval table reproducible and safe to commit.
