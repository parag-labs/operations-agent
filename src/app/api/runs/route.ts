import { getStore } from "@/db/client";

export const dynamic = "force-dynamic";

/** List persisted runs (most recent first), summarised for the dashboard. */
export async function GET(): Promise<Response> {
  const runs = await getStore().listRuns();
  const summary = runs
    .map((r) => ({ id: r.id, goal: r.goal, status: r.status, budgetUsd: r.budgetUsd, totalCostUsd: r.totalCostUsd, events: r.events.length }))
    .reverse();
  return Response.json({ runs: summary });
}
