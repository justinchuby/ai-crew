import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('Flightdeck');
  outputChannel.appendLine('Flightdeck extension activated');

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('flightdeck.connect', () => {
      const serverUrl = vscode.workspace.getConfiguration('flightdeck').get<string>('serverUrl', 'http://localhost:3001');
      outputChannel.appendLine(`Connecting to ${serverUrl}...`);
      vscode.window.showInformationMessage(`Flightdeck: Connecting to ${serverUrl}...`);
      // TODO: Implement WebSocket connection
      vscode.commands.executeCommand('setContext', 'flightdeck.connected', true);
    }),

    vscode.commands.registerCommand('flightdeck.disconnect', () => {
      outputChannel.appendLine('Disconnecting...');
      vscode.window.showInformationMessage('Flightdeck: Disconnected');
      vscode.commands.executeCommand('setContext', 'flightdeck.connected', false);
      // TODO: Close WebSocket connection
    }),

    vscode.commands.registerCommand('flightdeck.openDashboard', () => {
      outputChannel.appendLine('Opening dashboard...');
      vscode.window.showInformationMessage('Flightdeck: Dashboard coming soon');
      // TODO: Create DashboardPanel webview
    }),

    vscode.commands.registerCommand('flightdeck.refreshAgents', () => {
      outputChannel.appendLine('Refreshing agents...');
      // TODO: Refresh agent tree view data
    }),

    vscode.commands.registerCommand('flightdeck.refreshTasks', () => {
      outputChannel.appendLine('Refreshing tasks...');
      // TODO: Refresh task tree view data
    }),

    vscode.commands.registerCommand('flightdeck.sendMessage', async (item?: { agentId?: string }) => {
      const message = await vscode.window.showInputBox({
        prompt: 'Enter message to send to agent',
        placeHolder: 'Type your message...',
      });
      if (message) {
        outputChannel.appendLine(`Sending message to ${item?.agentId ?? 'lead'}: ${message}`);
        vscode.window.showInformationMessage(`Flightdeck: Message sent`);
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
  // TODO: Close WebSocket connection, cleanup resources
}
