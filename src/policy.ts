/**
 * When to rescue, when to give way, and when to stop.
 *
 * Separate from detection on purpose: what counts as a leaking stall changes
 * with evidence, while how many times to retry it changes with the operator's
 * patience. Keeping them apart means neither edit rewrites the other's tests.
 *
 * @module dsh-dsml-rescue/policy
 */

/** What the caller should do about one finished turn. */
export type Decision =
  /** Queue a continuation turn. */
  | 'rescue'
  /** The cap is spent: stop quietly and let the turn stay finished. */
  | 'give-up'
  /** A human is already waiting; their input goes first. */
  | 'yield'
  /** Nothing to do. */
  | 'ignore'

/** Everything the decision depends on. */
export interface PolicyInput {
  /** Whether detection accepted this turn as a leaking stall. */
  readonly candidate: boolean
  /** Rescues already queued for the current streak. */
  readonly consecutive: number
  /** Configured cap on consecutive rescues. */
  readonly maxConsecutive: number
  /** Whether the agent's inbox already holds input a human queued. */
  readonly humanPending: boolean
}

/** The decision plus the streak that must be recorded alongside it. */
export interface PolicyOutcome {
  /** What to do now. */
  readonly decision: Decision
  /** The consecutive-rescue count after this decision. */
  readonly consecutive: number
}

/**
 * Decide what one finished turn deserves.
 *
 * Order matters: a spent cap outranks a waiting human, because giving way would
 * leave the cap unrecorded and the streak silently unbounded.
 * @param input - detection verdict, current streak, cap, and human presence.
 * @returns the decision and the streak to store.
 */
export function evaluate(input: PolicyInput): PolicyOutcome {
  if (!input.candidate) return { decision: 'ignore', consecutive: 0 }
  if (input.consecutive >= input.maxConsecutive) return { decision: 'give-up', consecutive: 0 }
  if (input.humanPending) return { decision: 'yield', consecutive: input.consecutive }
  return { decision: 'rescue', consecutive: input.consecutive + 1 }
}
