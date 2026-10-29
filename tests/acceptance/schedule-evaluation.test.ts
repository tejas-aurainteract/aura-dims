/**
 * Aura DIMS - Schedule Evaluator Acceptance Test Suite
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Verifies the shared Asia/Kolkata schedule evaluator against all boundary conditions:
 * - Inclusive starts and exclusive ends
 * - Recurring weekdays
 * - Overnight windows
 * - Overall validity dates
 * - Controlled clock timezones
 * - Expiry
 * - Admin overrides and override expiry
 * - Equal-priority conflicts
 * - Neutral corporate fallback selection
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateScheduleAtTime,
  isScheduleRuleActiveAtTime,
  detectScheduleConflicts,
  getBundledNeutralFallback,
  getKolkataTimeComponents,
  type ScheduleRecord,
  type ScheduleRule,
} from '@aura-dims/display-schema';

describe('Aura DIMS - Asia/Kolkata Schedule Evaluator Boundary Suite', () => {
  const DISPLAY_ID = 'disp-acceptance-01';

  function createMockSchedule(params: {
    id: string;
    title: string;
    rule: Partial<ScheduleRule>;
    priority?: number;
    status?: 'draft' | 'awaiting_approval' | 'approved' | 'active';
  }): ScheduleRecord {
    const fullRule: ScheduleRule = {
      scheduleType: 'recurring',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      startTime: '09:00',
      endTime: '18:00',
      isOvernight: false,
      daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
      priority: params.priority ?? 5,
      timezone: 'Asia/Kolkata',
      ...params.rule,
    };

    return {
      id: params.id,
      title: params.title,
      playlistRevisionId: `prev-${params.id}`,
      departmentId: 'dept-mfg',
      targetDisplayIds: [DISPLAY_ID],
      orientation: 'landscape',
      scheduleRule: fullRule,
      fallbackConfig: { type: 'bundled' },
      status: params.status ?? 'active',
      ownerId: 'user-admin',
      ownerDisplayName: 'System Administrator',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };
  }

  // ---------------------------------------------------------------------------
  // 1. Inclusive Start and Exclusive End
  // ---------------------------------------------------------------------------
  describe('1. Inclusive Start and Exclusive End Boundaries', () => {
    const schedule = createMockSchedule({
      id: 'sched-daytime',
      title: 'Standard Workday Broadcast',
      rule: {
        startDate: '2026-10-15',
        endDate: '2026-10-15',
        startTime: '09:00',
        endTime: '17:00',
        scheduleType: 'one_time',
      },
    });

    it('is inactive 1 second before start time (08:59:59 IST)', () => {
      // 08:59:59 IST = 03:29:59 UTC
      const iso = '2026-10-15T03:29:59.000Z';
      const res = evaluateScheduleAtTime({
        schedules: [schedule],
        displayId: DISPLAY_ID,
        targetIsoString: iso,
        displayOrientation: 'landscape',
      });
      expect(res.status).toBe('fallback');
    });

    it('is active at exact start time (09:00:00 IST)', () => {
      // 09:00:00 IST = 03:30:00 UTC
      const iso = '2026-10-15T03:30:00.000Z';
      const res = evaluateScheduleAtTime({
        schedules: [schedule],
        displayId: DISPLAY_ID,
        targetIsoString: iso,
        displayOrientation: 'landscape',
      });
      expect(res.status).toBe('active');
      if (res.status === 'active') {
        expect(res.schedule.id).toBe('sched-daytime');
      }
    });

    it('is active during the window (12:00:00 IST)', () => {
      // 12:00:00 IST = 06:30:00 UTC
      const iso = '2026-10-15T06:30:00.000Z';
      const res = evaluateScheduleAtTime({
        schedules: [schedule],
        displayId: DISPLAY_ID,
        targetIsoString: iso,
        displayOrientation: 'landscape',
      });
      expect(res.status).toBe('active');
    });

    it('is active 1 minute before end time (16:59:00 IST)', () => {
      // 16:59:00 IST = 11:29:00 UTC
      const iso = '2026-10-15T11:29:00.000Z';
      const res = evaluateScheduleAtTime({
        schedules: [schedule],
        displayId: DISPLAY_ID,
        targetIsoString: iso,
        displayOrientation: 'landscape',
      });
      expect(res.status).toBe('active');
    });

    it('is exclusive and drops to fallback at exact end time (17:00:00 IST)', () => {
      // 17:00:00 IST = 11:30:00 UTC
      const iso = '2026-10-15T11:30:00.000Z';
      const res = evaluateScheduleAtTime({
        schedules: [schedule],
        displayId: DISPLAY_ID,
        targetIsoString: iso,
        displayOrientation: 'landscape',
      });
      expect(res.status).toBe('fallback');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Weekday Recurrence
  // ---------------------------------------------------------------------------
  describe('2. Weekday Recurrence and Weekend Exclusion', () => {
    const weekdaySched = createMockSchedule({
      id: 'sched-weekdays',
      title: 'Mon to Fri Shift Notice',
      rule: {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        startTime: '08:00',
        endTime: '16:00',
        daysOfWeek: [1, 2, 3, 4, 5], // Monday (1) to Friday (5)
        scheduleType: 'recurring',
        isOvernight: false,
      },
    });

    it('plays on Monday afternoon (2026-10-12 14:00 IST)', () => {
      // 2026-10-12 is Monday. 14:00 IST = 08:30 UTC
      const iso = '2026-10-12T08:30:00.000Z';
      const res = evaluateScheduleAtTime({
        schedules: [weekdaySched],
        displayId: DISPLAY_ID,
        targetIsoString: iso,
        displayOrientation: 'landscape',
      });
      expect(res.status).toBe('active');
    });

    it('plays on Friday morning (2026-10-16 09:15 IST)', () => {
      // 2026-10-16 is Friday. 09:15 IST = 03:45 UTC
      const iso = '2026-10-16T03:45:00.000Z';
      const res = evaluateScheduleAtTime({
        schedules: [weekdaySched],
        displayId: DISPLAY_ID,
        targetIsoString: iso,
        displayOrientation: 'landscape',
      });
      expect(res.status).toBe('active');
    });

    it('falls back on Saturday (2026-10-17 11:00 IST)', () => {
      // 2026-10-17 is Saturday. 11:00 IST = 05:30 UTC
      const iso = '2026-10-17T05:30:00.000Z';
      const res = evaluateScheduleAtTime({
        schedules: [weekdaySched],
        displayId: DISPLAY_ID,
        targetIsoString: iso,
        displayOrientation: 'landscape',
      });
      expect(res.status).toBe('fallback');
    });

    it('falls back on Sunday (2026-10-18 11:00 IST)', () => {
      // 2026-10-18 is Sunday. 11:00 IST = 05:30 UTC
      const iso = '2026-10-18T05:30:00.000Z';
      const res = evaluateScheduleAtTime({
        schedules: [weekdaySched],
        displayId: DISPLAY_ID,
        targetIsoString: iso,
        displayOrientation: 'landscape',
      });
      expect(res.status).toBe('fallback');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Overnight Recurring Windows
  // ---------------------------------------------------------------------------
  describe('3. Overnight Window Handling & Cross-Midnight Day Attribution', () => {
    // Mon night to Tue morning (scheduled for Monday dayOfWeek=1, 22:00 to 06:00)
    const nightShiftSched = createMockSchedule({
      id: 'sched-night-shift',
      title: 'Night Shift Broadcast',
      rule: {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        startTime: '22:00',
        endTime: '06:00',
        daysOfWeek: [1], // Monday only
        scheduleType: 'recurring',
        isOvernight: true,
      },
    });

    it('is active on Monday night at 23:30 IST (starts on Monday)', () => {
      // 2026-10-12 is Monday. 23:30 IST = 18:00 UTC
      const iso = '2026-10-12T18:00:00.000Z';
      const res = evaluateScheduleAtTime({
        schedules: [nightShiftSched],
        displayId: DISPLAY_ID,
        targetIsoString: iso,
        displayOrientation: 'landscape',
      });
      expect(res.status).toBe('active');
    });

    it('remains active in early Tuesday morning at 03:30 IST (attributed to Monday recurrence)', () => {
      // 2026-10-13 is Tuesday. 03:30 IST = 22:00 UTC on 2026-10-12
      const iso = '2026-10-12T22:00:00.000Z';
      const res = evaluateScheduleAtTime({
        schedules: [nightShiftSched],
        displayId: DISPLAY_ID,
        targetIsoString: iso,
        displayOrientation: 'landscape',
      });
      expect(res.status).toBe('active');
    });

    it('terminates at 06:00 IST on Tuesday morning', () => {
      // 2026-10-13 06:00 IST = 00:30 UTC on 2026-10-13
      const iso = '2026-10-13T00:30:00.000Z';
      const res = evaluateScheduleAtTime({
        schedules: [nightShiftSched],
        displayId: DISPLAY_ID,
        targetIsoString: iso,
        displayOrientation: 'landscape',
      });
      expect(res.status).toBe('fallback');
    });

    it('does NOT activate on Tuesday night at 23:30 IST (Tuesday is not in daysOfWeek)', () => {
      // 2026-10-13 is Tuesday. 23:30 IST = 18:00 UTC on 2026-10-13
      const iso = '2026-10-13T18:00:00.000Z';
      const res = evaluateScheduleAtTime({
        schedules: [nightShiftSched],
        displayId: DISPLAY_ID,
        targetIsoString: iso,
        displayOrientation: 'landscape',
      });
      expect(res.status).toBe('fallback');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Overall Validity Dates and Expiry
  // ---------------------------------------------------------------------------
  describe('4. Overall Validity Dates and Expiry Bounds', () => {
    const validWindowSched = createMockSchedule({
      id: 'sched-october',
      title: 'October Campaign',
      rule: {
        startDate: '2026-10-10',
        endDate: '2026-10-20',
        startTime: '09:00',
        endTime: '18:00',
        daysOfWeek: [1, 2, 3, 4, 5],
        scheduleType: 'recurring',
        isOvernight: false,
      },
    });

    it('rejects dates before startDate (2026-10-09 10:00 IST)', () => {
      const iso = '2026-10-09T04:30:00.000Z';
      const res = evaluateScheduleAtTime({
        schedules: [validWindowSched],
        displayId: DISPLAY_ID,
        targetIsoString: iso,
        displayOrientation: 'landscape',
      });
      expect(res.status).toBe('fallback');
    });

    it('accepts dates within [startDate, endDate] (2026-10-15 10:00 IST)', () => {
      const iso = '2026-10-15T04:30:00.000Z';
      const res = evaluateScheduleAtTime({
        schedules: [validWindowSched],
        displayId: DISPLAY_ID,
        targetIsoString: iso,
        displayOrientation: 'landscape',
      });
      expect(res.status).toBe('active');
    });

    it('rejects dates after endDate (2026-10-21 10:00 IST)', () => {
      const iso = '2026-10-21T04:30:00.000Z';
      const res = evaluateScheduleAtTime({
        schedules: [validWindowSched],
        displayId: DISPLAY_ID,
        targetIsoString: iso,
        displayOrientation: 'landscape',
      });
      expect(res.status).toBe('fallback');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Admin Emergency Override and Expiry
  // ---------------------------------------------------------------------------
  describe('5. Admin Emergency Override (Priority 10) & Automatic Expiry', () => {
    const standardSched = createMockSchedule({
      id: 'sched-standard',
      title: 'Standard Operational Loop',
      priority: 5,
      rule: {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        startTime: '00:00',
        endTime: '23:59',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        scheduleType: 'recurring',
      },
    });

    const emergencyOverride = createMockSchedule({
      id: 'sched-emergency',
      title: 'Evacuation Drill Emergency Override',
      priority: 10,
      rule: {
        startDate: '2026-10-15',
        endDate: '2026-10-15',
        startTime: '10:00',
        endTime: '12:00',
        scheduleType: 'one_time',
        overrideExpiresAt: '2026-10-15T06:00:00.000Z', // 11:30 IST
      },
    });

    it('standard schedule plays before emergency window (09:45 IST)', () => {
      // 09:45 IST = 04:15 UTC
      const iso = '2026-10-15T04:15:00.000Z';
      const res = evaluateScheduleAtTime({
        schedules: [standardSched, emergencyOverride],
        displayId: DISPLAY_ID,
        targetIsoString: iso,
        displayOrientation: 'landscape',
      });
      expect(res.status).toBe('active');
      if (res.status === 'active') {
        expect(res.schedule.id).toBe('sched-standard');
        expect(res.isAdminOverride).toBe(false);
      }
    });

    it('emergency override immediately preempts standard broadcast at 10:15 IST', () => {
      // 10:15 IST = 04:45 UTC
      const iso = '2026-10-15T04:45:00.000Z';
      const res = evaluateScheduleAtTime({
        schedules: [standardSched, emergencyOverride],
        displayId: DISPLAY_ID,
        targetIsoString: iso,
        displayOrientation: 'landscape',
      });
      expect(res.status).toBe('active');
      if (res.status === 'active') {
        expect(res.schedule.id).toBe('sched-emergency');
        expect(res.isAdminOverride).toBe(true);
      }
    });

    it('automatically drops back to standard broadcast once overrideExpiresAt is reached (11:31 IST)', () => {
      // 11:31 IST = 06:01 UTC (after 06:00:00.000Z expiry)
      const iso = '2026-10-15T06:01:00.000Z';
      const res = evaluateScheduleAtTime({
        schedules: [standardSched, emergencyOverride],
        displayId: DISPLAY_ID,
        targetIsoString: iso,
        displayOrientation: 'landscape',
      });
      expect(res.status).toBe('active');
      if (res.status === 'active') {
        expect(res.schedule.id).toBe('sched-standard');
        expect(res.isAdminOverride).toBe(false);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Equal-Priority Conflict Resolution
  // ---------------------------------------------------------------------------
  describe('6. Equal-Priority Conflict Detection & Neutral Corporate Fallback', () => {
    const schedA = createMockSchedule({
      id: 'sched-marketing',
      title: 'Marketing Product Showcase',
      priority: 5,
      rule: {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        startTime: '10:00',
        endTime: '14:00',
        daysOfWeek: [1, 2, 3, 4, 5],
        scheduleType: 'recurring',
      },
    });

    const schedB = createMockSchedule({
      id: 'sched-hr',
      title: 'HR Employee Benefits Notice',
      priority: 5,
      rule: {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        startTime: '12:00',
        endTime: '16:00',
        daysOfWeek: [1, 2, 3, 4, 5],
        scheduleType: 'recurring',
      },
    });

    it('marketing plays cleanly before 12:00 IST', () => {
      // 11:00 IST = 05:30 UTC
      const iso = '2026-10-15T05:30:00.000Z';
      const res = evaluateScheduleAtTime({
        schedules: [schedA, schedB],
        displayId: DISPLAY_ID,
        targetIsoString: iso,
        displayOrientation: 'landscape',
      });
      expect(res.status).toBe('active');
      if (res.status === 'active') {
        expect(res.schedule.id).toBe('sched-marketing');
      }
    });

    it('returns conflict status during overlapping interval (13:00 IST)', () => {
      // 13:00 IST = 07:30 UTC
      const iso = '2026-10-15T07:30:00.000Z';
      const res = evaluateScheduleAtTime({
        schedules: [schedA, schedB],
        displayId: DISPLAY_ID,
        targetIsoString: iso,
        displayOrientation: 'landscape',
      });
      expect(res.status).toBe('conflict');
      if (res.status === 'conflict') {
        expect(res.conflictingSchedules.length).toBe(2);
      }
    });

    it('detectScheduleConflicts scanner flags the collision window', () => {
      const scan = detectScheduleConflicts([schedA, schedB], DISPLAY_ID, 'landscape');
      expect(scan.hasConflict).toBe(true);
      expect(scan.conflicts.length).toBeGreaterThan(0);
      expect(scan.conflicts[0]?.priority).toBe(5);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Timezone Independence (UTC+05:30 Asia/Kolkata)
  // ---------------------------------------------------------------------------
  describe('7. Timezone Determinism (Hardware Clock Asia/Kolkata)', () => {
    it('getKolkataTimeComponents accurately computes IST regardless of machine environment', () => {
      // 2026-10-29T13:00:00.000Z is 18:30:00 IST (+05:30)
      const parsed = getKolkataTimeComponents('2026-10-29T13:00:00.000Z');
      expect(parsed.dateString).toBe('2026-10-29');
      expect(parsed.timeString).toBe('18:30');
      expect(parsed.hours).toBe(18);
      expect(parsed.minutes).toBe(30);
    });

    it('returns valid corporate neutral fallback for both Landscape and Portrait orientations', () => {
      const landscapeFallback = getBundledNeutralFallback('landscape');
      expect(landscapeFallback.slides.length).toBeGreaterThan(0);
      expect(landscapeFallback.slides[0]?.elements.length).toBeGreaterThan(0);

      const portraitFallback = getBundledNeutralFallback('portrait');
      expect(portraitFallback.slides.length).toBeGreaterThan(0);
      expect(portraitFallback.slides[0]?.elements.length).toBeGreaterThan(0);
    });
  });
});

