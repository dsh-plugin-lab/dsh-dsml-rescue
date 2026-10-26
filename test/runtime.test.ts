import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'

import { install } from '../src/runtime.ts'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'

/**
 * The translation layer, exercised through a real Cordis context.
 *
 * `runtime` is the only module that touches the host, so it is the only one the
 * pure suites above cannot reach. The fake here is deliberately tiny: it stands
 * in for the two services the module reads (`ctx.agents` and the agent's inbox)
 * and for the one method it calls (`followup`). Everything else — event
 * dispatch, listener registration, disposal — is the real implementation.
 */

/** A stand-in agent capturing what the plugin decided to queue. */
interface FakeAgent {
  readonly id: string
  readonly session: object
  readonly inbox: { nextTurn: UserMessage[]; nextStep: UserMessage[] }
  readonly queued: UserMessage[]
  followup(message: UserMessage): void
}

/** The agent registry the plugin reads, as a real service. */
class FakeAgents extends Service {
  readonly live: FakeAgent[] = []

  /** Register the registry under the name the plugin injects. */
  constructor(ctx: Context) {
    super(ctx, 'agents')
  }

  /** Look up one live agent by session id. */
  get(id: string): FakeAgent | undefined {
    return this.live.find((agent) => agent.id === id)
  }

  /** Top-level agents; anything absent here is a child. */
  roots(): FakeAgent[] {
    return this.live.filter((agent) => !agent.id.startsWith('child'))
  }
}

/** Build a fake agent that records what it was asked to queue. */
function makeAgent(id: string, maxTokens?: number): FakeAgent {
  const session = {
    id,
    requestHeader: () => (maxTokens === undefined ? undefined : { config: { maxTokens } }),
  }
  const agent: FakeAgent = {
    id,
    session,
    inbox: { nextTurn: [], nextStep: [] },
    queued: [],
    followup(message) {
      agent.queued.push(message)
    },
  }
  return agent
}

/** Mount the plugin over a fresh context with one registered agent. */
function setup(
  options: { applyToSubagents?: boolean; maxConsecutive?: number; maxTokens?: number } = {},
): {
  ctx: Context
  agents: FakeAgents
  agent: FakeAgent
} {
  const ctx = new Context()
  const agents = new FakeAgents(ctx)
  const agent = makeAgent('root-1', options.maxTokens)
  agents.live.push(agent)
  install(ctx, {
    maxConsecutive: options.maxConsecutive ?? 3,
    applyToSubagents: options.applyToSubagents ?? true,
  })
  return { ctx, agents, agent }
}

const LEAK = '<||DSML|| calls>'

/** Append one assistant message the way the host publishes it. */
function emitAssistant(
  ctx: Context,
  agent: FakeAgent,
  turn: number,
  blocks: readonly object[],
  outputTokens?: number,
): void {
  const event = {
    type: 'assistant/message',
    data: {
      turn,
      step: 1,
      message: { role: 'assistant', content: blocks },
      ...(outputTokens === undefined
        ? {}
        : { usage: { inputTokens: 1, outputTokens, totalTokens: 1 + outputTokens } }),
    },
  } as unknown as SessionEvent
  ctx.emit('session/event', agent.session as Session, event)
}

/** Close one turn the way the host publishes it. */
function emitTurnEnd(ctx: Context, agent: FakeAgent, turn: number, completed: boolean): void {
  const reason = completed ? { kind: 'completed' } : { kind: 'aborted', reason: { kind: 'user' } }
  const event = { type: 'turn/end', data: { turn, reason } } as unknown as SessionEvent
  ctx.emit('session/event', agent.session as Session, event)
}

/** Offer the turn-stopping seam for one turn. */
async function offer(ctx: Context, agent: FakeAgent, turn: number): Promise<void> {
  await ctx.serial('agent/turn-stopping', {
    agent: agent as unknown as Agent,
    turn,
    signal: new AbortController().signal,
  })
}

/** Run one whole stalled turn: leaking message, offer, then close. */
async function stalledTurn(
  ctx: Context,
  agent: FakeAgent,
  turn: number,
  outputTokens?: number,
): Promise<void> {
  emitAssistant(ctx, agent, turn, [{ type: 'reasoning', text: `working\n${LEAK}` }], outputTokens)
  await offer(ctx, agent, turn)
  emitTurnEnd(ctx, agent, turn, true)
}

