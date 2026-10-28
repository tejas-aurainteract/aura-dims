import React from 'react';
import { Tv } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';

export const DisplaysPage: React.FC = () => {
  return (
    <EmptyState
      title="Digital Display Fleet Management"
      moduleName="Digital Displays"
      description="Register, monitor, and assign digital displays deployed across Aurainteract customer sites. Supports landscape and portrait orientations, device token enrollment, heartbeat telemetry, and offline playback state."
      icon={Tv}
      futureCapabilities={[
        'Digital display enrollment with cryptographic device credentials',
        'Real-time heartbeat monitoring and offline alert triggers',
        'Orientation configuration (Landscape 1920×1080 / Portrait 1080×1920)',
        'Explicit assignment to Department Heads and sites (Ahmedabad, Vadodara, Surat, Rajkot)',
        'Remote cache clearing and publication manifest reconciliation',
        'Hardware telemetry reporting (storage, temperature, uptime)',
      ]}
    />
  );
};

