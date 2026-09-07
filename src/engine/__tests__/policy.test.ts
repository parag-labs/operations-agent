import { describe, expect, it } from "vitest";
import { authorize } from "../policy";
import { defaultTools } from "../services";

const tools = defaultTools();
const ctx = { allowedTools: tools.names() };

describe("policy gate", () => {
  it("allows a safe read/search/write tool automatically", () => {
    expect(authorize(tools.get("travel.search"), ctx).kind).toBe("allow");
    expect(authorize(tools.get("budget.validate"), ctx).kind).toBe("allow");
    expect(authorize(tools.get("calendar.create_event"), ctx).kind).toBe("allow");
  });

  it("requires approval for spend and cancel effects", () => {
    expect(authorize(tools.get("travel.book"), ctx).kind).toBe("needs_approval");
    expect(authorize(tools.get("reservation.cancel"), ctx).kind).toBe("needs_approval");
  });

  it("denies an unknown tool", () => {
    expect(authorize(undefined, ctx)).toEqual({ kind: "deny", reason: "unknown tool" });
  });

  it("denies a tool that is not in the permitted set", () => {
    const decision = authorize(tools.get("travel.search"), { allowedTools: ["budget.validate"] });
    expect(decision.kind).toBe("deny");
  });
});
