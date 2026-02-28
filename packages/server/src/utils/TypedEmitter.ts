import { EventEmitter } from 'events';

/**
 * A generic wrapper around Node's EventEmitter that enforces type safety
 * on event names and their payloads. Each event maps to a single data argument.
 *
 * Usage:
 *   interface MyEvents {
 *     'item:added': { id: string; name: string };
 *     'item:removed': string; // just an id
 *   }
 *   class MyService extends TypedEmitter<MyEvents> { ... }
 */
export class TypedEmitter<TEvents extends Record<string, any>> {
  private emitter = new EventEmitter();

  emit<K extends keyof TEvents & string>(event: K, data: TEvents[K]): boolean {
    return this.emitter.emit(event, data);
  }

  on<K extends keyof TEvents & string>(event: K, listener: (data: TEvents[K]) => void): this {
    this.emitter.on(event, listener);
    return this;
  }

  off<K extends keyof TEvents & string>(event: K, listener: (data: TEvents[K]) => void): this {
    this.emitter.off(event, listener);
    return this;
  }

  once<K extends keyof TEvents & string>(event: K, listener: (data: TEvents[K]) => void): this {
    this.emitter.once(event, listener);
    return this;
  }

  removeAllListeners<K extends keyof TEvents & string>(event?: K): this {
    if (event !== undefined) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
    }
    return this;
  }

  setMaxListeners(n: number): this {
    this.emitter.setMaxListeners(n);
    return this;
  }
}
