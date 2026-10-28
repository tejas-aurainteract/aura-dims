import React from 'react';
import { LayoutTemplate } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';

export const TemplatesPage: React.FC = () => {
  return (
    <EmptyState
      title="Display Layout Templates"
      moduleName="Templates"
      description="Pre-built and reusable layout templates for safety briefings, factory shift updates, visitor welcomes, emergency notices, and operational announcements across digital displays."
      icon={LayoutTemplate}
      futureCapabilities={[
        'Landscape templates (1920×1080) for hallways, cafeterias, and lobbies',
        'Portrait templates (1080×1920) for kiosks and entrance totems',
        'Corporate branding locks (Aurainteract logos, color themes, headers)',
        'Dynamic placeholder fields (date, site name, shift supervisor)',
        'Multilingual template variants for English, Gujarati, and Hindi',
        'Template cloning, archiving, and departmental sharing',
      ]}
    />
  );
};

