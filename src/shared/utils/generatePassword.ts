import { randomInt } from 'node:crypto'

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const DIGITS = '23456789'
const SYMBOLS = '!@#$%^&*'
const ALL = UPPER + LOWER + DIGITS + SYMBOLS

// 12 chars drawn from a charset that excludes visually ambiguous characters
// (0/O, 1/l/I) — the password is read off-screen and typed by hand.
export function generatePassword(length = 12): string {
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)]
  const rest = Array.from({ length: length - required.length }, () => pick(ALL))
  return shuffle([...required, ...rest]).join('')
}

function pick(charset: string): string {
  return charset[randomInt(charset.length)]
}

function shuffle(chars: string[]): string[] {
  const result = [...chars]
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
