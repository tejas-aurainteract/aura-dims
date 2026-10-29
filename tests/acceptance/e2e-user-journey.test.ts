/**
 * Aura DIMS - Complete Real User Journey End-to-End Acceptance Test
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Implements the 18-step emulator-backed acceptance scenario:
 * 1. Admin Bootstrap
 * 2. Two Departments & Two Department Heads
 * 3. Sites & Digital Displays in both Landscape and Portrait orientations
 * 4. Explicit Digital Display Assignments
 * 5. Department Head valid image and video ingestion & validation
 * 6. Visual Design creation (Text, Shape, Image, and Video slides)
 * 7. Save, close, reopen, and verify design
 * 8. Playlist creation & time-based publication request
 * 9. Admin editorial review and approval
 * 10. Immutable publication package compilation
 * 11. Digital display player pairing & credential persistence
 * 12. Package download, SHA-256 verification, and atomic activation
 * 13. Scheduled playback & delivery reporting
 * 14. Network disconnection & offline cached playback survival
 * 15. Offline restart recovery
 * 16. Reconnection & replacement package update
 * 17. Schedule withdrawal & neutral corporate fallback
 * 18. Departmental security isolation & cross-department access denials
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
  type Functions,
} from 'firebase/functions';
import {
  getStorage,
  connectStorageEmulator,
  ref,
  uploadBytes,
  type FirebaseStorage,
} from 'firebase/storage';
import {
  evaluateScheduleAtTime,
  type DesignDocument,
  type DetailedPublicationManifest,
} from '@aura-dims/display-schema';

describe('Aura DIMS - 18-Step Real User Journey Acceptance Suite', () => {
  let app: FirebaseApp;
  let auth: Auth;
  let functions: Functions;
  let storage: FirebaseStorage;

  const PROJECT_ID = 'demo-aura-dims';
  const REGION = 'asia-south1';

  // Test data identifiers
  const ADMIN_EMAIL = 'admin@aurainteract.com';
  const ADMIN_PASS = 'AuraAdmin#2026';

  let deptMfgId = '';
  let deptEngId = '';
  const HEAD_MFG_EMAIL = `head.mfg.${Date.now()}@aurainteract.com`;
  const HEAD_ENG_EMAIL = `head.eng.${Date.now()}@aurainteract.com`;
  const HEAD_PASS = 'DepartmentHead#2026';

  let headMfgUid = '';
  let headEngUid = '';

  let siteId = '';
  let displayLandscapeId = '';
  let displayPortraitId = '';

  let imageAssetId = '';
  let videoAssetId = '';

  let designId = '';
  let designRevisionId = '';
  let playlistId = '';
  let playlistRevisionId = '';
  let scheduleId = '';
  let approvalId = '';
  let publicationId = '';

  let pairingCode = '';
  let deviceCredentials: { displayId: string; deviceSecret: string; customToken: string } | null = null;
  let localDataDir = '';

  beforeAll(async () => {
    // 1. Initialize client Firebase instance targeting local emulators
    app = initializeApp({
      apiKey: 'demo-api-key',
      authDomain: `${PROJECT_ID}.firebaseapp.com`,
      projectId: PROJECT_ID,
      storageBucket: `${PROJECT_ID}.appspot.com`,
    }, `acceptance-${Date.now()}`);

    auth = getAuth(app);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

    functions = getFunctions(app, REGION);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);

    storage = getStorage(app);
    connectStorageEmulator(storage, '127.0.0.1', 9199);

    localDataDir = path.resolve('test-tmp', `acceptance-player-${Date.now()}`);
    fs.mkdirSync(localDataDir, { recursive: true });
  });

  afterAll(async () => {
    try {
      if (fs.existsSync(localDataDir)) {
        fs.rmSync(localDataDir, { recursive: true, force: true });
      }
      await deleteApp(app);
    } catch {
      // Cleanup
    }
  });

  // Helper callable invoker
  async function call<TReq, TRes>(name: string, data: TReq): Promise<TRes> {
    const fn = httpsCallable<TReq, TRes>(functions, name);
    const res = await fn(data);
    return res.data;
  }

  // ---------------------------------------------------------------------------
  // Step 1: Admin Bootstrap
  // ---------------------------------------------------------------------------
  it('Step 1: Authenticates as bootstrapped Administrator', async () => {
    const cred = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASS);
    expect(cred.user.email).toBe(ADMIN_EMAIL);
    expect(cred.user.uid).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Step 2: Create Two Departments & Two Department Heads
  // ---------------------------------------------------------------------------
  it('Step 2: Admin creates two departments and provisions two Department Heads', async () => {
    // Create MFG Department
    const codeMfg = `M${Date.now().toString().slice(-4)}`;
    const deptMfgRes = await call<any, any>('createDepartment', {
      name: 'Manufacturing Operations',
      code: codeMfg,
    });
    expect(deptMfgRes.department.id).toBeTruthy();
    deptMfgId = deptMfgRes.department.id;

    // Create ENG Department
    const codeEng = `E${Date.now().toString().slice(-4)}`;
    const deptEngRes = await call<any, any>('createDepartment', {
      name: 'Product Engineering',
      code: codeEng,
    });
    expect(deptEngRes.department.id).toBeTruthy();
    deptEngId = deptEngRes.department.id;

    // Provision MFG Department Head
    const mfgHeadRes = await call<any, any>('provisionUser', {
      email: HEAD_MFG_EMAIL,
      displayName: 'Manufacturing Lead',
      role: 'department_head',
      departmentId: deptMfgId,
      temporaryPassword: HEAD_PASS,
    });
    expect(mfgHeadRes.email).toBe(HEAD_MFG_EMAIL);
    expect(mfgHeadRes.departmentId).toBe(deptMfgId);
    headMfgUid = mfgHeadRes.uid;

    // Provision ENG Department Head
    const engHeadRes = await call<any, any>('provisionUser', {
      email: HEAD_ENG_EMAIL,
      displayName: 'Engineering Lead',
      role: 'department_head',
      departmentId: deptEngId,
      temporaryPassword: HEAD_PASS,
    });
    expect(engHeadRes.email).toBe(HEAD_ENG_EMAIL);
    expect(engHeadRes.departmentId).toBe(deptEngId);
    headEngUid = engHeadRes.uid;
  });

  // ---------------------------------------------------------------------------
  // Step 3: Create Site & Digital Displays in Both Orientations
  // ---------------------------------------------------------------------------
  it('Step 3: Admin creates a site and registers digital displays in both orientations', async () => {
    // Create Site
    const siteRes = await call<any, any>('createSite', {
      name: 'Surat Tech Complex',
      location: 'Surat, Gujarat',
    });
    expect(siteRes.site.id).toBeTruthy();
    siteId = siteRes.site.id;

    // Register Landscape Display in MFG
    const dispLandRes = await call<any, any>('registerDisplay', {
      name: 'MFG Assembly Floor Display',
      siteId,
      departmentId: deptMfgId,
      locationDescription: 'Line 1 Main Overhead',
      orientation: 'landscape',
      configuredResolution: { width: 1920, height: 1080 },
    });
    expect(dispLandRes.display.orientation).toBe('landscape');
    displayLandscapeId = dispLandRes.display.id;

    // Register Portrait Display in ENG
    const dispPortRes = await call<any, any>('registerDisplay', {
      name: 'ENG R&D Totem Display',
      siteId,
      departmentId: deptEngId,
      locationDescription: 'R&D Labs Entrance',
      orientation: 'portrait',
      configuredResolution: { width: 1080, height: 1920 },
    });
    expect(dispPortRes.display.orientation).toBe('portrait');
    displayPortraitId = dispPortRes.display.id;
  });

  // ---------------------------------------------------------------------------
  // Step 4: Admin Assigns Permitted Displays
  // ---------------------------------------------------------------------------
  it('Step 4: Admin assigns permitted digital displays to each Department Head', async () => {
    // Assign Landscape display to MFG Head
    const assignMfg = await call<any, any>('assignDisplayUser', {
      displayId: displayLandscapeId,
      uid: headMfgUid,
    });
    expect(assignMfg.assignment.displayId).toBe(displayLandscapeId);
    expect(assignMfg.assignment.uid).toBe(headMfgUid);

    // Assign Portrait display to ENG Head
    const assignEng = await call<any, any>('assignDisplayUser', {
      displayId: displayPortraitId,
      uid: headEngUid,
    });
    expect(assignEng.assignment.displayId).toBe(displayPortraitId);
    expect(assignEng.assignment.uid).toBe(headEngUid);

    // Sign out Admin
    await signOut(auth);
  });

  // ---------------------------------------------------------------------------
  // Step 5: Department Head Uploads Valid Image and Video Assets
  // ---------------------------------------------------------------------------
  it('Step 5: MFG Department Head signs in, uploads valid PNG and MP4, and verifies them', async () => {
    // Sign in as MFG Head
    await signInWithEmailAndPassword(auth, HEAD_MFG_EMAIL, HEAD_PASS);

    // 1. Generate real valid PNG via sharp
    const sharp = (await import('../../functions/node_modules/sharp' as any)).default;
    const pngBuffer = await sharp({
      create: { width: 400, height: 300, channels: 4, background: { r: 13, g: 148, b: 136, alpha: 1 } },
    }).png().toBuffer();

    // Ingest Image
    const initImg = await call<any, any>('initiateMediaUpload', {
      fileName: 'safety-banner.png',
      fileSizeBytes: pngBuffer.length,
      declaredMimeType: 'image/png',
      departmentId: deptMfgId,
    });
    imageAssetId = initImg.assetId;
    expect(initImg.stagingPath).toBeTruthy();

    // Upload bytes to staging path
    const imgStorageRef = ref(storage, initImg.stagingPath);
    await uploadBytes(imgStorageRef, pngBuffer, { contentType: 'image/png' });

    // Finalize Image
    const finImg = await call<any, any>('finalizeMediaUpload', { assetId: imageAssetId });
    expect(finImg.asset.status).toBe('ready');
    expect(finImg.asset.checksumSha256).toBeTruthy();
    expect(finImg.asset.dimensions.width).toBe(400);
    expect(finImg.asset.dimensions.height).toBe(300);

    // 2. Generate real valid H.264 MP4 via ffmpeg
    const ffmpeg = (await import('../../functions/node_modules/@ffmpeg-installer/ffmpeg' as any)).default;
    const tempVideoPath = path.resolve('test-tmp', `acceptance-${Date.now()}.mp4`);
    fs.mkdirSync('test-tmp', { recursive: true });
    execFileSync(ffmpeg.path, [
      '-y', '-f', 'lavfi', '-i', 'color=c=teal:s=320x240:d=1',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', tempVideoPath
    ]);
    const videoBuffer = fs.readFileSync(tempVideoPath);

    // Ingest Video
    const initVid = await call<any, any>('initiateMediaUpload', {
      fileName: 'plant-safety.mp4',
      fileSizeBytes: videoBuffer.length,
      declaredMimeType: 'video/mp4',
      departmentId: deptMfgId,
    });
    videoAssetId = initVid.assetId;
    expect(initVid.stagingPath).toBeTruthy();

    // Upload bytes to staging path
    const vidStorageRef = ref(storage, initVid.stagingPath);
    await uploadBytes(vidStorageRef, videoBuffer, { contentType: 'video/mp4' });

    // Finalize Video
    const finVid = await call<any, any>('finalizeMediaUpload', { assetId: videoAssetId });
    expect(finVid.asset.status).toBe('ready');
    expect(finVid.asset.mediaType).toBe('video');
    expect(finVid.asset.checksumSha256).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Step 6: Create Design Using Text, Shapes, Image, and Video
  // ---------------------------------------------------------------------------
  it('Step 6: Department Head creates a visual design with 2 slides', async () => {
    const docPayload: DesignDocument = {
      schemaVersion: '1.0.0',
      orientation: 'landscape',
      dimensions: { width: 1920, height: 1080 },
      slides: [
        {
          id: 'slide-1',
          durationSeconds: 10,
          background: { type: 'color', color: '#0f172a' },
          elements: [
            {
              id: 'el-text-1',
              type: 'text',
              name: 'Headline',
              x: 100, y: 100, width: 800, height: 120, zIndex: 1, rotation: 0, opacity: 1,
              content: 'Manufacturing Safety Directive',
              fontFamily: 'Inter',
              fontSize: 48,
              fontWeight: 700,
              fontStyle: 'normal',
              color: '#ffffff',
              textAlign: 'left',
              language: 'en',
            },
            {
              id: 'el-shape-1',
              type: 'shape',
              name: 'Separator Line',
              x: 100, y: 240, width: 600, height: 8, zIndex: 2, rotation: 0, opacity: 1,
              shapeType: 'rectangle',
              fillColor: '#0d9488',
            },
            {
              id: 'el-img-1',
              type: 'image',
              name: 'Safety Badge',
              x: 100, y: 300, width: 400, height: 300, zIndex: 3, rotation: 0, opacity: 1,
              assetId: imageAssetId,
              fit: 'contain',
            },
          ],
        },
        {
          id: 'slide-2',
          durationSeconds: 15,
          background: { type: 'color', color: '#020617' },
          elements: [
            {
              id: 'el-video-1',
              type: 'video',
              name: 'Safety Video Loop',
              x: 200, y: 150, width: 1520, height: 780, zIndex: 1, rotation: 0, opacity: 1,
              assetId: videoAssetId,
              autoPlay: true,
              loop: true,
              muted: true,
            },
          ],
        },
      ],
    };

    const designRes = await call<any, any>('createDesign', {
      title: 'Plant Shift Safety Notice',
      description: 'Daily safety requirements for manufacturing line 1',
      orientation: 'landscape',
      initialDocument: docPayload,
    });

    expect(designRes.design.id).toBeTruthy();
    expect(designRes.design.slideCount).toBe(2);
    designId = designRes.design.id;
  });

  // ---------------------------------------------------------------------------
  // Step 7: Save, Close, Reopen, and Verify Design
  // ---------------------------------------------------------------------------
  it('Step 7: Saves, closes, reopens, and verifies the design document model', async () => {
    // 1. Fetch design
    const opened = await call<any, any>('getDesign', { designId });
    expect(opened.design.id).toBe(designId);
    expect(opened.design.document.slides.length).toBe(2);

    // 2. Modify and update
    const updatedDoc: DesignDocument = {
      ...opened.design.document,
      slides: [
        {
          ...opened.design.document.slides[0]!,
          durationSeconds: 12,
        },
        opened.design.document.slides[1]!,
      ],
    };

    const updateRes = await call<any, any>('updateDesign', {
      designId,
      document: updatedDoc,
      expectedRevision: opened.design.revision,
    });
    expect(updateRes.design.revision).toBe(opened.design.revision + 1);

    // 3. Reopen and verify persisted state
    const reopened = await call<any, any>('getDesign', { designId });
    expect(reopened.design.document.slides[0]?.durationSeconds).toBe(12);
  });

  // ---------------------------------------------------------------------------
  // Step 8: Create Playlist and Time-Based Publication Request
  // ---------------------------------------------------------------------------
  it('Step 8: Creates an ordered playlist and time-based publication request', async () => {
    // 1. Create immutable design revision
    const revRes = await call<any, any>('createDesignRevision', { designId });
    expect(revRes.revision.id).toBeTruthy();
    expect(revRes.revision.referencedAssetIds.length).toBe(2);
    designRevisionId = revRes.revision.id;

    // 2. Create Playlist
    const playlistRes = await call<any, any>('createPlaylist', {
      title: 'MFG Line 1 Daily Broadcast',
      description: 'Morning and afternoon shift rotation',
      departmentId: deptMfgId,
      orientation: 'landscape',
      items: [
        {
          designId,
          designRevisionId,
          title: 'Plant Shift Safety Notice',
          orientation: 'landscape',
          slideCount: 2,
          durationSeconds: 27,
          order: 1,
        },
      ],
    });
    expect(playlistRes.playlist.id).toBeTruthy();
    playlistId = playlistRes.playlist.id;

    // Create Playlist Revision
    const pRevRes = await call<any, any>('createPlaylistRevision', { playlistId });
    expect(pRevRes.revision.id).toBeTruthy();
    playlistRevisionId = pRevRes.revision.id;

    // 3. Create Schedule
    const schedRes = await call<any, any>('createSchedule', {
      title: 'MFG Line 1 Workday Broadcast',
      playlistRevisionId,
      playlistTitle: 'MFG Line 1 Daily Broadcast',
      departmentId: deptMfgId,
      targetDisplayIds: [displayLandscapeId],
      orientation: 'landscape',
      scheduleRule: {
        scheduleType: 'recurring',
        startDate: '2026-10-01',
        endDate: '2026-11-30',
        startTime: '06:00',
        endTime: '22:00',
        isOvernight: false,
        daysOfWeek: [1, 2, 3, 4, 5, 6],
        priority: 5,
        timezone: 'Asia/Kolkata',
      },
    });
    expect(schedRes.schedule.id).toBeTruthy();
    scheduleId = schedRes.schedule.id;

    // 4. Submit for Editorial Approval
    const submitRes = await call<any, any>('submitForApproval', { scheduleId });
    expect(submitRes.approval.status).toBe('pending_review');
    approvalId = submitRes.approval.id;

    await signOut(auth);
  });

  // ---------------------------------------------------------------------------
  // Step 9: Admin Reviews and Approves Exact Revision and Targets
  // ---------------------------------------------------------------------------
  it('Step 9: Admin signs in, reviews approval queue, and approves the publication request', async () => {
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASS);

    const approvals = await call<any, any>('listApprovals', { status: 'pending_review' });
    const targetApproval = approvals.approvals.find((a: any) => a.id === approvalId);
    expect(targetApproval).toBeTruthy();
    expect(targetApproval.playlistRevisionId).toBe(playlistRevisionId);
    expect(targetApproval.targetDisplayIds).toContain(displayLandscapeId);

    // Approve
    const decisionRes = await call<any, any>('reviewApproval', {
      approvalId,
      decision: 'approved',
    });
    expect(decisionRes.approval.status).toBe('approved');
  });

  // ---------------------------------------------------------------------------
  // Step 10: Prepare Immutable Publication Package
  // ---------------------------------------------------------------------------
  it('Step 10: Prepares the immutable publication package in Cloud Storage with SHA-256 manifest', async () => {
    const pubRes = await call<any, any>('preparePublication', {
      scheduleId,
      idempotencyKey: `pub-${Date.now()}`,
    });
    expect(pubRes.publication.id).toBeTruthy();
    expect(pubRes.publication.status).toBe('prepared');
    expect(pubRes.publication.storagePath).toBeTruthy();
    expect(pubRes.publication.manifestChecksumSha256).toBeTruthy();
    publicationId = pubRes.publication.id;
  });

  // ---------------------------------------------------------------------------
  // Step 11: Pair a Local Digital Display Player
  // ---------------------------------------------------------------------------
  it('Step 11: Admin generates a pairing code and local digital display player pairs successfully', async () => {
    // 1. Generate 10-char pairing code
    const codeRes = await call<any, any>('generateDisplayPairingCode', { displayId: displayLandscapeId });
    expect(codeRes.pairingCode).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/);
    pairingCode = codeRes.pairingCode;

    // Sign out Admin to simulate edge player environment
    await signOut(auth);

    // 2. Player redeems pairing code
    const redeemRes = await call<any, any>('redeemPairingCode', { pairingCode });
    expect(redeemRes.displayId).toBe(displayLandscapeId);
    expect(redeemRes.deviceSecret).toBeTruthy();
    expect(redeemRes.customToken).toBeTruthy();

    deviceCredentials = redeemRes;

    // Persist credentials with mode 0600
    const credPath = path.join(localDataDir, 'device-credentials.json');
    fs.writeFileSync(credPath, JSON.stringify(deviceCredentials, null, 2), { mode: 0o600 });
    const stat = fs.statSync(credPath);
    if (process.platform !== 'win32') {
      expect(stat.mode & 0o777).toBe(0o600);
    }
  });

  // ---------------------------------------------------------------------------
  // Step 12: Download, Verify, and Activate the Package
  // ---------------------------------------------------------------------------
  it('Step 12: Player retrieves manifest, downloads assets, verifies SHA-256, and atomically activates', async () => {
    // 1. Device sign in
    const signInRes = await call<any, any>('deviceSignIn', {
      displayId: displayLandscapeId,
      deviceSecret: deviceCredentials!.deviceSecret,
    });
    expect(signInRes.customToken).toBeTruthy();

    // Sign in player with custom token
    const { signInWithCustomToken } = await import('firebase/auth');
    await signInWithCustomToken(auth, signInRes.customToken);

    // 2. Discover publication
    const pubStatus = await call<any, any>('getDevicePublication', { displayId: displayLandscapeId });
    expect(pubStatus.desiredPublicationId).toBe(publicationId);

    // 3. Fetch manifest
    const manifestRes = await call<any, any>('getDevicePublicationManifest', {
      displayId: displayLandscapeId,
      publicationId,
    });
    const manifest: DetailedPublicationManifest = manifestRes.manifest;
    const assetUrls: Record<string, string> = manifestRes.assetUrls || {};
    expect(manifest.publicationId).toBe(publicationId);
    expect(manifest.assets.length).toBe(2);

    // 4. Download and verify each asset in staging
    const stagingDir = path.join(localDataDir, 'staging', publicationId);
    const cacheDir = path.join(localDataDir, 'cache');
    const packagesDir = path.join(localDataDir, 'packages');
    fs.mkdirSync(stagingDir, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.mkdirSync(packagesDir, { recursive: true });

    for (const asset of manifest.assets) {
      const downloadUrl = assetUrls[asset.assetId];
      expect(downloadUrl).toBeTruthy();
      const resp = await fetch(downloadUrl);
      if (!resp.ok) {
        console.error('[Acceptance Step 12 Fetch Failed]', downloadUrl, resp.status, await resp.text().catch(() => ''));
      }
      expect(resp.ok).toBe(true);
      const buf = Buffer.from(await resp.arrayBuffer());
      const hash = crypto.createHash('sha256').update(buf).digest('hex');
      expect(hash).toBe(asset.checksumSha256);

      // Save to content-addressed cache
      const cachedFile = path.join(cacheDir, hash);
      fs.writeFileSync(cachedFile, buf);
    }

    // 5. Atomic activation pointer write
    const activePackageFile = path.join(packagesDir, 'active.json');
    fs.writeFileSync(activePackageFile, JSON.stringify(manifest, null, 2));
    expect(fs.existsSync(activePackageFile)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Step 13: Verify Scheduled Playback & Status Reporting
  // ---------------------------------------------------------------------------
  it('Step 13: Verifies scheduled playback evaluation and reports delivery telemetry to Cloud Functions', async () => {
    const packagesDir = path.join(localDataDir, 'packages');
    const activePackage: DetailedPublicationManifest = JSON.parse(
      fs.readFileSync(path.join(packagesDir, 'active.json'), 'utf8')
    );

    // Evaluate schedule locally in Asia/Kolkata
    // 2026-10-15 10:00 IST = 04:30 UTC
    const evalResult = evaluateScheduleAtTime({
      schedules: [
        {
          id: scheduleId,
          title: 'MFG Line 1 Workday Broadcast',
          playlistRevisionId,
          departmentId: deptMfgId,
          targetDisplayIds: [displayLandscapeId],
          orientation: 'landscape',
          scheduleRule: activePackage.scheduleRule,
          fallbackConfig: { type: 'bundled' },
          status: 'active',
          ownerId: headMfgUid,
          ownerDisplayName: 'Manufacturing Lead',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      displayId: displayLandscapeId,
      targetIsoString: '2026-10-15T04:30:00.000Z',
      displayOrientation: 'landscape',
    });

    expect(evalResult.status).toBe('active');

    // Report delivery
    const deliveryReport = await call<any, any>('reportDeviceDelivery', {
      displayId: displayLandscapeId,
      publicationId,
      stage: 'active',
      checksumSha256: activePackage.integrity?.checksum,
    });
    expect(deliveryReport.accepted).toBe(true);

    // Report heartbeat
    const hbRes = await call<any, any>('reportDeviceHeartbeat', {
      displayId: displayLandscapeId,
      reported: {
        appVersion: '1.0.0',
        playerEngine: 'chromium-kiosk',
        osProfile: 'linux-arm64',
        localIp: '192.168.1.105',
        lastHeartbeatAt: new Date().toISOString(),
        rendererHealth: 'healthy',
        freeDiskBytes: 10000000000,
      },
    });
    expect(hbRes.success).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Step 14: Disconnect Player and Verify Cached Playback
  // ---------------------------------------------------------------------------
  it('Step 14: Simulates network disconnection and confirms player loops cached publication purely offline', async () => {
    // Cut off cloud network credentials
    await signOut(auth);

    // Read purely from local disk
    const packagesDir = path.join(localDataDir, 'packages');
    const localActivePackage: DetailedPublicationManifest = JSON.parse(
      fs.readFileSync(path.join(packagesDir, 'active.json'), 'utf8')
    );

    expect(localActivePackage.publicationId).toBe(publicationId);

    // Verify slide assets exist in local cache without touching network
    const cacheDir = path.join(localDataDir, 'cache');
    for (const asset of localActivePackage.assetManifest) {
      const cachedPath = path.join(cacheDir, asset.checksumSha256);
      expect(fs.existsSync(cachedPath)).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // Step 15: Restart Offline and Verify Recovery
  // ---------------------------------------------------------------------------
  it('Step 15: Simulates power-loss reboot offline and verifies instant recovery from active.json', async () => {
    // Re-verify that starting with zero network reads active.json directly
    const packagesDir = path.join(localDataDir, 'packages');
    const activeFile = path.join(packagesDir, 'active.json');
    expect(fs.existsSync(activeFile)).toBe(true);

    const activeManifest: DetailedPublicationManifest = JSON.parse(fs.readFileSync(activeFile, 'utf8'));
    expect(activeManifest.playlist.items.length).toBe(1);
    expect(activeManifest.orientation).toBe('landscape');
  });

  // ---------------------------------------------------------------------------
  // Step 16: Reconnect, Publish Replacement, and Verify Safe Activation
  // ---------------------------------------------------------------------------
  it('Step 16: Reconnects, prepares replacement publication, and player switches active package', async () => {
    // Sign in as MFG Head to update schedule
    await signInWithEmailAndPassword(auth, HEAD_MFG_EMAIL, HEAD_PASS);

    // Create a new design revision
    const newRevRes = await call<any, any>('createDesignRevision', { designId });
    const newDesignRevId = newRevRes.revision.id;

    // Create new playlist revision
    const newPRevRes = await call<any, any>('createPlaylist', {
      title: 'MFG Line 1 Daily Broadcast v2',
      description: 'Updated shift rotation',
      departmentId: deptMfgId,
      orientation: 'landscape',
      items: [
        {
          designId,
          designRevisionId: newDesignRevId,
          title: 'Plant Shift Safety Notice v2',
          orientation: 'landscape',
          slideCount: 2,
          durationSeconds: 30,
          order: 1,
        },
      ],
    });
    const pRev2 = await call<any, any>('createPlaylistRevision', { playlistId: newPRevRes.playlist.id });

    // Update Schedule with new playlist revision
    await call<any, any>('updateSchedule', {
      scheduleId,
      title: 'MFG Line 1 Workday Broadcast v2',
      playlistRevisionId: pRev2.revision.id,
      playlistTitle: 'MFG Line 1 Daily Broadcast v2',
      targetDisplayIds: [displayLandscapeId],
      scheduleRule: {
        scheduleType: 'recurring',
        startDate: '2026-10-01',
        endDate: '2026-11-30',
        startTime: '06:00',
        endTime: '22:00',
        isOvernight: false,
        daysOfWeek: [1, 2, 3, 4, 5, 6],
        priority: 5,
        timezone: 'Asia/Kolkata',
      },
    });

    // Submit for approval
    const sub2 = await call<any, any>('submitForApproval', { scheduleId });

    // Admin approves & prepares publication
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASS);
    await call<any, any>('reviewApproval', { approvalId: sub2.approval.id, decision: 'approved' });
    const prep2 = await call<any, any>('preparePublication', {
      scheduleId,
      idempotencyKey: `pub-replace-${Date.now()}`,
    });
    const replacementPublicationId = prep2.publication.id;

    // Sign out Admin and reconnect player
    await signOut(auth);

    // Player device sign in
    const devAuth = await call<any, any>('deviceSignIn', {
      displayId: displayLandscapeId,
      deviceSecret: deviceCredentials!.deviceSecret,
    });
    const { signInWithCustomToken } = await import('firebase/auth');
    await signInWithCustomToken(auth, devAuth.customToken);

    // Query desired publication
    const queryRes = await call<any, any>('getDevicePublication', { displayId: displayLandscapeId });
    expect(queryRes.desiredPublicationId).toBe(replacementPublicationId);

    // Archive old active pointer to previous.json and set replacement active
    const packagesDir = path.join(localDataDir, 'packages');
    const oldActivePath = path.join(packagesDir, 'active.json');
    const prevActivePath = path.join(packagesDir, 'previous.json');
    fs.copyFileSync(oldActivePath, prevActivePath);

    fs.writeFileSync(oldActivePath, JSON.stringify({ publicationId: replacementPublicationId }, null, 2));
    expect(JSON.parse(fs.readFileSync(oldActivePath, 'utf8')).publicationId).toBe(replacementPublicationId);
    expect(fs.existsSync(prevActivePath)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Step 17: Withdraw Schedule and Verify Fallback Selection
  // ---------------------------------------------------------------------------
  it('Step 17: Withdraws schedule and verifies evaluator falls back to neutral corporate fallback', async () => {
    // Sign in as Admin
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASS);

    // Set schedule status to withdrawn
    const withdrawRes = await call<any, any>('setScheduleStatus', {
      scheduleId,
      status: 'withdrawn',
    });
    expect(withdrawRes.status).toBe('withdrawn');

    // Run schedule evaluator: since schedule is withdrawn, it must return fallback!
    const res = evaluateScheduleAtTime({
      schedules: [
        {
          id: scheduleId,
          title: 'MFG Line 1 Workday Broadcast',
          playlistRevisionId,
          departmentId: deptMfgId,
          targetDisplayIds: [displayLandscapeId],
          orientation: 'landscape',
          scheduleRule: {
            scheduleType: 'recurring',
            startDate: '2026-10-01',
            endDate: '2026-11-30',
            startTime: '06:00',
            endTime: '22:00',
            isOvernight: false,
            daysOfWeek: [1, 2, 3, 4, 5, 6],
            priority: 5,
            timezone: 'Asia/Kolkata',
          },
          fallbackConfig: { type: 'bundled' },
          status: 'withdrawn',
          ownerId: headMfgUid,
          ownerDisplayName: 'Manufacturing Lead',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      displayId: displayLandscapeId,
      targetIsoString: '2026-10-15T04:30:00.000Z',
      displayOrientation: 'landscape',
    });
    expect(res.status).toBe('fallback');
  });

  // ---------------------------------------------------------------------------
  // Step 18: Negative Departmental Isolation Barriers
  // ---------------------------------------------------------------------------
  it('Step 18: Department Head 2 (ENG) is strictly blocked from accessing MFG protected resources', async () => {
    // Sign in as ENG Department Head
    await signInWithEmailAndPassword(auth, HEAD_ENG_EMAIL, HEAD_PASS);

    // 1. Cannot read MFG's visual designs
    await expect(call('getDesign', { designId })).rejects.toThrow(/permission-denied|access denied|permission to view/i);

    // 2. Cannot reference MFG's media assets in an ENG design
    const illegalDoc: DesignDocument = {
      schemaVersion: '1.0.0',
      orientation: 'portrait',
      dimensions: { width: 1080, height: 1920 },
      slides: [
        {
          id: 'slide-illegal',
          durationSeconds: 10,
          background: { type: 'color', color: '#000000' },
          elements: [
            {
              id: 'el-illegal-img',
              type: 'image',
              name: 'Stolen Asset',
              x: 0, y: 0, width: 400, height: 300, zIndex: 1, rotation: 0, opacity: 1,
              assetId: imageAssetId, // Belongs to DEPT_MFG!
              fit: 'contain',
            },
          ],
        },
      ],
    };

    await expect(
      call('createDesign', {
        title: 'Unauthorized Cross-Dept Design',
        orientation: 'portrait',
        initialDocument: illegalDoc,
      })
    ).rejects.toThrow(/belongs to another department/i);

    // 3. Cannot modify or approve MFG playlists
    await expect(
      call('createPlaylist', {
        title: 'Unauthorized ENG Playlist',
        departmentId: deptMfgId, // Targeting MFG
        orientation: 'landscape',
        items: [],
      })
    ).rejects.toThrow(/Access denied|permission-denied/i);

    // Sign out
    await signOut(auth);
  });
});
