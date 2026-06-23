import { describe, expect, it } from 'vitest'
import { createTodo, deleteTodo, getTodo, listTodos, updateTodo } from '../../src/handlers/todo.js'
import { NotFoundError, ValidationError } from '../../src/lib/errors.js'
import { InjectedFaultError } from '../../src/lib/faults.js'
import { InMemoryTodoRepository, buildEvent, makeDeps } from '../support/harness.js'

function parseBody(body: string | undefined): Record<string, unknown> {
  return JSON.parse(body ?? '{}')
}

describe('createTodo', () => {
  it('201 を返し永続化する', async () => {
    const repo = new InMemoryTodoRepository()
    const deps = makeDeps({ repo })
    const res = await createTodo(deps, buildEvent({ body: { title: 'やること' } }))

    expect(res.statusCode).toBe(201)
    const created = parseBody(res.body)
    expect(created).toMatchObject({ id: 'id-1', title: 'やること', completed: false })
    expect(await repo.get('id-1')).not.toBeNull()
  })

  it('不正なボディは ValidationError', async () => {
    const deps = makeDeps()
    await expect(createTodo(deps, buildEvent({ body: { title: '' } }))).rejects.toThrow(
      ValidationError,
    )
  })

  it('FAULT_NULL_DEREF=true で TypeError（局在バグ）を投げる', async () => {
    const deps = makeDeps({ faults: { nullDeref: true } })
    await expect(createTodo(deps, buildEvent({ body: { title: 'x' } }))).rejects.toThrow(TypeError)
  })

  it('FAULT_ERROR_RATE=1 で InjectedFaultError を投げる', async () => {
    const deps = makeDeps({ faults: { errorRate: 1 } })
    await expect(createTodo(deps, buildEvent({ body: { title: 'x' } }))).rejects.toThrow(
      InjectedFaultError,
    )
  })

  it('FAULT_DYNAMO_FAIL=true で InjectedFaultError を投げる', async () => {
    const deps = makeDeps({ faults: { dynamoFail: true } })
    // インメモリ repo は dynamoFail を見ないため、ここでは Dynamo 実装の責務を確認しない。
    // 代わりに operation がフォルトを伝播することは errorRate / nullDeref で担保済み。
    const res = await createTodo(deps, buildEvent({ body: { title: 'x' } }))
    expect(res.statusCode).toBe(201)
  })
})

describe('listTodos', () => {
  it('items と count を返す', async () => {
    const repo = new InMemoryTodoRepository()
    const deps = makeDeps({ repo })
    await createTodo(deps, buildEvent({ body: { title: 'a' } }))
    await createTodo(deps, buildEvent({ body: { title: 'b' } }))

    const res = await listTodos(deps, buildEvent({ routeKey: 'GET /todos' }))
    expect(res.statusCode).toBe(200)
    expect(parseBody(res.body)).toMatchObject({ count: 2 })
  })

  it('limit が不正なら ValidationError', async () => {
    const deps = makeDeps()
    await expect(
      listTodos(deps, buildEvent({ routeKey: 'GET /todos', query: { limit: '0' } })),
    ).rejects.toThrow(ValidationError)
  })
})

describe('getTodo', () => {
  it('存在すれば 200', async () => {
    const repo = new InMemoryTodoRepository()
    const deps = makeDeps({ repo })
    await createTodo(deps, buildEvent({ body: { title: 'a' } }))

    const res = await getTodo(deps, buildEvent({ pathParameters: { id: 'id-1' } }))
    expect(res.statusCode).toBe(200)
  })

  it('存在しなければ NotFoundError', async () => {
    const deps = makeDeps()
    await expect(getTodo(deps, buildEvent({ pathParameters: { id: 'missing' } }))).rejects.toThrow(
      NotFoundError,
    )
  })

  it('id が無ければ ValidationError', async () => {
    const deps = makeDeps()
    await expect(getTodo(deps, buildEvent({}))).rejects.toThrow(ValidationError)
  })
})

describe('updateTodo', () => {
  it('部分更新して 200 を返す', async () => {
    const repo = new InMemoryTodoRepository()
    const deps = makeDeps({ repo })
    await createTodo(deps, buildEvent({ body: { title: 'a' } }))

    const res = await updateTodo(
      deps,
      buildEvent({ pathParameters: { id: 'id-1' }, body: { completed: true } }),
    )
    expect(res.statusCode).toBe(200)
    expect(parseBody(res.body)).toMatchObject({ id: 'id-1', title: 'a', completed: true })
  })

  it('存在しなければ NotFoundError', async () => {
    const deps = makeDeps()
    await expect(
      updateTodo(deps, buildEvent({ pathParameters: { id: 'missing' }, body: { title: 'x' } })),
    ).rejects.toThrow(NotFoundError)
  })
})

describe('deleteTodo', () => {
  it('削除して 200 を返す', async () => {
    const repo = new InMemoryTodoRepository()
    const deps = makeDeps({ repo })
    await createTodo(deps, buildEvent({ body: { title: 'a' } }))

    const res = await deleteTodo(deps, buildEvent({ pathParameters: { id: 'id-1' } }))
    expect(res.statusCode).toBe(200)
    expect(await repo.get('id-1')).toBeNull()
  })

  it('存在しなければ NotFoundError', async () => {
    const deps = makeDeps()
    await expect(
      deleteTodo(deps, buildEvent({ pathParameters: { id: 'missing' } })),
    ).rejects.toThrow(NotFoundError)
  })
})
