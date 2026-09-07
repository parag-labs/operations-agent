/**
 * Drizzle schema for persisting operation runs and their events. Two tables are enough: a
 * run header and its append-only event stream. The event payload is stored as JSONB because
 * the event union is validated in the domain layer, not the database.
 */

import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  goal: text("goal").notNull(),
  budgetUsd: integer("budget_usd").notNull(),
  status: text("status").notNull(),
  totalCostUsd: integer("total_cost_usd").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const events = pgTable("events", {
  runId: text("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  at: integer("at").notNull(),
  payload: jsonb("payload").notNull(),
});

export type RunRow = typeof runs.$inferSelect;
export type EventRow = typeof events.$inferSelect;
