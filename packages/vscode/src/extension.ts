import * as vscode from 'vscode';
import { FlightdeckConnection } from './connection';
import { AgentsTreeProvider } from './providers/AgentsTreeProvider';
import { TasksTreeProvider } from './providers/TasksTreeProvider';
import { FileLocksTreeProvider } from './providers/FileLocksTreeProvider';

let outputChannel: vscode.OutputChannel;
let connection: FlightdeckConnection;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('Flightdeck');
  outputChannel.appendLine('Flightdeck extension activated');

  // Create connection manager
  connection = new FlightdeckConnection();
  context.subscriptions.push({ dispose: () => connection.dispose() });

  // Create tree view providers
  const agentsProvider = new AgentsTreeProvider(connection);
  const tasksProvider = new TasksTreeProvider(connection);
  const locksProvider = new FileLocksTreeProvider(connection);

  // Register tree views
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('flightdeck-agents', agentsProvider),
    vscode.window.registerTreeDataProvider('flightdeck-tasks', tasksProvider),
    vscode.window.registerTreeDataProvider('flightdeck-locks', locksProvider),
  );

  // Refresh all views when connection state changes
  connection.onDidChangeConnection((connected) => {
    outputChannel.appendLine(`Connection state: ${connected ? 'connected' : 'disconnected'}`);
    agentsProvider.refresh();
    tasksProvider.refresh();
    locksProvider.refresh();
  });

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('flightdeck.connect', async () => {
      outputChannel.appendLine(`Connecting to ${connection.serverUrl}...`);
      vscode.window.showInformationMessage(`Flightdeck: Connecting to ${connection.serverUrl}...`);
      await connection.connect();
      if (connection.connected) {
        vscode.window.showInformationMessage('Flightdeck: Connected');
      } else {
        vscode.window.showWarningMessage('Flightdeck: Failed to connect');
      }
    }),

    vscode.commands.registerCommand('flightdeck.disconnect', () => {
      connection.disconnect();
      outputChannel.appendLine('Disconnected');
      vscode.window.showInformationMessage('Flightdeck: Disconnected');
    }),

    vscode.commands.registerCommand('flightdeck.openDashboard', () => {
      outputChannel.appendLine('Opening dashboard...');
      vscode.window.showInformationMessage('Flightdeck: Dashboard coming soon');
      // TODO: Create DashboardPanel webview
    }),

    vscode.commands.registerCommand('flightdeck.refreshAgents', () => {
      agentsProvider.refresh();
    }),

    vscode.commands.registerCommand('flightdeck.refreshTasks', () => {
      tasksProvider.refresh();
    }),

    vscode.commands.registerCommand('flightdeck.sendMessage', async (item?: { agentId?: string }) => {
      const message = await vscode.window.showInputBox({
        prompt: 'Enter message to send to agent',
        placeHolder: 'Type your message...',
      });
      if (message) {
        outputChannel.appendLine(`Sending message to ${item?.agentId ?? 'lead'}: ${message}`);
        vscode.window.showInformationMessage('Flightdeck: Message sent');
        // TODO: Send via API
      }
    }),

    vscode.commands.registerCommand('flightdeck.terminateAgent', async (item?: { agentId?: string }) => {
      if (!item?.agentId) return;
      const confirm = await vscode.window.showWarningMessage(
        `Terminate agent ${item.agentId.slice(0, 8)}?`,
        { modal: true },
        'Terminate',
      );
      if (confirm === 'Terminate') {
        outputChannel.appendLine(`Terminating agent ${item.agentId}`);
        // TODO: Call terminate API
      }
    }),

    vscode.commands.registerCommand('flightdeck.approveDecision', () => {
      outputChannel.appendLine('Approving decision...');
      // TODO: Implement decision approval
    }),
  );

  // Create status bar item
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBarItem.text = '$(rocket) Flightdeck';
  statusBarItem.tooltip = 'Flightdeck — Click to open dashboard';
  statusBarItem.command = 'flightdeck.openDashboard';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Auto-connect if configured
  const config = vscode.workspace.getConfiguration('flightdeck');
  if (config.get<boolean>('autoConnect', true)) {
    vscode.commands.executeCommand('flightdeck.connect');
  }

  outputChannel.appendLine('Flightdeck extension ready');
}

export function deactivate(): void {
  outputChannel?.appendLine('Flightdeck extension deactivated');
  connection?.dispose();
}
