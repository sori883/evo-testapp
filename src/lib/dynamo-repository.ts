import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb'
import type { Todo } from '../domain/todo.js'
import { type FaultConfig, assertDataLayerHealthy } from './faults.js'
import type { TodoRepository } from './repository.js'

/**
 * DynamoDB 版 TodoRepository。
 * テーブルは単一キー（PK: id）。サンプル規模のため list は Scan を使う。
 * 各メソッド冒頭で FAULT_DYNAMO_FAIL を評価し、有効時はデータ層障害を擬似再現する。
 */
export class DynamoTodoRepository implements TodoRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly faults: FaultConfig,
  ) {}

  async put(todo: Todo): Promise<void> {
    assertDataLayerHealthy(this.faults, 'repository.put')
    await this.doc.send(new PutCommand({ TableName: this.tableName, Item: todo }))
  }

  async get(id: string): Promise<Todo | null> {
    assertDataLayerHealthy(this.faults, 'repository.get')
    const result = await this.doc.send(new GetCommand({ TableName: this.tableName, Key: { id } }))
    return (result.Item as Todo | undefined) ?? null
  }

  async list(limit: number): Promise<Todo[]> {
    assertDataLayerHealthy(this.faults, 'repository.list')
    const result = await this.doc.send(new ScanCommand({ TableName: this.tableName, Limit: limit }))
    return (result.Items as Todo[] | undefined) ?? []
  }

  async remove(id: string): Promise<Todo | null> {
    assertDataLayerHealthy(this.faults, 'repository.remove')
    const result = await this.doc.send(
      new DeleteCommand({ TableName: this.tableName, Key: { id }, ReturnValues: 'ALL_OLD' }),
    )
    return (result.Attributes as Todo | undefined) ?? null
  }
}

export function createDynamoRepository(
  tableName: string,
  faults: FaultConfig,
  region?: string,
): DynamoTodoRepository {
  const client = new DynamoDBClient(region ? { region } : {})
  const doc = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  })
  return new DynamoTodoRepository(doc, tableName, faults)
}
