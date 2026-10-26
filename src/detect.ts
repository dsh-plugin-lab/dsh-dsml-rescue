/**
 * The one judgment this plugin makes: does a finished turn deserve a rescue?
 *
 * A turn deserves one when it ended normally yet produced nothing the loop or
 * the user can act on, and its reasoning ends in leaked protocol markup. Both
 * halves are required — a turn that produced nothing for another reason stays
 * untouched, because rescuing it would paper over an unrelated failure.
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

/** Whether a text block carries anything other than whitespace. */
function carriesText(block: BlockLike): boolean {
  return block.type === 'text' && block.text !== undefined && /\S/.test(block.text)
}

/**
 * Whether the turn produced anything a caller could act on.
 *
 * An unknown block type counts as actionable on purpose: a provider that adds
 * a content kind this plugin has never seen is far more likely to have produced
 * output than to have produced nothing, and a false rescue costs a request.
 * @param blocks - the turn's closing content blocks.
 * @returns whether any block is visible text, a tool call, or an unknown kind.
 */
function hasActionableContent(blocks: readonly BlockLike[]): boolean {
  return blocks.some((block) =>
    block.type === 'reasoning' ? false : block.type === 'text' ? carriesText(block) : true,
  )
}

/**
 * Concatenate every reasoning block of a message.
 * @param blocks - the turn's closing content blocks.
 * @returns the joined reasoning text, or the empty string when there is none.
 */
function joinReasoning(blocks: readonly BlockLike[]): string {
  return blocks
    .flatMap((block) =>
      block.type === 'reasoning' && block.text !== undefined ? [block.text] : [],
    )
    .join('\n')
}

/**
 * Decide whether one finished turn is a leaking stall.
 * @param observation - the turn's end reason and its closing message blocks.
 * @returns true only when the turn completed, produced nothing actionable, and
 *   its reasoning ends in protocol markup.
 */
export function isRescueCandidate(observation: TurnObservation): boolean {
  if (!observation.completed) return false
  if (hasActionableContent(observation.blocks)) return false
  return hasLeakedProtocolTail(joinReasoning(observation.blocks))
}
