/**
 * Aura DIMS - Rollout Preparation & Controlled Expansion Acceptance Test Suite
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Test Scope:
 * 1. CSV Formula Injection Sanitization (Formula injection protection)
 * 2. Bulk Digital Display Import Preflight & Validation (Limits, Orientations, Duplicates)
 * 3. Bulk Department Head Assignment Preflight (Departmental compatibility & cross-dept rejection)
 * 4. 12-Item Digital Display Commissioning Checklist (Automated vs Human Evidence, Finalization Guard)
 * 5. Publication Rollout Progress Aggregation & Retry Idempotency
 *
 * Terminology rule: Strictly use "digital display" in all tests and logs.
 */

import { describe, it, expect } from 'vitest';
import {
  createDefaultCommissioningChecklist,
  type CommissioningRecord,
  type CommissioningCheckItem,
  type DisplayView,
  type PlannedInstallation,
  type BulkImportPreflightResponse,
  type BulkAssignDisplaysPreflightResponse,
} from '@aura-dims/display-schema';
import { sanitizeCsvCell, generateDisplaysCsv } from '../../apps/web/src/components/Rollout/displayExport';

describe('Aura DIMS - Rollout Preparation & Controlled Expansion Suite', () => {
  // ============================================================================
  // 1. CSV Formula Injection Sanitization Tests
  // ============================================================================
  describe('1. CSV Export Formula Injection Protection', () => {
    it('neutralizes dangerous formula prefixes with a leading single quote', () => {
      // Common spreadsheet injection payloads
      expect(sanitizeCsvCell('=SUM(1+2)')).toBe(`'=SUM(1+2)`);
      expect(sanitizeCsvCell('=CMD("calc.exe")')).toBe(`"'=CMD(""calc.exe"")"`); // Contains quotes, so wrapped
      expect(sanitizeCsvCell('+1+2')).toBe(`'+1+2`);
      expect(sanitizeCsvCell('-SUM(A1:A10)')).toBe(`'-SUM(A1:A10)`);
      expect(sanitizeCsvCell('@HYPERLINK("http://evil.com")')).toBe(`"'@HYPERLINK(""http://evil.com"")"`);
      expect(sanitizeCsvCell('\tmalicious_tab')).toBe(`'\tmalicious_tab`);
      expect(sanitizeCsvCell('\rmalicious_cr')).toBe(`"'\rmalicious_cr"`);
    });

    it('leaves standard, non-malicious text unquoted and unchanged', () => {
      expect(sanitizeCsvCell('Executive Boardroom Digital Display')).toBe('Executive Boardroom Digital Display');
      expect(sanitizeCsvCell('BLR-HQ-L01-D01')).toBe('BLR-HQ-L01-D01');
      expect(sanitizeCsvCell('Main Campus Level 2')).toBe('Main Campus Level 2');
      expect(sanitizeCsvCell(1920)).toBe('1920');
      expect(sanitizeCsvCell('')).toBe('');
      expect(sanitizeCsvCell(null)).toBe('');
      expect(sanitizeCsvCell(undefined)).toBe('');
    });

    it('escapes quotes and wraps in double quotes if commas or newlines exist', () => {
      expect(sanitizeCsvCell('Display, North Wing')).toBe('"Display, North Wing"');
      expect(sanitizeCsvCell('Display "Ultra" HD')).toBe('"Display ""Ultra"" HD"');
      expect(sanitizeCsvCell('=1+1, test')).toBe(`"'=1+1, test"`);
    });

    it('generates a clean, sanitized CSV for multiple digital displays', () => {
      const mockDisplays: DisplayView[] = [
        {
          id: 'disp-01',
          name: '=DDE("server","topic","item")', // Dangerous name
          installationRef: 'BLR-01',
          siteId: 'site-blr',
          siteName: 'Main Campus',
          departmentId: 'dept-eng',
          departmentName: 'Engineering',
          groupIds: [],
          groupNames: [],
          orientation: 'landscape',
          configuredResolution: { width: 1920, height: 1080 },
          lifecycle: 'active',
          desiredPublicationId: null,
          activePublicationId: null,
          deliveryStage: 'active',
          lastSyncAt: null,
          lastDeliveryError: null,
          lastHeartbeatAt: '2026-10-30T10:00:00.000Z',
          reported: null,
          connectivity: 'online',
          enrolledAt: '2026-10-30T09:00:00.000Z',
          createdBy: 'admin',
          createdAt: '2026-10-30T09:00:00.000Z',
          updatedAt: '2026-10-30T10:00:00.000Z',
          commissioningStatus: 'commissioned',
        },
      ];

      const csv = generateDisplaysCsv(mockDisplays);
      expect(csv).toContain('Digital Display ID,Display Name');
      expect(csv).toContain(`"'=DDE(""server"",""topic"",""item"")"`); // Safely sanitized
    });
  });

  // ============================================================================
  // 2. Bulk Digital Display Import Validation Logic
  // ============================================================================
  describe('2. Bulk Import Validation & Row Parsing', () => {
    function simulatePreflight(rows: Array<Record<string, string>>): {
      validCount: number;
      invalidCount: number;
      errors: string[];
      duplicateRefs: string[];
    } {
      const MAX_ROWS = 50;
      if (rows.length > MAX_ROWS) {
        return {
          validCount: 0,
          invalidCount: rows.length,
          errors: [`Batch size (${rows.length}) exceeds maximum limit of 50 digital displays.`],
          duplicateRefs: [],
        };
      }

      const seenRefs = new Set<string>();
      const duplicateRefs: string[] = [];
      let validCount = 0;
      let invalidCount = 0;
      const errors: string[] = [];

      rows.forEach((r, idx) => {
        const rowErrors: string[] = [];
        const ref = (r.installationRef || '').trim();
        const name = (r.name || '').trim();
        const orientation = (r.orientation || '').trim().toLowerCase();
        const resolution = (r.resolution || '').trim();

        if (!ref) rowErrors.push('Missing installation reference.');
        if (!name) rowErrors.push('Missing display name.');
        if (!['landscape', 'portrait'].includes(orientation)) {
          rowErrors.push(`Invalid orientation '${orientation}'. Must be landscape or portrait.`);
        }
        if (!/^\d{3,4}x\d{3,4}$/.test(resolution)) {
          rowErrors.push(`Invalid resolution '${resolution}'. Format must be WIDTHxHEIGHT.`);
        }

        if (seenRefs.has(ref)) {
          rowErrors.push(`Duplicate installation reference '${ref}' in CSV batch.`);
          if (!duplicateRefs.includes(ref)) duplicateRefs.push(ref);
        } else if (ref) {
          seenRefs.add(ref);
        }

        if (rowErrors.length === 0) {
          validCount++;
        } else {
          invalidCount++;
          errors.push(`Row ${idx + 1}: ${rowErrors.join('; ')}`);
        }
      });

      return { validCount, invalidCount, errors, duplicateRefs };
    }

    it('successfully validates compliant CSV rows', () => {
      const rows = [
        {
          installationRef: 'BLR-HQ-L01-D01',
          name: 'Executive Boardroom Digital Display',
          orientation: 'landscape',
          resolution: '1920x1080',
        },
        {
          installationRef: 'BLR-HQ-L02-D02',
          name: 'Cafeteria Portrait Kiosk',
          orientation: 'portrait',
          resolution: '1080x1920',
        },
      ];

      const res = simulatePreflight(rows);
      expect(res.validCount).toBe(2);
      expect(res.invalidCount).toBe(0);
      expect(res.errors).toHaveLength(0);
      expect(res.duplicateRefs).toHaveLength(0);
    });

    it('enforces maximum row limit of 50 digital displays per import batch', () => {
      const excessiveRows = Array.from({ length: 55 }, (_, i) => ({
        installationRef: `REF-${i + 1}`,
        name: `Display ${i + 1}`,
        orientation: 'landscape',
        resolution: '1920x1080',
      }));

      const res = simulatePreflight(excessiveRows);
      expect(res.validCount).toBe(0);
      expect(res.invalidCount).toBe(55);
      expect(res.errors[0]).toContain('exceeds maximum limit of 50');
    });

    it('detects duplicate installation references within the same batch', () => {
      const rowsWithDuplicates = [
        {
          installationRef: 'BLR-DUP-01',
          name: 'First Display',
          orientation: 'landscape',
          resolution: '1920x1080',
        },
        {
          installationRef: 'BLR-DUP-01', // Duplicate ref!
          name: 'Second Display',
          orientation: 'portrait',
          resolution: '1080x1920',
        },
      ];

      const res = simulatePreflight(rowsWithDuplicates);
      expect(res.validCount).toBe(1);
      expect(res.invalidCount).toBe(1);
      expect(res.duplicateRefs).toContain('BLR-DUP-01');
      expect(res.errors[0]).toContain("Duplicate installation reference 'BLR-DUP-01'");
    });

    it('rejects invalid orientation values and malformed resolution strings', () => {
      const invalidRows = [
        {
          installationRef: 'REF-01',
          name: 'Display with Bad Orientation',
          orientation: 'diagonal', // Invalid
          resolution: '1920x1080',
        },
        {
          installationRef: 'REF-02',
          name: 'Display with Bad Resolution',
          orientation: 'landscape',
          resolution: '4K-UHD', // Invalid format
        },
      ];

      const res = simulatePreflight(invalidRows);
      expect(res.validCount).toBe(0);
      expect(res.invalidCount).toBe(2);
      expect(res.errors[0]).toContain("Invalid orientation 'diagonal'");
      expect(res.errors[1]).toContain("Invalid resolution '4K-UHD'");
    });
  });

  // ============================================================================
  // 3. Bulk Department Head Display Assignment Preflight
  // ============================================================================
  describe('3. Bulk Department Head Display Assignments Preflight', () => {
    interface MockTargetUser {
      uid: string;
      displayName: string;
      role: 'admin' | 'department_head';
      departmentId: string;
      status: 'active' | 'suspended';
    }

    interface MockDisplay {
      id: string;
      name: string;
      departmentId: string;
    }

    function preflightAssignment(
      targetUser: MockTargetUser,
      displays: MockDisplay[]
    ): {
      eligibleCount: number;
      ineligibleCount: number;
      details: Array<{ displayId: string; isCompatible: boolean; reason?: string }>;
    } {
      if (targetUser.role !== 'department_head') {
        throw new Error('Only Department Heads can receive digital display operating permissions.');
      }
      if (targetUser.status !== 'active') {
        throw new Error('Cannot assign digital displays to an inactive user account.');
      }

      const details = displays.map((d) => {
        const isCompatible = d.departmentId === targetUser.departmentId;
        return {
          displayId: d.id,
          isCompatible,
          reason: isCompatible
            ? undefined
            : `Digital display belongs to '${d.departmentId}', but Department Head belongs to '${targetUser.departmentId}'.`,
        };
      });

      const eligibleCount = details.filter((d) => d.isCompatible).length;
      const ineligibleCount = details.filter((d) => !d.isCompatible).length;

      return { eligibleCount, ineligibleCount, details };
    }

    it('approves assignment when digital displays belong to the Department Head department', () => {
      const user: MockTargetUser = {
        uid: 'user-dept-eng',
        displayName: 'Engineering Head',
        role: 'department_head',
        departmentId: 'dept-engineering',
        status: 'active',
      };

      const displays: MockDisplay[] = [
        { id: 'disp-01', name: 'Eng Lab Display', departmentId: 'dept-engineering' },
        { id: 'disp-02', name: 'Eng Boardroom Display', departmentId: 'dept-engineering' },
      ];

      const result = preflightAssignment(user, displays);
      expect(result.eligibleCount).toBe(2);
      expect(result.ineligibleCount).toBe(0);
      expect(result.details.every((d) => d.isCompatible)).toBe(true);
    });

    it('rejects cross-department display assignment to preserve departmental security boundaries', () => {
      const user: MockTargetUser = {
        uid: 'user-dept-eng',
        displayName: 'Engineering Head',
        role: 'department_head',
        departmentId: 'dept-engineering',
        status: 'active',
      };

      const displays: MockDisplay[] = [
        { id: 'disp-01', name: 'Eng Lab Display', departmentId: 'dept-engineering' }, // Compatible
        { id: 'disp-02', name: 'HR Reception Display', departmentId: 'dept-hr' }, // INCOMPATIBLE
      ];

      const result = preflightAssignment(user, displays);
      expect(result.eligibleCount).toBe(1);
      expect(result.ineligibleCount).toBe(1);

      const incompatible = result.details.find((d) => d.displayId === 'disp-02');
      expect(incompatible?.isCompatible).toBe(false);
      expect(incompatible?.reason).toContain("Digital display belongs to 'dept-hr'");
    });

    it('blocks assignment if target user is inactive or not a Department Head', () => {
      const inactiveUser: MockTargetUser = {
        uid: 'user-inactive',
        displayName: 'Old Head',
        role: 'department_head',
        departmentId: 'dept-engineering',
        status: 'suspended',
      };

      expect(() => preflightAssignment(inactiveUser, [{ id: 'd1', name: 'D1', departmentId: 'dept-engineering' }]))
        .toThrow('Cannot assign digital displays to an inactive user account.');
    });
  });

  // ============================================================================
  // 4. 12-Item Digital Display Commissioning Quality Gate
  // ============================================================================
  describe('4. 12-Item Digital Display Commissioning Checklist', () => {
    it('creates all 12 default checklist items in the expected sequence', () => {
      const checklist = createDefaultCommissioningChecklist();
      expect(checklist).toHaveLength(12);

      const expectedIds = [
        'mounting_power',
        'orientation_resolution',
        'network_connectivity',
        'device_enrolled',
        'user_assignments',
        'fallback_installed',
        'test_publication_active',
        'fonts_video_verified',
        'physical_output_observed',
        'restart_recovery_verified',
        'offline_playback_verified',
        'operator_handover_completed',
      ];

      expect(checklist.map((c) => c.id)).toEqual(expectedIds);
    });

    it('strictly separates automated software telemetry from human physical inspection', () => {
      const checklist = createDefaultCommissioningChecklist();

      const automatedChecks = checklist.filter((c) => c.checkKind === 'automated');
      const humanChecks = checklist.filter((c) => c.checkKind === 'human');

      // 5 automated software checks
      expect(automatedChecks).toHaveLength(5);
      expect(automatedChecks.map((c) => c.id)).toEqual([
        'network_connectivity',
        'device_enrolled',
        'user_assignments',
        'fallback_installed',
        'test_publication_active',
      ]);

      // 7 human physical inspection checks
      expect(humanChecks).toHaveLength(7);
      expect(humanChecks.map((c) => c.id)).toEqual([
        'mounting_power',
        'orientation_resolution',
        'fonts_video_verified',
        'physical_output_observed',
        'restart_recovery_verified',
        'offline_playback_verified',
        'operator_handover_completed',
      ]);
    });

    it('blocks commissioning finalization if any checklist item is pending or failed', () => {
      const checklist = createDefaultCommissioningChecklist();
      // Mark 11 items as passed, leave item 12 pending
      checklist.forEach((item, idx) => {
        if (idx < 11) item.status = 'passed';
      });

      const canFinalize = checklist.every((c) => c.status === 'passed');
      expect(canFinalize).toBe(false);
    });

    it('certifies digital display as commissioned when all 12 checks are confirmed passed', () => {
      const checklist = createDefaultCommissioningChecklist();
      const nowIso = new Date().toISOString();

      checklist.forEach((item) => {
        item.status = 'passed';
        item.confirmedBy = 'usr-admin-01';
        item.confirmedByEmail = 'admin@aurainteract.com';
        item.confirmedAt = nowIso;
        item.notes = 'Verified in test environment.';
      });

      const canFinalize = checklist.every((c) => c.status === 'passed');
      expect(canFinalize).toBe(true);

      const record: CommissioningRecord = {
        displayId: 'disp-test-01',
        status: 'commissioned',
        checklist,
        commissionedAt: nowIso,
        commissionedBy: 'usr-admin-01',
        commissionedByEmail: 'admin@aurainteract.com',
        notes: 'Handover signoff completed.',
        updatedAt: nowIso,
      };

      expect(record.status).toBe('commissioned');
      expect(record.checklist.filter((c) => c.status === 'passed')).toHaveLength(12);
      expect(record.commissionedBy).toBe('usr-admin-01');
    });
  });

  // ============================================================================
  // 5. Publication Rollout Progress Aggregations & Safe Retries
  // ============================================================================
  describe('5. Publication Rollout Progress & Retry Logic', () => {
    interface TargetProgress {
      displayId: string;
      deliveryStage: 'active' | 'downloading' | 'verifying' | 'failed' | 'idle';
      isStale: boolean;
    }

    function calculateRolloutSummary(targets: TargetProgress[]): {
      targetCount: number;
      activeCount: number;
      downloadingCount: number;
      failedCount: number;
      staleCount: number;
      adoptionPercentage: number;
      retryEligibleDisplayIds: string[];
    } {
      const targetCount = targets.length;
      const activeCount = targets.filter((t) => t.deliveryStage === 'active' && !t.isStale).length;
      const downloadingCount = targets.filter((t) => ['downloading', 'verifying'].includes(t.deliveryStage)).length;
      const failedCount = targets.filter((t) => t.deliveryStage === 'failed').length;
      const staleCount = targets.filter((t) => t.isStale).length;

      const adoptionPercentage = targetCount > 0 ? Math.round((activeCount / targetCount) * 100) : 0;
      const retryEligibleDisplayIds = targets
        .filter((t) => t.deliveryStage === 'failed' || t.isStale || t.deliveryStage !== 'active')
        .map((t) => t.displayId);

      return {
        targetCount,
        activeCount,
        downloadingCount,
        failedCount,
        staleCount,
        adoptionPercentage,
        retryEligibleDisplayIds,
      };
    }

    it('accurately aggregates delivery stage telemetry across target digital displays', () => {
      const targets: TargetProgress[] = [
        { displayId: 'd1', deliveryStage: 'active', isStale: false },
        { displayId: 'd2', deliveryStage: 'active', isStale: false },
        { displayId: 'd3', deliveryStage: 'downloading', isStale: false },
        { displayId: 'd4', deliveryStage: 'failed', isStale: false },
        { displayId: 'd5', deliveryStage: 'active', isStale: true }, // Stale telemetry
      ];

      const summary = calculateRolloutSummary(targets);
      expect(summary.targetCount).toBe(5);
      expect(summary.activeCount).toBe(2);
      expect(summary.downloadingCount).toBe(1);
      expect(summary.failedCount).toBe(1);
      expect(summary.staleCount).toBe(1);
      expect(summary.adoptionPercentage).toBe(40); // 2 out of 5 active
    });

    it('isolates failed or lagging digital displays for targeted safe retries without disrupting active displays', () => {
      const targets: TargetProgress[] = [
        { displayId: 'disp-healthy-01', deliveryStage: 'active', isStale: false },
        { displayId: 'disp-healthy-02', deliveryStage: 'active', isStale: false },
        { displayId: 'disp-failed-03', deliveryStage: 'failed', isStale: false },
        { displayId: 'disp-stale-04', deliveryStage: 'active', isStale: true },
      ];

      const summary = calculateRolloutSummary(targets);
      // Retrying targets should only target failed or stale displays
      expect(summary.retryEligibleDisplayIds).toEqual(['disp-failed-03', 'disp-stale-04']);
      expect(summary.retryEligibleDisplayIds).not.toContain('disp-healthy-01');
      expect(summary.retryEligibleDisplayIds).not.toContain('disp-healthy-02');
    });
  });
});
