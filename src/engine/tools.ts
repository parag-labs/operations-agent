/**
 * The typed tool registry. Each tool declares an `effect` that determines its risk class,
 * and validates its arguments with a Zod schema at the runtime boundary. The set of tools
 * an operation is allowed to use is deterministic - the model can only ever *ask* for one.
 */

import { z } from "zod";

/**
 * A tool's effect classifies its risk. The safety matrix in the spec maps directly onto
 * this: read/search/write happen automatically; book/spend/cancel require human approval.
 */
export type ToolEffect = "read" | "search" | "write" | "book" | "spend" | "cancel";

export const DANGEROUS_EFFECTS: readonly ToolEffect[] = ["book", "spend", "cancel"];

export interface Tool<Args = unknown, Result = unknown> {
  readonly name: string;
  readonly effect: ToolEffect;
  readonly description: string;
  readonly schema: z.ZodType<Args>;
  readonly run: (args: Args) => Promise<Result> | Result;
}

/** A registry that keeps tools keyed by name and validates args before running them. */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): this {
    if (this.tools.has(tool.name)) throw new Error(`tool "${tool.name}" already registered`);
    this.tools.set(tool.name, tool as Tool);
    return this;
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  /** Validate args against the tool's schema, then run it. Throws on unknown tool or bad args. */
  async invoke(name: string, args: unknown): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`unknown tool "${name}"`);
    const parsed = tool.schema.safeParse(args);
    if (!parsed.success) throw new Error(`invalid args for "${name}": ${parsed.error.issues.map((i) => i.message).join("; ")}`);
    return tool.run(parsed.data);
  }
}
