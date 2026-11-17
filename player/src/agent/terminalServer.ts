/**
 * Aura DIMS - Standalone Real-Time Terminal & Direct Command WebSocket Server
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Provides direct, queue-free WebSocket execution between the web dashboard and Linux host.
 * While a command executes, streams "..." heartbeats until completed, then returns the full output.
 */

import { WebSocketServer, WebSocket } from 'ws';
import * as child_process from 'node:child_process';
import type { Logger } from './logger.js';

export interface TerminalServerOptions {
  port?: number;
  logger: Logger;
}

export class TerminalServer {
  private wss: WebSocketServer | null = null;
  private port: number;
  private logger: Logger;

  constructor(options: TerminalServerOptions) {
    this.port = options.port || 8091;
    this.logger = options.logger;
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ port: this.port, host: '0.0.0.0' }, () => {
          this.logger.info(`[TerminalServer] Direct WebSocket terminal listening on ws://0.0.0.0:${this.port}`);
          resolve();
        });

        this.wss.on('connection', (ws: WebSocket, req) => {
          const remoteIp = req.socket.remoteAddress || 'unknown';
          this.logger.info(`[TerminalServer] Client connected from ${remoteIp}`);

          // Welcome greeting
          ws.send(JSON.stringify({
            type: 'system',
            message: `Connected to Aura DIMS Digital Display Terminal (Direct WebSocket on port ${this.port})`,
          }));

          ws.on('message', (data: string | Buffer) => {
            try {
              const msg = JSON.parse(data.toString());
              const rawCmd = (msg.command || '').trim();

              if (!rawCmd) {
                ws.send(JSON.stringify({ type: 'error', message: 'Command is empty' }));
                return;
              }

              this.executeCommand(ws, rawCmd);
            } catch (err: any) {
              ws.send(JSON.stringify({ type: 'error', message: `Invalid JSON payload: ${err?.message}` }));
            }
          });

          ws.on('close', () => {
            this.logger.info(`[TerminalServer] Client disconnected: ${remoteIp}`);
          });

          ws.on('error', (err) => {
            this.logger.warn(`[TerminalServer] WebSocket error: ${err.message}`);
          });
        });

        this.wss.on('error', (err) => {
          this.logger.error(`[TerminalServer] Server error on port ${this.port}:`, err);
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          this.logger.info('[TerminalServer] Stopped WebSocket server');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private executeCommand(ws: WebSocket, command: string) {
    this.logger.info(`[TerminalServer] Executing direct command: "${command}"`);

    // Special handling for restart/reboot commands
    if (command === 'restart' || command === 'restart-player' || command === 'systemctl restart aura-player') {
      ws.send(JSON.stringify({
        type: 'progress',
        status: '...',
        command,
        message: 'Restarting aura-player service now...',
      }));

      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'completed',
          command,
          exitCode: 0,
          output: 'Player service restart initiated cleanly via systemctl.\n',
        }));

        try {
          const child = child_process.spawn('sudo', ['/usr/bin/systemctl', 'restart', 'aura-player'], {
            detached: true,
            stdio: 'ignore',
          });
          child.unref();
        } catch (err: any) {
          this.logger.error('Failed to trigger player restart:', err);
        }
      }, 500);
      return;
    }

    if (command === 'reboot' || command === 'systemctl reboot') {
      ws.send(JSON.stringify({
        type: 'progress',
        status: '...',
        command,
        message: 'Rebooting digital display host now...',
      }));

      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'completed',
          command,
          exitCode: 0,
          output: 'Controlled host reboot initiated via systemctl.\n',
        }));

        try {
          const child = child_process.spawn('sudo', ['/usr/bin/systemctl', 'reboot'], {
            detached: true,
            stdio: 'ignore',
          });
          child.unref();
        } catch (err: any) {
          this.logger.error('Failed to trigger reboot:', err);
        }
      }, 500);
      return;
    }

    // Normal command execution
    let fullOutput = '';
    const startTime = Date.now();

    // Notify execution started
    ws.send(JSON.stringify({
      type: 'started',
      command,
    }));

    // Send "..." heartbeat every 1000ms while running
    const progressTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'progress',
          status: '...',
          command,
          elapsedSeconds: Math.floor((Date.now() - startTime) / 1000),
        }));
      }
    }, 1000);

    const child = child_process.spawn(command, {
      shell: '/bin/bash',
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      fullOutput += text;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'stdout',
          data: text,
        }));
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      fullOutput += text;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'stderr',
          data: text,
        }));
      }
    });

    child.on('close', (code: number | null) => {
      clearInterval(progressTimer);
      const exitCode = typeof code === 'number' ? code : 0;
      this.logger.info(`[TerminalServer] Command "${command}" finished with exit code ${exitCode}`);

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'completed',
          command,
          exitCode,
          output: fullOutput || (exitCode === 0 ? '(Command completed with no output)\n' : `(Exited with code ${exitCode})\n`),
        }));
      }
    });

    child.on('error', (err: Error) => {
      clearInterval(progressTimer);
      this.logger.error(`[TerminalServer] Process error executing "${command}":`, err);

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'completed',
          command,
          exitCode: 1,
          output: `Error executing command: ${err.message}\n`,
        }));
      }
    });
  }
}
