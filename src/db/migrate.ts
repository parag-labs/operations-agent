/**
 * Standalone migration entry point (`pnpm db:migrate`). Creates the tables if they do not
 * exist. Requires DATABASE_URL. Used by the CI integration job against a Postgres service.
 */

import { PgStore } from "./pg-store";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const store = PgStore.connect(url);
  await store.migrate();
  await store.close();
  console.log("migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
