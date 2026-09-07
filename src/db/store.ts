/**
 * The persistence boundary. The engine never talks to a database directly; it produces runs
 * and event logs, and a `Store` saves them. Two implementations exist:
 *
 *  - `MemoryStore` - the default, used by the demo, unit tests and any deployment that does
 *    not set DATABASE_URL. Zero external dependencies.
 *  - `PgStore` - a Drizzle/Postgres implementation, exercised by the integration test and
 *    used when DATABASE_URL is present.
 *
 * Keeping this an interface means CI stays green without a database while still proving the
 * Postgres path works when one is provided.
 */

import type { LoggedEvent, RunStatus } from "../engine/events";
import type { RunId } from "../engine/ids";

export interface StoredRun {
  readonly id: RunId;
  readonly goal: string;
  readonly budgetUsd: number;
  readonly status: RunStatus;
  readonly totalCostUsd: number;
  readonly events: readonly LoggedEvent[];
}

export interface Store {
  saveRun(run: StoredRun): Promise<void>;
  getRun(id: RunId): Promise<StoredRun | undefined>;
  listRuns(): Promise<StoredRun[]>;
}

/** An in-memory store. Fully deterministic, no I/O - the default everywhere a DB is absent. */
export class MemoryStore implements Store {
  private readonly runs = new Map<string, StoredRun>();

  async saveRun(run: StoredRun): Promise<void> {
    this.runs.set(String(run.id), run);
  }

  async getRun(id: RunId): Promise<StoredRun | undefined> {
    return this.runs.get(String(id));
  }

  async listRuns(): Promise<StoredRun[]> {
    return [...this.runs.values()];
  }
}
