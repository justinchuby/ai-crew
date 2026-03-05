/**
 * Displays the app version next to the logo.
 * The git hash is shown when running in dev mode (import.meta.env.DEV)
 * or when the version is a pre-release (contains a hyphen per semver).
 * Production builds with stable versions show a clean version string.
 */
export function VersionBadge() {
  const version = __APP_VERSION__;
  const gitHash = __GIT_HASH__;

  const isPreRelease = version.includes('-');
  const isDevMode = import.meta.env.DEV;
  const hashAvailable = !!gitHash && gitHash !== 'unknown';
  const showHash = hashAvailable && (isPreRelease || isDevMode);
  const displayText = showHash ? `v${version} (${gitHash})` : `v${version}`;

  return (
    <span
      className="text-[11px] text-th-text-muted font-normal select-all"
      title={`Version ${version} — ${gitHash}`}
    >
      {displayText}
    </span>
  );
}
