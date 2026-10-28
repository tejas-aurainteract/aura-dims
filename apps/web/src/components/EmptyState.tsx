import React from 'react';
import { LucideIcon, ShieldAlert, Construction } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon: LucideIcon;
  moduleName: string;
  futureCapabilities: string[];
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon: Icon,
  moduleName,
  futureCapabilities,
}) => {
  return (
    <div className="space-y-6">
      {/* Informational banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-xs">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold uppercase tracking-wider mb-4 border border-slate-200">
            <Construction className="h-3.5 w-3.5 text-amber-600" />
            <span>Planned Module • {moduleName}</span>
          </div>

          <div className="flex items-start gap-4">
            <div className="p-3 bg-teal-50 border border-teal-100 text-teal-700 rounded-xl shrink-0">
              <Icon className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">{title}</h2>
              <p className="mt-1 text-sm text-slate-600 leading-relaxed">{description}</p>
            </div>
          </div>

          <div className="mt-8 border-t border-slate-100 pt-6">
            <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wider mb-3">
              Scheduled Capabilities for This Module
            </h3>
            <ul className="grid sm:grid-cols-2 gap-2.5">
              {futureCapabilities.map((cap, idx) => (
                <li key={idx} className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-500 shrink-0" />
                  <span>{cap}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Milestone status callout */}
      <div className="bg-teal-50/60 border border-teal-200/80 rounded-xl p-5 flex items-start gap-3.5">
        <ShieldAlert className="h-5 w-5 text-teal-700 shrink-0 mt-0.5" />
        <div className="text-xs text-teal-950 leading-relaxed">
          <p className="font-semibold text-teal-900">Current Milestone: Foundation & Local Emulators</p>
          <p className="mt-0.5 text-teal-800">
            Per development roadmap, operational business modules are guarded behind the authorization boundary.
            The upcoming milestone will deliver <strong>Login, user provisioning, and role management</strong>.
          </p>
        </div>
      </div>
    </div>
  );
};

