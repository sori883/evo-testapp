/**
 * ドメイン/アプリ層のエラー型。
 * HTTP ステータスへのマッピングを内包し、handler 層で一貫したレスポンスへ変換する。
 * これらは「想定内」のエラー（4xx）。想定外の例外（バグ・フォルト注入）はそのまま throw され 5xx になる。
 */

export type ErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'INTERNAL_ERROR'

export class AppError extends Error {
  readonly statusCode: number
  readonly code: ErrorCode
  /** クライアントに返して安全な追加情報（バリデーション詳細など）。 */
  readonly details?: unknown

  constructor(message: string, statusCode: number, code: ErrorCode, details?: unknown) {
    super(message)
    this.name = new.target.name
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details)
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'resource not found') {
    super(message, 404, 'NOT_FOUND')
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError
}
