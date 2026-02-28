import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { getConfig, updateConfig } from './config.js';
import { WebSocketServer } from './comms/WebSocketServer.js';
import { MessageBus } from './comms/MessageBus.js';
import { AgentManager } from './agents/AgentManager.js';
import { RoleRegistry } from './agents/RoleRegistry.js';
import { TaskQueue } from './tasks/TaskQueue.js';
import { Database } from './db/database.js';
import { apiRouter } from './api.js';
import { FileLockRegistry } from './coordination/FileLockRegistry.js';
import { ActivityLedger } from './coordination/ActivityLedger.js';
import { DecisionLog } from './coordination/DecisionLog.js';
import { AgentMemory } from './coordination/AgentMemory.js';
import { TaskDAG } from './coordination/TaskDAG.js';
import { ChatGroupRegistry } from './comms/ChatGroupRegistry.js';
import { ContextRefresher } from './coordination/ContextRefresher.js';

let config = getConfig();

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);

// Initialize core services
const db = new Database(config.dbPath);

// Restore persisted maxConcurrentAgents from SQLite settings (survives server restart)
const persistedMaxAgents = db.getSetting('maxConcurrentAgents');
if (persistedMaxAgents) {
  const parsed = parseInt(persistedMaxAgents, 10);
  if (!isNaN(parsed) && parsed > 0) {
    updateConfig({ maxConcurrentAgents: parsed });
  }
}

// Re-read config AFTER restoring persisted settings so all services see the correct values
config = getConfig();

const lockRegistry = new FileLockRegistry(db);
const activityLedger = new ActivityLedger(db);
const roleRegistry = new RoleRegistry(db);
const messageBus = new MessageBus();
const decisionLog = new DecisionLog(db);
const agentMemory = new AgentMemory(db);
const chatGroupRegistry = new ChatGroupRegistry(db);
const taskDAG = new TaskDAG(db);
const agentManager = new AgentManager(config, roleRegistry, lockRegistry, activityLedger, messageBus, decisionLog, agentMemory, chatGroupRegistry, taskDAG);
const taskQueue = new TaskQueue(db, agentManager);
const contextRefresher = new ContextRefresher(agentManager, lockRegistry, activityLedger);
const wsServer = new WebSocketServer(httpServer, agentManager, taskQueue, lockRegistry, activityLedger, decisionLog, chatGroupRegistry);

// Wire up API routes
app.use('/api', apiRouter(agentManager, taskQueue, roleRegistry, config, db, lockRegistry, activityLedger, decisionLog));

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    agents: agentManager.getAll().length,
    queuedTasks: taskQueue.getPending().length,
  });
});

httpServer.listen(config.port, config.host, () => {
  console.log(`🚀 AI Crew server running on http://${config.host}:${config.port}`);
  contextRefresher.start();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  contextRefresher.stop();
  agentManager.shutdownAll();
  lockRegistry.cleanExpired();
  db.close();
  httpServer.close();
});
