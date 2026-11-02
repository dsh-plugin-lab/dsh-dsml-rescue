import { describe, expect, it } from 'vitest'

import { isRescueCandidate } from '../src/detect.ts'
import type { BlockLike } from '../src/detect.ts'

const LEAK = '<||DSML|| calls>'

/** The reasoning placement: the markup is what the reasoning ends on. */
const leakingReasoning: BlockLike[] = [{ type: 'reasoning', text: `Let me do it.\n${LEAK}` }]

/** The text placement: the markup is what the visible answer consists of. */
const leakingText: BlockLike[] = [{ type: 'text', text: `\n\n</||DSML|| invoke>\n${LEAK}` }]

describe('isRescueCandidate', () => {
  it('accepts a completed turn whose only content is leaking reasoning', () => {
    expect(isRescueCandidate({ completed: true, blocks: leakingReasoning })).toBe(true)
  })

  it('accepts a completed turn whose visible text is the leaked markup', () => {
    expect(isRescueCandidate({ completed: true, blocks: leakingText })).toBe(true)
  })

  it('accepts a turn that transcribed its call in a fence after the markup', () => {
    // Recorded: the dump, then a JSON transcription of the same call.
    const blocks: BlockLike[] = [
      { type: 'reasoning', text: 'I will start it now.' },
      {
        type: 'text',
        text: `<||DSML|| calls>\n<||DSML|| invoke name="run">\n\`\`\`json\n{}</\`\`\`\n`,
      },
    ]
    expect(isRescueCandidate({ completed: true, blocks })).toBe(true)
  })

  it('joins reasoning and text into one stream before matching', () => {
    // Neither half ends the message on its own; together they do.
    const blocks: BlockLike[] = [
      { type: 'reasoning', text: 'thinking' },
      { type: 'text', text: LEAK },
    ]
    expect(isRescueCandidate({ completed: true, blocks })).toBe(true)
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

  it('rejects a turn that answered after the markup', () => {
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
