/**
 * Aura DIMS - Secure Loopback HTTP Service
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Security requirements:
 * - Strictly bound to 127.0.0.1 (loopback only)
 * - Validates Host and Origin headers to reject external origin requests
 * - Strict Content Security Policy (CSP)
 * - Path traversal protection on all asset and static file serving
 * - Serves renderer without requiring Firebase connectivity in browser JavaScript
 */

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PlayerConfig } from './config.js';
import type { Logger } from './logger.js';
import type { DeviceIdentity } from './identity.js';
import type { SyncEngine } from './syncEngine.js';
import type { PlaybackPresentationState } from '@aura-dims/display-schema';

export class LocalServer {
  private config: PlayerConfig;
  private logger: Logger;
  private identity: DeviceIdentity;
  private syncEngine: SyncEngine;
  private server: http.Server | null = null;
  private rendererDir: string;
  private playbackState: PlaybackPresentationState = {
    currentPlaylistId: null,
    currentSlideId: null,
    designRevisionId: null,
    isPlaying: false,
    lastSlideStartedAt: null,
  };
  private rendererHealth: 'healthy' | 'stalled' | 'error' = 'healthy';
  private lastRendererPing = Date.now();

  constructor(
    config: PlayerConfig,
    logger: Logger,
    identity: DeviceIdentity,
    syncEngine: SyncEngine,
    rendererDir?: string
  ) {
    this.config = config;
    this.logger = logger;
    this.identity = identity;
    this.syncEngine = syncEngine;
    this.rendererDir = rendererDir || path.resolve(process.cwd(), 'player/src/renderer');
  }

  getPlaybackState(): PlaybackPresentationState {
    return this.playbackState;
  }

