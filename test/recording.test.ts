import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { INITIAL_STATE, reduce } from '../src/machine.ts'
import type { MachineEvent, MachineState } from '../src/machine.ts'

/**
 * The acceptance test: replay real recordings through the shipped reducer.
 *
 * Fixtures are trimmed transcripts of two real sessions — one long session with
 * eight leaking stalls, and one subagent run with a single stall. The derive
 * script records what was kept; `.agents/notes/` records where they came from
 * and what the expectations below were read from.
 *
 * The replay restores the one ordering fact a trimmed log cannot carry: the
 * loop offers `turn-stopping` before it closes a completed turn, so each
 * completed `turn-end` record is paired with one synthetic offer. Aborted turns
 * get none, because the loop throws instead of offering.
 */

/** Read a fixture and drop its provenance header. */
function readFixture(name: string): MachineEvent[] {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as MachineEvent | { kind: 'fixture' })
    .filter((line): line is MachineEvent => line.kind !== 'fixture')
}

/**
 * Replay one fixture through the reducer.
 * @param events - the trimmed transcript, in log order.
 * @param maxConsecutive - cap under test.
 * @returns every turn whose stopping offer produced a decision, as `decision round/cap`.
 */
function replay(events: readonly MachineEvent[], maxConsecutive: number): Map<number, string> {
  let state: MachineState = INITIAL_STATE
  const decisions = new Map<number, string>()
  for (const event of events) {
    if (event.kind === 'turn-end' && event.completed) {
      // Nobody is waiting at any of these boundaries: every prompt the human
      // sent in this recording opened a later turn rather than joining one.
      const step = reduce(
        state,
        { kind: 'turn-stopping', turn: event.turn, humanPending: false, outputCeiling: undefined },
        { maxConsecutive },
      )
      state = step.state
      if (step.decision !== 'ignore')
        decisions.set(event.turn, `${step.decision} ${step.round}/${maxConsecutive}`)
    }
    state = reduce(state, event, { maxConsecutive }).state
  }
  return decisions
}

describe('recorded session with eight leaking stalls', () => {
  const events = readFixture('stall-run.jsonl')

  it('finds every stalled turn and nothing else', () => {
    // Turns 21, 22, 30, 32, 34, 35, 36, and 37 close with reasoning that ends in
    // leaked protocol markup and carry no other content. The other 30 turns do
    // not, and none of them may be touched: a rescue there would cost a request
    // to fix nothing.
    const decisions = replay(events, 3)
    expect([...decisions.keys()].sort((left, right) => left - right)).toEqual([
      21, 22, 30, 32, 34, 35, 36, 37,
    ])
  })

  it('starts a fresh streak every time because a human prompt followed each stall', () => {
    // This is the human-reset path proven on real data: the user typed a prompt
    // after every one of these turns, so no streak ever reached the cap.
    expect([...replay(events, 3).values()]).toEqual(Array.from({ length: 8 }, () => 'rescue 1/3'))
  })

  it('offers turn-stopping only for turns that closed normally', () => {
    // The loop throws on a cancelled turn instead of offering turn-stopping, so the replay harness
    // must synthesise an offer only for a completed close. This guards the harness, not the
    // detector: if it started offering for aborted turns, the replay would be testing a seam the
    // host never reaches. The second assertion keeps the guard from going vacuous — a recording
    // with no aborted turn has nothing to exclude.
    const aborted = new Set<number>()
    const completed = new Set<number>()
    for (const event of events) {
      if (event.kind !== 'turn-end') continue
      ;(event.completed ? completed : aborted).add(event.turn)
    }
    expect(aborted.size).toBeGreaterThan(0)
    for (const turn of replay(events, 3).keys())
      expect(completed.has(turn), `turn ${turn} closed abnormally`).toBe(true)
  })
})

describe('recorded subagent run', () => {
  it('rescues a child that ended the same way', () => {
    // The same failure inside a child is the case that otherwise reaches the
    // parent only as "finished".
    expect([...replay(readFixture('subagent-stall.jsonl'), 3).values()]).toEqual(['rescue 1/3'])
  })
})
