import { describe, it, expect, vi } from 'vitest';
import { TypedEmitter } from '../utils/TypedEmitter.js';

interface TestEvents {
  'item:added': { id: string; name: string };
  'item:removed': string;
  'count:changed': number;
}

describe('TypedEmitter', () => {
  it('emits and receives typed events', () => {
    const emitter = new TypedEmitter<TestEvents>();
    const listener = vi.fn();

    emitter.on('item:added', listener);
    emitter.emit('item:added', { id: '1', name: 'test' });

    expect(listener).toHaveBeenCalledWith({ id: '1', name: 'test' });
  });

  it('supports string payloads', () => {
    const emitter = new TypedEmitter<TestEvents>();
    const listener = vi.fn();

    emitter.on('item:removed', listener);
    emitter.emit('item:removed', 'item-42');

    expect(listener).toHaveBeenCalledWith('item-42');
  });

  it('supports numeric payloads', () => {
    const emitter = new TypedEmitter<TestEvents>();
    const listener = vi.fn();

    emitter.on('count:changed', listener);
    emitter.emit('count:changed', 5);

    expect(listener).toHaveBeenCalledWith(5);
  });

  it('off removes a listener', () => {
    const emitter = new TypedEmitter<TestEvents>();
    const listener = vi.fn();

    emitter.on('item:added', listener);
    emitter.off('item:added', listener);
    emitter.emit('item:added', { id: '1', name: 'test' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('once fires only once', () => {
    const emitter = new TypedEmitter<TestEvents>();
    const listener = vi.fn();

    emitter.once('count:changed', listener);
    emitter.emit('count:changed', 1);
    emitter.emit('count:changed', 2);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(1);
  });

  it('removeAllListeners removes all for a given event', () => {
    const emitter = new TypedEmitter<TestEvents>();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    emitter.on('item:added', listener1);
    emitter.on('item:added', listener2);
    emitter.removeAllListeners('item:added');
    emitter.emit('item:added', { id: '1', name: 'test' });

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
  });

  it('removeAllListeners without event clears everything', () => {
    const emitter = new TypedEmitter<TestEvents>();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    emitter.on('item:added', listener1);
    emitter.on('count:changed', listener2);
    emitter.removeAllListeners();
    emitter.emit('item:added', { id: '1', name: 'test' });
    emitter.emit('count:changed', 5);

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
  });

  it('emit returns true when listeners exist, false otherwise', () => {
    const emitter = new TypedEmitter<TestEvents>();
    const listener = vi.fn();

    expect(emitter.emit('count:changed', 1)).toBe(false);

    emitter.on('count:changed', listener);
    expect(emitter.emit('count:changed', 1)).toBe(true);
  });

  it('setMaxListeners returns this for chaining', () => {
    const emitter = new TypedEmitter<TestEvents>();
    const result = emitter.setMaxListeners(20);
    expect(result).toBe(emitter);
  });

  it('on/off/once return this for chaining', () => {
    const emitter = new TypedEmitter<TestEvents>();
    const listener = vi.fn();

    expect(emitter.on('count:changed', listener)).toBe(emitter);
    expect(emitter.off('count:changed', listener)).toBe(emitter);
    expect(emitter.once('count:changed', listener)).toBe(emitter);
  });

  it('multiple listeners on the same event all fire', () => {
    const emitter = new TypedEmitter<TestEvents>();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    emitter.on('item:removed', listener1);
    emitter.on('item:removed', listener2);
    emitter.emit('item:removed', 'x');

    expect(listener1).toHaveBeenCalledWith('x');
    expect(listener2).toHaveBeenCalledWith('x');
  });
});
