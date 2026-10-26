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
  /** Rescues queued since the last turn that produced output or human input. */
  readonly consecutive: number
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
  /** Cap on consecutive rescues. */
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
  consecutive: 0,
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
 * The streak clears on two facts only: a turn that ended abnormally (a
 * different failure, which a rescue would hide) and human input (the human now
 * owns the conversation). It is *not* cleared by the plugin's own notices.
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
      return nothing({ ...state, consecutive: 0 })

    case 'turn-end':
      // An abnormal close is a different failure; continuing it would hide the cause.
      return event.completed ? nothing(state) : nothing({ ...state, consecutive: 0 })

    case 'turn-stopping': {
      // A truncated step owes an answer it never wrote: continuing it would treat
      // truncation as a stall and buy another budget to be cut off from.
      const blocks =
        state.turn === event.turn && !spentBudget(state, event.outputCeiling) ? state.blocks : []
      const outcome = evaluate({
        candidate: isRescueCandidate({ completed: true, blocks }),
        consecutive: state.consecutive,
        maxConsecutive: limits.maxConsecutive,
        humanPending: event.humanPending,
      })
      return {
        state: { ...state, consecutive: outcome.consecutive },
        decision: outcome.decision,
        round: outcome.decision === 'rescue' ? outcome.consecutive : 0,
      }
    }
  }
}
