/**
 * The typed event model. An operation run is fully described by the ordered events it emits,
 * which is what powers realtime streaming to the UI and after-the-fact replay/debugging.
 * Every event is a plain, serializable record - safe to persist and to send over SSE.
 */

import type { RunId, StepId } from "./ids";
import type { ToolEffect } from "./tools";

export type AgentEvent =
  | { readonly type: "RunStarted"; readonly goal: string; readonly budgetUsd: number }
  | { readonly type: "PlanProposed"; readonly steps: readonly ProposedStepView[] }
  | { readonly type: "StepStarted"; readonly step: StepId; readonly tool: string; readonly effect: ToolEffect }
  | { readonly type: "ToolRequested"; readonly step: StepId; readonly tool: string; readonly args: unknown }
  | { readonly type: "ToolCompleted"; readonly step: StepId; readonly tool: string; readonly ok: boolean; readonly result: unknown }
  | { readonly type: "ToolRejected"; readonly step: StepId; readonly tool: string; readonly reason: string }
  | { readonly type: "ApprovalRequested"; readonly step: StepId; readonly tool: string; readonly effect: ToolEffect }
  | { readonly type: "ApprovalDecided"; readonly step: StepId; readonly approved: boolean }
  | { readonly type: "StepCompleted"; readonly step: StepId; readonly costUsd: number }
  | { readonly type: "BudgetComputed"; readonly totalUsd: number; readonly limitUsd: number; readonly withinBudget: boolean }
  | { readonly type: "VerificationCompleted"; readonly ok: boolean; readonly detail: string }
  | { readonly type: "RunPaused"; readonly reason: string }
  | { readonly type: "RunCompleted"; readonly status: RunStatus }
  | { readonly type: "RunFailed"; readonly error: string };

export type AgentEventType = AgentEvent["type"];

export type RunStatus = "completed" | "awaiting_approval" | "failed";

export interface ProposedStepView {
  readonly id: StepId;
  readonly tool: string;
  readonly effect: ToolEffect;
  readonly args: unknown;
}

export interface LoggedEvent {
  readonly seq: number;
  readonly at: number;
  readonly runId: RunId;
  readonly event: AgentEvent;
}

/** An append-only log. It never mutates past entries; new events are pushed with a sequence. */
export class EventLog {
  private readonly events: LoggedEvent[] = [];
  private seq = 0;

  constructor(
    private readonly runId: RunId,
    private readonly clock: () => number = () => Date.now(),
    private readonly onAppend?: (e: LoggedEvent) => void,
  ) {}

  append(event: AgentEvent): LoggedEvent {
    const logged: LoggedEvent = { seq: this.seq++, at: this.clock(), runId: this.runId, event };
    this.events.push(logged);
    this.onAppend?.(logged);
    return logged;
  }

  all(): readonly LoggedEvent[] {
    return this.events;
  }

  ofType<T extends AgentEventType>(type: T): Extract<AgentEvent, { type: T }>[] {
    return this.events.map((e) => e.event).filter((e): e is Extract<AgentEvent, { type: T }> => e.type === type);
  }
}
