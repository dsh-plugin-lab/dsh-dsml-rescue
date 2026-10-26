import { describe, expect, it } from 'vitest'

import { apply, inject, name } from '../src/index.ts'

/**
 * Smoke test: it only establishes that the package imports and that the entry point has the right
 * shape.
 *
 * It is **not** a redline. A redline is an assertion that this plugin's behaviour must not break,
 * and those grow alongside the capability itself.
 */
describe('entry', () => {
  it('exports the plugin name', () => {
    expect(name).toBe('dsh-dsml-rescue')
  })

  it('declares a service list (which may be empty)', () => {
    expect(Array.isArray(inject)).toBe(true)
  })

  it('can be applied without throwing', () => {
    expect(() => apply({})).not.toThrow()
  })
})
