/**
 * The orchestrator: the deterministic core that turns a model's *proposed* plan into a safe,
 * observable, bounded execution. It validates the proposal with Zod, runs every step through
 * the policy gate, auto-executes safe steps, pauses for approval on dangerous ones, tracks
 * budget and cost, and verifies the result against the user's limit. Every decision is an
 * event, so the run can be streamed live and replayed later.
 *
 * The rule the whole design enforces: the LLM reasons and proposes; this code validates and
 * executes.
 */

import { EventLog, type LoggedEvent, type ProposedStepView, type RunStatus } from "./events";
import { makeCounter, RunId, StepId } from "./ids";
import { proposedPlanSchema, type Planner } from "./llm";
import { authorize } from "./policy";
import { defaultTools } from "./services";
import { ToolRegistry } from "./tools";

export interface AgentLimits {
  readonly maxSteps: number;
  readonly maxToolCalls: number;
  readonly tokenBudget: number;
  readonly costBudgetUsd: number;
}

export const DEFAULT_LIMITS: AgentLimits = {
  maxSteps: 12,
  maxToolCalls: 12,
  tokenBudget: 2000,
  costBudgetUsd: 100_000,
};

export interface RunRequest {
  readonly goal: string;
  readonly budgetUsd: number;
}

export interface RunOptions {
  readonly planner: Planner;
  readonly tools?: ToolRegistry;
  /** Approval decision for a dangerous step. Default: deny (nothing dangerous auto-runs). */
  readonly approve?: (step: ProposedStepView) => boolean;
  readonly clock?: () => number;
  readonly runId?: RunId;
  readonly limits?: Partial<AgentLimits>;
  /** Called synchronously as each event is appended - powers live SSE streaming. */
  readonly onEvent?: (e: LoggedEvent) => void;
}

export interface RunResult {
  readonly runId: RunId;
  readonly status: RunStatus;
  readonly events: readonly LoggedEvent[];
  readonly totalCostUsd: number;
  readonly withinBudget: boolean;
  /** Steps that were held back waiting for human approval. */
  readonly pending: readonly ProposedStepView[];
  readonly tokens: number;
  readonly error?: string;
}

const SPEND_EFFECTS = new Set(["spend"]);

/** Execute an operations run to completion or to a pause for approval. */
export async function run(request: RunRequest, opts: RunOptions): Promise<RunResult> {
  const clock = opts.clock ?? (() => Date.now());
  const runId = opts.runId ?? RunId(makeCounter("run")());
  const tools = opts.tools ?? defaultTools();
  const approve = opts.approve ?? (() => false);
  const limits: AgentLimits = { ...DEFAULT_LIMITS, ...opts.limits };
  const stepId = makeCounter("step");
  const log = new EventLog(runId, clock, opts.onEvent);

  log.append({ type: "RunStarted", goal: request.goal, budgetUsd: request.budgetUsd });

  try {
    const { plan, tokens } = await opts.planner.propose({
      goal: request.goal,
      budgetUsd: request.budgetUsd,
      availableTools: tools.names(),
    });

    if (tokens > limits.tokenBudget) throw new Error(`token budget exceeded: ${tokens} > ${limits.tokenBudget}`);

    // Zod at the trust boundary: the model's output is validated before the engine acts on it.
    const parsed = proposedPlanSchema.safeParse(plan);
    if (!parsed.success) throw new Error(`planner returned an invalid plan: ${parsed.error.issues.map((i) => i.message).join("; ")}`);

    const steps: ProposedStepView[] = parsed.data.steps.slice(0, limits.maxSteps).map((s) => {
      const tool = tools.get(s.tool);
      return { id: StepId(stepId()), tool: s.tool, effect: tool?.effect ?? "read", args: s.args };
    });
    log.append({ type: "PlanProposed", steps });

    let totalCostUsd = 0;
    let toolCalls = 0;
    const pending: ProposedStepView[] = [];

    for (const step of steps) {
      const tool = tools.get(step.tool);
      log.append({ type: "StepStarted", step: step.id, tool: step.tool, effect: step.effect });

      const decision = authorize(tool, { allowedTools: tools.names() });

      if (decision.kind === "deny") {
        log.append({ type: "ToolRejected", step: step.id, tool: step.tool, reason: decision.reason });
        continue;
      }

      if (decision.kind === "needs_approval") {
        log.append({ type: "ApprovalRequested", step: step.id, tool: step.tool, effect: step.effect });
        const approved = approve(step);
        log.append({ type: "ApprovalDecided", step: step.id, approved });
        if (!approved) {
          pending.push(step);
          continue;
        }
      }

      if (toolCalls >= limits.maxToolCalls) {
        log.append({ type: "ToolRejected", step: step.id, tool: step.tool, reason: "max tool calls reached" });
        continue;
      }

      toolCalls++;
      log.append({ type: "ToolRequested", step: step.id, tool: step.tool, args: step.args });
      try {
        const result = await tools.invoke(step.tool, step.args);
        log.append({ type: "ToolCompleted", step: step.id, tool: step.tool, ok: true, result });
        const cost = SPEND_EFFECTS.has(step.effect) ? amountOf(step.args) : 0;
        totalCostUsd += cost;
        log.append({ type: "StepCompleted", step: step.id, costUsd: cost });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        log.append({ type: "ToolCompleted", step: step.id, tool: step.tool, ok: false, result: reason });
      }
    }

    const withinBudget = totalCostUsd <= request.budgetUsd;
    log.append({ type: "BudgetComputed", totalUsd: round(totalCostUsd), limitUsd: request.budgetUsd, withinBudget });

    if (pending.length > 0) {
      log.append({ type: "RunPaused", reason: `${pending.length} step(s) awaiting approval` });
      log.append({ type: "RunCompleted", status: "awaiting_approval" });
      return { runId, status: "awaiting_approval", events: log.all(), totalCostUsd: round(totalCostUsd), withinBudget, pending, tokens };
    }

    const verifyOk = withinBudget && totalCostUsd <= limits.costBudgetUsd;
    log.append({
      type: "VerificationCompleted",
      ok: verifyOk,
      detail: verifyOk ? "plan executed within budget" : `spend $${round(totalCostUsd)} exceeds budget $${request.budgetUsd}`,
    });
    log.append({ type: "RunCompleted", status: "completed" });
    return { runId, status: "completed", events: log.all(), totalCostUsd: round(totalCostUsd), withinBudget, pending: [], tokens };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.append({ type: "RunFailed", error });
    return { runId, status: "failed", events: log.all(), totalCostUsd: 0, withinBudget: false, pending: [], tokens: 0, error };
  }
}

function amountOf(args: unknown): number {
  if (args && typeof args === "object" && "amountUsd" in args) {
    const v = (args as { amountUsd: unknown }).amountUsd;
    return typeof v === "number" ? v : 0;
  }
  return 0;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
