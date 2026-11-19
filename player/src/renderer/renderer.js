/**
 * Aura DIMS - Offline Fullscreen Digital Display Renderer
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Characteristics:
 * - Operates purely locally from loopback HTTP service.
 * - Zero live Firebase connectivity required in browser JavaScript.
 * - Evaluates schedules in Asia/Kolkata timezone with neutral corporate fallback.
 * - Dual-buffered off-screen slide preparation with generation counters, 15s preparation watchdog,
 *   reveal-timed dwell, and audio-then-muted video fallback adapted from verified hardware runtime.
 * - Supports complex script shaping (Gujarati/Hindi/English) and remote renderer refresh.
 */

(function () {
  'use strict';

  const PREP_TIMEOUT_MS = 15000;
  const rootEl = document.getElementById('player-root');
  let currentPackage = null;
  let currentSlideIndex = 0;
  let slideTimeoutTimer = null;
  let prepWatchdogTimer = null;
  let statusPollTimer = null;
  let isPlaying = false;
  let activeBufferSlot = 'a';
  let transitionGeneration = 0;
  let currentReloadGeneration = 1;

  function clearSlideTimers() {
    if (slideTimeoutTimer) {
      clearTimeout(slideTimeoutTimer);
      slideTimeoutTimer = null;
    }
    if (prepWatchdogTimer) {
      clearTimeout(prepWatchdogTimer);
      prepWatchdogTimer = null;
    }
  }

  // Initialize
  async function init() {
    clearSlideTimers();
    transitionGeneration += 1;

    try {
      const res = await fetch('/api/active-package');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (typeof data.reloadGeneration === 'number') {
        currentReloadGeneration = data.reloadGeneration;
      }

      updateApModeBanner(data.apMode);

      if (data.state === 'unprovisioned') {
        currentPackage = data;
        renderSetupScreen({ apMode: data.apMode, pendingEnrollment: data.pendingEnrollment });
        startPolling();
      } else if (data.state === 'provisioned_no_package') {
        currentPackage = data;
        renderAwaitingPackageScreen(data.displayId);
        startPolling();
      } else if (data.state === 'active') {
        currentPackage = data;
        await startPlayback();
        startPolling();
      }
    } catch (err) {
      renderErrorScreen('Failed to connect to local digital display player service.');
    }
  }

  function buildWifiQrPayload(ssid, password) {
    const esc = (v) => String(v || '').replace(/([\\;,:"])/g, '\\$1');
    return `WIFI:T:WPA;S:${esc(ssid)};P:${esc(password)};;`;
  }

  // 1. Mobile-First Onboarding Status Screen (Keyboard-free; ?debug=1 enables manual input)
  function renderSetupScreen(stateInfo = {}, errorMsg = null) {
    clearSlideTimers();
    isPlaying = false;

    const apMode = stateInfo?.apMode || null;
    const pending = stateInfo?.pendingEnrollment || null;
    const isDebugKeyboard =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('debug') === '1';

    let title = 'Digital Display Setup';
    let bodyHtml = '';

    const renderApQrBlock = (ap) => {
      const qrSvg =
        typeof window !== 'undefined' && window.AuraQr && typeof window.AuraQr.renderQrSvg === 'function'
          ? window.AuraQr.renderQrSvg(buildWifiQrPayload(ap.ssid, ap.password || 'aura12345678'), 190)
          : '';
      return `
        <div style="display:flex;flex-direction:column;align-items:center;gap:0.85rem;margin-top:1.25rem;padding:1.1rem;background:#020617;border:1px solid #1e293b;border-radius:0.85rem;">
          ${qrSvg ? `<div style="padding:0.5rem;background:#ffffff;border-radius:0.65rem;line-height:0;">${qrSvg}</div>` : ''}
          <div style="text-align:center;font-size:0.9rem;color:#cbd5e1;line-height:1.6;">
            <div><strong>1.</strong> Scan QR or join Wi-Fi <code style="color:#2dd4bf;background:#0f172a;padding:0.15rem 0.45rem;border-radius:0.35rem;">${escapeHtml(ap.ssid)}</code></div>
            <div>Password: <code style="color:#2dd4bf;background:#0f172a;padding:0.15rem 0.45rem;border-radius:0.35rem;">${escapeHtml(ap.password || 'aura12345678')}</code></div>
            <div style="margin-top:0.25rem;"><strong>2.</strong> Open <code style="color:#38bdf8;background:#0f172a;padding:0.15rem 0.45rem;border-radius:0.35rem;">http://10.42.0.1</code> on your phone</div>
            <div><strong>3.</strong> Enter your Wi-Fi and 6-character pairing code from Aura DIMS</div>
          </div>
        </div>
      `;
    };

    if (pending && pending.state === 'redeeming') {
      title = 'Registering Digital Display';
      bodyHtml = `
        <div style="margin:1.25rem auto;display:flex;flex-direction:column;align-items:center;gap:0.75rem;">
          <div class="spinner"></div>
          <p class="brand-sub" style="margin:0;color:#7dd3fc;">
            Registering digital display with Aura DIMS… (attempt ${escapeHtml(String(pending.attempts || 1))})
          </p>
          <p style="font-size:0.85rem;color:#94a3b8;margin:0;">
            Stored pairing code: <code style="color:#e2e8f0;">${escapeHtml(pending.codeHint)}</code>
          </p>
        </div>
      `;
    } else if (pending && pending.state === 'failed_terminal') {
      title = 'Pairing Code Rejected';
      const reason = (pending.lastError && pending.lastError.message) || 'Pairing code could not be redeemed.';
      bodyHtml = `
        <div class="error-banner" style="margin-top:1rem;">
          <strong>${escapeHtml(reason)}</strong><br>
          <span style="font-size:0.85rem;opacity:0.9;">Stored code: ${escapeHtml(pending.codeHint)}. Generate a new pairing code in Aura DIMS and reconnect on your phone.</span>
        </div>
        ${apMode && apMode.active ? renderApQrBlock(apMode) : `<p class="brand-sub" style="margin-top:1rem;">Re-opening mobile setup hotspot shortly…</p>`}
      `;
    } else if (pending && pending.state === 'pending') {
      title = 'Waiting for Internet';
      bodyHtml = `
        <div style="margin:1.25rem auto;display:flex;flex-direction:column;align-items:center;gap:0.75rem;">
          <div class="spinner"></div>
          <p class="brand-sub" style="margin:0;color:#86efac;">
            Pairing code saved (<code>${escapeHtml(pending.codeHint)}</code>). Waiting for internet to register with Aura DIMS…
          </p>
          ${pending.wifiSsid ? `<p style="font-size:0.85rem;color:#94a3b8;margin:0;">Target Wi-Fi: <strong>${escapeHtml(pending.wifiSsid)}</strong></p>` : ''}
        </div>
        ${apMode && apMode.active ? renderApQrBlock(apMode) : ''}
      `;
    } else if (apMode && apMode.active) {
      title = 'Mobile Setup Ready';
      bodyHtml = `
        <p class="brand-sub" style="margin-bottom:0.25rem;">
          Connect your phone to configure Wi-Fi and register this digital display with Aura DIMS.
        </p>
        ${renderApQrBlock(apMode)}
      `;
    } else {
      title = 'Digital Display Unregistered';
      bodyHtml = `
        <p class="brand-sub">
          This digital display is not yet registered in Aura DIMS.<br>
          Preparing mobile onboarding hotspot…
        </p>
      `;
    }

    const debugFormHtml = isDebugKeyboard
      ? `
        <form id="pair-form" class="pairing-form" style="margin-top:1.25rem;">
          <input
            type="text"
            id="pair-code-input"
            class="pairing-input"
            maxlength="6"
            placeholder="XXXXXX"
            autocomplete="off"
            autofocus
            required
          />
          <button type="submit" id="pair-btn" class="pair-button">Connect Digital Display</button>
        </form>
      `
      : '';

    rootEl.innerHTML = `
      <div class="setup-card" style="max-width:540px;">
        <div class="brand-badge">Aura DIMS • Signage Runtime</div>
        <h1 class="brand-title">${escapeHtml(title)}</h1>
        ${bodyHtml}
        ${debugFormHtml}
        ${errorMsg ? `<div class="error-banner" style="margin-top: 1rem;">${escapeHtml(errorMsg)}</div>` : ''}
      </div>
    `;

    if (isDebugKeyboard) {
      const form = document.getElementById('pair-form');
      const input = document.getElementById('pair-code-input');
      const btn = document.getElementById('pair-btn');

      if (input && form && btn) {
        input.addEventListener('input', (e) => {
          e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        });

        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const code = input.value.trim().toUpperCase();
          if (code.length < 6) return;

          btn.disabled = true;
          btn.textContent = 'Enrolling digital display...';

          try {
            const res = await fetch('/api/pair', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pairingCode: code }),
            });

            const json = await res.json();
            if (json.success) {
              renderAwaitingPackageScreen(json.displayId);
              startPolling();
            } else {
              renderSetupScreen(stateInfo, json.error || 'Failed to claim pairing code.');
            }
          } catch (err) {
            renderSetupScreen(
              stateInfo,
              'Could not communicate with local digital display player service.'
            );
          }
        });
      }
    }
  }

  // 2. Awaiting Package Screen
  function renderAwaitingPackageScreen(displayId) {
    clearSlideTimers();
    isPlaying = false;
    rootEl.innerHTML = `
      <div class="screen-center">
        <div class="spinner"></div>
        <h2 style="font-size: 1.5rem; font-weight: 700;">Digital Display Enrolled</h2>
        <p class="brand-sub" style="margin-bottom: 0;">
          Display ID: <span style="font-family: monospace; color: #38bdf8;">${escapeHtml(displayId)}</span><br>
          Synchronizing publication manifest with Aura DIMS Cloud...
        </p>
      </div>
    `;
  }

  // 3. Error Screen
  function renderErrorScreen(message) {
    clearSlideTimers();
    isPlaying = false;
    rootEl.innerHTML = `
      <div class="setup-card">
        <div class="brand-badge" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border-color: rgba(239, 68, 68, 0.4);">
          Aura DIMS • Attention
        </div>
        <h1 class="brand-title">Playback Service Unavailable</h1>
        <p class="brand-sub">${escapeHtml(message)}</p>
        <button onclick="location.reload()" class="pair-button" style="background: #334155;">Retry Connection</button>
      </div>
    `;
  }

  // 4. Start Playback
  async function startPlayback() {
    if (!currentPackage || !currentPackage.manifest) return;

    // Wait for bundled fonts to ensure pixel-accurate typography before slide render
    if (document.fonts) {
      try {
        await document.fonts.ready;
      } catch {}
    }

    const manifest = currentPackage.manifest;
    const orientation = manifest.orientation || 'landscape';
    const canvasWidth = orientation === 'landscape' ? 1920 : 1080;
    const canvasHeight = orientation === 'landscape' ? 1080 : 1920;

    rootEl.innerHTML = `
      <div id="viewport" class="signage-viewport" style="width: ${canvasWidth}px; height: ${canvasHeight}px;">
        <div id="slide-container" class="slide-canvas">
          <div id="slide-buffer-a" class="slide-buffer active"></div>
          <div id="slide-buffer-b" class="slide-buffer"></div>
        </div>
      </div>
      <div class="status-indicator">
        <span class="dot"></span>
        <span>Aura DIMS • Asia/Kolkata</span>
      </div>
    `;

    // Responsive canvas aspect ratio scaler
    function scaleViewport() {
      const vp = document.getElementById('viewport');
      if (!vp) return;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const scaleX = windowWidth / canvasWidth;
      const scaleY = windowHeight / canvasHeight;
      const scale = Math.min(scaleX, scaleY);
      vp.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }

    window.addEventListener('resize', scaleViewport);
    scaleViewport();

    activeBufferSlot = 'a';
    isPlaying = true;
    currentSlideIndex = 0;
    playNextSlide();
  }

  // 5. Evaluate Schedule & Sequence Slides with Dual-Buffer Preparation
  function playNextSlide() {
    if (!isPlaying || !currentPackage || !currentPackage.manifest) return;
    clearSlideTimers();

    const myGeneration = ++transitionGeneration;
    const manifest = currentPackage.manifest;

    // Local Schedule Evaluation in Asia/Kolkata
    const scheduleActive = isScheduleActiveNow(manifest.scheduleRule);
    let slideToRender = null;
    let durationSeconds = 10;
    let playlistId = manifest.scheduleId || 'default-schedule';
    let designRevisionId = null;

    if (
      scheduleActive &&
      manifest.playlist &&
      manifest.playlist.items &&
      manifest.playlist.items.length > 0
    ) {
      const allPlaylistSlides = [];
      manifest.playlist.items.forEach((item) => {
        (item.slides || []).forEach((s) => {
          allPlaylistSlides.push({
            slide: s,
            duration: s.durationSeconds || item.durationSeconds || 10,
            designRevisionId: item.designRevisionId,
          });
        });
      });

      if (allPlaylistSlides.length > 0) {
        if (currentSlideIndex >= allPlaylistSlides.length) {
          currentSlideIndex = 0;
        }
        const currentEntry = allPlaylistSlides[currentSlideIndex];
        slideToRender = currentEntry.slide;
        durationSeconds = currentEntry.duration;
        designRevisionId = currentEntry.designRevisionId;
        currentSlideIndex++;
      }
    }

    // If no active schedule or empty playlist, render fallback slide
    if (!slideToRender) {
      slideToRender =
        manifest.fallback?.slides?.[0] || getNeutralFallbackSlide(manifest.orientation);
      durationSeconds = 15;
    }

    prepareAndRevealSlide({
      slide: slideToRender,
      durationSeconds,
      playlistId,
      designRevisionId,
      generation: myGeneration,
    });
  }

  // 6. Dual-Buffered DOM Slide Renderer with 15s Prep Watchdog & Reveal-Timed Dwell
  function prepareAndRevealSlide({
    slide,
    durationSeconds,
    playlistId,
    designRevisionId,
    generation,
  }) {
    const bufferA = document.getElementById('slide-buffer-a');
    const bufferB = document.getElementById('slide-buffer-b');
    const fallbackContainer = document.getElementById('slide-container');

    if (!bufferA || !bufferB) {
      if (fallbackContainer) {
        fallbackContainer.innerHTML = buildSlideInnerHtml(slide);
      }
      return;
    }

    const currentBuffer = activeBufferSlot === 'a' ? bufferA : bufferB;
    const nextBuffer = activeBufferSlot === 'a' ? bufferB : bufferA;
    const nextSlot = activeBufferSlot === 'a' ? 'b' : 'a';

    // Apply background style to off-screen buffer
    applySlideBackground(nextBuffer, slide.background);
    nextBuffer.innerHTML = buildSlideInnerHtml(slide);

    const images = Array.from(nextBuffer.querySelectorAll('img'));
    const videos = Array.from(nextBuffer.querySelectorAll('video'));
    const totalMediaCount = images.length + videos.length;
    let settledCount = 0;
    let failedCount = 0;
    let revealed = false;

    const revealNow = () => {
      if (revealed || generation !== transitionGeneration) return;
      revealed = true;
      if (prepWatchdogTimer) {
        clearTimeout(prepWatchdogTimer);
        prepWatchdogTimer = null;
      }

      // Swap active classes
      nextBuffer.classList.add('active');
      currentBuffer.classList.remove('active');
      activeBufferSlot = nextSlot;

      // Stop and release media in previous buffer
      const oldVideos = currentBuffer.querySelectorAll('video');
      oldVideos.forEach((v) => {
        try {
          v.pause();
          v.removeAttribute('src');
          v.load();
        } catch {}
      });

      // Start videos in newly revealed buffer with audio-then-muted fallback
      videos.forEach((v) => {
        const wantsAudio = v.getAttribute('data-muted') === 'false';
        v.muted = !wantsAudio;
        const playPromise = v.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {
            if (generation !== transitionGeneration) return;
            v.muted = true;
            v.play().catch(() => {
              reportPlaybackEvent({
                type: 'playback_error',
                error: 'Video playback failed even when muted',
              });
            });
          });
        }
      });

      // Notify agent of actual slide presentation start
      reportPlaybackEvent({
        type: 'slide_started',
        publicationId: currentPackage?.publicationId || null,
        playlistId,
        slideId: slide.id || 'slide-1',
        designRevisionId,
      });

      // Start dwell timer strictly after reveal
      slideTimeoutTimer = setTimeout(() => {
        if (generation !== transitionGeneration) return;
        playNextSlide();
      }, Math.max(1, durationSeconds) * 1000);
    };

    const onMediaSettled = (failed) => {
      if (generation !== transitionGeneration || revealed) return;
      settledCount += 1;
      if (failed) failedCount += 1;
      if (settledCount >= totalMediaCount) {
        revealNow();
      }
    };

    if (totalMediaCount === 0) {
      revealNow();
      return;
    }

    // Arm 15-second preparation watchdog so a hung asset never freezes signage playback
    prepWatchdogTimer = setTimeout(() => {
      if (generation !== transitionGeneration || revealed) return;
      reportPlaybackEvent({
        type: 'playback_error',
        error: 'Slide media preparation watchdog timeout (15s)',
      });
      revealNow();
    }, PREP_TIMEOUT_MS);

    images.forEach((img) => {
      if (img.complete) {
        onMediaSettled(img.naturalWidth === 0);
      } else {
        img.addEventListener('load', () => onMediaSettled(false), { once: true });
        img.addEventListener(
          'error',
          () => {
            img.style.display = 'none';
            onMediaSettled(true);
          },
          { once: true }
        );
      }
    });

    videos.forEach((v) => {
      if (v.readyState >= 2) {
        onMediaSettled(false);
      } else {
        v.addEventListener('loadeddata', () => onMediaSettled(false), { once: true });
        v.addEventListener(
          'error',
          () => {
            reportPlaybackEvent({ type: 'playback_error', error: 'Video decode failure' });
            onMediaSettled(true);
          },
          { once: true }
        );
      }
    });
  }

  function applySlideBackground(bufferEl, background) {
    bufferEl.style.backgroundColor = '#0f172a';
    bufferEl.style.backgroundImage = 'none';
    if (!background) return;

    if (background.type === 'color' && background.value) {
      bufferEl.style.backgroundColor = background.value;
    } else if (background.type === 'gradient' && background.value) {
      bufferEl.style.backgroundImage = background.value;
    } else if (background.type === 'asset' && background.assetId) {
      const url = getAssetUrl(background.assetId);
      if (url) {
        bufferEl.style.backgroundImage = `url("${url}")`;
        bufferEl.style.backgroundSize = 'cover';
        bufferEl.style.backgroundPosition = 'center';
      }
    }
  }

  function buildSlideInnerHtml(slide) {
    const hasVideo = (slide.elements || []).some((el) => el.type === 'video');
    if (!hasVideo) {
      const renderedUrl = (slide.renderedAssetId && getAssetUrl(slide.renderedAssetId)) || slide.renderedImageUrl;
      if (renderedUrl) {
        return `
          <div class="rendered-slide-container">
            <img class="rendered-slide-img" src="${renderedUrl}" alt="" loading="eager" />
          </div>
        `;
      }
    }

    return (slide.elements || [])
      .slice()
      .sort((a, b) => (a.zIndex || 1) - (b.zIndex || 1))
      .map((el) => renderElementHtml(el))
      .join('');
  }

  function renderElementHtml(el) {
    const style = `
      position: absolute;
      left: ${el.x}px;
      top: ${el.y}px;
      width: ${el.width}px;
      height: ${el.height}px;
      transform: ${el.rotation ? `rotate(${el.rotation}deg)` : 'none'};
      opacity: ${el.opacity !== undefined ? el.opacity : 1};
      z-index: ${el.zIndex || 1};
      box-sizing: border-box;
      overflow: hidden;
    `;

    if (el.type === 'text') {
      const font = getFontCss(el.fontFamily);
      const isBold = el.fontWeight === 'bold' || el.fontWeight === 700 || el.fontWeight === '700';
      const isMedium = el.fontWeight === 'medium' || el.fontWeight === 600 || el.fontWeight === '600';
      const weight = isBold ? 700 : isMedium ? 600 : 400;
      return `
        <div class="canvas-element" style="${style}
          font-family: ${font};
          font-size: ${el.fontSize || 32}px;
          font-weight: ${weight};
          font-style: ${el.italic ? 'italic' : 'normal'};
          text-decoration: ${el.underline ? 'underline' : 'none'};
          color: ${el.color || '#ffffff'};
          text-align: ${el.textAlign || 'left'};
          line-height: ${el.lineHeight || 1.3};
          letter-spacing: ${el.letterSpacing ? `${el.letterSpacing}px` : 'normal'};
          white-space: pre-wrap;
          word-break: break-word;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
        ">
          ${escapeHtml(el.content || '')}
        </div>
      `;
    }

    if (el.type === 'shape') {
      let shapeRadius = '0px';
      if (el.shapeType === 'ellipse') shapeRadius = '50%';
      else if (el.shapeType === 'rounded_rectangle') shapeRadius = `${el.borderRadius || 24}px`;

      const borderWidth = el.borderWidth || 0;
      const borderStyle = borderWidth > 0 ? 'solid' : 'none';

      return `
        <div class="canvas-element" style="${style}
          background-color: ${el.fillColor || 'transparent'};
          border-color: ${el.borderColor || 'transparent'};
          border-width: ${borderWidth}px;
          border-style: ${borderStyle};
          border-radius: ${shapeRadius};
        "></div>
      `;
    }

    if (el.type === 'image') {
      const url = getAssetUrl(el.assetId);
      if (!url) return '';
      const fit = el.fit || 'cover';
      return `
        <div class="canvas-element" style="${style}">
          <img class="canvas-image" style="object-fit: ${fit};" src="${url}" alt="" loading="eager">
        </div>
      `;
    }

    if (el.type === 'video') {
      const url = getAssetUrl(el.assetId);
      if (!url) return '';
      const fit = el.fit || 'cover';
      const isMuted = el.muted !== false;
      const isLoop = el.loop !== false;
      return `
        <div class="canvas-element" style="${style}">
          <video
            class="canvas-video"
            style="object-fit: ${fit};"
            src="${url}"
            preload="auto"
            data-muted="${isMuted ? 'true' : 'false'}"
            ${isMuted ? 'muted' : ''}
            ${isLoop ? 'loop' : ''}
            playsinline
          ></video>
        </div>
      `;
    }

    return '';
  }

  function getFontCss(fontFamily) {
    switch (fontFamily) {
      case 'Noto Sans Gujarati':
        return '"Noto Sans Gujarati", sans-serif';
      case 'Noto Sans Devanagari':
        return '"Noto Sans Devanagari", sans-serif';
      case 'Inter':
      default:
        return '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    }
  }

  function getAssetUrl(assetId) {
    if (!assetId || !currentPackage || !currentPackage.assetUrls) return null;
    return currentPackage.assetUrls[assetId] || null;
  }

  // 7. Schedule Rule Evaluator in Asia/Kolkata
  function isScheduleActiveNow(rule) {
    if (!rule) return true; // Default fallback: always active if no rule
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      const parts = formatter.formatToParts(now);
      const partMap = {};
      parts.forEach((p) => {
        partMap[p.type] = p.value;
      });

      const currentDate = `${partMap.year}-${partMap.month}-${partMap.day}`;
      const currentTime = `${partMap.hour}:${partMap.minute}`;

      // Date window check
      if (rule.startDate && currentDate < rule.startDate) return false;
      if (rule.endDate && currentDate > rule.endDate) return false;

      // Day of week check (0: Sunday, 1: Monday, ...)
      const dayOfWeek = new Date(`${currentDate}T00:00:00+05:30`).getDay();
      if (rule.daysOfWeek && rule.daysOfWeek.length > 0 && !rule.daysOfWeek.includes(dayOfWeek)) {
        return false;
      }

      // Time of day window check (handles overnight windows)
      if (rule.startTime && rule.endTime) {
        if (rule.startTime <= rule.endTime) {
          if (currentTime < rule.startTime || currentTime > rule.endTime) return false;
        } else {
          // Overnight window spanning midnight (e.g. 22:00 to 06:00)
          if (currentTime < rule.startTime && currentTime > rule.endTime) return false;
        }
      }

      return true;
    } catch {
      return true;
    }
  }

  function getNeutralFallbackSlide(orientation) {
    const isPortrait = orientation === 'portrait';
    return {
      id: 'neutral-fallback',
      name: 'Corporate Neutral Fallback',
      durationSeconds: 15,
      background: {
        type: 'gradient',
        value: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      },
      elements: [
        {
          id: 'fb-title',
          type: 'text',
          name: 'Title',
          x: isPortrait ? 80 : 160,
          y: isPortrait ? 600 : 400,
          width: isPortrait ? 920 : 1600,
          height: 120,
          content: 'Aurainteract Private Limited',
          fontFamily: 'Inter',
          fontSize: isPortrait ? 54 : 64,
          fontWeight: 800,
          color: '#ffffff',
          textAlign: 'center',
          lineHeight: 1.2,
        },
        {
          id: 'fb-sub',
          type: 'text',
          name: 'Subtitle',
          x: isPortrait ? 80 : 160,
          y: isPortrait ? 740 : 540,
          width: isPortrait ? 920 : 1600,
          height: 80,
          content: 'Aura DIMS • Enterprise Digital Signage Platform',
          fontFamily: 'Inter',
          fontSize: isPortrait ? 28 : 32,
          fontWeight: 500,
          color: '#14b8a6',
          textAlign: 'center',
          lineHeight: 1.3,
        },
      ],
    };
  }

  function reportPlaybackEvent(eventData) {
    fetch('/api/playback-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventData),
    }).catch(() => {});
  }

  // 8. Status Poller (hot reloads package when new one is activated or REFRESH_RENDERER is triggered)
  function startPolling() {
    if (statusPollTimer) clearInterval(statusPollTimer);
    statusPollTimer = setInterval(async () => {
      try {
        const res = await fetch('/api/status');
        if (!res.ok) return;
        const status = await res.json();

        updateApModeBanner(status.apMode);

        if (
          typeof status.reloadGeneration === 'number' &&
          status.reloadGeneration > currentReloadGeneration
        ) {
          currentReloadGeneration = status.reloadGeneration;
          init();
          return;
        }

        if (status.enrolled && currentPackage?.state === 'unprovisioned') {
          init();
          return;
        }

        if (!status.enrolled && currentPackage?.state === 'unprovisioned') {
          const prevKey = JSON.stringify({
            ap: currentPackage.apMode || null,
            pe: currentPackage.pendingEnrollment || null,
          });
          const nextKey = JSON.stringify({
            ap: status.apMode || null,
            pe: status.pendingEnrollment || null,
          });
          if (prevKey !== nextKey) {
            currentPackage.apMode = status.apMode || null;
            currentPackage.pendingEnrollment = status.pendingEnrollment || null;
            renderSetupScreen({
              apMode: status.apMode,
              pendingEnrollment: status.pendingEnrollment,
            });
          }
          return;
        }

        if (
          status.activePublicationId &&
          (!currentPackage || currentPackage.publicationId !== status.activePublicationId)
        ) {
          init();
        }
      } catch {}
    }, 3000);
  }

  function updateApModeBanner(apMode) {
    let banner = document.getElementById('ap-mode-banner');
    if (apMode && apMode.active) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'ap-mode-banner';
        banner.className = 'ap-mode-banner';
        document.body.appendChild(banner);
      }
      banner.innerHTML = `
        <div class="ap-badge">⚡ Wi-Fi Setup Mode Active</div>
        <div class="ap-text">Connect to: <strong>${escapeHtml(apMode.ssid)}</strong> (Pass: <code>${escapeHtml(apMode.password)}</code>)</div>
      `;
    } else if (banner) {
      banner.remove();
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Bootstrap
  init();
})();
