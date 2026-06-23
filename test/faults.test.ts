import { describe, expect, it, vi } from 'vitest'
import {
  InjectedFaultError,
  anyFaultEnabled,
  assertDataLayerHealthy,
  loadFaultConfig,
  maybeInjectLatency,
  maybeThrowNullDeref,
  maybeThrowRandomError,
} from '../src/lib/faults.js'
import { NO_FAULTS } from './support/harness.js'

describe('loadFaultConfig', () => {
  it('未設定なら全 OFF', () => {
    expect(loadFaultConfig({})).toEqual(NO_FAULTS)
  })

  it('環境変数を解釈する', () => {
    expect(
      loadFaultConfig({
        FAULT_NULL_DEREF: 'true',
        FAULT_LATENCY_MS: '250',
        FAULT_ERROR_RATE: '0.5',
        FAULT_DYNAMO_FAIL: '1',
      }),
    ).toEqual({ nullDeref: true, latencyMs: 250, errorRate: 0.5, dynamoFail: true })
  })

  it('errorRate は 0..1 にクランプ、不正な数値は既定', () => {
    expect(loadFaultConfig({ FAULT_ERROR_RATE: '5' }).errorRate).toBe(1)
    expect(loadFaultConfig({ FAULT_ERROR_RATE: '-1' }).errorRate).toBe(0)
    expect(loadFaultConfig({ FAULT_LATENCY_MS: 'abc' }).latencyMs).toBe(0)
  })
})

describe('anyFaultEnabled', () => {
  it('全 OFF は false', () => {
    expect(anyFaultEnabled(NO_FAULTS)).toBe(false)
  })
  it('ひとつでも ON なら true', () => {
    expect(anyFaultEnabled({ ...NO_FAULTS, latencyMs: 100 })).toBe(true)
  })
})

describe('maybeThrowNullDeref', () => {
  it('OFF では何もしない', () => {
    expect(() => maybeThrowNullDeref(NO_FAULTS)).not.toThrow()
  })

  it('ON では本物の TypeError（null 参照）を投げる', () => {
    expect(() => maybeThrowNullDeref({ ...NO_FAULTS, nullDeref: true })).toThrow(TypeError)
  })
})

describe('maybeThrowRandomError', () => {
  it('errorRate=0 では投げない', () => {
    expect(() => maybeThrowRandomError(NO_FAULTS, 'op')).not.toThrow()
  })

  it('rng が rate 未満なら InjectedFaultError', () => {
    expect(() => maybeThrowRandomError({ ...NO_FAULTS, errorRate: 0.5 }, 'op', () => 0.1)).toThrow(
      InjectedFaultError,
    )
  })

  it('rng が rate 以上なら投げない', () => {
    expect(() =>
      maybeThrowRandomError({ ...NO_FAULTS, errorRate: 0.5 }, 'op', () => 0.9),
    ).not.toThrow()
  })
})

describe('assertDataLayerHealthy', () => {
  it('OFF では何もしない', () => {
    expect(() => assertDataLayerHealthy(NO_FAULTS, 'op')).not.toThrow()
  })
  it('ON では InjectedFaultError', () => {
    expect(() => assertDataLayerHealthy({ ...NO_FAULTS, dynamoFail: true }, 'op')).toThrow(
      InjectedFaultError,
    )
  })
})

describe('maybeInjectLatency', () => {
  it('latencyMs=0 では sleep しない', async () => {
    const sleep = vi.fn(async () => {})
    await maybeInjectLatency(NO_FAULTS, sleep)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('latencyMs>0 では指定値で sleep する', async () => {
    const sleep = vi.fn(async () => {})
    await maybeInjectLatency({ ...NO_FAULTS, latencyMs: 300 }, sleep)
    expect(sleep).toHaveBeenCalledWith(300)
  })
})
