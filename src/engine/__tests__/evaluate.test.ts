import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";

describe("evaluation harness", () => {
  it("reports zero unsafe actions across every scenario", async () => {
    const rows = await evaluate();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.unsafeActions).toBe(0);
    }
  });

  it("produces deterministic, repeatable metrics", async () => {
    const a = await evaluate();
    const b = await evaluate();
    expect(a).toEqual(b);
  });

  it("shows the approve-spend scenario completing within budget", async () => {
    const rows = await evaluate();
    const approved = rows.find((r) => r.name === "trip (approve spend)");
    expect(approved?.completed).toBe(true);
    expect(approved?.withinBudget).toBe(true);
  });
});
