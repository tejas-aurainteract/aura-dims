/**
 * Aura DIMS - Digital Display Signage Player Agent CLI Entrypoint
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Terminology rule: Strictly use "digital display" in user-facing copy and logs.
 */

import * as path from 'node:path';
import { exec } from 'node:child_process';
import { loadConfig, type PlayerTransportMode } from './config.js';
import { Logger } from './logger.js';
import { PlayerTransport } from './transport.js';
import { DeviceIdentity } from './identity.js';
import { HardwareAdapter } from './hardwareAdapter.js';
import { SyncEngine } from './syncEngine.js';
import { LocalServer } from './localServer.js';
import { OperationsAgent } from './operationsAgent.js';
import { Supervisor } from './supervision.js';

async function main() {
  const args = process.argv.slice(2);
  let portOverride: number | undefined;
  let dataDirOverride: string | undefined;
  let modeOverride: PlayerTransportMode | undefined;
  let pairCode: string | undefined;
  let openBrowser = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      portOverride = Number(args[i + 1]);
      i++;
    } else if (args[i] === '--data-dir' && args[i + 1]) {
      dataDirOverride = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--mode' && args[i + 1]) {
      modeOverride = args[i + 1] as PlayerTransportMode;
      i++;
    } else if (args[i] === '--pair' && args[i + 1]) {
      pairCode = args[i + 1];
      i++;
    } else if (args[i] === '--open') {
      openBrowser = true;
    }
  }

  const config = loadConfig({
    ...(portOverride ? { port: portOverride } : {}),
    ...(dataDirOverride ? { dataDir: dataDirOverride } : {}),
    ...(modeOverride ? { mode: modeOverride } : {}),
  });

  const logger = new Logger(config.logsDir);
  logger.info('====================================================');
  logger.info('Aura DIMS - Digital Display Player Agent starting...');
  logger.info('Company: Aurainteract Private Limited');
  logger.info(`Transport mode: ${config.mode} (project: ${config.projectId})`);
  logger.info(`Loopback service: http://${config.host}:${config.port}/`);
  logger.info(`Data directory: ${config.dataDir}`);
  logger.info('====================================================');

  const transport = new PlayerTransport(config);
  const identity = new DeviceIdentity(config, logger, transport);
  const hardwareAdapter = new HardwareAdapter(config, logger);
  const syncEngine = new SyncEngine(config, logger, identity, hardwareAdapter);
  const server = new LocalServer(config, logger, identity, syncEngine);
  const operationsAgent = new OperationsAgent({
    config,
    logger,
    identity,
    syncEngine,
    hardwareAdapter,
    onRefreshRenderer: () => server.triggerRendererRefresh(),
  });
  const supervisor = new Supervisor(
    config,
    logger,
    identity,
    syncEngine,
    server,
    hardwareAdapter,
    operationsAgent
  );

  // If pairing code provided via CLI, pair immediately
  if (pairCode) {
    logger.info('Redeeming CLI pairing code for digital display enrollment...');
    const pairResult = await identity.pairWithCode(pairCode);
    if (!pairResult.success) {
      logger.error(`Pairing failed: ${pairResult.error}`);
    } else {
      logger.info(`Pairing succeeded for digital display: ${pairResult.displayId}`);
    }
  } else if (identity.isEnrolled()) {
    // Attempt session restoration
    await identity.restoreSession();
  } else {
    logger.info('Device is unprovisioned. First-run pairing screen will be presented.');
  }

  // Start loopback server
  await server.start();

  // Start supervision and heartbeat timers
  supervisor.start();

  const playerUrl = `http://${config.host}:${config.port}/`;
  logger.info(`Aura DIMS Digital Display Renderer is ready at: ${playerUrl}`);

  if (openBrowser) {
    logger.info(`Opening default browser to ${playerUrl}...`);
    const cmd =
      process.platform === 'win32'
        ? `start ${playerUrl}`
        : process.platform === 'darwin'
          ? `open ${playerUrl}`
          : `xdg-open ${playerUrl}`;
    exec(cmd);
  }

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down player agent cleanly...`);
    supervisor.stop();
    await server.stop();
    logger.info('Player agent stopped.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[Aura DIMS Fatal Error]', err);
  process.exit(1);
});
