/**
 * Aura DIMS - Project Detail Workspace
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export const ProjectDetailPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/projects')}
          className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Project Workspace</h1>
          <p className="text-xs text-slate-500 font-mono mt-0.5">{projectId}</p>
        </div>
      </div>
    </div>
  );
};
