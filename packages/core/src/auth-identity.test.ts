import { describe, expect, it } from 'vitest'
import {
  classifyIdentifier,
  maskEmail,
  normalizeEmail,
  normalizeUsername,
} from './auth-identity'

describe('normalizeEmail', () => {
  it('strips dots from gmail local parts', () => {
    expect(normalizeEmail('ameen.hassan421@gmail.com')).toBe('ameenhassan421@gmail.com')
    expect(normalizeEmail('a.b.c@googlemail.com')).toBe('abc@googlemail.com')
  })

  it('leaves non-gmail domains untouched — dots are meaningful elsewhere', () => {
    expect(normalizeEmail('first.last@yahoo.com')).toBe('first.last@yahoo.com')
    expect(normalizeEmail('a.b@company.co')).toBe('a.b@company.co')
  })

  it('lowercases and trims', () => {
    expect(normalizeEmail('  Ameen@GMAIL.com ')).toBe('ameen@gmail.com')
  })

  it('does not treat a leading @ as an email boundary', () => {
    expect(normalizeEmail('@gmail.com')).toBe('@gmail.com')
  })
})

describe('classifyIdentifier', () => {
  it('classifies emails, normalised', () => {
    expect(classifyIdentifier(' Ameen.Hassan421@Gmail.com ')).toEqual({
      kind: 'email',
      value: 'ameenhassan421@gmail.com',
    })
  })

  it('classifies usernames, with or without the @ prefix', () => {
    expect(classifyIdentifier('@ameen_lifts')).toEqual({
      kind: 'username',
      value: 'ameen_lifts',
    })
    expect(classifyIdentifier('Ameen_Lifts')).toEqual({
      kind: 'username',
      value: 'ameen_lifts',
    })
  })

  it('rejects strings that are neither', () => {
    expect(classifyIdentifier('ab').kind).toBe('invalid')
    expect(classifyIdentifier('has space').kind).toBe('invalid')
    expect(classifyIdentifier('').kind).toBe('invalid')
  })
})

describe('normalizeUsername', () => {
  it('strips one leading @ and lowercases', () => {
    expect(normalizeUsername('@Wazn_User')).toBe('wazn_user')
  })
})

describe('maskEmail', () => {
  it('keeps first letters of local part and domain only', () => {
    expect(maskEmail('ameenahassan421@gmail.com')).toBe('a•••@g•••.com')
    expect(maskEmail('x@y.co')).toBe('x•••@y•••.co')
  })

  it('never throws on junk', () => {
    expect(maskEmail('junk')).toBe('•••')
  })
})
