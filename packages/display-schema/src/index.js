"use strict";
/**
 * Aura DIMS - Core Domain Types & Schemas
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Terminology rule: Always use "digital display" in user-facing naming.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DESIGN_CONSTRAINTS = exports.MEDIA_CONSTRAINTS = void 0;
exports.validateDesignDocument = validateDesignDocument;
exports.extractReferencedAssetIds = extractReferencedAssetIds;
exports.getKolkataTimeComponents = getKolkataTimeComponents;
exports.isScheduleRuleActiveAtTime = isScheduleRuleActiveAtTime;
exports.evaluateScheduleAtTime = evaluateScheduleAtTime;
exports.detectScheduleConflicts = detectScheduleConflicts;
exports.validateScheduleRule = validateScheduleRule;
exports.validatePlaylist = validatePlaylist;
exports.getBundledNeutralFallback = getBundledNeutralFallback;
exports.MEDIA_CONSTRAINTS = {
    MAX_IMAGE_SIZE_BYTES: 20 * 1024 * 1024, // 20 MB
    MAX_VIDEO_SIZE_BYTES: 200 * 1024 * 1024, // 200 MB
    MAX_VIDEO_DURATION_SECONDS: 600, // 10 minutes
    MAX_VIDEO_WIDTH: 1920,
    MAX_VIDEO_HEIGHT: 1920,
    MAX_VIDEO_PIXELS: 1920 * 1080,
    MAX_IMAGE_PIXELS: 40_000_000, // 40 Megapixels
    ALLOWED_IMAGE_MIME_TYPES: ['image/jpeg', 'image/png'],
    ALLOWED_VIDEO_MIME_TYPES: ['video/mp4'],
    ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'video/mp4'],
    ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.mp4'],
    UPLOAD_INTENT_EXPIRY_MS: 30 * 60 * 1000, // 30 minutes
    MAX_TITLE_LENGTH: 100,
    MAX_DESCRIPTION_LENGTH: 500,
    MAX_TAGS_COUNT: 20,
    MAX_TAG_LENGTH: 30,
};
// ==========================================
// Milestone: Visual Content Creator & Reusable Templates
// ==========================================
exports.DESIGN_CONSTRAINTS = {
    MAX_SLIDES_PER_DESIGN: 20,
    MAX_ELEMENTS_PER_SLIDE: 50,
    MAX_VIDEOS_PER_SLIDE: 1,
    MAX_TITLE_LENGTH: 120,
    MAX_DESCRIPTION_LENGTH: 1000,
    MIN_SLIDE_DURATION_SECONDS: 1,
    MAX_SLIDE_DURATION_SECONDS: 3600,
    DEFAULT_SLIDE_DURATION_SECONDS: 10,
    LANDSCAPE_DIMENSIONS: { width: 1920, height: 1080 },
    PORTRAIT_DIMENSIONS: { width: 1080, height: 1920 },
    SUPPORTED_FONT_FAMILIES: [
        'Inter',
        'Noto Sans Gujarati',
        'Noto Sans Devanagari',
    ],
    SUPPORTED_SCHEMA_VERSIONS: ['1.0.0'],
};
/**
 * Validates a DesignDocument against all schema invariants and bounds.
 */
