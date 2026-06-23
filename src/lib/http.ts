import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { ValidationError } from './errors.js'

export function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  }
}

/** リクエストボディを JSON として解析する。空なら {}、不正な JSON は ValidationError(400)。 */
export function parseJsonBody(event: APIGatewayProxyEventV2): unknown {
  const raw = event.body
  if (raw === undefined || raw === null || raw === '') {
    return {}
  }
  const text = event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf-8') : raw
  try {
    return JSON.parse(text)
  } catch {
    throw new ValidationError('リクエストボディが不正な JSON です')
  }
}

/** パスパラメータ {id} を取り出す。 */
export function pathParam(event: APIGatewayProxyEventV2, name: string): string | undefined {
  return event.pathParameters?.[name]
}
