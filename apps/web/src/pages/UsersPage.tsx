/**
 * Aura DIMS - User Provisioning & Management
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Admin-only workspace for provisioning users, managing role assignments,
 * activating/deactivating accounts, and triggering password reset links.
 * All mutations execute via Cloud Functions with backend authorization.
 */

import React, { useState, useEffect } from 'react';
import {
  Users2,
  Plus,
  Shield,
  Building2,
  Edit2,
  Power,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Copy,
  Check,
  Eye,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { api } from '@/lib/api';
import type { UserProfile, UserRole, UserStatus, Department } from '@aura-dims/display-schema';

export const UsersPage: React.FC = () => {
  const { userProfile: currentAdminProfile, refreshProfile } = useAuth();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Add User Modal State
  const [isProvisionOpen, setIsProvisionOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('creator');
  const [newDeptId, setNewDeptId] = useState<string>('');
  const [generatedSetupLink, setGeneratedSetupLink] = useState<string | null>(null);

  // Edit Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('creator');
  const [editDeptId, setEditDeptId] = useState<string>('');

  // Action status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Replace Department Head confirmation modal
  const [replaceHeadState, setReplaceHeadState] = useState<{
    isOpen: boolean;
    existingHeadName: string;
    isProvisioning: boolean;
    pendingProvisionData?: {
      displayName: string;
      email: string;
      role: UserRole;
      departmentId: string | null;
    };
    pendingUpdateData?: {
      uid: string;
      displayName: string;
      role: UserRole;
      departmentId: string | null;
    };
  }>({
    isOpen: false,
    existingHeadName: '',
    isProvisioning: false,
  });

  // Real-time Firestore query for users & departments
  useEffect(() => {
    setLoading(true);

    const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribeUsers = onSnapshot(
      usersQuery,
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({
          uid: doc.id,
          ...doc.data(),
        })) as UserProfile[];
        setUsers(list);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching users:', err);
        setErrorMessage('Failed to load users: ' + err.message);
        setLoading(false);
      }
    );

    const deptsQuery = query(collection(db, 'departments'), orderBy('name', 'asc'));
    const unsubscribeDepts = onSnapshot(
      deptsQuery,
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Department[];
        setDepartments(list);
      },
      (err) => {
        console.warn('Error fetching departments:', err);
      }
    );

    return () => {
      unsubscribeUsers();
      unsubscribeDepts();
    };
  }, []);

  const departmentMap = new Map<string, Department>();
  departments.forEach((d) => departmentMap.set(d.id, d));

  const activeAdminCount = users.filter((u) => u.role === 'admin' && u.status === 'active').length;

  const handleProvisionUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setGeneratedSetupLink(null);

    if (!newName.trim() || !newEmail.trim()) {
      setModalError('Please provide both full name and email address.');
      return;
    }

    if (newRole !== 'admin' && !newDeptId) {
      setModalError('Please assign a department for this user.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await api.provisionUser({
        displayName: newName.trim(),
        email: newEmail.trim().toLowerCase(),
        role: newRole,
        departmentId: newRole === 'admin' ? (newDeptId || null) : newDeptId,
      });

      setActionSuccess(`User account for ${res.displayName} created successfully.`);
      if (res.setupLink) {
        setGeneratedSetupLink(res.setupLink);
      } else {
        setIsProvisionOpen(false);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (
        (err as any)?.code === 'already-exists' ||
        errorMsg.includes('already has an active Department Head') ||
        errorMsg.includes('already-exists')
      ) {
        const match = errorMsg.match(/active Department Head \((.*?)\)/i);
        const headName = (match && match[1]) ? match[1] : 'Current Department Head';
        setReplaceHeadState({
          isOpen: true,
          existingHeadName: headName,
          isProvisioning: true,
          pendingProvisionData: {
            displayName: newName.trim(),
            email: newEmail.trim().toLowerCase(),
            role: newRole,
            departmentId: newRole === 'admin' ? (newDeptId || null) : newDeptId,
          },
        });
        return;
      }
      setModalError(err instanceof Error ? err.message : 'User provisioning failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setModalError(null);

    if (editRole !== 'admin' && !editDeptId) {
      setModalError('Please assign a department for this user.');
      return;
    }

    // Last-admin guard on frontend before calling backend
    if (
      editingUser.role === 'admin' &&
      editRole !== 'admin' &&
      editingUser.status === 'active' &&
      activeAdminCount <= 1
    ) {
      setModalError('Cannot demote the last remaining active Administrator.');
      return;
    }

    try {
      setIsSubmitting(true);
      await api.updateUser({
        uid: editingUser.uid,
        displayName: editName.trim(),
        role: editRole,
        departmentId: editRole === 'admin' ? (editDeptId || null) : editDeptId,
      });

      setIsEditOpen(false);
      setEditingUser(null);
      setActionSuccess(`User updated successfully.`);
      if (editingUser.uid === currentAdminProfile?.uid) {
        await refreshProfile();
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (
        (err as any)?.code === 'already-exists' ||
        errorMsg.includes('already has an active Department Head') ||
        errorMsg.includes('already-exists')
      ) {
        const match = errorMsg.match(/active Department Head \((.*?)\)/i);
        const headName = (match && match[1]) ? match[1] : 'Current Department Head';
        setReplaceHeadState({
          isOpen: true,
          existingHeadName: headName,
          isProvisioning: false,
          pendingUpdateData: {
            uid: editingUser.uid,
            displayName: editName.trim(),
            role: editRole,
            departmentId: editRole === 'admin' ? (editDeptId || null) : editDeptId,
          },
        });
        return;
      }
      setModalError(err instanceof Error ? err.message : 'User update failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmReplaceHead = async () => {
    setIsSubmitting(true);
    setModalError(null);
    try {
      if (replaceHeadState.isProvisioning && replaceHeadState.pendingProvisionData) {
        const res = await api.provisionUser({
          ...replaceHeadState.pendingProvisionData,
          replaceExistingHead: true,
        });
        setReplaceHeadState({ isOpen: false, existingHeadName: '', isProvisioning: false });
        setActionSuccess(`User ${res.displayName} provisioned as Department Head. Previous head was demoted to Creator.`);
        if (res.setupLink) {
          setGeneratedSetupLink(res.setupLink);
        } else {
          setIsProvisionOpen(false);
        }
      } else if (!replaceHeadState.isProvisioning && replaceHeadState.pendingUpdateData) {
        await api.updateUser({
          ...replaceHeadState.pendingUpdateData,
          replaceExistingHead: true,
        });
        setReplaceHeadState({ isOpen: false, existingHeadName: '', isProvisioning: false });
        setIsEditOpen(false);
        setEditingUser(null);
        setActionSuccess('User promoted to Department Head. Previous head was demoted to Creator and their sessions revoked.');
        if (replaceHeadState.pendingUpdateData.uid === currentAdminProfile?.uid) {
          await refreshProfile();
        }
      }
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Action failed.');
      setReplaceHeadState({ isOpen: false, existingHeadName: '', isProvisioning: false });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (user: UserProfile) => {
    const nextStatus: UserStatus = user.status === 'active' ? 'inactive' : 'active';

    if (user.role === 'admin' && user.status === 'active' && activeAdminCount <= 1) {
      alert('Forbidden: Cannot deactivate the last remaining active Administrator in the system.');
      return;
    }

    const isSelf = user.uid === currentAdminProfile?.uid;
    const confirmPrompt =
      nextStatus === 'inactive'
        ? isSelf
          ? 'Warning: You are about to deactivate your own Administrator account. You will lose access immediately upon deactivation. Continue?'
          : `Deactivate user account "${user.displayName}" (${user.email})?`
        : `Re-activate user account "${user.displayName}"?`;

    if (!window.confirm(confirmPrompt)) return;

    try {
      await api.setUserStatus({
        uid: user.uid,
        status: nextStatus,
      });
      setActionSuccess(`User status changed to ${nextStatus}.`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to change user status.');
    }
  };

  const handleSendResetLink = async (user: UserProfile) => {
    try {
      const res = await api.triggerPasswordReset({ email: user.email });
      if (res.resetLink) {
        prompt('Password Reset Link (Local Development Mode):', res.resetLink);
      } else {
        setActionSuccess(`Password reset email triggered for ${user.email}.`);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to send password reset email.');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const formatDate = (dateValue: unknown) => {
    if (!dateValue) return '—';
    try {
      let date: Date;
      if (typeof dateValue === 'string') {
        date = new Date(dateValue);
      } else if (dateValue && typeof dateValue === 'object' && 'toDate' in dateValue && typeof (dateValue as { toDate: () => Date }).toDate === 'function') {
        date = (dateValue as { toDate: () => Date }).toDate();
      } else if (dateValue && typeof dateValue === 'object' && '_seconds' in dateValue) {
        date = new Date((dateValue as { _seconds: number })._seconds * 1000);
      } else if (dateValue && typeof dateValue === 'object' && 'seconds' in dateValue) {
        date = new Date((dateValue as { seconds: number }).seconds * 1000);
      } else {
        date = new Date(dateValue as number);
      }
      if (isNaN(date.getTime())) return '—';
      return date.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Users & Access Control
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Provision system administrators and departmental users with role-based access control • Aurainteract Private Limited
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setNewName('');
            setNewEmail('');
            setNewRole('creator');
            setNewDeptId('');
            setGeneratedSetupLink(null);
            setModalError(null);
            setIsProvisionOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>Add User</span>
        </button>
      </div>

      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-xs text-teal-600 hover:text-teal-800 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Users Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Total Users</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{users.length}</div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Administrators</div>
          <div className="text-2xl font-bold text-indigo-700 mt-1">{activeAdminCount}</div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Department Heads</div>
          <div className="text-2xl font-bold text-blue-700 mt-1">
            {users.filter((u) => u.role === 'department_head').length}
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Department Members</div>
          <div className="text-2xl font-bold text-teal-700 mt-1">
            {users.filter((u) => u.role === 'creator' || u.role === 'viewer').length}
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="py-12 flex items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
            <span>Loading user directory...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center">
            <Users2 className="h-8 w-8 text-slate-400 mx-auto mb-2" />
            <div className="text-xs font-semibold text-slate-800">No users added</div>
            <p className="text-[11px] text-slate-400 mt-1">
              Click &quot;Add User&quot; to create the first administrative or departmental account.
            </p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold">
              <tr>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 hidden md:table-cell">Created (IST)</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {users.map((user) => {
                const dept = user.departmentId ? departmentMap.get(user.departmentId) : null;
                const isCurrentAdmin = user.uid === currentAdminProfile?.uid;

                return (
                  <tr key={user.uid} className="hover:bg-slate-50/50">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                        <span>{user.displayName}</span>
                        {isCurrentAdmin && (
                          <span className="text-[10px] font-normal px-1.5 py-0.2 bg-teal-100 text-teal-800 rounded">
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">{user.email}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      {user.role === 'admin' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Shield className="h-3 w-3" />
                          <span>Administrator</span>
                        </span>
                      )}
                      {user.role === 'department_head' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          <Building2 className="h-3 w-3" />
                          <span>Department Head</span>
                        </span>
                      )}
                      {user.role === 'creator' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                          <Users2 className="h-3 w-3" />
                          <span>Department Member</span>
                        </span>
                      )}
                      {user.role === 'viewer' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          <Eye className="h-3 w-3" />
                          <span>Viewer</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {dept ? (
                        <span className="inline-flex items-center gap-1 text-slate-800 font-medium">
                          <Building2 className="h-3.5 w-3.5 text-slate-400" />
                          <span>{dept.name}</span>
                          <span className="text-[10px] text-slate-400">({dept.code})</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">
                          {user.role === 'admin' ? 'All Departments' : 'Unassigned'}
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${user.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                      >
                        {user.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 hidden md:table-cell text-[11px] text-slate-500 font-mono">
                      {formatDate(user.createdAt)}
                    </td>

                    <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingUser(user);
                          setEditName(user.displayName);
                          setEditRole(user.role);
                          setEditDeptId(user.departmentId || '');
                          setModalError(null);
                          setIsEditOpen(true);
                        }}
                        className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
                        title="Edit user attributes"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendResetLink(user)}
                        className="p-1.5 text-slate-500 hover:text-teal-700 rounded-lg hover:bg-slate-100 transition-colors"
                        title="Dispatch password reset link"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleStatus(user)}
                        className={`p-1.5 rounded-lg transition-colors ${user.status === 'active'
                          ? 'text-amber-600 hover:text-amber-800 hover:bg-amber-50'
                          : 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50'
                          }`}
                        title={user.status === 'active' ? 'Deactivate user' : 'Activate user'}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add User Modal */}
      {isProvisionOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Add User</h3>

            {modalError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <span>{modalError}</span>
              </div>
            )}

            {generatedSetupLink ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs space-y-2">
                  <div className="font-semibold text-teal-950 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-teal-600" />
                    <span>Account Created Successfully!</span>
                  </div>
                  <p className="text-teal-800 text-[11px] leading-relaxed">
                    A password setup link was generated for local testing. Copy it to set the password:
                  </p>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={generatedSetupLink}
                      className="w-full text-[10px] font-mono p-2 pr-16 bg-white border border-teal-300 rounded-lg text-slate-800 select-all"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(generatedSetupLink)}
                      className="absolute right-1 top-1 bottom-1 px-2.5 bg-teal-600 text-white rounded text-[10px] font-semibold flex items-center gap-1 hover:bg-teal-700"
                    >
                      {copiedLink ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsProvisionOpen(false);
                      setGeneratedSetupLink(null);
                    }}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleProvisionUser} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Patel"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. ramesh@aurainteract.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="mt-1 block w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-slate-900"
                  >
                    <option value="creator">Department Member (Standard member - HOD assigns project roles)</option>
                    <option value="department_head">Department Head (HOD - Department leader & approver)</option>
                  </select>
                  <div className="mt-1.5 p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-0.5">
                    {newRole === 'creator' && (
                      <p>
                        <strong className="text-teal-700">Department Member:</strong> Regular staff member of this department. Their Department Head will assign their specific role (Publisher, Contributor, or Viewer) per project.
                      </p>
                    )}
                    {newRole === 'department_head' && (
                      <p>
                        <strong className="text-blue-700">Department Head (HOD):</strong> Department leader. Approves broadcast schedules, manages department digital displays, and leads projects (1 head per department).
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Department {newRole !== 'admin' && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    value={newDeptId}
                    onChange={(e) => setNewDeptId(e.target.value)}
                    required={newRole !== 'admin'}
                    className="mt-1 block w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-slate-900"
                  >
                    <option value="">Select Department...</option>
                    {departments
                      .filter((d) => d.status === 'active')
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.code})
                        </option>
                      ))}
                  </select>
                  {newRole === 'admin' && (
                    <p className="text-[10px] text-slate-400 mt-1">
                      Admins have cross-department privileges; department assignment is optional.
                    </p>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsProvisionOpen(false)}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Adding...' : 'Add User'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {isEditOpen && editingUser && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Edit User Profile</h3>

            {modalError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Email</label>
                <input
                  type="text"
                  disabled
                  value={editingUser.email}
                  className="mt-1 block w-full px-3 py-2 text-xs bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-mono cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Full Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="mt-1 block w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-slate-900"
                >
                  <option value="creator">Department Member (HOD assigns project roles)</option>
                  <option value="department_head">Department Head (HOD - Single departmental leader)</option>
                  <option value="admin">Administrator (Cross-department system manager)</option>
                  <option value="viewer">Viewer (Read-only observation)</option>
                </select>
                <div className="mt-1.5 p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-0.5">
                  {editRole === 'creator' && (
                    <p>
                      <strong className="text-teal-700">Department Member:</strong> Standard organization staff member. Inside projects, their Department Head assigns their exact capabilities (Lead, Member, or Viewer).
                    </p>
                  )}
                  {editRole === 'department_head' && (
                    <p>
                      <strong className="text-blue-700">Department Head:</strong> Manages the department team, approves broadcast schedules, and publishes content to department digital displays (1 head per department).
                    </p>
                  )}
                  {editRole === 'admin' && (
                    <p>
                      <strong className="text-indigo-700">System Administrator:</strong> Global administrative access across all departments, digital displays, system settings, and user provisioning.
                    </p>
                  )}
                  {editRole === 'viewer' && (
                    <p>
                      <strong className="text-slate-700">Viewer:</strong> Read-only access to browse assets, designs, and playlists without editing or publishing permissions.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Department {editRole !== 'admin' && <span className="text-red-500">*</span>}
                </label>
                <select
                  value={editDeptId}
                  onChange={(e) => setEditDeptId(e.target.value)}
                  required={editRole !== 'admin'}
                  className="mt-1 block w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-slate-900"
                >
                  <option value="">Select Department...</option>
                  {departments
                    .filter((d) => d.status === 'active')
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                </select>
                {editRole === 'admin' && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    Admins have cross-department privileges; department assignment is optional.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Replace Department Head Confirmation Modal */}
      {replaceHeadState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Replace Department Head?</h3>
                <p className="text-xs text-slate-500">Aurainteract Private Limited Governance Rule</p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-600 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <p>
                This department already has an active Department Head:{' '}
                <strong className="text-slate-900">{replaceHeadState.existingHeadName}</strong>.
              </p>
              <p className="text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200 leading-relaxed font-medium">
                Consequence: <strong>{replaceHeadState.existingHeadName}</strong> will be demoted to <strong>Department Member</strong>, and their active login sessions will be immediately revoked to enforce security.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() =>
                  setReplaceHeadState({ isOpen: false, existingHeadName: '', isProvisioning: false })
                }
                className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmReplaceHead}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors shadow-xs"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Replace and demote existing head</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
