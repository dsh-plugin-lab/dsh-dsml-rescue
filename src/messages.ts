/**
 * The one message this plugin shows the model, and the attribution it carries.
 *
 * Deliberately says nothing about why the previous turn ended empty. The cause
 * sits below the model — a provider route delivering tool-call markup as text —
 * so nothing the model does can avoid it, and naming it would only invite the
 * model to talk about the failure instead of continuing the work. The wording
 * is fixed rather than configurable: one sentence that asks for the next step,
 * plus one legal way out so a rescue cannot become an open-ended loop.
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

/** What the model reads. Two instructions: continue, or close out if finished. */
export const CONTINUE_PROMPT =
  'Continue with the task. Take the next concrete step now, using a tool if needed. ' +
  'If the work is complete, reply with a short summary.'

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
