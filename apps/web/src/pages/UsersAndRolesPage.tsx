import React from 'react';
import { Users2 } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';

export const UsersAndRolesPage: React.FC = () => {
  return (
    <EmptyState
      title="User Provisioning & Role-Based Access Control"
      moduleName="Users & Roles"
      description="Manage administrative users, department heads, site supervisors, and display device credentials. Enforces explicit privilege boundaries where UI visibility never substitutes for backend authorization."
      icon={Users2}
      futureCapabilities={[
        'Role hierarchy: Admin (all sites/departments) and Department Heads (departmental scope)',
        'Explicit digital display assignments to Department Heads',
        'Strict backend authorization checks via Cloud Functions Admin SDK',
        'Separation of human user identities from digital display hardware credentials',
        'Prohibition of self-assigned privileges or email domain wildcards',
        'Comprehensive audit logging of all role assignments and display permissions',
      ]}
    />
  );
};

