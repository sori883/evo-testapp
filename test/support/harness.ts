import type { APIGatewayProxyEventV2 } from 'aws-lambda'
import type { Todo } from '../../src/domain/todo.js'
import type { OperationDeps } from '../../src/handlers/todo.js'
import type { FaultConfig } from '../../src/lib/faults.js'
import { type LogLevel, type Logger, createLogger } from '../../src/lib/logger.js'
import type { TodoRepository } from '../../src/lib/repository.js'

/** テスト用のインメモリ TodoRepository。 */
export class InMemoryTodoRepository implements TodoRepository {
  private readonly store = new Map<string, Todo>()

  async put(todo: Todo): Promise<void> {
    this.store.set(todo.id, { ...todo })
  }

  async get(id: string): Promise<Todo | null> {
    const found = this.store.get(id)
    return found ? { ...found } : null
  }

  async list(limit: number): Promise<Todo[]> {
    return [...this.store.values()].slice(0, limit)
  }

  async remove(id: string): Promise<Todo | null> {
    const found = this.store.get(id) ?? null
    if (found) {
      this.store.delete(id)
    }
    return found
  }

  /** テスト用: 直接投入する。 */
  seed(todo: Todo): void {
    this.store.set(todo.id, { ...todo })
  }
}

export const NO_FAULTS: FaultConfig = {
  nullDeref: false,
  latencyMs: 0,
  errorRate: 0,
  dynamoFail: false,
}

export interface CapturingLogger {
  logger: Logger
  lines: Array<{ level: LogLevel; record: Record<string, unknown> }>
}

/** 出力を捕捉するロガー（console を汚さない）。 */
export function createCapturingLogger(): CapturingLogger {
  const lines: CapturingLogger['lines'] = []
  const logger = createLogger({
    level: 'debug',
    clock: () => new Date('2026-06-22T00:00:00.000Z'),
    sink: (level, line) => lines.push({ level, record: JSON.parse(line) }),
  })
  return { logger, lines }
}

export interface MakeDepsOptions {
  repo?: TodoRepository
  faults?: Partial<FaultConfig>
  logger?: Logger
}

/** 決定論的な newId / now を持つ OperationDeps を組み立てる。 */
export function makeDeps(options: MakeDepsOptions = {}): OperationDeps {
  let counter = 0
  return {
    repo: options.repo ?? new InMemoryTodoRepository(),
    logger: options.logger ?? createCapturingLogger().logger,
    faults: { ...NO_FAULTS, ...options.faults },
    newId: () => `id-${++counter}`,
    now: () => '2026-06-22T00:00:00.000Z',
  }
}

export interface BuildEventOptions {
  routeKey?: string
  method?: string
  rawPath?: string
  body?: unknown
  pathParameters?: Record<string, string>
  query?: Record<string, string>
  isBase64Encoded?: boolean
}

/** APIGatewayProxyEventV2 の最小モックを作る。 */
export function buildEvent(options: BuildEventOptions = {}): APIGatewayProxyEventV2 {
  const method = options.method ?? options.routeKey?.split(' ')[0] ?? 'GET'
  const rawPath = options.rawPath ?? options.routeKey?.split(' ')[1] ?? '/'
  const body =
    options.body === undefined
      ? undefined
      : typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body)

  return {
    version: '2.0',
    routeKey: options.routeKey ?? `${method} ${rawPath}`,
    rawPath,
    rawQueryString: '',
    headers: {},
    queryStringParameters: options.query,
    pathParameters: options.pathParameters,
    isBase64Encoded: options.isBase64Encoded ?? false,
    body,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.ap-northeast-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method,
        path: rawPath,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'test-request-id',
      routeKey: options.routeKey ?? `${method} ${rawPath}`,
      stage: '$default',
      time: '22/Jun/2026:00:00:00 +0000',
      timeEpoch: 1_781_000_000_000,
    },
  } as APIGatewayProxyEventV2
}
