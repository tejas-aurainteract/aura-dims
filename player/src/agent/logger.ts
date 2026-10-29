/**
 * Aura DIMS - Bounded Secure Logger
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Implements bounded log files with automatic rotation and redaction of secrets.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export class Logger {
  private logFilePath: string;
  private maxSizeBytes = 5 * 1024 * 1024; // 5 MB per file
  private maxBackups = 3;

  constructor(logsDir: string) {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    this.logFilePath = path.join(logsDir, 'player.log');
  }

  private redact(message: string): string {
    // Redact tokens, codes, and secrets from log strings
    return message
      .replace(/pairingCode=[\w\d]+/gi, 'pairingCode=[REDACTED]')
      .replace(/deviceSecret=[\w\d-_]+/gi, 'deviceSecret=[REDACTED]')
      .replace(/customToken=[\w\d-_.]+/gi, 'customToken=[REDACTED]')
      .replace(/Bearer\s+[\w\d-_.]+/gi, 'Bearer [REDACTED]');
  }

  private rotateIfNeeded() {
    try {
      if (fs.existsSync(this.logFilePath)) {
        const stats = fs.statSync(this.logFilePath);
        if (stats.size >= this.maxSizeBytes) {
          for (let i = this.maxBackups - 1; i >= 1; i--) {
            const oldPath = `${this.logFilePath}.${i}`;
            const newPath = `${this.logFilePath}.${i + 1}`;
            if (fs.existsSync(oldPath)) {
              fs.renameSync(oldPath, newPath);
            }
          }
          fs.renameSync(this.logFilePath, `${this.logFilePath}.1`);
        }
      }
    } catch {
      // Rotation failures must not crash the process
    }
  }

  private write(level: string, message: string, meta?: unknown) {
    const timestamp = new Date().toISOString();
    const safeMsg = this.redact(message);
    const metaStr = meta ? ` ${this.redact(JSON.stringify(meta))}` : '';
    const line = `[${timestamp}] [${level}] [Aura DIMS] ${safeMsg}${metaStr}\n`;

    if (level === 'ERROR') {
      console.error(line.trimEnd());
    } else if (level === 'WARN') {
      console.warn(line.trimEnd());
    } else {
      console.log(line.trimEnd());
    }

    try {
      this.rotateIfNeeded();
      fs.appendFileSync(this.logFilePath, line, 'utf8');
    } catch {
      // Disk write failure must not crash player agent
    }
  }

  info(message: string, meta?: unknown) {
    this.write('INFO', message, meta);
  }

  warn(message: string, meta?: unknown) {
    this.write('WARN', message, meta);
  }

  error(message: string, meta?: unknown) {
    this.write('ERROR', message, meta);
  }
}

