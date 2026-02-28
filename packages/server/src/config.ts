/** Hard ceiling for auto-scaling concurrency. Prevents runaway agent spawning. */
export const MAX_CONCURRENCY_LIMIT = 200;

export interface ServerConfig {
  port: number;
  host: string;
  cliCommand: string;
  cliArgs: string[];
  maxConcurrentAgents: number;
  dbPath: string;
}

const defaults: ServerConfig = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '127.0.0.1',
  cliCommand: process.env.COPILOT_CLI_PATH || 'copilot',
  cliArgs: [],
  maxConcurrentAgents: parseInt(process.env.MAX_AGENTS || '50', 10),
  dbPath: process.env.DB_PATH || './ai-crew.db',
};

let config: ServerConfig = { ...defaults };

export function getConfig(): ServerConfig {
  return config;
}

export function updateConfig(patch: Partial<ServerConfig>): ServerConfig {
  config = { ...config, ...patch };
  return config;
}
