/**
 * Aura DIMS - Safe Digital Display CSV Export Utility
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Terminology Requirement: Strictly use "digital display" in all user-facing copy.
 *
 * CSV Formula Injection Protection:
 * Any cell starting with '=', '+', '-', '@', '\t', or '\r' is prefixed with a single quote (')
 * to prevent spreadsheet macro/command execution in Microsoft Excel, Google Sheets, and LibreOffice Calc.
 */

import type { DisplayView } from '@aura-dims/display-schema';

/**
 * Sanitizes a cell string against CSV formula injection.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);

  // If the string begins with dangerous spreadsheet formula triggers, prefix with '
  const dangerousPrefixes = ['=', '+', '-', '@', '\t', '\r'];
  const sanitized = dangerousPrefixes.some((prefix) => str.startsWith(prefix))
    ? `'${str}`
    : str;

  // If string contains comma, double-quote, or newline, escape double quotes and wrap in quotes
  if (/[",\n\r]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }

  return sanitized;
}

/**
 * Exports digital displays fleet metadata to a sanitized CSV string.
 */
export function generateDisplaysCsv(displays: DisplayView[]): string {
  const headers = [
    'Digital Display ID',
    'Display Name',
    'Installation Ref',
    'Site Name',
    'Site ID',
    'Department Name',
    'Department ID',
    'Orientation',
    'Resolution',
    'Lifecycle',
    'Commissioning Status',
    'Connectivity',
    'Active Publication ID',
    'Last Heartbeat',
    'Enrolled At',
  ];

  const rows = displays.map((d) => [
    sanitizeCsvCell(d.id),
    sanitizeCsvCell(d.name),
    sanitizeCsvCell(d.installationRef || ''),
    sanitizeCsvCell(d.siteName || ''),
    sanitizeCsvCell(d.siteId),
    sanitizeCsvCell(d.departmentName || ''),
    sanitizeCsvCell(d.departmentId),
    sanitizeCsvCell(d.orientation),
    sanitizeCsvCell(`${d.configuredResolution.width}x${d.configuredResolution.height}`),
    sanitizeCsvCell(d.lifecycle),
    sanitizeCsvCell(d.commissioningStatus || 'uncommissioned'),
    sanitizeCsvCell(d.connectivity),
    sanitizeCsvCell(d.activePublicationId || ''),
    sanitizeCsvCell(d.lastHeartbeatAt || ''),
    sanitizeCsvCell(d.enrolledAt || ''),
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  return csvContent;
}

/**
 * Triggers a browser download of the generated CSV file.
 */
export function downloadDisplaysCsv(displays: DisplayView[], filename = 'aura-dims-digital-displays.csv'): void {
  const csv = generateDisplaysCsv(displays);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

