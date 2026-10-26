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
}

/** One durable or in-memory fact, already adapted from its host event. */
export type MachineEvent =
  /** An assistant message was appended. */
  | {
      readonly kind: 'assistant-message'
      readonly turn: number
      readonly blocks: readonly BlockLike[]
    }
  /** A human-authored prompt was appended. */
  | { readonly kind: 'human-message' }
  /** A turn closed with the given outcome. */
  | { readonly kind: 'turn-end'; readonly turn: number; readonly completed: boolean }
  /** The loop is about to close the turn unless new work arrives. */
  | { readonly kind: 'turn-stopping'; readonly turn: number; readonly humanPending: boolean }

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
export const INITIAL_STATE: MachineState = { consecutive: 0, turn: undefined, blocks: [] }

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
      return {
        state: { ...state, turn: event.turn, blocks: event.blocks },
        decision: 'ignore',
        round: 0,
      }

    case 'human-message':
      return { state: { ...state, consecutive: 0 }, decision: 'ignore', round: 0 }

    case 'turn-end':
      return event.completed
        ? { state, decision: 'ignore', round: 0 }
        : { state: { ...state, consecutive: 0 }, decision: 'ignore', round: 0 }

    case 'turn-stopping': {
      const blocks = state.turn === event.turn ? state.blocks : []
      const candidate = isRescueCandidate({ completed: true, blocks })
      const outcome = evaluate({
        candidate,
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
