/**
 * zero-dependency の最小構造化ロガー。
 *
 * - CloudWatch Logs に「JSON 1行」を出力する（evo が原因特定に使う前提）。
 * - Error はネストしていても自動で {name, message, stack} に展開する。
 *   → エラー時に「例外メッセージ + スタックトレース + 発生箇所」が必ずログに残る。
 * - pino 等の代替として最小実装にしている理由は README「ロギング」を参照（Lambda バンドルの確実性）。
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

export type LogFields = Record<string, unknown>

export interface Logger {
  debug(msg: string, fields?: LogFields): void
  info(msg: string, fields?: LogFields): void
  warn(msg: string, fields?: LogFields): void
  error(msg: string, fields?: LogFields): void
  /** 固定フィールド（requestId / route 等）を束ねた子ロガーを返す。 */
  child(bindings: LogFields): Logger
}

export interface SerializedError {
  name: string
  message: string
  stack?: string
}

/** unknown を安全に {name, message, stack} へ変換する。 */
export function serializeError(err: unknown): SerializedError {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack }
  }
  return { name: 'NonError', message: typeof err === 'string' ? err : JSON.stringify(err) }
}

/** JSON.stringify の replacer。Error と BigInt をログ安全な形へ変換する。 */
function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return serializeError(value)
  }
  if (typeof value === 'bigint') {
    return value.toString()
  }
  return value
}

export interface LoggerOptions {
  level?: LogLevel
  base?: LogFields
  /** テスト用の時刻注入。既定は実時刻。 */
  clock?: () => Date
  /** テスト用の出力差し替え。既定は console。 */
  sink?: (level: LogLevel, line: string) => void
}

const defaultSink = (level: LogLevel, line: string): void => {
  if (level === 'error') {
    console.error(line)
  } else {
    console.log(line)
  }
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  const level = opts.level ?? 'info'
  const base = opts.base ?? {}
  const clock = opts.clock ?? (() => new Date())
  const sink = opts.sink ?? defaultSink
  const threshold = LEVEL_WEIGHT[level]

  const emit = (logLevel: LogLevel, msg: string, fields?: LogFields): void => {
    if (LEVEL_WEIGHT[logLevel] < threshold) {
      return
    }
    const record = {
      time: clock().toISOString(),
      level: logLevel,
      msg,
      ...base,
      ...fields,
    }
    sink(logLevel, JSON.stringify(record, replacer))
  }

  return {
    debug: (msg, fields) => emit('debug', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
    child: (bindings) => createLogger({ level, base: { ...base, ...bindings }, clock, sink }),
  }
}
