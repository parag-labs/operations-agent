import { describe, expect, it } from "vitest";
import { defaultTools, searchTravel, validateBudget } from "../services";

describe("tool registry", () => {
  const tools = defaultTools();

  it("validates args against the tool schema before running", async () => {
    const result = await tools.invoke("budget.validate", { items: [100, 200], limitUsd: 500 });
    expect(result).toMatchObject({ totalUsd: 300, withinBudget: true });
  });

  it("rejects arguments that fail validation", async () => {
    await expect(tools.invoke("budget.validate", { items: [], limitUsd: 500 })).rejects.toThrow(/invalid args/);
  });

  it("throws on an unknown tool", async () => {
    await expect(tools.invoke("does.not.exist", {})).rejects.toThrow(/unknown tool/);
  });

  it("refuses to register a duplicate tool name", () => {
    expect(() => tools.register(tools.get("travel.search")!)).toThrow(/already registered/);
  });
});

describe("deterministic services", () => {
  it("returns a stable travel catalogue for the same input", () => {
    const a = searchTravel({ destination: "Lisbon", nights: 4 });
    const b = searchTravel({ destination: "Lisbon", nights: 4 });
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
  });

  it("computes budget totals and remaining correctly", () => {
    const r = validateBudget({ items: [1000, 500], limitUsd: 2000 });
    expect(r.totalUsd).toBe(1500);
    expect(r.remainingUsd).toBe(500);
    expect(r.withinBudget).toBe(true);
  });
});
