/**
 * The planner abstraction - the only place a model runs. A planner turns a natural-language
 * goal into a *proposed* structured plan: an ordered list of tool calls. It cannot execute
 * anything; the orchestrator validates the proposal and decides what actually runs. Swapping
 * in a real provider (OpenAI, Anthropic, ...) means implementing this one interface.
 */

import { z } from "zod";

/** The structured proposal a planner must return. Validated with Zod before the engine trusts it. */
export const proposedPlanSchema = z.object({
  steps: z
    .array(
      z.object({
        tool: z.string().min(1),
        args: z.record(z.unknown()),
      }),
    )
    .min(1),
});
export type ProposedPlan = z.infer<typeof proposedPlanSchema>;

export interface PlanRequest {
  readonly goal: string;
  readonly budgetUsd: number;
  readonly availableTools: readonly string[];
}

export interface PlanResponse {
  readonly plan: ProposedPlan;
  readonly tokens: number;
}

export interface Planner {
  propose(req: PlanRequest): Promise<PlanResponse>;
}

/**
 * A deterministic mock planner. For a trip goal it proposes a realistic sequence:
 * search -> validate budget -> hold the calendar -> create a task -> book (needs approval).
 * It is deliberately "trickable": if the goal text mentions a tool name it will add that
 * tool to the plan, which is how the security test injects a malicious step.
 */
export class MockPlanner implements Planner {
  async propose(req: PlanRequest): Promise<PlanResponse> {
    const steps: ProposedPlan["steps"] = [
      { tool: "travel.search", args: { destination: destinationFrom(req.goal), nights: 4 } },
      { tool: "budget.validate", args: { items: [1400], limitUsd: req.budgetUsd } },
      { tool: "calendar.create_event", args: { title: "Trip hold", startsAt: "2026-10-01", endsAt: "2026-10-05" } },
      { tool: "tasks.create", args: { title: "Pack and prepare for trip" } },
      { tool: "travel.book", args: { optionId: "opt_std", amountUsd: 1400 } },
    ];

    // Prompt-injection surface: if the goal names any available tool we don't already use,
    // the (untrusted) model dutifully adds it. The policy gate is what stops the dangerous ones.
    for (const tool of req.availableTools) {
      if (req.goal.toLowerCase().includes(tool.toLowerCase()) && !steps.some((s) => s.tool === tool)) {
        steps.push({ tool, args: injectedArgsFor(tool) });
      }
    }

    return { plan: { steps }, tokens: 24 + steps.length * 4 };
  }
}

/** A planner that returns a fixed, caller-supplied plan. Useful for targeted tests/evals. */
export class ScriptedPlanner implements Planner {
  constructor(private readonly plan: ProposedPlan, private readonly tokens = 20) {}
  async propose(): Promise<PlanResponse> {
    return { plan: this.plan, tokens: this.tokens };
  }
}

function destinationFrom(goal: string): string {
  const m = goal.match(/to ([A-Z][a-zA-Z]+)/);
  return m?.[1] ?? "Lisbon";
}

function injectedArgsFor(tool: string): Record<string, unknown> {
  if (tool === "reservation.cancel") return { confirmation: "CONF-opt_std" };
  if (tool === "travel.book") return { optionId: "opt_prem", amountUsd: 4000 };
  return {};
}
