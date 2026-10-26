import { describe, expect, it } from 'vitest'

import { isRescueCandidate } from '../src/detect.ts'
import type { BlockLike } from '../src/detect.ts'

const LEAK = '<||DSML|| calls>'

/** A stall: reasoning that ends in leaked markup, nothing else. */
const leakingReasoning: BlockLike[] = [{ type: 'reasoning', text: `Let me do it.\n${LEAK}` }]

describe('isRescueCandidate', () => {
  it('accepts a completed turn whose only content is leaking reasoning', () => {
    expect(isRescueCandidate({ completed: true, blocks: leakingReasoning })).toBe(true)
  })

  it('joins several reasoning blocks before matching', () => {
    const blocks: BlockLike[] = [
      { type: 'reasoning', text: 'thinking' },
      { type: 'reasoning', text: LEAK },
    ]
    expect(isRescueCandidate({ completed: true, blocks })).toBe(true)
  })

  it('rejects a turn that ended abnormally', () => {
    expect(isRescueCandidate({ completed: false, blocks: leakingReasoning })).toBe(false)
  })

  it('rejects a turn that produced visible text', () => {
    const blocks = [...leakingReasoning, { type: 'text', text: 'Done.' }]
    expect(isRescueCandidate({ completed: true, blocks })).toBe(false)
  })

  it('rejects whitespace-only text but accepts its absence', () => {
    const blank = [...leakingReasoning, { type: 'text', text: '  \n ' }]
    expect(isRescueCandidate({ completed: true, blocks: blank })).toBe(true)
  })

  it('rejects a turn that made a tool call', () => {
    const blocks = [...leakingReasoning, { type: 'tool-call' }]
    expect(isRescueCandidate({ completed: true, blocks })).toBe(false)
  })

  it('rejects an unknown block kind rather than guessing', () => {
    const blocks = [...leakingReasoning, { type: 'image' }]
    expect(isRescueCandidate({ completed: true, blocks })).toBe(false)
  })

  it('rejects a turn that produced nothing at all', () => {
    expect(isRescueCandidate({ completed: true, blocks: [] })).toBe(false)
  })

  it('rejects an empty turn that ended normally without any reasoning', () => {
    expect(
      isRescueCandidate({
        completed: true,
        blocks: [{ type: 'reasoning', text: 'just thinking' }],
      }),
    ).toBe(false)
  })
})
