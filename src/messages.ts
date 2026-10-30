/**
 * The one message this plugin shows the model, and the attribution it carries.
 *
 * Deliberately says nothing about why the previous turn ended empty. The cause
 * sits below the model — a provider route delivering tool-call markup as text —
 * so nothing the model does can avoid it, and naming it would only invite the
 * model to talk about the failure instead of continuing the work. The wording
 * is fixed rather than configurable: one instruction, and no clause inviting the
 * model to declare the work finished. The cap is what bounds a rescue, so the
 * text owes no exit — and offering one gives a stalled model a cheaper way to
 * end the turn than doing the work.
 *
 * @module dsh-dsml-rescue/messages
 */

import { boundContextSummary, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'dsml-rescue': {
      readonly kind: 'dsml-rescue'
      /** A runtime account shown without expanding the row. */
      readonly form: 'notice'
      /** One-line account of which rescue this is. */
      readonly summary: string
    }
  }
}

/**
 * What the model reads: one instruction, and nothing about being finished.
 *
 * The rescued turn ended with a tool call that never landed, so the next step
 * has not happened yet; a "say you are done" clause has nothing true to be right
 * about. Taking one is not free either: a prose answer is actionable output, so
 * detection stops calling the turn a stall and the run ends with the work
 * undone.
 */
export const CONTINUE_PROMPT =
  'Continue with the task. Take the next concrete step now, using a tool if needed.'

/**
 * Build the continuation turn's message.
 * @param round - this rescue's ordinal in the current streak, from 1.
 * @param max - the configured cap, for the durable one-line summary.
 * @returns an immutable user-role message attributed to this plugin.
 */
export function createRescueMessage(round: number, max: number): UserMessage {
  return createUserMessage({
    content: [{ type: 'text', text: CONTINUE_PROMPT }],
    source: {
      kind: 'dsml-rescue',
      form: 'notice',
      summary: boundContextSummary(`Auto-continue ${round}/${max}`),
    },
  })
}
