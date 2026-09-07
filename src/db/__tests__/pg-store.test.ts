import { describe, expect, it } from "vitest";
import { PgStore } from "../pg-store";
import { run } from "../../engine/orchestrator";
import { MockPlanner } from "../../engine/llm";
import { tripGoal } from "../../engine/examples";
import { RunId } from "../../engine/ids";

/**
 * Integration test for the Postgres path. It only runs when DATABASE_URL is set (CI provides
 * a Postgres service container); locally, without a database, it is skipped. This keeps the
 * unit suite database-free while still proving the persistence layer round-trips a real run.
 */
const url = process.env.DATABASE_URL;
const maybe = url ? describe : describe.skip;

maybe("PgStore integration", () => {
  it("persists a run and its event log, then reads it back", async () => {
    const store = PgStore.connect(url!);
    await store.migrate();

    const result = await run(tripGoal, { planner: new MockPlanner(), approve: () => true, runId: RunId("run_it_" + Date.now()) });
    await store.saveRun({
      id: result.runId,
      goal: tripGoal.goal,
      budgetUsd: tripGoal.budgetUsd,
      status: result.status,
      totalCostUsd: result.totalCostUsd,
      events: result.events,
    });

    const loaded = await store.getRun(result.runId);
    expect(loaded).toBeDefined();
    expect(loaded!.events.length).toBe(result.events.length);
    expect(loaded!.events[0]!.event.type).toBe("RunStarted");
    expect(loaded!.status).toBe(result.status);

    const all = await store.listRuns();
    expect(all.some((r) => String(r.id) === String(result.runId))).toBe(true);

    await store.close();
  });
});
