/**
 * One agent's turn-to-turn decision, as a pure reducer.
 *
 * The runtime's only job is translation: Cordis events in, this reducer called,
 * one side effect out. Keeping the sequencing here means the recorded sessions
 * under `test/fixtures/` exercise the same code the host runs, instead of a
 * second implementation written for the tests.
 *
 * @module dsh-dsml-rescue/machine
 */

import { isRescueCandidate } from './detect.ts'
import type { BlockLike } from './detect.ts'
import { evaluate } from './policy.ts'
import type { Decision } from './policy.ts'

/** What the reducer remembers between events for one agent. */
export interface MachineState {
  /**
   * Rescues that were issued and then **failed** — the turn each one opened
   * stalled again. A rescue still in flight is not counted: only an observed
   * failure spends the budget, and a productive turn clears the streak, so a
   * long run may absorb any number of rescues as long as they keep landing.
   */
  readonly failedRescues: number
  /**
   * Whether a rescue was queued for the last stall and its successor turn has
   * not been judged yet. This is what distinguishes "we issued a rescue" from
   * "that rescue failed"; a rescue whose turn never runs (the agent is disposed,
   * a human cancels) leaves this set and spends nothing.
   */
  readonly rescuePending: boolean
  /** Turn that owns {@link MachineState.blocks}, or undefined before the first step. */
  readonly turn: number | undefined
  /** Content blocks of the last assistant message seen. */
  readonly blocks: readonly BlockLike[]
  /** Output tokens the last assistant message reported, when the host logged it. */
  readonly outputTokens: number | undefined
}

/** One durable or in-memory fact, already adapted from its host event. */
export type MachineEvent =
  /** An assistant message was appended. */
  | {
      readonly kind: 'assistant-message'
      readonly turn: number
      readonly blocks: readonly BlockLike[]
      readonly outputTokens: number | undefined
    }
  /** A human-authored prompt was appended. */
  | { readonly kind: 'human-message' }
  /** A turn closed with the given outcome. */
  | { readonly kind: 'turn-end'; readonly turn: number; readonly completed: boolean }
  /** The loop is about to close the turn unless new work arrives. */
  | {
      readonly kind: 'turn-stopping'
      readonly turn: number
      readonly humanPending: boolean
      /**
       * The output ceiling the closing request was sent under, when the session
       * recorded one.
       *
       * The seam carries no stop reason, so comparing the tokens spent against
       * this ceiling is the only way to keep a truncated turn out of the rescue
       * path; the host's own `max-tokens` verdict arrives one event later, after
       * the decision has already been made.
       */
      readonly outputCeiling: number | undefined
    }

/** Limits the reducer reads from configuration. */
export interface MachineLimits {
  /** Cap on consecutive *failed* rescues. */
  readonly maxConsecutive: number
}

/** The reducer's answer for one event. */
export interface MachineStep {
  /** State to carry into the next event. */
  readonly state: MachineState
  /** What the caller should do; `rescue` and `give-up` are terminal for this turn. */
  readonly decision: Decision
  /** Which rescue this is, from 1; zero when the decision is not a rescue. */
  readonly round: number
}

/** The state a machine starts in. */
export const INITIAL_STATE: MachineState = {
  failedRescues: 0,
  rescuePending: false,
  turn: undefined,
  blocks: [],
  outputTokens: undefined,
}

/** Nothing to do, with the state unchanged. */
function nothing(state: MachineState): MachineStep {
  return { state, decision: 'ignore', round: 0 }
}

/**
 * Whether the step being closed spent its whole output budget.
 *
 * Reads as exhausted only when both numbers are known: an unknown ceiling or a
 * missing count reports "not exhausted" on purpose, because a wrong `true`
 * would silence the rescue this plugin exists for, while a wrong `false` only
 * costs the streak one attempt.
 * @param state - state carrying the closing message's output tokens.
 * @param ceiling - the ceiling the request was sent under, when known.
 * @returns whether the model was cut off rather than finished.
 */
function spentBudget(state: MachineState, ceiling: number | undefined): boolean {
  if (state.outputTokens === undefined) return false
  if (ceiling === undefined || ceiling <= 0) return false
  return state.outputTokens >= ceiling
}

/**
 * Advance one agent's machine by one event.
 *
 * The streak of failed rescues clears on three facts: a turn that produced
 * output (the rescue worked), an abnormal close (a different failure, which a
 * rescue would hide), and human input (the human now owns the conversation). It
 * is *not* cleared by the plugin's own notices.
 * @param state - state after the previous event.
 * @param event - the fact to apply.
 * @param limits - configured cap.
 * @returns the next state and what to do about it.
 */
export function reduce(
  state: MachineState,
  event: MachineEvent,
  limits: MachineLimits,
): MachineStep {
  switch (event.kind) {
    case 'assistant-message':
      return nothing({
        ...state,
        turn: event.turn,
        blocks: event.blocks,
        outputTokens: event.outputTokens,
      })

    case 'human-message':
      return nothing({ ...state, failedRescues: 0, rescuePending: false })

    case 'turn-end':
      // An abnormal close is a different failure; continuing it would hide the cause.
      return event.completed
        ? nothing(state)
        : nothing({ ...state, failedRescues: 0, rescuePending: false })

    case 'turn-stopping': {
      // A truncated step owes an answer it never wrote: continuing it would treat
      // truncation as a stall and buy another budget to be cut off from.
      const blocks =
        state.turn === event.turn && !spentBudget(state, event.outputCeiling) ? state.blocks : []
      const candidate = isRescueCandidate({ completed: true, blocks })
      // A stall observed here is the verdict on the *previous* rescue, not on a new
      // one: a rescue is only marked failed once its successor turn is judged.
      const failedRescues =
        state.rescuePending && candidate ? state.failedRescues + 1 : state.failedRescues
      const outcome = evaluate({
        candidate,
        failedRescues,
        maxConsecutive: limits.maxConsecutive,
        humanPending: event.humanPending,
      })
      return {
        state: {
          ...state,
          failedRescues: outcome.failedRescues,
          rescuePending: outcome.decision === 'rescue',
        },
        decision: outcome.decision,
        round: outcome.decision === 'rescue' ? outcome.failedRescues + 1 : 0,
      }
    }
  }
}
