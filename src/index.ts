/**
 * Host half entry point.
 *
 * Assembly only: the Cordis name, the service this plugin reads, the validated
 * config, and the one call that installs the runtime. Every judgment lives in
 * `detect` and `policy`, and the only side effect lives in `runtime`, so this
 * file has nothing to unit-test beyond its shape.
 *
 * @module dsh-dsml-rescue
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { install } from './runtime.ts'

/** Cordis plugin name, used by the loader for diagnostics. */
export const name = 'dsh-dsml-rescue'

/** The agent registry, needed to map a session back to its live agent. */
export const inject = ['agents']

/** Validated configuration; the defaults are the documented behaviour. */
export interface Config {
  /** Whether the plugin acts at all. Turn it off without uninstalling. */
  enabled?: boolean
  /**
   * Consecutive rescues allowed for one agent before it is left alone. Each
   * rescue costs one model request, so this is the only spend control here.
   */
  maxConsecutive?: number
  /**
   * Whether child agents are rescued too. Their stalls otherwise settle
   * silently and reach their parent only as "finished".
   */
  applyToSubagents?: boolean
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  // A cap of zero would mean "never rescue", which `enabled` already says.
  maxConsecutive: z.natural().min(1).default(3),
  applyToSubagents: z.boolean().default(true),
})

/**
 * Mount the plugin.
 * @param ctx - host context.
 * @param config - validated configuration.
 */
export function apply(ctx: Context, config: Config): void {
  if (config.enabled === false) return
  install(ctx, {
    maxConsecutive: config.maxConsecutive ?? 3,
    applyToSubagents: config.applyToSubagents ?? true,
  })
}
