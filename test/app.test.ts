import { describe, expect, it } from 'vitest'
import { createApiHandler } from '../src/app.js'
import { buildEvent, createCapturingLogger, makeDeps } from './support/harness.js'

function body(res: { body?: string }): Record<string, unknown> {
  return JSON.parse(res.body ?? '{}')
}

describe('createApiHandler ルーティング', () => {
  it('POST /todos は 201', async () => {
    const handler = createApiHandler(makeDeps())
    const res = await handler(buildEvent({ routeKey: 'POST /todos', body: { title: 'x' } }))
    expect(res.statusCode).toBe(201)
  })

  it('未知のルートは 404 レスポンス', async () => {
    const handler = createApiHandler(makeDeps())
    const res = await handler(buildEvent({ routeKey: 'GET /unknown' }))
    expect(res.statusCode).toBe(404)
  })

  it('ValidationError は 400 に変換し rethrow しない', async () => {
    const handler = createApiHandler(makeDeps())
    const res = await handler(buildEvent({ routeKey: 'POST /todos', body: { title: '' } }))
    expect(res.statusCode).toBe(400)
    expect(body(res).code).toBe('VALIDATION_ERROR')
  })

  it('NotFoundError は 404 に変換する', async () => {
    const handler = createApiHandler(makeDeps())
    const res = await handler(
      buildEvent({ routeKey: 'GET /todos/{id}', pathParameters: { id: 'missing' } }),
    )
    expect(res.statusCode).toBe(404)
    expect(body(res).code).toBe('NOT_FOUND')
  })

  it('想定外例外は rethrow し、stack 付きの error ログを残す（Lambda Errors を発報させる）', async () => {
    const { logger, lines } = createCapturingLogger()
    const handler = createApiHandler(makeDeps({ faults: { nullDeref: true }, logger }))

    await expect(
      handler(buildEvent({ routeKey: 'POST /todos', body: { title: 'x' } })),
    ).rejects.toThrow(TypeError)

    const errorLog = lines.find((l) => l.level === 'error')
    expect(errorLog).toBeDefined()
    const err = errorLog?.record.err as { name?: string; stack?: string } | undefined
    expect(err?.name).toBe('TypeError')
    expect(err?.stack).toBeTruthy()
    expect(errorLog?.record.routeKey).toBe('POST /todos')
  })

  it('成功時に statusCode と durationMs を info ログに残す', async () => {
    const { logger, lines } = createCapturingLogger()
    const handler = createApiHandler(makeDeps({ logger }))
    await handler(buildEvent({ routeKey: 'POST /todos', body: { title: 'x' } }))

    const completed = lines.find((l) => l.record.msg === 'request completed')
    expect(completed?.record).toMatchObject({ statusCode: 201 })
    expect(completed?.record.durationMs).toBeTypeOf('number')
  })
})
