import { randomUUID } from 'node:crypto'
import { createApiHandler } from './app.js'
import type { OperationDeps } from './handlers/todo.js'
import { loadConfig } from './lib/config.js'
import { createDynamoRepository } from './lib/dynamo-repository.js'
import { anyFaultEnabled, loadFaultConfig } from './lib/faults.js'
import { createLogger } from './lib/logger.js'

/**
 * Lambda エントリポイント（コールドスタート時に 1 度だけ依存を組み立てる）。
 * 実行時設定・フォルト設定・DynamoDB クライアントを env から構築する。
 */
const config = loadConfig()
const faults = loadFaultConfig()

const logger = createLogger({
  level: config.logLevel,
  base: { service: config.serviceName, stage: config.stage },
})

if (anyFaultEnabled(faults)) {
  // 平常時は出ない。フォルト注入が有効なことを起動時に明示し、原因調査の手がかりにする。
  logger.warn('fault injection enabled', { faults })
}

const deps: OperationDeps = {
  repo: createDynamoRepository(config.tableName, faults, config.awsRegion),
  logger,
  faults,
  newId: () => randomUUID(),
  now: () => new Date().toISOString(),
}

export const handler = createApiHandler(deps)
