/**
 * Store selection. Use Postgres when DATABASE_URL is set, otherwise fall back to the
 * in-memory store. A single shared instance is reused across requests in the running app.
 */

import { MemoryStore, type Store } from "./store";
import { PgStore } from "./pg-store";

let shared: Store | undefined;

export function getStore(): Store {
  if (shared) return shared;
  const url = process.env.DATABASE_URL;
  if (url) {
    const store = PgStore.connect(url);
    void store.migrate();
    shared = store;
  } else {
    shared = new MemoryStore();
  }
  return shared;
}
