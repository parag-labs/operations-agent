/**
 * The policy gate. This is the deterministic authorization the model can never talk its way
 * past. A proposed tool call runs automatically only if the tool exists, is in the allowed
 * set, and its effect is not dangerous. Dangerous effects (book/spend/cancel) always require
 * an explicit human approval - so an injected "book the premium suite" is stopped by code.
 */

import { DANGEROUS_EFFECTS, type Tool } from "./tools";

export type PolicyDecision =
  | { readonly kind: "allow" }
  | { readonly kind: "needs_approval"; readonly reason: string }
  | { readonly kind: "deny"; readonly reason: string };

export interface PolicyContext {
  /** Tool names this run is permitted to use at all. */
  readonly allowedTools: readonly string[];
}

/** Decide how a single proposed tool call should be handled. Pure and deterministic. */
export function authorize(tool: Tool | undefined, ctx: PolicyContext): PolicyDecision {
  if (!tool) return { kind: "deny", reason: "unknown tool" };
  if (!ctx.allowedTools.includes(tool.name)) {
    return { kind: "deny", reason: `tool "${tool.name}" is not in the permitted set` };
  }
  if (DANGEROUS_EFFECTS.includes(tool.effect)) {
    return { kind: "needs_approval", reason: `effect "${tool.effect}" requires human approval` };
  }
  return { kind: "allow" };
}
