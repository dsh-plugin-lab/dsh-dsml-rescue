import { describe, expect, it } from 'vitest'

import { evaluate } from '../src/policy.ts'

const base = { candidate: true, failedRescues: 0, maxConsecutive: 3, humanPending: false }

describe('evaluate', () => {
  it('rescues without charging the streak: only an observed failure does', () => {
    // Issuing a rescue is not evidence that it failed; the verdict arrives when
    // the turn it opened is judged. So the count passes through untouched.
    expect(evaluate(base)).toEqual({ decision: 'rescue', failedRescues: 0 })
    expect(evaluate({ ...base, failedRescues: 2 })).toEqual({
      decision: 'rescue',
      failedRescues: 2,
    })
  })

  it('gives up at the cap and clears the streak for the next incident', () => {
    expect(evaluate({ ...base, failedRescues: 3 })).toEqual({
      decision: 'give-up',
      failedRescues: 0,
    })
    // A cap of one allows one rescue before the first failure is fatal.
    expect(evaluate({ ...base, maxConsecutive: 1, failedRescues: 1 })).toEqual({
      decision: 'give-up',
      failedRescues: 0,
    })
  })

  it('gives way to a waiting human without spending budget', () => {
    expect(evaluate({ ...base, humanPending: true })).toEqual({
      decision: 'yield',
      failedRescues: 0,
    })
    expect(evaluate({ ...base, failedRescues: 1, humanPending: true })).toEqual({
      decision: 'yield',
      failedRescues: 1,
    })
  })

  it('resets the streak on any turn that is not a candidate', () => {
    expect(evaluate({ ...base, candidate: false, failedRescues: 2 })).toEqual({
      decision: 'ignore',
      failedRescues: 0,
    })
  })

  it('lets the cap outrank a waiting human so the streak cannot stay unbounded', () => {
    expect(evaluate({ ...base, failedRescues: 3, humanPending: true })).toEqual({
      decision: 'give-up',
      failedRescues: 0,
    })
  })
})