function validateDesignDocument(doc) {
    const errors = [];
    if (!doc || typeof doc !== 'object') {
        return { valid: false, errors: ['Document must be an object.'] };
    }
    const d = doc;
    if (!d.schemaVersion || !exports.DESIGN_CONSTRAINTS.SUPPORTED_SCHEMA_VERSIONS.includes(d.schemaVersion)) {
        errors.push(`Unsupported or missing schemaVersion: ${d.schemaVersion}`);
    }
    if (d.orientation !== 'landscape' && d.orientation !== 'portrait') {
        errors.push(`Invalid orientation: ${d.orientation}. Must be 'landscape' or 'portrait'.`);
    }
    const expectedDimensions = d.orientation === 'landscape'
        ? exports.DESIGN_CONSTRAINTS.LANDSCAPE_DIMENSIONS
        : exports.DESIGN_CONSTRAINTS.PORTRAIT_DIMENSIONS;
    if (!d.dimensions ||
        d.dimensions.width !== expectedDimensions.width ||
        d.dimensions.height !== expectedDimensions.height) {
        errors.push(`Invalid dimensions for ${d.orientation}: expected ${expectedDimensions.width}x${expectedDimensions.height}, got ${d.dimensions?.width}x${d.dimensions?.height}`);
    }
    if (!Array.isArray(d.slides)) {
        errors.push('Document must contain a slides array.');
        return { valid: false, errors };
    }
    if (d.slides.length === 0) {
        errors.push('Design must contain at least one slide.');
    }
    if (d.slides.length > exports.DESIGN_CONSTRAINTS.MAX_SLIDES_PER_DESIGN) {
        errors.push(`Design exceeds maximum slide limit of ${exports.DESIGN_CONSTRAINTS.MAX_SLIDES_PER_DESIGN} (has ${d.slides.length}).`);
    }
    const slideIds = new Set();
    d.slides.forEach((slide, sIdx) => {
        if (!slide.id || typeof slide.id !== 'string') {
            errors.push(`Slide #${sIdx + 1} is missing a valid string id.`);
        }
        else if (slideIds.has(slide.id)) {
            errors.push(`Duplicate slide id detected: ${slide.id}`);
        }
        else {
            slideIds.add(slide.id);
        }
        if (typeof slide.durationSeconds !== 'number' ||
            !Number.isFinite(slide.durationSeconds) ||
            slide.durationSeconds < exports.DESIGN_CONSTRAINTS.MIN_SLIDE_DURATION_SECONDS ||
            slide.durationSeconds > exports.DESIGN_CONSTRAINTS.MAX_SLIDE_DURATION_SECONDS) {
            errors.push(`Slide #${sIdx + 1} duration must be between ${exports.DESIGN_CONSTRAINTS.MIN_SLIDE_DURATION_SECONDS} and ${exports.DESIGN_CONSTRAINTS.MAX_SLIDE_DURATION_SECONDS} seconds.`);
        }
        if (!Array.isArray(slide.elements)) {
            errors.push(`Slide #${sIdx + 1} elements must be an array.`);
            return;
        }
        if (slide.elements.length > exports.DESIGN_CONSTRAINTS.MAX_ELEMENTS_PER_SLIDE) {
            errors.push(`Slide #${sIdx + 1} exceeds maximum element count of ${exports.DESIGN_CONSTRAINTS.MAX_ELEMENTS_PER_SLIDE} (has ${slide.elements.length}).`);
        }
        let videoCount = 0;
        const elementIds = new Set();
        slide.elements.forEach((el, eIdx) => {
            if (!el.id || typeof el.id !== 'string') {
                errors.push(`Slide #${sIdx + 1} Element #${eIdx + 1} is missing an id.`);
            }
            else if (elementIds.has(el.id)) {
                errors.push(`Slide #${sIdx + 1} has duplicate element id: ${el.id}`);
            }
            else {
                elementIds.add(el.id);
            }
            if (!Number.isFinite(el.x) ||
                !Number.isFinite(el.y) ||
                !Number.isFinite(el.width) ||
                !Number.isFinite(el.height) ||
                el.width <= 0 ||
                el.height <= 0) {
                errors.push(`Slide #${sIdx + 1} Element ${el.id || eIdx + 1} has invalid geometry (w, h must be > 0 and coordinates finite).`);
            }
            if (el.type === 'video') {
                videoCount++;
                if (!el.assetId || typeof el.assetId !== 'string') {
                    errors.push(`Slide #${sIdx + 1} Video element ${el.id} is missing an assetId.`);
                }
            }
            else if (el.type === 'image') {
                if (!el.assetId || typeof el.assetId !== 'string') {
                    errors.push(`Slide #${sIdx + 1} Image element ${el.id} is missing an assetId.`);
                }
            }
            else if (el.type === 'text') {
                if (typeof el.content !== 'string') {
                    errors.push(`Slide #${sIdx + 1} Text element ${el.id} is missing content.`);
                }
                if (el.fontFamily &&
                    !exports.DESIGN_CONSTRAINTS.SUPPORTED_FONT_FAMILIES.includes(el.fontFamily)) {
                    errors.push(`Slide #${sIdx + 1} Text element ${el.id} uses unsupported font: ${el.fontFamily}`);
                }
            }
            else if (el.type === 'shape') {
                if (!['rectangle', 'rounded_rectangle', 'ellipse', 'line'].includes(el.shapeType)) {
                    errors.push(`Slide #${sIdx + 1} Shape element ${el.id} has unknown shapeType: ${el.shapeType}`);
                }
            }
            else {
                errors.push(`Slide #${sIdx + 1} Element ${el?.id || eIdx + 1} has unknown type: ${el?.type}`);
            }
        });
        if (videoCount > exports.DESIGN_CONSTRAINTS.MAX_VIDEOS_PER_SLIDE) {
            errors.push(`Slide #${sIdx + 1} has ${videoCount} video elements. Maximum allowed is ${exports.DESIGN_CONSTRAINTS.MAX_VIDEOS_PER_SLIDE}.`);
        }
    });
    return { valid: errors.length === 0, errors };
}
/**
 * Extracts unique referenced asset IDs from a DesignDocument.
 */
