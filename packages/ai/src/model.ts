import { getEnv } from "@autochat/core";

/**
 * Default model. Opus 5.5 is the most capable default; a workspace can override
 * per-tenant (AiConfig.model) or globally (ANTHROPIC_MODEL) — e.g. to
 * claude-sonnet-5-5 or claude-haiku-5-5 to trade capability for cost at scale.
 */
export const DEFAULT_MODEL = "claude-opus-5-5";

export function resolveModel(workspaceModel?: string | null): string {
  return workspaceModel || getEnv().ANTHROPIC_MODEL || DEFAULT_MODEL;
}
