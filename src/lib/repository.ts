import type { Todo } from '../domain/todo.js'

/**
 * ToDo 永続化の抽象。operation 層はこのインターフェースにのみ依存する。
 * → 本番は DynamoDB 実装（dynamo-repository.ts）、テストはインメモリ実装を注入できる。
 */
export interface TodoRepository {
  put(todo: Todo): Promise<void>
  get(id: string): Promise<Todo | null>
  list(limit: number): Promise<Todo[]>
  /** 削除した Todo を返す。存在しなければ null。 */
  remove(id: string): Promise<Todo | null>
}
