import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { getConfig } from './config.js';
import { WebSocketServer } from './comms/WebSocketServer.js';
import { AgentManager } from './agents/AgentManager.js';
import { RoleRegistry } from './agents/RoleRegistry.js';
import { TaskQueue } from './tasks/TaskQueue.js';
import { Database } from './db/database.js';
import { apiRouter } from './api.js';
import { FileLockRegistry } from './coordination/FileLockRegistry.js';
import { ActivityLedger } from './coordination/ActivityLedger.js';
import { ContextRefresher } from './coordination/ContextRefresher.js';

const config = getConfig();

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);

// Initialize core services
const db = new Database(config.dbPath);
const lockRegistry = new FileLockRegistry(db);
const activityLedger = new ActivityLedger(db);
const roleRegistry = new RoleRegistry();
const agentManager = new AgentManager(config, roleRegistry, lockRegistry, activityLedger);
const taskQueue = new TaskQueue(db, agentManager);
const contextRefresher = new ContextRefresher(agentManager, lockRegistry, activityLedger);
const wsServer = new WebSocketServer(httpServer, agentManager, taskQueue, lockRegistry, activityLedger);

// Wire up API routes
app.use('/api', apiRouter(agentManager, taskQueue, roleRegistry, config, db, lockRegistry, activityLedger));

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
