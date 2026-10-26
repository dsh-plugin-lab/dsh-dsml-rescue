#!/usr/bin/env node
/**
 * Throwaway OpenAI-compatible endpoint that reproduces the stalled turn.
 *
 * The first request answers with reasoning only, ending in the leaked protocol
 * markup — the shape a real route produced. Every request after that answers
 * normally. That makes the whole failure deterministic: if the plugin works,
 * the run issues a second request without a human typing anything.
 *
 * Usage:
 *   node scripts/mock-stall-server.mjs <port> <request-log>
 *
 * Exit codes: 0 = stopped by signal / 1 = usage error.
 */

import { appendFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'

const [portArg, logPath] = process.argv.slice(2)
if (portArg === undefined || logPath === undefined) {
  console.error('usage: node scripts/mock-stall-server.mjs <port> <request-log>')
  process.exit(1)
}

/** The leaked tail a real route emits instead of a structured tool call. */
const LEAK = '\n</｜｜DSML｜｜ parameter>\n</｜｜DSML｜｜ invoke>\n</｜｜DSML｜｜ calls>'

writeFileSync(logPath, '', 'utf8')
let requests = 0

/** Stream one completion in the `openai-completions` SSE dialect. */
function reply(response, chunks) {
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })
  for (const chunk of chunks) {
    response.write(`data: ${JSON.stringify(chunk)}\n\n`)
  }
  response.write('data: [DONE]\n\n')
  response.end()
}

/** One delta in the chat-completions shape. */
function delta(fields, finishReason = null) {
  return {
    id: 'mock-1',
    object: 'chat.completion.chunk',
    model: 'mock-model',
    choices: [{ index: 0, delta: fields, finish_reason: finishReason }],
  }
}

const server = createServer((request, response) => {
  if (!request.url.endsWith('/chat/completions')) {
    response.writeHead(404).end()
    return
  }
  let body = ''
  request.on('data', (piece) => {
    body += piece
  })
  request.on('end', () => {
    requests += 1
    const parsed = (() => {
      try {
        return JSON.parse(body)
      } catch {
        return {}
      }
    })()
    const messages = parsed.messages?.length ?? 0
    const last = (parsed.messages ?? []).at(-1)
    const lastText =
      typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? null)
    appendFileSync(
      logPath,
      `request ${requests} messages=${messages} role=${last?.role} last=${(lastText ?? '').slice(0, 100).replaceAll('\n', ' | ')}\n`,
      'utf8',
    )

    // Three kinds of request arrive here, and the classification is what makes
    // this demo repeatable instead of one-shot per server lifetime.
    const stall = !/^(Generate the session title|Continue with the task)/.test(lastText ?? '')
    if (stall) {
      // Reasoning only: no `content`, no tool calls. This is the stall.
      reply(response, [
        delta({ role: 'assistant', reasoning_content: 'I should call a tool now.' }),
        delta({ reasoning_content: LEAK }),
        delta({}, 'stop'),
      ])
      return
    }
    if ((lastText ?? '').startsWith('Generate the session title')) {
      reply(response, [delta({ role: 'assistant', content: 'Demo session' }), delta({}, 'stop')])
      return
    }
    reply(response, [
      delta({ role: 'assistant', content: 'Continued after the rescue.' }),
      delta({}, 'stop'),
    ])
  })
})

server.listen(Number(portArg), '127.0.0.1', () => {
  console.log(`mock provider listening on 127.0.0.1:${portArg}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
