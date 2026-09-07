/**
 * The Postgres-backed store, using Drizzle over the `postgres` driver. Only constructed when
 * DATABASE_URL is set; the app falls back to MemoryStore otherwise. The run header and its
 * events are written together, and a read rehydrates the typed event log from JSONB.
 */

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { events, runs } from "./schema";
import type { Store, StoredRun } from "./store";
import type { LoggedEvent, AgentEvent, RunStatus } from "../engine/events";
import { RunId } from "../engine/ids";

export class PgStore implements Store {
  private constructor(
    private readonly db: PostgresJsDatabase,
    private readonly sql: postgres.Sql,
  ) {}

  static connect(url: string): PgStore {
    const sql = postgres(url, { max: 4 });
    return new PgStore(drizzle(sql), sql);
  }

  async migrate(): Promise<void> {
    await this.sql`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        goal TEXT NOT NULL,
        budget_usd INTEGER NOT NULL,
        status TEXT NOT NULL,
        total_cost_usd INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      )`;
    await this.sql`
      CREATE TABLE IF NOT EXISTS events (
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        at INTEGER NOT NULL,
        payload JSONB NOT NULL,
        PRIMARY KEY (run_id, seq)
      )`;
  }

  async saveRun(run: StoredRun): Promise<void> {
    await this.db
      .insert(runs)
      .values({ id: String(run.id), goal: run.goal, budgetUsd: run.budgetUsd, status: run.status, totalCostUsd: Math.round(run.totalCostUsd) })
      .onConflictDoNothing();
    if (run.events.length > 0) {
      await this.db
        .insert(events)
        .values(run.events.map((e) => ({ runId: String(run.id), seq: e.seq, at: e.at, payload: e.event })))
        .onConflictDoNothing();
    }
  }

  async getRun(id: RunId): Promise<StoredRun | undefined> {
    const [header] = await this.db.select().from(runs).where(eq(runs.id, String(id)));
    if (!header) return undefined;
    const rows = await this.db.select().from(events).where(eq(events.runId, String(id)));
    return this.rehydrate(header, rows);
  }

  async listRuns(): Promise<StoredRun[]> {
    const headers = await this.db.select().from(runs);
    const out: StoredRun[] = [];
    for (const header of headers) {
      const rows = await this.db.select().from(events).where(eq(events.runId, header.id));
      out.push(this.rehydrate(header, rows));
    }
    return out;
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  private rehydrate(
    header: { id: string; goal: string; budgetUsd: number; status: string; totalCostUsd: number },
    rows: Array<{ seq: number; at: number; payload: unknown }>,
  ): StoredRun {
    const loggedEvents: LoggedEvent[] = rows
      .sort((a, b) => a.seq - b.seq)
      .map((r) => ({ seq: r.seq, at: r.at, runId: RunId(header.id), event: r.payload as AgentEvent }));
    return {
      id: RunId(header.id),
      goal: header.goal,
      budgetUsd: header.budgetUsd,
      status: header.status as RunStatus,
      totalCostUsd: header.totalCostUsd,
      events: loggedEvents,
    };
  }
}
