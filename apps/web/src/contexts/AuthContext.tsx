/**
 * Aura DIMS - Authentication Context & Session Management
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Implements Firebase email/password authentication, native session persistence,
 * separate loading states for auth restoration and user-profile resolution,
 * and profile verification against Firestore /users.
 */

import React, { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { UserProfile, Department } from '@aura-dims/display-schema';

export interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  department: Department | null;
  loadingAuth: boolean;
  loadingProfile: boolean;
  isResolvingAuth: boolean;
  error: string | null;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<{ success: boolean; message: string }>;
  clearError: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const [loadingAuth, setLoadingAuth] = useState<boolean>(true);
  const [loadingProfile, setLoadingProfile] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch Firestore user profile and associated department
  const fetchUserProfile = async (
    uid: string,
    email?: string | null
  ): Promise<{ profile: UserProfile | null; dept: Department | null }> => {
    try {
      const userRef = doc(db, 'users', uid);
      let userSnap = await getDoc(userRef);

      // Resilient fallback: If profile is not found by UID, check by verified email
      if (!userSnap.exists() && email) {
        try {
          const q = query(collection(db, 'users'), where('email', '==', email.toLowerCase()), limit(1));
          const querySnap = await getDocs(q);
          if (!querySnap.empty) {
            userSnap = querySnap.docs[0]!;
          }
        } catch (queryErr) {
          console.warn('[Aura DIMS] Fallback email lookup warning:', queryErr);
        }
      }

      if (!userSnap.exists()) {
        return { profile: null, dept: null };
      }

      const profile = userSnap.data() as UserProfile;
      let dept: Department | null = null;

      if (profile.departmentId) {
        try {
          const deptRef = doc(db, 'departments', profile.departmentId);
          const deptSnap = await getDoc(deptRef);
          if (deptSnap.exists()) {
            dept = { id: deptSnap.id, ...(deptSnap.data() as Omit<Department, 'id'>) };
          }
        } catch (deptErr) {
          console.warn('[Aura DIMS] Could not fetch department info:', deptErr);
        }
      }

      return { profile, dept };
    } catch (err) {
      console.error('[Aura DIMS] Error loading user profile:', err);
      return { profile: null, dept: null };
    }
  };

  // Refresh profile on demand (e.g. after profile edit)
  const refreshProfile = async () => {
    if (!currentUser) return;
    setLoadingProfile(true);
    const { profile, dept } = await fetchUserProfile(currentUser.uid, currentUser.email);
    setUserProfile(profile);
    setDepartment(dept);
    setLoadingProfile(false);
  };

  // Firebase auth state subscription using native Firebase persistence
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setCurrentUser(firebaseUser);
      setLoadingAuth(false);

      if (firebaseUser) {
        setLoadingProfile(true);
        const { profile, dept } = await fetchUserProfile(firebaseUser.uid, firebaseUser.email);
        setUserProfile(profile);
        setDepartment(dept);
        setLoadingProfile(false);
      } else {
        setUserProfile(null);
        setDepartment(null);
        setLoadingProfile(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, pass: string): Promise<void> => {
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
      setLoadingProfile(true);
      const { profile, dept } = await fetchUserProfile(cred.user.uid, cred.user.email);
      setUserProfile(profile);
      setDepartment(dept);
      setLoadingProfile(false);
    } catch (err: unknown) {
      setLoadingProfile(false);
      const authError = err as { code?: string; message?: string };
      let friendlyMessage = 'Authentication failed. Please verify your credentials.';

      switch (authError.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          friendlyMessage = 'Invalid email or password. Please verify your credentials and try again.';
          break;
        case 'auth/too-many-requests':
          friendlyMessage = 'Access to this account has been temporarily disabled due to many failed login attempts. Please reset your password or try again later.';
          break;
        case 'auth/network-request-failed':
          friendlyMessage = 'Network connection failure. Unable to reach the authentication service. Please check your connectivity.';
          break;
        case 'auth/user-disabled':
          friendlyMessage = 'This account has been disabled by an administrator.';
          break;
        case 'auth/configuration-not-found':
          friendlyMessage = 'Firebase Authentication is not enabled or Email/Password sign-in is not activated in the Firebase Console for this project.';
          break;
        default:
          friendlyMessage = authError.message || friendlyMessage;
      }
      setError(friendlyMessage);
      throw new Error(friendlyMessage);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await signOut(auth);
      setCurrentUser(null);
      setUserProfile(null);
      setDepartment(null);
      setError(null);
    } catch (err) {
      console.error('[Aura DIMS] Sign-out failed:', err);
    }
  };

  /**
   * Send password reset email with generic confirmation.
   * Does NOT reveal whether an account exists for the submitted email address.
   */
  const sendPasswordReset = async (email: string): Promise<{ success: boolean; message: string }> => {
    setError(null);
    const genericSuccess = 'If an account matches this email, instructions to reset your password have been sent. Please check your inbox and spam folder.';
    try {
      await sendPasswordResetEmail(auth, email.trim());
      return { success: true, message: genericSuccess };
    } catch (err: unknown) {
      const authError = err as { code?: string };
      // Return network errors explicitly, but obscure non-existent user errors for security
      if (authError.code === 'auth/network-request-failed') {
        throw new Error('Network error. Unable to send password reset request. Please check your connection.');
      }
      // Return generic message for any other reason so attacker cannot enumerate valid emails
      return { success: true, message: genericSuccess };
    }
  };

  const clearError = () => setError(null);

  const isResolvingAuth = loadingAuth || loadingProfile;

  const value = useMemo<AuthContextType>(
    () => ({
      currentUser,
      userProfile,
      department,
      loadingAuth,
      loadingProfile,
      isResolvingAuth,
      error,
      login,
      logout,
      sendPasswordReset,
      clearError,
      refreshProfile,
    }),
    [currentUser, userProfile, department, loadingAuth, loadingProfile, isResolvingAuth, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

