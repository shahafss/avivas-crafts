import { afterEach, describe, expect, it, vi } from 'vitest';
import { log } from '@/server/security/logger';

function capture(fn: () => void): Record<string, unknown>[] {
  const lines: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return lines
    .flatMap((line) => line.split('\n').filter(Boolean))
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

afterEach(() => vi.restoreAllMocks());

describe('logger', () => {
  it('writes one JSON line with level, event and allow-listed fields', () => {
    const [entry] = capture(() => {
      log.info('order.created', { orderNumber: 1001, durationMs: 12, route: '/x' });
    });
    expect(entry).toMatchObject({
      level: 'info',
      event: 'order.created',
      orderNumber: 1001,
      durationMs: 12,
    });
    expect(typeof entry?.time).toBe('string');
  });

  it('drops personal-data keys', () => {
    const [entry] = capture(() => {
      log.error('boom', {
        email: 'a@b.test',
        phone: '+972500000000',
        token: 'secret-token',
        ip: '203.0.113.7',
        name: 'Dana',
        address: 'Street 1',
        errorCode: 'E1',
      } as never);
    });
    const raw = JSON.stringify(entry);
    for (const forbidden of [
      'a@b.test',
      '+972500000000',
      'secret-token',
      '203.0.113.7',
      'Dana',
      'Street 1',
    ]) {
      expect(raw).not.toContain(forbidden);
    }
    for (const key of ['email', 'phone', 'token', 'ip', 'name', 'address']) {
      expect(entry).not.toHaveProperty(key);
    }
    expect(entry).toMatchObject({ errorCode: 'E1' });
  });

  it('cannot overwrite level or event through fields', () => {
    const [entry] = capture(() => {
      log.warn('real', { level: 'x', event: 'fake' } as never);
    });
    expect(entry).toMatchObject({ level: 'warn', event: 'real' });
  });
});
