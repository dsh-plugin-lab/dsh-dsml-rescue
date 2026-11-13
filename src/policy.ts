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
  /**
   * Rescues that were issued and **failed**: the turn each one opened stalled
   * again. A rescue still in flight is never counted here.
   */
  readonly failedRescues: number
  /** Configured cap on consecutive failed rescues. */
  readonly maxConsecutive: number
  /** Whether the agent's inbox already holds input a human queued. */
  readonly humanPending: boolean
}

/** The decision plus the streak that must be recorded alongside it. */
export interface PolicyOutcome {
  /** What to do now. */
  readonly decision: Decision
  /** The failed-rescue count after this decision. */
  readonly failedRescues: number
}

/**
 * Decide what one finished turn deserves.
 *
 * **What the cap counts.** Not rescues issued, and not stalls seen: a *failed*
 * rescue — one that was issued and whose successor turn stalled again. Issuing a
 * rescue whose turn never runs is not evidence of anything, so it never spends
 * budget. Progress resets the streak, which is what makes a long run able to
 * absorb an unbounded number of rescues: only an unbroken run of failures is
 * bounded.
 *
 * Order matters: a spent cap outranks a waiting human, because giving way would
 * leave the cap unrecorded and the streak silently unbounded.
 * @param input - detection verdict, failed-rescue count, cap, and human presence.
 * @returns the decision and the count to store.
 */
export function evaluate(input: PolicyInput): PolicyOutcome {
  if (!input.candidate) return { decision: 'ignore', failedRescues: 0 }
  if (input.failedRescues >= input.maxConsecutive) {
    return { decision: 'give-up', failedRescues: 0 }
  }
  if (input.humanPending) return { decision: 'yield', failedRescues: input.failedRescues }
  return { decision: 'rescue', failedRescues: input.failedRescues }
}
