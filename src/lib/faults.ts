/**
 * フォルトインジェクション（意図的な「直せるバグ面」）。
 *
 * 設計意図:
 * - 平常時はすべて OFF（環境変数未設定）。本番挙動に影響しない。
 * - ON にすると「エラー増 → CloudWatch アラーム発報 → evo が診断 → 修正 PR」の一連を再現できる。
 * - バグを *この 1 ファイル* に局在させ、テストで挙動を固定する。evo の修正対象が特定しやすい。
 *
 * 環境変数:
 * - FAULT_NULL_DEREF=true   … 変更系 operation で意図的な null 参照（TypeError）を発生させる。
 * - FAULT_LATENCY_MS=<ms>   … 各リクエストにレイテンシを注入する（API GW Latency p99 アラーム検証）。
 * - FAULT_ERROR_RATE=<0..1> … 確率的に InjectedFaultError を投げる（Lambda Errors アラーム検証）。
 * - FAULT_DYNAMO_FAIL=true  … DynamoDB アクセスを擬似的に失敗させる（データ層障害の再現）。
 */

import type { Env } from './config.js'

export interface FaultConfig {
  nullDeref: boolean
  latencyMs: number
  errorRate: number
  dynamoFail: boolean
}

/** 注入された「想定外」エラー。AppError ではないため 5xx になりアラームを発報させる。 */
export class InjectedFaultError extends Error {
  readonly operation: string

  constructor(operation: string, detail: string) {
    super(`injected fault in ${operation}: ${detail}`)
    this.name = 'InjectedFaultError'
    this.operation = operation
  }
}

function parseBool(value: string | undefined): boolean {
  return value === 'true' || value === '1'
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') {
    return fallback
  }
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function loadFaultConfig(env: Env = process.env): FaultConfig {
  return {
    nullDeref: parseBool(env.FAULT_NULL_DEREF),
    latencyMs: Math.max(0, parseNumber(env.FAULT_LATENCY_MS, 0)),
    errorRate: clamp(parseNumber(env.FAULT_ERROR_RATE, 0), 0, 1),
    dynamoFail: parseBool(env.FAULT_DYNAMO_FAIL),
  }
}

/** いずれかのフォルトが有効か（起動ログ用）。 */
export function anyFaultEnabled(faults: FaultConfig): boolean {
  return faults.nullDeref || faults.latencyMs > 0 || faults.errorRate > 0 || faults.dynamoFail
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** FAULT_LATENCY_MS が有効なら待機する。 */
export async function maybeInjectLatency(
  faults: FaultConfig,
  sleep: (ms: number) => Promise<void> = realSleep,
): Promise<void> {
  if (faults.latencyMs > 0) {
    await sleep(faults.latencyMs)
  }
}

/**
 * FAULT_NULL_DEREF が有効なら、意図的な null 参照で TypeError を発生させる。
 * 実際に null を参照することで「Cannot read properties of null」という本物のスタックを残す。
 */
export function maybeThrowNullDeref(faults: FaultConfig): void {
  if (!faults.nullDeref) {
    return
  }
  const broken = null as unknown as { value: string }
  // ↓ この行で TypeError がスローされる（evo の修正対象となる局在バグ）。
  broken.value.toLowerCase()
}

/** FAULT_ERROR_RATE が有効なら、確率的に InjectedFaultError を投げる。 */
export function maybeThrowRandomError(
  faults: FaultConfig,
  operation: string,
  rng: () => number = Math.random,
): void {
  if (faults.errorRate <= 0) {
    return
  }
  if (rng() < faults.errorRate) {
    throw new InjectedFaultError(operation, `random error (rate=${faults.errorRate})`)
  }
}

/** FAULT_DYNAMO_FAIL が有効なら、データ層アクセス前に擬似障害を投げる。 */
export function assertDataLayerHealthy(faults: FaultConfig, operation: string): void {
  if (faults.dynamoFail) {
    throw new InjectedFaultError(operation, 'simulated DynamoDB backend failure')
  }
}
