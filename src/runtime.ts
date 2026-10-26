/**
 * The impure edge: adapt host events into reducer events, act on the answer.
 *
 * Every judgment lives in `machine` (sequencing), `detect` (recognition), and
 * `policy` (limits); this module only translates and performs one side effect.
 *
 * **Why the continuation is queued from `agent/turn-stopping`.** Three
 * constraints meet at that seam and nowhere else:
 *
 * 1. Append reentrancy — a `session/event` observer runs while the event being
 *    published still holds the log open, so appending the inbox splice from
 *    there is rejected. `turn-stopping` is dispatched outside any append.
 * 2. Turn continuation — the loop closes a turn by appending `turn/end` and
 *    then asking its inbox whether more work is pending. A message queued
 *    before that question opens the next turn immediately.
 * 3. Subagent settlement — a child counts as settled only while it is idle
 *    *and* its inbox is empty, so a rescue queued here keeps it unsettled and
 *    keeps its parent from being told the run ended. Deferring the same message
 *    by one microtask would let the child go idle first and race exactly that
 *    check.
 *
 * The seam's payload carries no stop reason, so a turn cut off at its output
 * ceiling looks like one that finished. It is excluded by accounting instead —
 * the closing message's output-token count against the ceiling this session last
 * requested — because the host's own `max-tokens` verdict arrives one event
 * later, after the decision is already made.
 *
 * **Why giving up writes nothing.** See constraint 3: a message in a capped-out
 * child's inbox would leave it permanently unsettled, so its parent would never
 * learn the run ended — worse than the stall this plugin exists to shorten.
 *
 * @module dsh-dsml-rescue/runtime
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock, TokenUsage } from '@deepseek-ai/dsh-llm'
import { INITIAL_STATE, reduce } from './machine.ts'
import type { MachineState } from './machine.ts'
import { createRescueMessage } from './messages.ts'

/** Deployment-varying limits, already validated by the plugin entry. */
export interface RuntimeConfig {
  /** Cap on consecutive rescues for one agent. */
  readonly maxConsecutive: number
  /** Whether child agents are rescued too. */
  readonly applyToSubagents: boolean
}

/** Whether the inbox already holds input a human queued. */
function humanPending(agent: Agent): boolean {
  return (
    agent.inbox.nextTurn.some((message) => message.source.kind === 'user') ||
    agent.inbox.nextStep.some((message) => message.source.kind === 'user')
  )
}

/**
 * Whether the step being closed spent its whole output budget.
 *
 * The seam carries no stop reason, so this compares the closing message's
 * output-token count with the ceiling the request was sent under. Both numbers
 * are the caller's own accounting — the count is what the provider reported and
 * the ceiling is what this session last requested — so equality means the model
 * was cut off, not that it chose to stop.
 *
 * The comparison is deliberately one-sided: an unknown ceiling or a missing
 * count reports "not exhausted", because a wrong `true` would silence the
 * rescue this plugin exists for, while a wrong `false` only costs the rescue
 * one attempt of the streak.
 * @param agent - the agent whose turn is closing.
 * @param turn - the turn being closed.
 * @param usage - the closing message's token accounting, when the host logged it.
 * @returns whether the output budget is spent.
 */
function outputExhausted(agent: Agent, usage: TokenUsage | undefined): boolean {
  if (usage === undefined) return false
  const ceiling = agent.session.requestHeader()?.config.maxTokens
  if (ceiling === undefined || ceiling <= 0) return false
  return usage.outputTokens >= ceiling
}

/**
 * Install the turn watcher and its continuation side effect.
 * @param ctx - plugin context; listeners are disposed with it.
 * @param config - validated limits.
 */
export function install(ctx: Context, config: RuntimeConfig): void {
  const states = new Map<Agent, MachineState>()
  /** Output accounting of the last assistant message, per agent. */
  const usageByAgent = new Map<Agent, TokenUsage | undefined>()

  /** Apply one reducer event and store the result. */
  function advance(agent: Agent, event: Parameters<typeof reduce>[1]): ReturnType<typeof reduce> {
    const state = states.get(agent) ?? INITIAL_STATE
    const step = reduce(state, event, { maxConsecutive: config.maxConsecutive })
    states.set(agent, step.state)
    return step
  }

  /** Whether this agent was created by another agent instead of at the root. */
  function isSubagent(agent: Agent): boolean {
    return !ctx.agents.roots().includes(agent)
  }

  ctx.on('session/event', (session, event) => {
    const agent = ctx.agents.get(session.id)
    if (agent === undefined || agent.session !== session) return

    switch (event.type) {
      case 'assistant/message':
        advance(agent, {
          kind: 'assistant-message',
          turn: event.data.turn,
          blocks: event.data.message.content as readonly ContentBlock[],
        })
        usageByAgent.set(agent, event.data.usage)
        return
      case 'user/message':
        // Human input redefines the streak; this plugin's own notices do not.
        if (event.data.source.kind === 'user') advance(agent, { kind: 'human-message' })
        return
      case 'turn/end':
        advance(agent, {
          kind: 'turn-end',
          turn: event.data.turn,
          completed: event.data.reason.kind === 'completed',
        })
        return
      default:
        return
    }
  })

  ctx.on('agent/turn-stopping', ({ agent, turn }) => {
    if (!config.applyToSubagents && isSubagent(agent)) return
    const step = advance(agent, {
      kind: 'turn-stopping',
      turn,
      humanPending: humanPending(agent),
      outputExhausted: outputExhausted(agent, usageByAgent.get(agent)),
    })

    if (step.decision === 'give-up') {
      ctx.logger.warn(
        `dsml-rescue: agent "${agent.id}" stalled ${config.maxConsecutive} times in a row; stopped continuing it`,
      )
      return
    }
    if (step.decision !== 'rescue') return
    try {
      agent.followup(createRescueMessage(step.round, config.maxConsecutive))
    } catch (error: unknown) {
      // A queue failure must never fail the turn that just finished.
      states.set(agent, { ...(states.get(agent) ?? INITIAL_STATE), consecutive: 0 })
      ctx.logger.warn(
        `dsml-rescue: could not queue a continuation for agent "${agent.id}": ${String(error)}`,
      )
    }
  })

  ctx.on('agent/disposed', ({ agent }) => {
    states.delete(agent)
    usageByAgent.delete(agent)
  })
}
