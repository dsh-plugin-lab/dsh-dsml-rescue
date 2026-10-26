/**
 * Protocol-mark detection over one reasoning stream.
 *
 * Some provider routes deliver the model's tool-call dialect as ordinary
 * reasoning text instead of a structured tool call. The dialect's closing
 * tokens then sit at the very end of the thinking stream, and the turn ends
 * having done nothing. This module answers one question about that text: does
 * it end with such a token? It knows nothing about turns, agents, or sessions.
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
 * How many trailing non-blank lines are considered. A leak puts its closing
 * tokens at the end; scanning further back starts matching prose *about* the
 * dialect, including examples a model quotes while explaining it.
 */
const TAIL_LINES = 3

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
 * Whether a reasoning stream ends with leaked protocol markup.
 *
 * Empty or absent reasoning is not a leak: a turn that produced nothing at all
 * is a different failure and stays outside this plugin's scope.
 * @param reasoning - the complete reasoning text of one assistant message.
 * @returns whether any of its last few non-blank lines is protocol markup.
 */
export function hasLeakedProtocolTail(reasoning: string): boolean {
  if (reasoning === '') return false
  const lines = reasoning.normalize('NFKC').split(/\r?\n/)
  let scanned = 0
  for (let index = lines.length - 1; index >= 0 && scanned < TAIL_LINES; index -= 1) {
    const line = (lines[index] ?? '').trim()
    if (line === '') continue
    scanned += 1
    if (isMarkupLine(line)) return true
  }
  return false
}
