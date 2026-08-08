import { describe, expect, it } from 'vitest'
import { parseCsv, parseCsvRecords, toRecords } from './csv'

describe('parseCsv', () => {
  it('reads plain rows', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('keeps commas inside quotes', () => {
    expect(parseCsv('a,b\n"Bench Press, wide",8')).toEqual([
      ['a', 'b'],
      ['Bench Press, wide', '8'],
    ])
  })

  it('unescapes a doubled quote', () => {
    expect(parseCsv('note\n"he said ""go"""')).toEqual([['note'], ['he said "go"']])
  })

  it('keeps a newline inside quotes', () => {
    expect(parseCsv('note\n"line one\nline two"')).toEqual([
      ['note'],
      ['line one\nline two'],
    ])
  })

  it('handles CRLF and a lone CR the same as LF', () => {
    expect(parseCsv('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
    expect(parseCsv('a,b\r1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('strips a BOM, which would otherwise rename the first column', () => {
    expect(parseCsv('﻿title,reps')[0]).toEqual(['title', 'reps'])
  })

  it('reads a last row with no trailing newline', () => {
    expect(parseCsv('a\n1')).toEqual([['a'], ['1']])
  })

  it('does not invent a row for a trailing newline', () => {
    expect(parseCsv('a\n1\n')).toEqual([['a'], ['1']])
  })

  it('keeps empty fields rather than collapsing them', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ])
  })

  it('is empty for empty input', () => {
    expect(parseCsv('')).toEqual([])
  })
})

describe('toRecords', () => {
  it('keys data rows by trimmed header', () => {
    expect(
      toRecords([
        [' a ', 'b'],
        ['1', '2'],
      ]),
    ).toEqual([{ a: '1', b: '2' }])
  })

  /**
   * A truncated export is the common bad file. Reading a missing cell as an
   * empty string rather than `undefined` lets every caller treat "absent" and
   * "blank" the same way, which is what makes the analyser total.
   */
  it('pads a short row instead of leaving holes', () => {
    expect(toRecords([['a', 'b', 'c'], ['1']])).toEqual([{ a: '1', b: '', c: '' }])
  })

  it('drops a blank line', () => {
    expect(toRecords([['a'], [''], ['1']])).toEqual([{ a: '1' }])
  })

  it('is empty with no header', () => {
    expect(toRecords([])).toEqual([])
  })
})

describe('parseCsvRecords', () => {
  it('goes text to records in one step', () => {
    expect(parseCsvRecords('title,reps\nBench,8')).toEqual([
      { title: 'Bench', reps: '8' },
    ])
  })
})
