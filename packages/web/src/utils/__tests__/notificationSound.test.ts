import { describe, it, expect, vi } from 'vitest';
import { playAttentionSound, playCompletionSound } from '../notificationSound';

// notificationSound uses Web Audio API which doesn't exist in jsdom.
// The functions swallow errors internally via try/catch.
// We test that they resolve without throwing.

describe('notificationSound', () => {
  it('playAttentionSound resolves without error in test environment', async () => {
    await expect(playAttentionSound()).resolves.toBeUndefined();
  });

  it('playCompletionSound resolves without error in test environment', async () => {
    await expect(playCompletionSound()).resolves.toBeUndefined();
  });

  it('calling both in sequence does not throw', async () => {
    await playAttentionSound();
    await playCompletionSound();
    await playAttentionSound();
    // All resolved without error
  });
});
