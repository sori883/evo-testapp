import { describe, expect, it } from 'vitest'
import {
  TITLE_MAX_LENGTH,
  type Todo,
  applyUpdate,
  newTodo,
  parseCreateInput,
  parseUpdateInput,
} from '../../src/domain/todo.js'
import { ValidationError } from '../../src/lib/errors.js'

const NOW = '2026-06-22T00:00:00.000Z'

describe('parseCreateInput', () => {
  it('title をトリムして completed の既定を false にする', () => {
    expect(parseCreateInput({ title: '  買い物  ' })).toEqual({
      title: '買い物',
      completed: false,
    })
  })

  it('completed を尊重する', () => {
    expect(parseCreateInput({ title: 'x', completed: true })).toEqual({
      title: 'x',
      completed: true,
    })
  })

  it.each([
    ['オブジェクトでない', 'not-an-object'],
    ['配列', ['a']],
    ['null', null],
  ])('%s は ValidationError', (_label, body) => {
    expect(() => parseCreateInput(body)).toThrow(ValidationError)
  })

  it('title が空白のみなら ValidationError', () => {
    expect(() => parseCreateInput({ title: '   ' })).toThrow(ValidationError)
  })

  it('title が文字列でないなら ValidationError', () => {
    expect(() => parseCreateInput({ title: 123 })).toThrow(ValidationError)
  })

  it('title が最大長超過なら ValidationError', () => {
    const tooLong = 'a'.repeat(TITLE_MAX_LENGTH + 1)
    expect(() => parseCreateInput({ title: tooLong })).toThrow(ValidationError)
  })

  it('completed が真偽値でないなら ValidationError', () => {
    expect(() => parseCreateInput({ title: 'x', completed: 'yes' })).toThrow(ValidationError)
  })
})

describe('parseUpdateInput', () => {
  it('title のみの部分更新を受け付ける', () => {
    expect(parseUpdateInput({ title: 'new' })).toEqual({ title: 'new' })
  })

  it('completed のみの部分更新を受け付ける', () => {
    expect(parseUpdateInput({ completed: true })).toEqual({ completed: true })
  })

  it('更新項目が無ければ ValidationError', () => {
    expect(() => parseUpdateInput({})).toThrow(ValidationError)
  })
})

describe('newTodo / applyUpdate', () => {
  it('newTodo は createdAt と updatedAt を now にする', () => {
    const todo = newTodo('id-1', { title: 'x', completed: false }, NOW)
    expect(todo).toEqual({
      id: 'id-1',
      title: 'x',
      completed: false,
      createdAt: NOW,
      updatedAt: NOW,
    })
  })

  it('applyUpdate は非破壊で updatedAt のみ進める', () => {
    const original: Todo = {
      id: 'id-1',
      title: 'old',
      completed: false,
      createdAt: NOW,
      updatedAt: NOW,
    }
    const later = '2026-06-23T00:00:00.000Z'
    const updated = applyUpdate(original, { completed: true }, later)

    expect(updated).toEqual({
      id: 'id-1',
      title: 'old',
      completed: true,
      createdAt: NOW,
      updatedAt: later,
    })
    // 非破壊であること
    expect(original.completed).toBe(false)
    expect(original.updatedAt).toBe(NOW)
  })
})
