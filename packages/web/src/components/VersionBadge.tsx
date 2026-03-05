/**
 * Displays the app version next to the logo.
 * For dev/pre-release versions (containing a hyphen per semver),
 * the short git commit hash is also shown for debugging.
 */
export function VersionBadge() {
  const version = __APP_VERSION__;
  const gitHash = __GIT_HASH__;

  const isPreRelease = version.includes('-');
  const showHash = isPreRelease && gitHash && gitHash !== 'unknown';
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
