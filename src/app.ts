import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from 'aws-lambda'
import {
  type OperationDeps,
  createTodo,
  deleteTodo,
  getTodo,
  listTodos,
  updateTodo,
} from './handlers/todo.js'
import { isAppError } from './lib/errors.js'
import { jsonResponse } from './lib/http.js'

/**
 * routeKey（"POST /todos" 等）→ operation のルーティング表。
 * API Gateway HTTP API のルート定義（CDK）と一致させること。
 */
type RouteHandler = (
  deps: OperationDeps,
  event: APIGatewayProxyEventV2,
) => Promise<APIGatewayProxyStructuredResultV2>

const ROUTES: Record<string, RouteHandler> = {
  'POST /todos': createTodo,
  'GET /todos': listTodos,
  'GET /todos/{id}': getTodo,
  'PUT /todos/{id}': updateTodo,
  'DELETE /todos/{id}': deleteTodo,
}

/**
 * 依存を束ねて Lambda ハンドラ関数を生成する（副作用なし＝テスト可能）。
 * リクエストごとに requestId / routeKey を束ねた子ロガーで観測ログを出す。
 */
export function createApiHandler(deps: OperationDeps) {
  return async (
    event: APIGatewayProxyEventV2,
    context?: Context,
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    const requestId = event.requestContext?.requestId ?? context?.awsRequestId ?? 'local'
    const routeKey =
      event.routeKey ?? `${event.requestContext?.http?.method ?? 'GET'} ${event.rawPath ?? '/'}`
    const log = deps.logger.child({ requestId, routeKey })
    const requestDeps: OperationDeps = { ...deps, logger: log }
    const startedAt = Date.now()

    try {
      const handler = ROUTES[routeKey]
      if (!handler) {
        log.warn('route not found', { durationMs: Date.now() - startedAt })
        return jsonResponse(404, { code: 'NOT_FOUND', message: `route ${routeKey} not found` })
      }
      const response = await handler(requestDeps, event)
      log.info('request completed', {
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
      })
      return response
    } catch (err) {
      const durationMs = Date.now() - startedAt

      // 想定内（4xx）: クライアント起因。アラームを発報させない。スタックも出さない。
      if (isAppError(err)) {
        log.warn('request failed (client error)', {
          statusCode: err.statusCode,
          code: err.code,
          errorMessage: err.message,
          durationMs,
        })
        return jsonResponse(err.statusCode, {
          code: err.code,
          message: err.message,
          ...(err.details === undefined ? {} : { details: err.details }),
        })
      }

      // 想定外（5xx / バグ / フォルト注入）: 例外メッセージ + スタック + operation をログに残す。
      // その後 rethrow して Lambda Errors メトリクスを増やし、アラームを発報させる（evo の incident トリガ）。
      const error = err instanceof Error ? err : new Error(String(err))
      log.error('request failed (unhandled exception)', { routeKey, durationMs, err: error })
      throw error
    }
  }
}
