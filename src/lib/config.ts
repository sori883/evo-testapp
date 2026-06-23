import type { LogLevel } from './logger.js'

/** アプリ全体の実行時設定。Lambda 環境変数から読む（CDK が注入）。 */
export interface AppConfig {
  serviceName: string
  stage: string
  tableName: string
  logLevel: LogLevel
  awsRegion: string
}

const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error']

function parseLogLevel(value: string | undefined): LogLevel {
  if (value && (LOG_LEVELS as readonly string[]).includes(value)) {
    return value as LogLevel
  }
  return 'info'
}

export type Env = Record<string, string | undefined>

export function loadConfig(env: Env = process.env): AppConfig {
  const tableName = env.TABLE_NAME
  if (!tableName) {
    throw new Error('TABLE_NAME 環境変数が未設定です（CDK が注入するはず）')
  }
  return {
    serviceName: env.SERVICE_NAME ?? 'evo-testapp',
    stage: env.STAGE ?? 'dev',
    tableName,
    logLevel: parseLogLevel(env.LOG_LEVEL),
    awsRegion: env.AWS_REGION ?? 'ap-northeast-1',
  }
}
