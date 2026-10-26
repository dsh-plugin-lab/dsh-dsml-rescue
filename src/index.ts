/**
 * Host half entry point.
 *
 * This is the **only** file that touches Cordis: lifecycle, config validation and registration all
 * land here. Business logic lives outside this file so it can be unit-tested as plain objects.
 *
 * Lifecycle discipline: state, listeners and timers are created inside `ctx.effect()` / `ctx.on()`
 * and released by the disposer those return. **Module scope holds no mutable state** — otherwise a
 * hot reload leaves two generations of the plugin sharing one copy of it, and the resulting fault is
 * a ghost.
 */

/** Cordis plugin name, used by the loader for diagnostics. */
export const name = 'dsh-dsml-rescue'

/**
 * The services this plugin needs. List only what it actually uses — declaring a service you never
 * touch complicates startup ordering for nothing.
 *
 * TODO: for example the tool registry is `['tools']`.
 */
export const inject: string[] = []

/**
 * Mount point.
 *
 * TODO: register whatever this plugin provides here.
 *
 * @param ctx Host context.
 */
export function apply(_ctx: unknown): void {
  // Nothing yet. This is a skeleton, not a finished plugin.
}
