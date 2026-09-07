"use client";

import { useCallback, useRef, useState } from "react";

interface LoggedEvent {
  seq: number;
  at: number;
  event: { type: string; [k: string]: unknown };
}

interface DoneInfo {
  status: string;
  totalCostUsd: number;
  withinBudget: boolean;
}

function tagClass(type: string): string {
  if (type.startsWith("Approval")) return "approval";
  if (type === "ToolRejected" || type === "RunFailed") return "reject";
  if (type === "ToolCompleted" || type === "RunCompleted" || type === "VerificationCompleted") return "ok";
  return "info";
}

function describe(e: LoggedEvent["event"]): string {
  switch (e.type) {
    case "RunStarted":
      return `goal: ${e.goal as string}`;
    case "PlanProposed":
      return `${(e.steps as unknown[]).length} steps proposed`;
    case "StepStarted":
      return `${e.tool as string} (${e.effect as string})`;
    case "ToolRequested":
      return `call ${e.tool as string}`;
    case "ToolCompleted":
      return `${e.tool as string} ${e.ok ? "ok" : "failed"}`;
    case "ToolRejected":
      return `${e.tool as string}: ${e.reason as string}`;
    case "ApprovalRequested":
      return `approval needed for ${e.tool as string}`;
    case "ApprovalDecided":
      return `approval ${e.approved ? "granted" : "denied"}`;
    case "BudgetComputed":
      return `total $${e.totalUsd as number} / limit $${e.limitUsd as number}`;
    case "VerificationCompleted":
      return e.detail as string;
    case "RunPaused":
      return e.reason as string;
    case "RunCompleted":
      return `status: ${e.status as string}`;
    case "RunFailed":
      return e.error as string;
    default:
      return "";
  }
}

export default function Page() {
  const [goal, setGoal] = useState("Plan my upcoming trip to Lisbon while keeping the total budget below $5,000.");
  const [budget, setBudget] = useState(5000);
  const [approveSpend, setApproveSpend] = useState(false);
  const [events, setEvents] = useState<LoggedEvent[]>([]);
  const [done, setDone] = useState<DoneInfo | null>(null);
  const [running, setRunning] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const start = useCallback(() => {
    esRef.current?.close();
    setEvents([]);
    setDone(null);
    setRunning(true);

    const params = new URLSearchParams({ goal, budget: String(budget), approveSpend: approveSpend ? "1" : "0" });
    const es = new EventSource(`/api/run/stream?${params.toString()}`);
    esRef.current = es;

    es.onmessage = (msg) => setEvents((prev) => [...prev, JSON.parse(msg.data) as LoggedEvent]);
    es.addEventListener("done", (msg) => {
      setDone(JSON.parse((msg as MessageEvent).data) as DoneInfo);
      setRunning(false);
      es.close();
    });
    es.onerror = () => {
      setRunning(false);
      es.close();
    };
  }, [goal, budget, approveSpend]);

  return (
    <main>
      <h1>Operations Agent</h1>
      <p className="sub">The planner proposes; deterministic code validates and executes. Dangerous steps wait for your approval.</p>

      <div className="panel">
        <div className="row">
          <input type="text" value={goal} onChange={(e) => setGoal(e.target.value)} aria-label="Goal" />
          <input type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} aria-label="Budget (USD)" style={{ width: 120 }} />
        </div>
        <div className="row" style={{ marginTop: "0.75rem" }}>
          <label>
            <input type="checkbox" checked={approveSpend} onChange={(e) => setApproveSpend(e.target.checked)} /> approve spend steps
          </label>
          <button onClick={start} disabled={running}>
            {running ? "Running…" : "Run"}
          </button>
        </div>
      </div>

      {done && (
        <div className="panel">
          <div className="row">
            <span className={`pill ${done.status === "completed" ? "ok" : done.status === "failed" ? "bad" : "warn"}`}>{done.status}</span>
            <span>
              spend <code>${done.totalCostUsd}</code>
            </span>
            <span className={`pill ${done.withinBudget ? "ok" : "bad"}`}>{done.withinBudget ? "within budget" : "over budget"}</span>
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div className="panel">
          {events.map((e) => (
            <div className="event" key={e.seq}>
              <span className={`tag ${tagClass(e.event.type)}`}>{e.event.type}</span>
              <span>{describe(e.event)}</span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
