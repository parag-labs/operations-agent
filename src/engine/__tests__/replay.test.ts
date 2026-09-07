import { describe, expect, it } from "vitest";
import { run } from "../orchestrator";
import { replay } from "../replay";
import { MockPlanner } from "../llm";
import { tripGoal } from "../examples";

describe("replay", () => {
  it("reconstructs the final run view from the event log", async () => {
    const result = await run(tripGoal, { planner: new MockPlanner(), clock: () => 0, approve: () => true });
    const view = replay(result.events);
    expect(view.goal).toContain("Lisbon");
    expect(view.budgetUsd).toBe(5000);
    expect(view.status).toBe("completed");
    expect(view.toolsCompleted).toBe(5);
  });

  it("is monotonic: folding more events never decreases completed tools", async () => {
    const result = await run(tripGoal, { planner: new MockPlanner(), clock: () => 0, approve: () => true });
    let last = 0;
    for (const e of result.events) {
      const view = replay(result.events, e.seq);
      expect(view.toolsCompleted).toBeGreaterThanOrEqual(last);
      last = view.toolsCompleted;
    }
  });

  it("shows a partial view partway through the log", async () => {
    const result = await run(tripGoal, { planner: new MockPlanner(), clock: () => 0, approve: () => true });
    const full = replay(result.events);
    const partial = replay(result.events, 2);
    expect(partial.toolsCompleted).toBeLessThan(full.toolsCompleted);
  });
});
