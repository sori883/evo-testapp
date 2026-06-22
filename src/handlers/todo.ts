import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { applyUpdate, newTodo, parseCreateInput, parseUpdateInput } from '../domain/todo.js'
import { NotFoundError, ValidationError } from '../lib/errors.js'
import {
  type FaultConfig,
  maybeInjectLatency,
  maybeThrowNullDeref,
  maybeThrowRandomError,
} from '../lib/faults.js'
import { jsonResponse, parseJsonBody, pathParam } from '../lib/http.js'
import type { Logger } from '../lib/logger.js'
import type { TodoRepository } from '../lib/repository.js'

/** operation が必要とする依存。handler 層が組み立て、テストは差し替える。 */
export interface OperationDeps {
  repo: TodoRepository
  logger: Logger
  faults: FaultConfig
  newId: () => string
  now: () => string
}

const DEFAULT_LIST_LIMIT = 50
const MAX_LIST_LIMIT = 100

function parseLimit(raw: string | undefined): number {
  if (raw === undefined) {
    return DEFAULT_LIST_LIMIT
  }
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) {
    throw new ValidationError('limit は 1 以上の整数である必要があります', { field: 'limit' })
  }
  return Math.min(n, MAX_LIST_LIMIT)
}

function requireId(event: APIGatewayProxyEventV2): string {
  const id = pathParam(event, 'id')
  if (!id) {
    throw new ValidationError('パスパラメータ id が必要です', { field: 'id' })
  }
  return id
}

export async function createTodo(
  deps: OperationDeps,
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const operation = 'createTodo'
  maybeThrowRandomError(deps.faults, operation)
  await maybeInjectLatency(deps.faults)

  const input = parseCreateInput(parseJsonBody(event))
  maybeThrowNullDeref(deps.faults) // 変更系に局在させた意図的バグ（平常 OFF）

  const todo = newTodo(deps.newId(), input, deps.now())
  await deps.repo.put(todo)
  deps.logger.info('todo created', { operation, todoId: todo.id })
  return jsonResponse(201, todo)
}

export async function listTodos(
  deps: OperationDeps,
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const operation = 'listTodos'
  maybeThrowRandomError(deps.faults, operation)
  await maybeInjectLatency(deps.faults)

  const limit = parseLimit(event.queryStringParameters?.limit)
  const items = await deps.repo.list(limit)
  deps.logger.info('todos listed', { operation, count: items.length })
  return jsonResponse(200, { items, count: items.length })
}

export async function getTodo(
  deps: OperationDeps,
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const operation = 'getTodo'
  maybeThrowRandomError(deps.faults, operation)
  await maybeInjectLatency(deps.faults)

  const id = requireId(event)
  const todo = await deps.repo.get(id)
  if (!todo) {
    throw new NotFoundError(`todo ${id} が見つかりません`)
  }
  return jsonResponse(200, todo)
}

export async function updateTodo(
  deps: OperationDeps,
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const operation = 'updateTodo'
  maybeThrowRandomError(deps.faults, operation)
  await maybeInjectLatency(deps.faults)

  const id = requireId(event)
  const input = parseUpdateInput(parseJsonBody(event))
  maybeThrowNullDeref(deps.faults) // 変更系に局在させた意図的バグ（平常 OFF）

  const existing = await deps.repo.get(id)
  if (!existing) {
    throw new NotFoundError(`todo ${id} が見つかりません`)
  }
  const updated = applyUpdate(existing, input, deps.now())
  await deps.repo.put(updated)
  deps.logger.info('todo updated', { operation, todoId: id })
  return jsonResponse(200, updated)
}

export async function deleteTodo(
  deps: OperationDeps,
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const operation = 'deleteTodo'
  maybeThrowRandomError(deps.faults, operation)
  await maybeInjectLatency(deps.faults)

  const id = requireId(event)
  const removed = await deps.repo.remove(id)
  if (!removed) {
    throw new NotFoundError(`todo ${id} が見つかりません`)
  }
  deps.logger.info('todo deleted', { operation, todoId: id })
  return jsonResponse(200, removed)
}
