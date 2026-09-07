import { MockPlanner } from "@/engine/llm";
import { run } from "@/engine/orchestrator";
import type { LoggedEvent, ProposedStepView } from "@/engine/events";
import { getStore } from "@/db/client";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events endpoint that streams an operation run live. Each engine event is
 * pushed to the client as it is appended, so the UI timeline fills in as the run proceeds.
 * The run uses the deterministic mock planner, so no API keys are needed.
 *
 * Query params: goal, budget, approveSpend ("1" to auto-approve spend steps).
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const goal = url.searchParams.get("goal") ?? "Plan my upcoming trip to Lisbon while keeping the total budget below $5,000.";
  const budgetUsd = Number(url.searchParams.get("budget") ?? "5000");
  const approveSpend = url.searchParams.get("approveSpend") === "1";

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: LoggedEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      const result = await run(
        { goal, budgetUsd: Number.isFinite(budgetUsd) ? budgetUsd : 5000 },
        {
          planner: new MockPlanner(),
          approve: (s: ProposedStepView) => approveSpend && (s.effect === "spend" || s.effect === "book"),
          onEvent: send,
        },
      );

      await getStore().saveRun({
        id: result.runId,
        goal,
        budgetUsd,
        status: result.status,
        totalCostUsd: result.totalCostUsd,
        events: result.events,
      });

      controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ runId: result.runId, status: result.status, totalCostUsd: result.totalCostUsd, withinBudget: result.withinBudget })}\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
