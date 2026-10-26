import { describe, expect, it } from 'vitest'

import { Config, apply, inject, name } from '../src/index.ts'
import { CONTINUE_PROMPT, createRescueMessage } from '../src/messages.ts'

/**
 * Entry-point shape and the model-facing message. Behaviour lives in the
 * per-layer suites next to this file; this one pins what the loader reads and
 * what the model is told.
 */
describe('entry', () => {
  it('exports the plugin name', () => {
    expect(name).toBe('dsh-dsml-rescue')
  })

  it('declares the agent registry as its only service', () => {
    expect(inject).toEqual(['agents'])
  })

  it('defaults to acting on children as well as roots', () => {
    const parsed = new Config({})
    expect(parsed.enabled).toBe(true)
    expect(parsed.maxConsecutive).toBe(3)
    expect(parsed.applyToSubagents).toBe(true)
  })

  it('rejects a cap below one instead of silently never rescuing', () => {
    expect(() => new Config({ maxConsecutive: 0 })).toThrow()
  })

  it('does nothing when disabled', () => {
    // A bare object is enough: a disabled plugin must not touch the context.
    expect(() => apply({} as never, { enabled: false })).not.toThrow()
  })
})

describe('continuation message', () => {
  const textOf = (round: number): string =>
    createRescueMessage(round, 3)
      .content.flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')

  it('asks for the next step and offers a way to close out', () => {
    expect(textOf(1)).toBe(CONTINUE_PROMPT)
    expect(textOf(1)).toContain('next concrete step')
    expect(textOf(1)).toContain('short summary')
  })

  it('never explains the cause to the model', () => {
    const text = textOf(2).toLowerCase()
    for (const word of ['dsml', 'protocol', 'markup', 'reasoning', 'leak']) {
      expect(text).not.toContain(word)
    }
  })

  it('carries its own attribution and the round in the summary', () => {
    const message = createRescueMessage(2, 3)
    expect(message.source).toEqual({
      kind: 'dsml-rescue',
      form: 'notice',
      summary: 'Auto-continue 2/3',
    })
    expect(message.role).toBe('user')
  })
})
