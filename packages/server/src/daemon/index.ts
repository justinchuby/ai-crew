/**
 * Daemon module barrel export.
 *
 * Provides the daemon process, client, protocol types, event buffer,
 * and cross-platform utilities for agent lifecycle management across
 * server restarts.
 */
export { DaemonProcess, type DaemonProcessOptions } from './DaemonProcess.js';
export { DaemonClient, type DaemonClientOptions, type DaemonClientEvents } from './DaemonClient.js';
export { EventBuffer, type EventBufferOptions } from './EventBuffer.js';
export {
  // Cross-platform utilities
  createTransport,
  detectPlatform,
  isWindows,
  isMacOS,
  isLinux,
  type TransportAdapter,
  type Platform,
} from './platform.js';
export {
  // Protocol types
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcNotification,
  type JsonRpcError,
  type JsonRpcMessage,
  type DaemonEvent,
  type DaemonEventType,
  type DaemonAgentStatus,
  type AgentDescriptor,
  type MassFailureData,
  // Param types
  type AuthParams,
  type SpawnParams,
  type TerminateParams,
  type SendParams,
  type SubscribeParams,
  type ShutdownParams,
  type ConfigureParams,
  // Result types
  type AuthResult,
  type SpawnResult,
  type ListResult,
  type SubscribeResult,
  // Constants
  RPC_ERRORS,
  // Utilities
  serializeMessage,
  parseNdjsonBuffer,
  createRequest,
  createResponse,
  createErrorResponse,
  createNotification,
  isRequest,
  isResponse,
  isNotification,
  getSocketDir,
} from './DaemonProtocol.js';
export {
  MassFailureDetector,
  detectCause,
  type ExitRecord,
  type MassFailureConfig,
  type MassFailureCallback,
  type MassFailureCause,
} from './MassFailureDetector.js';