  getRendererHealth(): 'healthy' | 'stalled' | 'error' {
    // If renderer hasn't pinged in 60s, mark stalled
    if (this.playbackState.isPlaying && Date.now() - this.lastRendererPing > 60_000) {
      return 'stalled';
    }
    return this.rendererHealth;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));

      this.server.on('error', (err) => {
        this.logger.error('Local server error:', err);
        reject(err);
      });

      this.server.listen(this.config.port, this.config.host, () => {
        this.logger.info(`Loopback server running at http://${this.config.host}:${this.config.port}/`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    // 1. Validate Host header strictly against loopback
    const hostHeader = req.headers.host || '';
    const isLoopbackHost =
      hostHeader === `127.0.0.1:${this.config.port}` ||
      hostHeader === `localhost:${this.config.port}` ||
      hostHeader === '127.0.0.1' ||
      hostHeader === 'localhost';

    if (!isLoopbackHost) {
      this.logger.warn(`Rejected request with unauthorized Host header: ${hostHeader}`);
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden: Unauthorized Host header');
      return;
    }

    // 2. Validate Origin header if present
    const origin = req.headers.origin;
    if (origin) {
      const allowedOrigins = [
        `http://127.0.0.1:${this.config.port}`,
        `http://localhost:${this.config.port}`,
      ];
      if (!allowedOrigins.includes(origin)) {
        this.logger.warn(`Rejected request with unauthorized Origin header: ${origin}`);
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden: Unauthorized Origin');
        return;
      }
    }

    // 3. Set strict security headers on all responses
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; font-src 'self' data: https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none';"
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');

    const parsedUrl = new URL(req.url || '/', `http://${this.config.host}:${this.config.port}`);
    const pathname = parsedUrl.pathname;

    // Routing
    if (req.method === 'GET' && pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', uptimeSeconds: process.uptime() }));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/status') {
      const creds = this.identity.getCredentials();
      const activePkg = this.syncEngine.getActivePackage();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          enrolled: this.identity.isEnrolled(),
          displayId: creds?.displayId || null,
          deliveryStage: this.syncEngine.getCurrentStage(),
          downloadingPublicationId: this.syncEngine.getDownloadingPublicationId(),
          readyPublicationId: this.syncEngine.getReadyPublicationId(),
          activePublicationId: activePkg?.publicationId || null,
          lastError: this.syncEngine.getLastError(),
          playback: this.playbackState,
          rendererHealth: this.getRendererHealth(),
        })
      );
      return;
    }

    if (req.method === 'GET' && pathname === '/api/active-package') {
      if (!this.identity.isEnrolled()) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ state: 'unprovisioned' }));
        return;
      }

      const activePkg = this.syncEngine.getActivePackage();
      const manifest = this.syncEngine.loadActiveManifest();

      if (!activePkg || !manifest) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            state: 'provisioned_no_package',
            displayId: this.identity.getDisplayId(),
            stage: this.syncEngine.getCurrentStage(),
          })
        );
        return;
      }

      // Map assets to loopback URLs
      const assetUrls: Record<string, string> = {};
      (manifest.assets || []).forEach((a: any) => {
        assetUrls[a.assetId] = `/api/assets/${encodeURIComponent(a.assetId)}`;
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          state: 'active',
          displayId: activePkg.displayId,
          publicationId: activePkg.publicationId,
          manifest,
          assetUrls,
        })
      );
      return;
    }

    // Serve active package verified assets with path traversal defense
    if (req.method === 'GET' && pathname.startsWith('/api/assets/')) {
      const assetId = decodeURIComponent(pathname.replace('/api/assets/', ''));
      const activePkg = this.syncEngine.getActivePackage();

      if (!activePkg) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('No active package');
        return;
      }

      // Path traversal check
      const safeAssetPath = path.resolve(activePkg.assetsDir, assetId);
      if (!safeAssetPath.startsWith(path.resolve(activePkg.assetsDir))) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden: Invalid asset path');
        return;
      }

      if (!fs.existsSync(safeAssetPath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Asset not found');
        return;
      }

      // Stream asset with proper mime type
      const ext = path.extname(safeAssetPath).toLowerCase();
      let contentType = 'application/octet-stream';
      if (['.jpg', '.jpeg'].includes(ext)) contentType = 'image/jpeg';
      else if (ext === '.png') contentType = 'image/png';
      else if (ext === '.webp') contentType = 'image/webp';
      else if (ext === '.mp4') contentType = 'video/mp4';
      else if (ext === '.webm') contentType = 'video/webm';

      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(safeAssetPath).pipe(res);
      return;
    }

    // Pairing endpoint called by setup screen
    if (req.method === 'POST' && pathname === '/api/pair') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body);
          const pairingCode = parsed.pairingCode;
          if (!pairingCode) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Pairing code required' }));
            return;
          }

          const result = await this.identity.pairWithCode(pairingCode);
          if (result.success) {
            // Trigger background sync immediately
            this.syncEngine.checkForUpdates().catch(() => {});
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, displayId: result.displayId }));
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: result.error }));
          }
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err?.message || 'Server error' }));
        }
      });
      return;
    }

    // Playback events reported by renderer
    if (req.method === 'POST' && pathname === '/api/playback-event') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const evt = JSON.parse(body);
          this.lastRendererPing = Date.now();

          if (evt.type === 'slide_started') {
            this.playbackState = {
              currentPlaylistId: evt.playlistId || null,
              currentSlideId: evt.slideId || null,
              designRevisionId: evt.designRevisionId || null,
              isPlaying: true,
              lastSlideStartedAt: new Date().toISOString(),
            };
            this.rendererHealth = 'healthy';
          } else if (evt.type === 'playback_error') {
            this.rendererHealth = 'error';
            this.logger.warn('Renderer playback error:', evt.error);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ received: true }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ received: false }));
        }
      });
      return;
    }

    // Static renderer file serving with path traversal protection
    if (req.method === 'GET') {
      let relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
      const safePath = path.resolve(this.rendererDir, relativePath);

      if (!safePath.startsWith(path.resolve(this.rendererDir))) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
      }

      if (!fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
        // Fallback to index.html for SPA if not found
        const indexPath = path.join(this.rendererDir, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          fs.createReadStream(indexPath).pipe(res);
          return;
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }

      const ext = path.extname(safePath).toLowerCase();
      let contentType = 'application/octet-stream';
      if (ext === '.html') contentType = 'text/html; charset=utf-8';
      else if (ext === '.js') contentType = 'application/javascript; charset=utf-8';
      else if (ext === '.css') contentType = 'text/css; charset=utf-8';
      else if (ext === '.svg') contentType = 'image/svg+xml';
      else if (ext === '.json') contentType = 'application/json';
      else if (['.woff', '.woff2'].includes(ext)) contentType = 'font/woff2';

      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(safePath).pipe(res);
      return;
    }

    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
  }
}