function extractReferencedAssetIds(doc) {
    const ids = new Set();
    if (!doc?.slides)
        return [];
    for (const slide of doc.slides) {
        if (slide.background?.type === 'asset' && slide.background.assetId) {
            ids.add(slide.background.assetId);
        }
        if (Array.isArray(slide.elements)) {
            for (const el of slide.elements) {
                if ((el.type === 'image' || el.type === 'video') && el.assetId) {
                    ids.add(el.assetId);
                }
            }
        }
    }
    return Array.from(ids);
}
/**
 * Deterministically converts any UTC/ISO date string into exact Asia/Kolkata (UTC+05:30) components.
 * Independent of the host system timezone.
 */
function getKolkataTimeComponents(isoOrDate) {
    const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
    const utcMs = date.getTime();
    const kolkataOffsetMs = (5 * 60 + 30) * 60 * 1000;
    const kDate = new Date(utcMs + kolkataOffsetMs);
    const year = kDate.getUTCFullYear();
    const month = String(kDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(kDate.getUTCDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    const dayOfWeek = kDate.getUTCDay();
    const hours = kDate.getUTCHours();
    const minutes = kDate.getUTCMinutes();
    const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    return { year, month, day, dateString, dayOfWeek, hours, minutes, timeString };
}
/**
 * Checks whether a single ScheduleRule is active at a given target date and time in Asia/Kolkata.
 */
function isScheduleRuleActiveAtTime(rule, kTime, targetIso) {
    // Check overall date validity window [startDate, endDate]
    if (kTime.dateString < rule.startDate || kTime.dateString > rule.endDate) {
        // If it's overnight and we are in early morning (< endTime), yesterday might be within [startDate, endDate]
        if (rule.isOvernight && kTime.timeString < rule.endTime) {
            const yesterday = new Date(new Date(targetIso).getTime() - 24 * 60 * 60 * 1000);
            const yTime = getKolkataTimeComponents(yesterday);
            if (yTime.dateString < rule.startDate || yTime.dateString > rule.endDate) {
                return false;
            }
        }
        else {
            return false;
        }
    }
    // Check Admin override expiry if priority is 10
    if (rule.priority === 10) {
        if (!rule.overrideExpiresAt)
            return false;
        if (new Date(targetIso).getTime() > new Date(rule.overrideExpiresAt).getTime()) {
            return false;
        }
    }
    if (rule.scheduleType === 'one_time') {
        if (rule.startDate === rule.endDate) {
            if (kTime.dateString !== rule.startDate)
                return false;
            return kTime.timeString >= rule.startTime && kTime.timeString < rule.endTime;
        }
        else {
            // Multi-day one-time window
            const startIso = `${rule.startDate}T${rule.startTime}:00+05:30`;
            const endIso = `${rule.endDate}T${rule.endTime}:00+05:30`;
            const targetMs = new Date(targetIso).getTime();
            return targetMs >= new Date(startIso).getTime() && targetMs < new Date(endIso).getTime();
        }
    }
    // Recurring schedule
    if (!rule.isOvernight) {
        // Daytime window on matching days of week
        if (!rule.daysOfWeek.includes(kTime.dayOfWeek))
            return false;
        return kTime.timeString >= rule.startTime && kTime.timeString < rule.endTime;
    }
    else {
        // Overnight window (e.g. 22:00 to 06:00)
        // 1. Current time is >= startTime (belongs to today's recurrence)
        if (kTime.timeString >= rule.startTime) {
            return rule.daysOfWeek.includes(kTime.dayOfWeek);
        }
        // 2. Current time is < endTime (belongs to yesterday's recurrence)
        if (kTime.timeString < rule.endTime) {
            const yesterdayDayOfWeek = (kTime.dayOfWeek + 6) % 7;
            return rule.daysOfWeek.includes(yesterdayDayOfWeek);
        }
        return false;
    }
}
/**
 * Shared schedule evaluator: evaluates what content should play on a digital display at a specific instant.
 * Used by UI preview, conflict detection, publication preparation, and future playback.
 */
function evaluateScheduleAtTime(params) {
    const { schedules, displayId, targetIsoString, displayOrientation, fallbackConfig } = params;
    const kTime = getKolkataTimeComponents(targetIsoString);
    // Filter schedules that target this digital display and are in active/approved state
    const candidateSchedules = schedules.filter((s) => s.targetDisplayIds.includes(displayId) &&
        (s.status === 'active' || s.status === 'approved') &&
        s.orientation === displayOrientation);
    const activeMatches = [];
    for (const s of candidateSchedules) {
        if (isScheduleRuleActiveAtTime(s.scheduleRule, kTime, targetIsoString)) {
            activeMatches.push(s);
        }
    }
    if (activeMatches.length === 0) {
        return {
            status: 'fallback',
            fallbackConfig: fallbackConfig || { type: 'bundled' },
            bundledFallback: getBundledNeutralFallback(displayOrientation),
        };
    }
    // Sort by priority descending
    activeMatches.sort((a, b) => b.scheduleRule.priority - a.scheduleRule.priority);
    const firstMatch = activeMatches[0];
    if (!firstMatch) {
        return {
            status: 'fallback',
            fallbackConfig: fallbackConfig || { type: 'bundled' },
            bundledFallback: getBundledNeutralFallback(displayOrientation),
        };
    }
    const highestPriority = firstMatch.scheduleRule.priority;
    const highestMatches = activeMatches.filter((s) => s.scheduleRule.priority === highestPriority);
    if (highestMatches.length > 1) {
        return {
            status: 'conflict',
            conflictingSchedules: highestMatches,
            message: `Conflict detected on digital display ${displayId}: ${highestMatches.length} schedules overlap with equal priority (${highestPriority}) at ${kTime.dateString} ${kTime.timeString} (Asia/Kolkata).`,
        };
    }
    const winner = highestMatches[0] || firstMatch;
    return {
        status: 'active',
        schedule: winner,
        isAdminOverride: winner.scheduleRule.priority === 10,
    };
}
/**
 * Scans schedules across their validity span to detect equal-priority collisions on a digital display.
 */
function detectScheduleConflicts(schedules, displayId, displayOrientation) {
    const conflicts = [];
    const activeSchedules = schedules.filter((s) => s.targetDisplayIds.includes(displayId) &&
        (s.status === 'active' || s.status === 'approved') &&
        s.orientation === displayOrientation);
    if (activeSchedules.length < 2) {
        return { hasConflict: false, conflicts: [] };
    }
    // Determine span of dates to sample
    let minDate = '9999-12-31';
    let maxDate = '0000-01-01';
    for (const s of activeSchedules) {
        if (s.scheduleRule.startDate < minDate)
            minDate = s.scheduleRule.startDate;
        if (s.scheduleRule.endDate > maxDate)
            maxDate = s.scheduleRule.endDate;
    }
    // Sample check boundaries and intermediate points
    const timePoints = [
        '00:00', '06:00', '08:00', '09:00', '12:00', '13:00', '15:00', '17:00', '18:00', '21:00', '22:00', '23:30',
    ];
    // Collect distinct dates to check (up to 30 days ahead from today or span)
    const today = getKolkataTimeComponents(new Date()).dateString;
    const startCheck = minDate > today ? minDate : today;
    const datesToCheck = [];
    const startDateObj = new Date(`${startCheck}T00:00:00+05:30`);
    for (let i = 0; i < 30; i++) {
        const cur = new Date(startDateObj.getTime() + i * 24 * 60 * 60 * 1000);
        const kCur = getKolkataTimeComponents(cur);
        if (kCur.dateString > maxDate)
            break;
        datesToCheck.push(kCur.dateString);
    }
    for (const d of datesToCheck) {
        for (const t of timePoints) {
            const iso = `${d}T${t}:00+05:30`;
            const evalResult = evaluateScheduleAtTime({
                schedules: activeSchedules,
                displayId,
                targetIsoString: iso,
                displayOrientation,
            });
            if (evalResult.status === 'conflict') {
                const ids = evalResult.conflictingSchedules.map((s) => s.id);
                const alreadyFound = conflicts.some((c) => c.displayId === displayId && c.conflictingScheduleIds.sort().join() === ids.sort().join());
                if (!alreadyFound) {
                    conflicts.push({
                        date: d,
                        time: t,
                        displayId,
                        conflictingScheduleIds: ids,
                        conflictingTitles: evalResult.conflictingSchedules.map((s) => s.title),
                        priority: evalResult.conflictingSchedules[0]?.scheduleRule.priority ?? 5,
                    });
                }
            }
        }
    }
    return {
        hasConflict: conflicts.length > 0,
        conflicts,
    };
}
/**
 * Validates a ScheduleRule for consistency and completeness.
 */
function validateScheduleRule(rule) {
    const errors = [];
    if (!rule.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(rule.startDate)) {
        errors.push('Start date must be in YYYY-MM-DD format.');
    }
    if (!rule.endDate || !/^\d{4}-\d{2}-\d{2}$/.test(rule.endDate)) {
        errors.push('End date must be in YYYY-MM-DD format.');
    }
    if (rule.startDate && rule.endDate && rule.startDate > rule.endDate) {
        errors.push('Start date cannot be after end date.');
    }
    if (!rule.startTime || !/^\d{2}:\d{2}$/.test(rule.startTime)) {
        errors.push('Start time must be in HH:mm format.');
    }
    if (!rule.endTime || !/^\d{2}:\d{2}$/.test(rule.endTime)) {
        errors.push('End time must be in HH:mm format.');
    }
    if (rule.startTime === rule.endTime) {
        errors.push('Start time and end time cannot be identical.');
    }
    if (rule.scheduleType === 'recurring') {
        if (!Array.isArray(rule.daysOfWeek) || rule.daysOfWeek.length === 0) {
            errors.push('Recurring schedules must select at least one day of the week.');
        }
        else if (rule.daysOfWeek.some((d) => d < 0 || d > 6)) {
            errors.push('Days of the week must be integers between 0 (Sunday) and 6 (Saturday).');
        }
    }
    if (rule.priority < 1 || rule.priority > 10) {
        errors.push('Priority must be an integer between 1 and 10.');
    }
    if (rule.priority === 10) {
        if (!rule.overrideExpiresAt) {
            errors.push('Admin emergency overrides (priority 10) must specify a mandatory expiration timestamp.');
        }
    }
    return { valid: errors.length === 0, errors };
}
/**
 * Validates playlist items for orientation compatibility and non-empty items.
 */
function validatePlaylist(playlist) {
    const errors = [];
    if (!playlist.title || playlist.title.trim().length === 0) {
        errors.push('Playlist title cannot be blank.');
    }
    if (playlist.items.length === 0) {
        errors.push('Playlist must contain at least one visual design.');
    }
    const incompatible = playlist.items.filter((item) => item.orientation !== playlist.orientation);
    if (incompatible.length > 0) {
        const firstBad = incompatible[0]?.orientation || 'incompatible';
        errors.push(`This playlist is formatted for ${playlist.orientation} digital displays. To broadcast ${firstBad} designs, please create a separate playlist with matching orientation.`);
    }
    return { valid: errors.length === 0, errors };
}
/**
 * Returns a bundled neutral corporate fallback slide when no custom fallback is provisioned.
 * Guarantees that digital displays never encounter black or unrenderable states.
 */
function getBundledNeutralFallback(orientation) {
    return {
        title: 'Aura DIMS Corporate Neutral Fallback',
        slides: [
            {
                id: 'fallback-slide-default',
                durationSeconds: 15,
                background: {
                    type: 'gradient',
                    value: 'linear-gradient(135deg, #090d16 0%, #0f172a 100%)',
                },
                elements: [
                    {
                        id: 'fallback-brand-title',
                        name: 'Brand Title',
                        type: 'text',
                        content: 'Aura DIMS',
                        x: orientation === 'landscape' ? 120 : 80,
                        y: orientation === 'landscape' ? 440 : 800,
                        width: orientation === 'landscape' ? 1680 : 920,
                        height: 120,
                        rotation: 0,
                        opacity: 1,
                        zIndex: 1,
                        fontSize: orientation === 'landscape' ? 72 : 56,
                        fontFamily: 'Inter',
                        fontWeight: 700,
                        color: '#14b8a6',
                        textAlign: 'center',
                        lineHeight: 1.2,
                        letterSpacing: 0,
                        language: 'en',
                    },
                    {
                        id: 'fallback-company-subtitle',
                        name: 'Company Subtitle',
                        type: 'text',
                        content: 'Aurainteract Private Limited • Enterprise Digital Signage',
                        x: orientation === 'landscape' ? 120 : 80,
                        y: orientation === 'landscape' ? 580 : 940,
                        width: orientation === 'landscape' ? 1680 : 920,
                        height: 60,
                        rotation: 0,
                        opacity: 0.8,
                        zIndex: 2,
                        fontSize: orientation === 'landscape' ? 28 : 24,
                        fontFamily: 'Inter',
                        fontWeight: 400,
                        color: '#94a3b8',
                        textAlign: 'center',
                        lineHeight: 1.2,
                        letterSpacing: 0,
                        language: 'en',
                    },
                ],
            },
        ],
    };
}
//# sourceMappingURL=index.js.map