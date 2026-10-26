#!/usr/bin/env node
/**
 * Derive the committed regression fixtures from a raw session recording.
 *
 * The raw recordings are tens of megabytes and are git-ignored; the fixtures
 * are the small, reviewable subset the tests read. This script is the
 * provenance for them: run it again when a new recording arrives, and record
 * the recording's identity alongside the result.
 *
 * What is kept, and why:
 * - the **last** assistant message of every turn keeps its block types plus a
 *   tail of its reasoning text and a head of any visible text — that is the
 *   only message the detector ever reads (each turn overwrites the previous
 *   one before the turn closes),
 * - earlier assistant messages keep their **block types only**, so the
 *   ordering fact ("the turn's last message is the one judged") stays testable
 *   without carrying text nobody reads,
 * - human prompts collapse to a marker, because the machine only asks whether
 *   one arrived,
 * - each turn keeps its completion flag and turn number.
 *
 * Everything else is dropped: stream frames, usage, tool calls and results,
 * provider replay state. None of them reach the plugin.
 *
 * Usage:
 *   node scripts/derive-fixture.mjs <recording.jsonl> <fixture.jsonl>
 *
 * Exit codes: 0 = fixture written / 1 = usage error or unreadable recording.
 */

import { readFileSync, writeFileSync } from 'node:fs'

/** Characters of reasoning tail kept for a turn's last message. */
const REASONING_TAIL_CHARS = 1200

/** Characters of visible text kept for a turn's last message. */
const TEXT_HEAD_CHARS = 200

const [input, output] = process.argv.slice(2)
if (input === undefined || output === undefined) {
  console.error('usage: node scripts/derive-fixture.mjs <recording.jsonl> <fixture.jsonl>')
  process.exit(1)
}

let raw
try {
  raw = readFileSync(input, 'utf8')
} catch (error) {
  console.error(`cannot read ${input}: ${String(error)}`)
  process.exit(1)
}

/** Reduce one content block to what detection reads. */
function trimBlock(block, keepText) {
  if (typeof block !== 'object' || block === null || typeof block.type !== 'string')
    return undefined
  if (!keepText) return { type: block.type }
  const text = typeof block.text === 'string' ? block.text : ''
  if (block.type === 'reasoning')
    return { type: 'reasoning', text: text.slice(-REASONING_TAIL_CHARS) }
  if (block.type === 'text') return { type: 'text', text: text.slice(0, TEXT_HEAD_CHARS) }
  return { type: block.type }
}

/** Every event this script cares about, in log order. */
const records = []
for (const line of raw.split('\n')) {
  if (line.trim() === '') continue
  try {
    records.push(JSON.parse(line))
  } catch {
    continue
  }
}

/** Turn number of the last assistant message per turn, so earlier ones can be trimmed. */
const lastAssistantIndex = new Map()
for (const [index, record] of records.entries()) {
  if (record.type === 'assistant/message') lastAssistantIndex.set(record.data.turn, index)
}

const lines = []
let turns = 0
for (const [index, record] of records.entries()) {
  if (record.type === 'assistant/message') {
    const isLast = lastAssistantIndex.get(record.data.turn) === index
    const blocks = (record.data.message.content ?? [])
      .map((block) => trimBlock(block, isLast))
      .filter((block) => block !== undefined)
    lines.push({ kind: 'assistant-message', turn: record.data.turn, blocks })
  } else if (record.type === 'user/message') {
    if (record.data.source?.kind === 'user') lines.push({ kind: 'human-message' })
  } else if (record.type === 'turn/end') {
    turns += 1
    lines.push({
      kind: 'turn-end',
      turn: record.data.turn,
      completed: record.data.reason?.kind === 'completed',
    })
  }
}

const header = { kind: 'fixture', source: input.replaceAll('\\', '/').split('/').at(-1), turns }
writeFileSync(
  output,
  `${JSON.stringify(header)}\n${lines.map((line) => JSON.stringify(line)).join('\n')}\n`,
  'utf8',
)
console.log(`wrote ${output}: ${turns} turns, ${lines.length} events`)
