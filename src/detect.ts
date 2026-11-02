/**
 * The one judgment this plugin makes: does a finished turn deserve a rescue?
 *
 * It deserves one when the turn ended normally and its closing message ends in
 * leaked protocol markup. Reasoning and visible text are both content: which of
 * them the route put the markup in says nothing about whether the work happened,
 * and the message's last line says everything.
 *
 * Pure: no host types, no events, no clock. The caller adapts real session
 * events into {@link TurnObservation}.
 *
 * @module dsh-dsml-rescue/detect
 */

import { hasLeakedProtocolTail } from './protocol.ts'

/** One content block, reduced to the two facts this judgment needs. */
export interface BlockLike {
  /** Provider content-block tag. */
  readonly type: string
  /** Text carried by text and reasoning blocks. */
  readonly text?: string
}

/** One turn end: whether it completed normally, and its closing message. */
export interface TurnObservation {
  /** Whether the turn ended `completed` rather than aborted, errored, or truncated. */
  readonly completed: boolean
  /** Content blocks of the turn's last assistant message, in stream order. */
  readonly blocks: readonly BlockLike[]
}

/**
 * Whether a block carries message content rather than an effect.
 *
 * Everything else — a tool call, or a content kind this plugin has never seen —
 * is output the turn produced, so it ends the question.
 * @param block - one content block of the closing message.
 * @returns whether the block is reasoning or visible text.
 */
function isTextBearing(block: BlockLike): boolean {
  return block.type === 'reasoning' || block.type === 'text'
}

/**
 * The text of every text-bearing block, in stream order.
 * @param blocks - the turn's closing content blocks.
 * @returns one entry per block that carries text, empty entries included.
 */
function streams(blocks: readonly BlockLike[]): string[] {
  return blocks
    .filter((block) => isTextBearing(block) && block.text !== undefined)
    .map((block) => block.text ?? '')
}

/**
 * Decide whether one finished turn is a leaking stall.
 * @param observation - the turn's end reason and its closing message blocks.
 * @returns true only when the turn completed, produced no non-text block, and
 *   its content ends in protocol markup.
 */
export function isRescueCandidate(observation: TurnObservation): boolean {
  if (!observation.completed) return false
  if (observation.blocks.some((block) => !isTextBearing(block))) return false
  return hasLeakedProtocolTail(streams(observation.blocks))
}
