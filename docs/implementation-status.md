# Aura DIMS - Implementation Status & Roadmap

**Company:** Aurainteract Private Limited  
**Product:** Aura Digital Information Management System (Aura DIMS)  
**Current Status:** Milestone 2 Complete (Authentication, Role-Based Access Control & Departmental Governance)

---

## 1. Milestones Overview

```
Milestone 1 (Complete)   ──>   Milestone 2 (Complete)             ──>   Milestone 3 (Planned)
Foundation, Emulators,         Authentication, RBAC, User &             Digital Display Fleet Enrollment,
Deny-by-default rules,         Department Provisioning, Cloud           Hardware Heartbeats, Offline
Monorepo Scaffolding.          Functions, Simplified Shell & RBAC.      Player Manifest Activation.
```

---

## 2. Deliverables Matrix

| Capability / Requirement | Status | Architecture & Implementation Reference |
| :--- | :--- | :--- |
| **Product Branding "Aura DIMS"** | Complete | Header, Sidebar, Login, and meta tags reflect Aura DIMS identity |
| **Digital Display Terminology** | Complete | Strictly enforced: devices are always "digital display", never bare screen/TV |
| **Simplified Navigation Shell** | Complete | Primary routes: Dashboard, Displays, Content, Schedules, Approvals, Users, Settings |
| **Content Hub & Subtabs** | Complete | `ContentPage` with tabs: Designs, Media Library, Templates; "Create content" action |
| **Legacy Route Redirects** | Complete | Redirects `/content-library`, `/content-creator`, `/templates`, `/users-and-roles` |
| **Development-Only Diagnostics** | Complete | Moved to `/dev/diagnostics`; excluded from production builds; unobtrusive header pill |
| **Firebase Email/Password Auth** | Complete | `apps/web/src/contexts/AuthContext.tsx`, `LoginPage`, `ForgotPasswordPage` |
| **Native SDK Session Persistence** | Complete | No custom tokens in `localStorage`; uses Firebase Auth native state |
| **Enumeration Attack Prevention** | Complete | Generic password reset confirmation message regardless of user existence |
| **No Public Self-Registration** | Complete | Public signup removed; users must be provisioned by System Administrators |
| **Role-Based Access Control** | Complete | Roles: `admin` (system-wide) vs `department_head` (departmental boundary) |
| **Protected Route Guards** | Complete | Distinguishes auth restoring, profile loading, and authorization checks |
| **Unassigned / Inactive Denials** | Complete | Redirects to `/access-denied` with informative explanation and sign-out action |
| **Privileged Mutation Cloud Functions** | Complete | 7 callable functions in `functions/src/index.ts` with explicit caller authorization |
| **Last-Admin Invariant Protection** | Complete | Transactional invariant prevents demoting or deactivating the last active Admin |
| **Department Management** | Complete | Admin can create, rename, activate/deactivate departments (`Settings` -> Departments) |
| **Admin Bootstrap Script** | Complete | `scripts/bootstrap-admin.ts` (`pnpm run bootstrap:admin`) with production refusal |
| **Security Rules Test Suite** | Complete | 18 unit tests in `tests/rules/security-rules.test.ts` (100% passing) |
| **Playwright E2E Suite** | Complete | 9 browser smoke & RBAC tests in `tests/e2e/` (100% passing) |

---

## 3. Security Rules & Privileged Boundaries Verification

### 3.1 Security Rules (`firestore.rules`)
- **Unauthenticated:** Completely denied from reading or writing `/users`, `/departments`, `/auditEvents`.
- **System Administrator:** Authorized to read all users and departments; client writes are strictly denied (must invoke Cloud Functions).
- **Department Head:** Authorized to read their own user profile and users belonging to their assigned department. Reading other departments or cross-department users is strictly blocked.
- **Audit Events:** Append-only through backend Cloud Functions; direct client writes or modifications are blocked.

### 3.2 Cloud Functions (v2 in `asia-south1`)
- `provisionUser`: Creates Firebase Auth user, assigns custom claims, creates Firestore profile, maintains Admin counts, writes audit event.
- `updateUser`: Modifies name, role, department with Last-Admin guard.
- `setUserActiveStatus`: Toggles user active/inactive status, revokes refresh tokens immediately upon deactivation, enforces Last-Admin guard.
- `triggerPasswordReset`: Dispatches password reset link via Admin SDK without client exposure.
- `createDepartment`, `updateDepartment`, `setDepartmentStatus`: Department lifecycle governance.

---

## 4. Verification & Testing Evidence

1. **Security Rules Suite:**
   ```bash
   pnpm run test:rules
   # 18 passed (18)
   ```
2. **Playwright End-to-End Suite:**
   ```bash
   pnpm run test:e2e
   # 9 passed (9)
   ```
3. **TypeScript Typecheck:**
   ```bash
   pnpm run typecheck
   # 4 workspace projects clean (0 errors)
   ```
4. **Monorepo Build:**
   ```bash
   pnpm run build
   # display-schema, functions, and web build clean
   ```
5. **Screenshots Captured:**
   - `login-screen.png`: Clean branded login interface without public signup.
   - `dashboard-simplified.png`: Executive dashboard without fake metrics or commentary.
   - `users-management.png`: Admin-only user directory with status badges and provisioning modal.
