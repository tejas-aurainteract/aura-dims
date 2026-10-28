import React from 'react';
import { Settings } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';

export const SettingsPage: React.FC = () => {
  return (
    <EmptyState
      title="System Configuration & Multi-Site Settings"
      moduleName="Settings"
      description="System-wide defaults, site locations, network timeout parameters, digital display heartbeat intervals, and localization preferences for Aurainteract Private Limited."
      icon={Settings}
      futureCapabilities={[
        'Site registry: Ahmedabad, Vadodara, Surat, Rajkot, and future expansions',
        'Timezone locking to Asia/Kolkata (IST)',
        'Default content language preferences (English, Gujarati, Hindi)',
        'Digital display health threshold configuration (heartbeat timeout: 120s)',
        'Cloud Storage retention policies and cache expiration lifetimes',
        'Firebase App Check and rate-limiting rules configuration',
      ]}
    />
  );
};

