import { describe, expect, it } from 'vitest'
import { type LogLevel, createLogger, serializeError } from '../src/lib/logger.js'

function capture(level: LogLevel) {
  const lines: Array<Record<string, unknown>> = []
  const logger = createLogger({
    level,
    clock: () => new Date('2026-06-22T00:00:00.000Z'),
    sink: (_lvl, line) => lines.push(JSON.parse(line)),
  })
  return { logger, lines }
}

describe('createLogger', () => {
  it('JSON 1行に time/level/msg を含める', () => {
    const { logger, lines } = capture('debug')
    logger.info('hello', { foo: 1 })
    expect(lines[0]).toEqual({
      time: '2026-06-22T00:00:00.000Z',
      level: 'info',
      msg: 'hello',
      foo: 1,
    })
  })

  it('閾値未満のレベルは出力しない', () => {
    const { logger, lines } = capture('warn')
    logger.info('skip')
    logger.warn('keep')
    expect(lines).toHaveLength(1)
    expect(lines[0]?.msg).toBe('keep')
  })

  it('child は固定フィールドを束ねる', () => {
    const { logger, lines } = capture('debug')
    logger.child({ requestId: 'r1' }).info('x')
    expect(lines[0]).toMatchObject({ requestId: 'r1', msg: 'x' })
  })

  it('Error を {name,message,stack} に自動展開する', () => {
    const { logger, lines } = capture('debug')
    logger.error('boom', { err: new TypeError('bad') })
    const err = lines[0]?.err as { name: string; message: string; stack?: string }
    expect(err.name).toBe('TypeError')
    expect(err.message).toBe('bad')
    expect(err.stack).toContain('TypeError')
  })
})

describe('serializeError', () => {
  it('非 Error は NonError として包む', () => {
    expect(serializeError('oops')).toEqual({ name: 'NonError', message: 'oops' })
  })
})
