import React from 'react';
import { Calendar } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';

export const SchedulesPage: React.FC = () => {
  return (
    <EmptyState
      title="Playlist & Broadcast Scheduling"
      moduleName="Schedules"
      description="Calender-based playlist scheduling calibrated to the Asia/Kolkata timezone. Compiles playlists into deterministic time windows distributed to targeted digital displays."
      icon={Calendar}
      futureCapabilities={[
        'Asia/Kolkata timezone scheduling with strict local clock evaluation',
        'Dayparting rules (e.g. Morning Shift 08:00–16:00, Evening Shift 16:00–00:00)',
        'Recurring weekly schedules and fixed-date holiday overrides',
        'Emergency high-priority broadcast overrides',
        'Conflict resolution when multiple schedules target the same digital display',
        'Automatic compilation into versioned publication manifests',
      ]}
    />
  );
};

