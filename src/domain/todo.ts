/**
 * ToDo ドメイン（純粋関数のみ。AWS / I/O に非依存でユニットテストしやすい）。
 * バリデーション失敗は ValidationError(400) を投げる。
 */

import { ValidationError } from '../lib/errors.js'

export interface Todo {
  id: string
  title: string
  completed: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateTodoInput {
  title: string
  completed: boolean
}

export interface UpdateTodoInput {
  title?: string
  completed?: boolean
}

export const TITLE_MAX_LENGTH = 200

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('リクエストボディは JSON オブジェクトである必要があります')
  }
  return body as Record<string, unknown>
}

function validateTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError('title は文字列である必要があります', { field: 'title' })
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new ValidationError('title は空にできません', { field: 'title' })
  }
  if (trimmed.length > TITLE_MAX_LENGTH) {
    throw new ValidationError(`title は ${TITLE_MAX_LENGTH} 文字以内である必要があります`, {
      field: 'title',
      max: TITLE_MAX_LENGTH,
    })
  }
  return trimmed
}

function validateCompleted(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new ValidationError('completed は真偽値である必要があります', { field: 'completed' })
  }
  return value
}

/** POST /todos のボディを検証して入力へ変換する。 */
export function parseCreateInput(body: unknown): CreateTodoInput {
  const record = asObject(body)
  return {
    title: validateTitle(record.title),
    completed: record.completed === undefined ? false : validateCompleted(record.completed),
  }
}

/** PUT /todos/{id} のボディを検証して入力へ変換する（部分更新）。 */
export function parseUpdateInput(body: unknown): UpdateTodoInput {
  const record = asObject(body)
  const input: UpdateTodoInput = {}
  if (record.title !== undefined) {
    input.title = validateTitle(record.title)
  }
  if (record.completed !== undefined) {
    input.completed = validateCompleted(record.completed)
  }
  if (input.title === undefined && input.completed === undefined) {
    throw new ValidationError('更新する項目（title / completed）が指定されていません')
  }
  return input
}

/** 新しい Todo エンティティを生成する。id / now は呼び出し側が注入する（純粋性のため）。 */
export function newTodo(id: string, input: CreateTodoInput, now: string): Todo {
  return {
    id,
    title: input.title,
    completed: input.completed,
    createdAt: now,
    updatedAt: now,
  }
}

/** 既存 Todo に部分更新を適用した新しいエンティティを返す（非破壊）。 */
export function applyUpdate(todo: Todo, input: UpdateTodoInput, now: string): Todo {
  return {
    ...todo,
    title: input.title ?? todo.title,
    completed: input.completed ?? todo.completed,
    updatedAt: now,
  }
}
