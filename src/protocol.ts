/**
 * Protocol-mark detection over one message's content.
 *
 * Some provider routes deliver the model's tool-call dialect as ordinary
 * content instead of a structured tool call. The dialect's closing tokens then
 * sit at the very end of the message, and the turn ends having done nothing.
 * This module answers one question about that text: does it end with such a
 * token? It knows nothing about turns, agents, or sessions, and nothing about
 * which content kind the route chose to put it in.
 *
 * @module dsh-dsml-rescue/protocol
 */

/**
 * The marker that opens and closes every token of the dialect. Matched on
 * NFKC-normalized text, so the full-width vertical bar the dialect actually
 * uses arrives here as an ASCII pipe and needs no separate alternative.
 */
const MARKER = /\|\|\s*dsml\s*\|\|/i

/**
 * Remove fenced code blocks, keeping a fence opener's line prefix.
 *
 * A fence is quotation: a model that transcribes the call it meant to make puts
 * the transcription inside one, and that transcription is not what the message
 * says. Fences can open mid-line, so this cuts at the delimiter rather than at
 * the start of the line.
 * @param text - one message's content.
 * @returns the same text with fenced spans blanked out.
 */
function withoutFences(text: string): string {
  const kept: string[] = []
  let fenced = false
  for (const line of text.split(/\r?\n/)) {
    let rest = line
    let visible = ''
    for (;;) {
      const at = rest.search(/```|~~~/)
      if (at < 0) break
      if (!fenced) visible += rest.slice(0, at)
      rest = rest.slice(at + 3)
      fenced = !fenced
    }
    kept.push(fenced ? visible : visible + rest)
  }
  return kept.join('\n')
}

/**
 * A line that is protocol markup rather than a sentence.
 *
 * Requiring the line to open with `<` is what separates the two: a model that
 * mentions the marker inside a sentence starts that line with ordinary text,
 * while genuine leaked markup starts with its opening angle bracket.
 * @param line - one NFKC-normalized line, trimmed.
 * @returns whether the line opens as markup and carries the marker.
 */
function isMarkupLine(line: string): boolean {
  return line.startsWith('<') && MARKER.test(line)
}

/**
 * Whether a message's content ends with leaked protocol markup.
 *
 * Only the last non-blank line is read. A leak is what the message stops on, so
 * anything said after the markup is output, and a turn that produced output is
 * not a stall. Fences are read per stream: a fence cannot span two blocks, and
 * carrying one block's fence state into the next would flip the reading of a
 * block that never opened one.
 * @param streams - one text per text-bearing block, in stream order.
 * @returns whether the last non-blank line of the content is protocol markup.
 */
export function hasLeakedProtocolTail(streams: readonly string[]): boolean {
  const lines: string[] = []
  for (const stream of streams) {
    for (const line of withoutFences(stream).normalize('NFKC').split(/\r?\n/)) lines.push(line)
  }
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = (lines[index] ?? '').trim()
    if (line === '') continue
    return isMarkupLine(line)
  }
  return false
}
