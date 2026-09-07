/**
 * Branded id types. A branded id is a string the compiler treats as distinct, so a RunId
 * can never be passed where a StepId is expected even though both are strings at runtime.
 */

declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

export type RunId = Brand<string, "RunId">;
export type StepId = Brand<string, "StepId">;
export type ApprovalId = Brand<string, "ApprovalId">;

export const RunId = (s: string): RunId => s as RunId;
export const StepId = (s: string): StepId => s as StepId;
export const ApprovalId = (s: string): ApprovalId => s as ApprovalId;

/** A deterministic monotonic id source, so runs are reproducible in tests. */
export function makeCounter(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}_${++n}`;
}