describe('a stalled turn continues', () => {
  it('queues one continuation with the fixed neutral prompt', async () => {
    const { ctx, agent } = setup()
    await stalledTurn(ctx, agent, 1)

    expect(agent.queued).toHaveLength(1)
    const message = agent.queued[0]
    expect(message?.source).toEqual({
      kind: 'dsml-rescue',
      form: 'notice',
      summary: 'Auto-continue 1/3',
    })
  })

  it('leaves a step that spent its whole output budget alone', async () => {
    // The ceiling comes from the session's last request, so equality with the
    // reported count means the model was cut off rather than finished.
    const { ctx, agent } = setup({ maxTokens: 4096 })
    await stalledTurn(ctx, agent, 1, 4096)
    expect(agent.queued).toHaveLength(0)
  })

  it('still rescues when the count is below the ceiling', async () => {
    const { ctx, agent } = setup({ maxTokens: 4096 })
    await stalledTurn(ctx, agent, 1, 4095)
    expect(agent.queued).toHaveLength(1)
  })

  it('stops after the configured number of attempts', async () => {
    const { ctx, agent } = setup({ maxConsecutive: 2 })
    for (const turn of [1, 2, 3]) await stalledTurn(ctx, agent, turn)
    // Two continuations, then silence: the third offer finds the budget spent.
    expect(agent.queued).toHaveLength(2)
  })

  it('starts a fresh streak after a turn that produced output', async () => {
    const { ctx, agent } = setup({ maxConsecutive: 1 })
    await stalledTurn(ctx, agent, 1)
    emitAssistant(ctx, agent, 2, [{ type: 'text', text: 'Done.' }])
    await offer(ctx, agent, 2)
    emitTurnEnd(ctx, agent, 2, true)
    await stalledTurn(ctx, agent, 3)
    expect(agent.queued.map((message) => message.source)).toEqual([
      { kind: 'dsml-rescue', form: 'notice', summary: 'Auto-continue 1/1' },
      { kind: 'dsml-rescue', form: 'notice', summary: 'Auto-continue 1/1' },
    ])
  })
})

describe('what holds the plugin back', () => {
  it('leaves a turn that produced text alone', async () => {
    const { ctx, agent } = setup()
    emitAssistant(ctx, agent, 1, [
      { type: 'reasoning', text: 'thinking' },
      { type: 'text', text: 'Done.' },
    ])
    await offer(ctx, agent, 1)
    expect(agent.queued).toHaveLength(0)
  })

  it('clears the streak when a turn ends abnormally', async () => {
    const { ctx, agent } = setup({ maxConsecutive: 1 })
    await stalledTurn(ctx, agent, 1)
    // The loop does not offer turn-stopping for a turn it is aborting — it
    // throws instead — so this mirrors what the host actually publishes: the
    // leaking message and the close, with no offer between them.
    emitAssistant(ctx, agent, 2, [{ type: 'reasoning', text: `working\n${LEAK}` }])
    emitTurnEnd(ctx, agent, 2, false)
    // The next stall therefore starts a fresh budget rather than staying spent.
    await stalledTurn(ctx, agent, 3)
    expect(agent.queued).toHaveLength(2)
  })

  it('yields when a human prompt is already queued', async () => {
    const { ctx, agent } = setup()
    agent.inbox.nextTurn.push({ source: { kind: 'user' } } as unknown as UserMessage)
    await stalledTurn(ctx, agent, 1)
    expect(agent.queued).toHaveLength(0)
  })

  it('skips a child agent when subagents are excluded', async () => {
    const { ctx, agents } = setup({ applyToSubagents: false })
    const child = makeAgent('child-1')
    agents.live.push(child)
    await stalledTurn(ctx, child, 1)
    expect(child.queued).toHaveLength(0)
  })

  it('continues a child agent by default', async () => {
    const { ctx, agents, agent } = setup()
    const child = makeAgent('child-1')
    agents.live.push(child)
    await stalledTurn(ctx, child, 1)
    expect(child.queued).toHaveLength(1)
    expect(agent.queued).toHaveLength(0)
  })
})
