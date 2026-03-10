/**
 * Dangerous Tool Detector.
 *
 * Identifies tool invocations that should bypass auto-approval even in
 * autonomous/balanced mode. Extends ShellCommandBlocklistHook patterns
 * to cover database operations and critical file deletions.
 */

/** Dangerous shell command patterns */
const DANGEROUS_SHELL_PATTERNS: RegExp[] = [
  /rm\s+-rf\s+\/(?!tmp)/,           // rm -rf outside /tmp
  /git\s+push\s+--force/,            // force push
  /curl.*\|\s*(?:bash|sh)/,          // pipe to shell
  /\bpkill\b/,                       // name-based process killing
  /\bkillall\b/,                     // name-based process killing
  /chmod\s+777/,                     // world-writable permissions
];

/** Dangerous SQL patterns */
const DANGEROUS_SQL_PATTERNS: RegExp[] = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+DATABASE\b/i,
  /\bDELETE\s+FROM\b(?!.*\bWHERE\b)/i,  // DELETE without WHERE
  /\bTRUNCATE\b/i,
];

/** Critical file paths that should never be deleted without confirmation */
const CRITICAL_FILE_PATTERNS: RegExp[] = [
  /\.env(\..*)?$/,                    // .env, .env.local, .env.production
  // JS / Node
  /package\.json$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  // Python
  /requirements\.txt$/,
  /pyproject\.toml$/,
  /Pipfile\.lock$/,
  /setup\.py$/,
  // Ruby
  /Gemfile\.lock$/,
  // Rust
  /Cargo\.lock$/,
  /Cargo\.toml$/,
  // Go
  /go\.sum$/,
  /go\.mod$/,
  // Java / JVM
  /pom\.xml$/,
  /build\.gradle(\.kts)?$/,
  // .NET
  /\.csproj$/,
  /\.sln$/,
  // Docker / CI / config
  /Dockerfile$/,
  /docker-compose\.ya?ml$/,
  /\.github\/workflows\/.+\.ya?ml$/,
  /Makefile$/,
  // Databases
  /\.sqlite3?$/,
  /\.db$/,
];

/**
 * Check if a tool invocation is potentially dangerous.
 * Used by adapter permission handlers to force user approval even in autopilot mode.
 */
export function isDangerousTool(toolName: string, args: Record<string, unknown>): boolean {
  const lowerTool = toolName.toLowerCase();

  // Check shell-like tools
  if (lowerTool.includes('shell') || lowerTool.includes('bash') || lowerTool.includes('terminal') || lowerTool.includes('exec')) {
    const command = String(args.command ?? args.cmd ?? args.input ?? '');
    for (const pattern of DANGEROUS_SHELL_PATTERNS) {
      if (pattern.test(command)) return true;
    }
  }

  // Check SQL-like tools
  if (lowerTool.includes('sql') || lowerTool.includes('query') || lowerTool.includes('database')) {
    const query = String(args.query ?? args.sql ?? args.statement ?? '');
    for (const pattern of DANGEROUS_SQL_PATTERNS) {
      if (pattern.test(query)) return true;
    }
  }

  // Check file deletion tools
  if (lowerTool.includes('delete') || lowerTool.includes('remove') || lowerTool.includes('rm')) {
    const filePath = String(args.path ?? args.file ?? args.filePath ?? '');
    for (const pattern of CRITICAL_FILE_PATTERNS) {
      if (pattern.test(filePath)) return true;
    }
  }

  // Also check the stringified arguments for SQL patterns (tools may embed SQL in any field)
  const argsStr = JSON.stringify(args);
  for (const pattern of DANGEROUS_SQL_PATTERNS) {
    if (pattern.test(argsStr)) return true;
  }

  return false;
}
