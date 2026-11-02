import { describe, expect, it } from 'vitest'

import { hasLeakedProtocolTail } from '../src/protocol.ts'

/** The dialect as the model actually emitted it: full-width bars. */
const FULL_WIDTH = '</｜｜DSML｜｜ calls>'

/** The one-stream call shape every case below uses. */
const tail = (text: string): boolean => hasLeakedProtocolTail([text])

describe('hasLeakedProtocolTail', () => {
  it('detects the full-width closing tokens', () => {
    expect(tail(`Let me proceed.\n${FULL_WIDTH}`)).toBe(true)
  })

  it('detects a tail whose last line is not closed', () => {
    // Not a shape any recording we hold shows — every marker on record closes with `>`. Kept
    // because the matcher deliberately does not require the closing bracket, and a stream cut
    // mid-token is the most likely way that leniency pays off.
    expect(tail('Let me check.\n</｜｜DSML｜｜ parameter')).toBe(true)
  })

  it('detects the ASCII-pipe spelling of the same dialect', () => {
    expect(tail('ok\n<||DSML|| invoke>')).toBe(true)
  })

  it('ignores case in the marker', () => {
    expect(tail('ok\n<||dsml|| invoke>')).toBe(true)
  })

  it('detects markup a few blank lines above the end', () => {
    expect(tail(`done\n<||DSML|| calls>\n\n\n`)).toBe(true)
  })

  it('does not treat a sentence that quotes the marker as a leak', () => {
    // This is the regression that matters: a model explaining the failure mode
    // must not be mistaken for one suffering from it.
    const explaining =
      'The turn ended without output because it wrote </｜｜DSML｜｜ parameter> into reasoning.'
    expect(tail(explaining)).toBe(false)
  })

  it('does not look past the last line', () => {
    const buried = `<||DSML|| calls>\nthen I wrote several more lines\nthat carry the answer`
    expect(tail(buried)).toBe(false)
  })

  it('does not count markup the message quoted inside a fence', () => {
    const quoted = `The shape is:\n\`\`\`\n<||DSML|| calls>\n\`\`\`\nThat is the whole failure.`
    expect(tail(quoted)).toBe(false)
  })

  it('still reads past a fence that opened on the markup line itself', () => {
    // Recorded: the transcription's fence opens glued to the closing token, so
    // cutting at the start of the line would miss the markup entirely.
    expect(tail('<||DSML|| calls>```json\n{"a":1}\n```')).toBe(true)
  })

  it('reads a fence per stream, so one block cannot blank the next', () => {
    // Recorded: a trimmed reasoning tail can carry an unpaired fence of its own.
    // Carrying that state into the visible text would hide the leak in it.
    const fence = '`'.repeat(3)
    expect(
      hasLeakedProtocolTail([`thinking ${fence}`, `<||DSML|| calls>${fence}json\n{}\n${fence}`]),
    ).toBe(true)
  })

  it('matches on the marker, so tokenizer artifacts inside the token name are irrelevant', () => {
    // Byte-level tokenizers spell a space or underscore as U+2581, which NFKC
    // leaves alone. Anchoring on the marker rather than the token name means
    // such a spelling needs no handling here: `tool▁calls` still matches,
    // because the part being matched ends before the token name starts.
    expect(tail('ok\n</｜｜DSML｜｜tool\u2581calls>')).toBe(true)
  })

  it('reports no leak for empty content', () => {
    expect(tail('')).toBe(false)
    expect(tail('\n\n  \n')).toBe(false)
    expect(hasLeakedProtocolTail([])).toBe(false)
  })
})
