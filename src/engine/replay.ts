/**
 * Replay: reconstruct the state of a run at any point by folding its event log forward.
 * Because a run is fully described by its events, replay is exact - the same log always
 * yields the same view. This backs both after-the-fact debugging and the UI timeline.
 */

import type { AgentEvent, LoggedEvent, RunStatus } from "./events";

export interface RunView {
  readonly goal: string;
  readonly budgetUsd: number;
  readonly toolsCompleted: number;
  readonly toolsRejected: number;
  readonly approvalsRequested: number;
  readonly totalCostUsd: number;
  readonly status: RunStatus | "running";
}

const EMPTY: RunView = {
  goal: "",
  budgetUsd: 0,
  toolsCompleted: 0,
  toolsRejected: 0,
  approvalsRequested: 0,
  totalCostUsd: 0,
  status: "running",
};

function apply(view: RunView, event: AgentEvent): RunView {
  switch (event.type) {
    case "RunStarted":
      return { ...view, goal: event.goal, budgetUsd: event.budgetUsd };
    case "ToolCompleted":
      return event.ok ? { ...view, toolsCompleted: view.toolsCompleted + 1 } : view;
    case "ToolRejected":
      return { ...view, toolsRejected: view.toolsRejected + 1 };
    case "ApprovalRequested":
      return { ...view, approvalsRequested: view.approvalsRequested + 1 };
    case "StepCompleted":
      return { ...view, totalCostUsd: Math.round((view.totalCostUsd + event.costUsd) * 100) / 100 };
    case "RunCompleted":
      return { ...view, status: event.status };
    case "RunFailed":
      return { ...view, status: "failed" };
    default:
      return view;
  }
}

/** Fold events up to and including `untilSeq` (default: all) into a run view. */
export function replay(events: readonly LoggedEvent[], untilSeq = Infinity): RunView {
  return events.filter((e) => e.seq <= untilSeq).reduce((view, e) => apply(view, e.event), EMPTY);
}
