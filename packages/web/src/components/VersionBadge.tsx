/**
 * Displays the app version next to the logo.
 * For dev/pre-release versions, includes the short git commit hash.
 */
export function VersionBadge() {
  const version = __APP_VERSION__;
  const gitHash = __GIT_HASH__;

  const isDevVersion =
    version.includes('-') || version.includes('alpha') || version.includes('beta');

  const displayText = isDevVersion ? `v${version} (${gitHash})` : `v${version}`;

  return (
    <span
      className="text-[11px] text-th-text-muted font-normal select-all"
      title={`Version ${version} — ${gitHash}`}
    >
      {displayText}
    </span>
  );
}
