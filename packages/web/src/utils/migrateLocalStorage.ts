/**
 * Migrate localStorage keys from old 'ai-crew' prefix to new 'flightdeck' prefix.
 * For each key pair: if old key exists and new key does not, copy old → new.
 * Old keys are intentionally preserved so rollback is safe.
 */

const KEY_MIGRATIONS: ReadonlyArray<[oldKey: string, newKey: string]> = [
  ['ai-crew-token', 'flightdeck-token'],
  ['ai-crew-sound-enabled', 'flightdeck-sound-enabled'],
  ['ai-crew-sidebar-tabs', 'flightdeck-sidebar-tabs'],
];

export function migrateLocalStorage(): void {
  try {
    for (const [oldKey, newKey] of KEY_MIGRATIONS) {
      const oldValue = localStorage.getItem(oldKey);
      if (oldValue !== null && localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, oldValue);
      }
    }
  } catch {
    // localStorage may be unavailable (e.g. in some privacy modes)
  }
}
