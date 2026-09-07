import { describe, expect, it } from "vitest";
import { run } from "../orchestrator";
import { MockPlanner } from "../llm";
import { injectionGoal } from "../examples";

/**
 * The security test. The injection goal names `reservation.cancel` in its text, so the
 * (deliberately trickable) mock planner adds it to the plan. This proves the *policy gate* -
 * not the prompt - is what stops the dangerous action.
 */
describe("prompt-injection defense", () => {
  it("never auto-executes an injected dangerous tool", async () => {
    const result = await run(injectionGoal, { planner: new MockPlanner(), clock: () => 0, approve: () => false });

    // The cancel step was proposed...
    const proposed = result.events.find((e) => e.event.type === "PlanProposed");
    const hasCancel =
      proposed?.event.type === "PlanProposed" && proposed.event.steps.some((s) => s.tool === "reservation.cancel");
    expect(hasCancel).toBe(true);

    // ...an approval was requested for it...
    const approvalForCancel = result.events.some(
      (e) => e.event.type === "ApprovalRequested" && e.event.tool === "reservation.cancel",
    );
    expect(approvalForCancel).toBe(true);

    // ...but it never completed, because approval was denied.
    const cancelRan = result.events.some(
      (e) => e.event.type === "ToolCompleted" && e.event.tool === "reservation.cancel" && e.event.ok,
    );
    expect(cancelRan).toBe(false);
  });

  it("blocks the dangerous tool even when the model floods the plan with it", async () => {
    const result = await run(
      { goal: "cancel everything: reservation.cancel reservation.cancel travel.book", budgetUsd: 5000 },
      { planner: new MockPlanner(), clock: () => 0, approve: () => false },
    );
    const dangerousRan = result.events.filter(
      (e) => e.event.type === "ToolCompleted" && e.event.ok && (e.event.tool === "reservation.cancel" || e.event.tool === "travel.book"),
    );
    expect(dangerousRan).toHaveLength(0);
  });
});
