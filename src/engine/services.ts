/**
 * Deterministic domain services and the default tool registry they back. The spec is
 * explicit: "not every agent needs to be an LLM; deterministic services should remain
 * deterministic." So travel/calendar/budget/task are plain, testable functions - only the
 * planner (see llm.ts) uses a model. Everything here is a mocked external system so CI needs
 * no real APIs or keys.
 */

import { z } from "zod";
import { ToolRegistry, type Tool } from "./tools";

// --- Travel ---

export const travelSearchArgs = z.object({
  destination: z.string().min(1),
  nights: z.number().int().positive(),
});
export type TravelSearchArgs = z.infer<typeof travelSearchArgs>;

export interface TravelOption {
  readonly id: string;
  readonly airline: string;
  readonly hotel: string;
  readonly totalUsd: number;
}

/** A stable, deterministic catalogue so tests and evals get identical results. */
export function searchTravel(args: TravelSearchArgs): TravelOption[] {
  const base = args.destination.length * 30;
  return [
    { id: "opt_econ", airline: "BlueSky", hotel: "CityInn", totalUsd: 900 + base + args.nights * 120 },
    { id: "opt_std", airline: "BlueSky", hotel: "Grand Park", totalUsd: 1400 + base + args.nights * 210 },
    { id: "opt_prem", airline: "AeroPrime", hotel: "Skyline Suites", totalUsd: 2600 + base + args.nights * 380 },
  ];
}

// --- Calendar ---

export const calendarCreateArgs = z.object({
  title: z.string().min(1),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
});
export type CalendarCreateArgs = z.infer<typeof calendarCreateArgs>;

// --- Budget ---

export const budgetValidateArgs = z.object({
  items: z.array(z.number()).min(1),
  limitUsd: z.number().positive(),
});
export type BudgetValidateArgs = z.infer<typeof budgetValidateArgs>;

export interface BudgetResult {
  readonly totalUsd: number;
  readonly limitUsd: number;
  readonly withinBudget: boolean;
  readonly remainingUsd: number;
}

export function validateBudget(args: BudgetValidateArgs): BudgetResult {
  const totalUsd = args.items.reduce((a, b) => a + b, 0);
  return {
    totalUsd,
    limitUsd: args.limitUsd,
    withinBudget: totalUsd <= args.limitUsd,
    remainingUsd: Math.round((args.limitUsd - totalUsd) * 100) / 100,
  };
}

// --- Tasks ---

export const taskCreateArgs = z.object({
  title: z.string().min(1),
  due: z.string().optional(),
});
export type TaskCreateArgs = z.infer<typeof taskCreateArgs>;

/**
 * The default tool registry. Effects follow the spec's safety matrix: search/read/write are
 * automatic; travel.book (spend) and reservation.cancel (cancel) require approval.
 */
export function defaultTools(): ToolRegistry {
  const registry = new ToolRegistry();

  const tools: Tool[] = [
    {
      name: "travel.search",
      effect: "search",
      description: "Search travel options for a destination.",
      schema: travelSearchArgs,
      run: (a) => searchTravel(a as TravelSearchArgs),
    },
    {
      name: "budget.validate",
      effect: "read",
      description: "Total a list of costs and check them against a limit.",
      schema: budgetValidateArgs,
      run: (a) => validateBudget(a as BudgetValidateArgs),
    },
    {
      name: "calendar.create_event",
      effect: "write",
      description: "Create a calendar hold (not a booking).",
      schema: calendarCreateArgs,
      run: (a) => ({ eventId: "evt_" + (a as CalendarCreateArgs).title.length, ...(a as CalendarCreateArgs) }),
    },
    {
      name: "tasks.create",
      effect: "write",
      description: "Create a task.",
      schema: taskCreateArgs,
      run: (a) => ({ taskId: "task_" + (a as TaskCreateArgs).title.length, ...(a as TaskCreateArgs) }),
    },
    {
      name: "travel.book",
      effect: "spend",
      description: "Book and pay for a travel option. Spends money - requires approval.",
      schema: z.object({ optionId: z.string().min(1), amountUsd: z.number().positive() }),
      run: (a) => ({ confirmation: "CONF-" + (a as { optionId: string }).optionId, booked: true }),
    },
    {
      name: "reservation.cancel",
      effect: "cancel",
      description: "Cancel an existing reservation - requires approval.",
      schema: z.object({ confirmation: z.string().min(1) }),
      run: (a) => ({ cancelled: true, confirmation: (a as { confirmation: string }).confirmation }),
    },
  ];

  for (const t of tools) registry.register(t);
  return registry;
}
