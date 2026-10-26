import { describe, expect, it } from 'vitest'

import { INITIAL_STATE, reduce } from '../src/machine.ts'
import type { MachineEvent, MachineState } from '../src/machine.ts'

const LEAK = '<||DSML|| calls>'

/** A turn that produced nothing but leaking reasoning. */
const stallBlocks = [{ type: 'reasoning', text: `Let me do it.\n${LEAK}` }]

/** A turn that produced a visible answer. */
const answerBlocks = [
  { type: 'reasoning', text: 'thinking' },
  { type: 'text', text: 'Done.' },
]

/** One turn as the host would dispatch it. */
interface PlannedTurn {
  readonly blocks: readonly { type: string; text?: string }[]
  readonly completed: boolean
}

interface RunResult {
  readonly state: MachineState
  /** Decisions in dispatch order; aborted turns offer nothing and add none. */
  readonly decisions: string[]
  /** Ordinal handed to each rescue, from 1; zero for anything else. */
  readonly rounds: number[]
  /** Turns actually dispatched before the run stopped. */
  readonly dispatched: number
}

/**
 * Drive one agent through turns the way the loop does: message, then the
 * stopping offer for a completed turn, then the close.
 *
 * **It stops once a turn is not rescued.** In the host, a turn that is not
 * rescued simply ends: nothing opens another turn, so no further turn-stopping
 * offer can arrive without human input. Modelling that here keeps the suite
 * from asserting states the loop cannot produce.
 * @param turns - planned turns, in order.
 * @param maxConsecutive - cap under test.
 * @param interrupts - 1-based turn numbers after which a human prompt arrives.
 * @returns decisions, rounds, and how many turns ran.
 */
function runTurns(
  turns: readonly PlannedTurn[],
  maxConsecutive: number,
  interrupts: readonly number[] = [],
): RunResult {
  let state = INITIAL_STATE
  const decisions: string[] = []
  const rounds: number[] = []
  let dispatched = 0
  for (const [index, turn] of turns.entries()) {
    const number = index + 1
    const events: MachineEvent[] = [
      { kind: 'assistant-message', turn: number, blocks: turn.blocks },
    ]
    if (turn.completed)
      events.push({
        kind: 'turn-stopping',
        turn: number,
        humanPending: false,
        outputExhausted: false,
      })
    events.push({ kind: 'turn-end', turn: number, completed: turn.completed })
    if (interrupts.includes(number)) events.push({ kind: 'human-message' })

    let rescued = false
    for (const event of events) {
      const step = reduce(state, event, { maxConsecutive })
      state = step.state
      if (event.kind !== 'turn-stopping') continue
      decisions.push(step.decision)
      rounds.push(step.round)
      rescued = step.decision === 'rescue'
    }
    dispatched = number
    // Another turn follows only if this plugin queued one, or if something else
    // ended the activity and a later actor started a new one: a human prompt, a
    // cancellation, or a failure all close the run of automatic turns.
    const restarted = rescued || interrupts.includes(number) || !turn.completed
    if (!restarted) break
  }
  return { state, decisions, rounds, dispatched }
}

const stall: PlannedTurn = { blocks: stallBlocks, completed: true }
const answer: PlannedTurn = { blocks: answerBlocks, completed: true }
const aborted: PlannedTurn = { blocks: stallBlocks, completed: false }

describe('consecutive stalls with nobody interrupting', () => {
  it('rescues up to the cap and then stops', () => {
    const { decisions, rounds, dispatched } = runTurns([stall, stall, stall, stall, stall], 3)
    expect(decisions).toEqual(['rescue', 'rescue', 'rescue', 'give-up'])
    expect(rounds).toEqual([1, 2, 3, 0])
    // The give-up queues nothing, so the fourth turn is where it ends.
    expect(dispatched).toBe(4)
  })

  it('gives up at the cap rather than queueing a fourth rescue', () => {
    // Each rescue is a full model request, and a provider-side leak does not
    // improve by asking again.
    expect(runTurns([stall, stall], 1).decisions).toEqual(['rescue', 'give-up'])
  })
})

describe('what restores the budget', () => {
  it('restores it after a turn that produced output', () => {
    // The normal turn ends the automatic run, so the following stall is a new
    // incident: a human turn has to open it, and the streak starts at one.
    const { decisions, rounds } = runTurns([stall, stall, answer, stall], 3, [3])
    expect(decisions).toEqual(['rescue', 'rescue', 'ignore', 'rescue'])
    expect(rounds).toEqual([1, 2, 0, 1])
  })

  it('restores it after a human prompt', () => {
    expect(runTurns([stall, stall, stall], 3, [1]).decisions).toEqual([
      'rescue',
      'rescue',
      'rescue',
    ])
  })

  it('restores it after an abnormal turn, which a rescue would otherwise hide', () => {
    // The aborted turn offers nothing, and its close clears the streak, so the
    // next stall starts again at one.
    const { decisions, rounds } = runTurns([stall, aborted, stall, stall], 3)
    expect(decisions).toEqual(['rescue', 'rescue', 'rescue'])
    expect(rounds).toEqual([1, 1, 2])
  })
})

describe('what does not count as a stall', () => {
  it('ignores a turn whose last message carries visible text', () => {
    expect(runTurns([answer], 3).decisions).toEqual(['ignore'])
  })

  it('ignores a turn that was cut off at its output ceiling', () => {
    // A truncated step owes an answer it never wrote; continuing it would buy
    // another budget to be cut off from. The host's own max-tokens reading
    // arrives one event later, so this is the only place it can be honoured.
    let state = INITIAL_STATE
    state = reduce(
      state,
      { kind: 'assistant-message', turn: 1, blocks: stallBlocks },
      { maxConsecutive: 3 },
    ).state
    const step = reduce(
      state,
      { kind: 'turn-stopping', turn: 1, humanPending: false, outputExhausted: true },
      { maxConsecutive: 3 },
    )
    expect(step.decision).toBe('ignore')
    expect(step.state.consecutive).toBe(0)
  })

  it('ignores a stopping offer whose closing message belongs to an earlier turn', () => {
    // A rejected pre-step leaves the previous turn's message in place; judging
    // it again would rescue a turn that produced nothing for another reason.
    let state = INITIAL_STATE
    state = reduce(
      state,
      { kind: 'assistant-message', turn: 1, blocks: stallBlocks },
      { maxConsecutive: 3 },
    ).state
    const step = reduce(
      state,
      { kind: 'turn-stopping', turn: 2, humanPending: false, outputExhausted: false },
      { maxConsecutive: 3 },
    )
    expect(step.decision).toBe('ignore')
  })

  it('yields to a human already waiting, without spending budget', () => {
    let state: MachineState = INITIAL_STATE
    state = reduce(
      state,
      { kind: 'assistant-message', turn: 1, blocks: stallBlocks },
      { maxConsecutive: 3 },
    ).state
    state = { ...state, consecutive: 2 }
    const step = reduce(
      state,
      { kind: 'turn-stopping', turn: 1, humanPending: true, outputExhausted: false },
      { maxConsecutive: 3 },
    )
    expect(step.decision).toBe('yield')
    expect(step.state.consecutive).toBe(2)
  })
})
