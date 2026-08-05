import { describe, expect, it } from 'vitest'
import { parseJsonObject } from '../../supabase/functions/_shared/parse-json-object'

/**
 * The three shapes a model actually answers in, plus the ways it fails.
 *
 * The preamble case is not hypothetical: `generate-routine` threw
 * "The routine came back unreadable" in production on 2026-08-05 because it
 * handled the fence and not the preamble, while `coach-notes` handled both.
 */
describe('parseJsonObject', () => {
  it('parses a clean object', () => {
    expect(parseJsonObject('{"days":[1]}')).toEqual({ days: [1] })
  })

  it('recovers an object from a fenced block', () => {
    const raw = 'Here you go:\n```json\n{"days":[1]}\n```\nHope that helps.'
    expect(parseJsonObject(raw)).toEqual({ days: [1] })
  })

  it('recovers an object from an unfenced reasoning preamble', () => {
    const raw = 'Let me think. The user wants 4 days, so:\n{"days":[1,2]}'
    expect(parseJsonObject(raw)).toEqual({ days: [1, 2] })
  })

  it('falls through a broken fence to the brace scan', () => {
    // A fenced block that is not valid JSON must not take the response down
    // with it — the real object may still be sitting after it.
    const raw = '```\nnot json at all\n```\n{"days":[3]}'
    expect(parseJsonObject(raw)).toEqual({ days: [3] })
  })

  it('handles an object containing a fence-like string', () => {
    expect(parseJsonObject('{"note":"use ``` for code"}')).toEqual({
      note: 'use ``` for code',
    })
  })

  it('returns null for prose with no object in it', () => {
    expect(parseJsonObject('I cannot help with that.')).toBeNull()
  })

  it('returns null for an empty response', () => {
    expect(parseJsonObject('')).toBeNull()
    expect(parseJsonObject('   ')).toBeNull()
  })

  it('returns null for a bare array or scalar', () => {
    // Both callers read a named property off the result. An array would pass
    // a truthiness check and then fail somewhere less obvious.
    expect(parseJsonObject('[1,2,3]')).toBeNull()
    expect(parseJsonObject('"just a string"')).toBeNull()
    expect(parseJsonObject('42')).toBeNull()
  })

  it('returns null for a truncated object rather than throwing', () => {
    // The 900-token cap produced exactly this before it was raised to 2400.
    expect(parseJsonObject('{"days":[{"name":"Push"')).toBeNull()
  })
})
