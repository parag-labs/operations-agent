import { describe, expect, it } from "vitest";
import { run } from "../orchestrator";
import { MockPlanner, ScriptedPlanner } from "../llm";
import { tripGoal, tightBudgetGoal } from "../examples";
import type { ProposedStepView } from "../events";

const planner = new MockPlanner();
const clock = () => 0;

describe("orchestrator", () => {
  it("runs the safe steps automatically and pauses for the spend step", async () => {
    const result = await run(tripGoal, { planner, clock, approve: () => false });
    expect(result.status).toBe("awaiting_approval");
    // travel.search, budget.validate, calendar.create_event, tasks.create all auto-run.
    const completed = result.events.filter((e) => e.event.type === "ToolCompleted" && e.event.ok);
    expect(completed.length).toBe(4);
    // The one spend step is held back, not executed.
    expect(result.pending.map((s) => s.tool)).toEqual(["travel.book"]);
  });

  it("executes the spend step once it is approved", async () => {
    const result = await run(tripGoal, { planner, clock, approve: (s: ProposedStepView) => s.effect === "spend" });
    expect(result.status).toBe("completed");
    expect(result.totalCostUsd).toBe(1400);
    expect(result.pending).toHaveLength(0);
  });

  it("reports the run as over budget when the spend exceeds the limit", async () => {
    const result = await run(tightBudgetGoal, { planner, clock, approve: (s: ProposedStepView) => s.effect === "spend" });
    expect(result.withinBudget).toBe(false);
    const verify = result.events.find((e) => e.event.type === "VerificationCompleted");
    expect(verify?.event.type === "VerificationCompleted" && verify.event.ok).toBe(false);
  });

  it("emits a well-formed, ordered event log", async () => {
    const result = await run(tripGoal, { planner, clock, approve: () => false });
    const types = result.events.map((e) => e.event.type);
    expect(types[0]).toBe("RunStarted");
    expect(types[1]).toBe("PlanProposed");
    expect(types.at(-1)).toBe("RunCompleted");
    // sequence numbers are contiguous
    result.events.forEach((e, i) => expect(e.seq).toBe(i));
  });

  it("fails safely when the planner returns an invalid plan", async () => {
    const bad = new ScriptedPlanner({ steps: [{ tool: "", args: {} }] });
    const result = await run(tripGoal, { planner: bad, clock });
    expect(result.status).toBe("failed");
    expect(result.error).toContain("invalid");
  });

  it("respects the max tool-call limit", async () => {
    const result = await run(tripGoal, { planner, clock, approve: () => true, limits: { maxToolCalls: 1 } });
    const completed = result.events.filter((e) => e.event.type === "ToolCompleted" && e.event.ok);
    expect(completed.length).toBe(1);
  });
});
