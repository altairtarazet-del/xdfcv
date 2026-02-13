import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";
import AdminLayout from "@/components/AdminLayout";

// Lazy-loaded pages
const AdminLogin = lazy(() => import("@/pages/admin/Login"));
const Dashboard = lazy(() => import("@/pages/admin/Dashboard"));
const AccountDetail = lazy(() => import("@/pages/admin/AccountDetail"));
const PortalUsersPage = lazy(() => import("@/pages/admin/PortalUsers"));
const TeamManagement = lazy(() => import("@/pages/admin/TeamManagement"));
const CustomerEmails = lazy(() => import("@/pages/admin/CustomerEmails"));
const Analytics = lazy(() => import("@/pages/admin/Analytics"));
const AllEmails = lazy(() => import("@/pages/admin/AllEmails"));
const PortalLogin = lazy(() => import("@/pages/portal/Login"));
const Inbox = lazy(() => import("@/pages/portal/Inbox"));

function PageLoader() {
  return (
    <div className="flex flex-col gap-4 p-8">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-64 mt-4" />
    </div>
  );
}

function isPortal() {
  const hostname = window.location.hostname;
  return hostname.startsWith("portal");
}

function ProtectedRoute({ children, type }: { children: React.ReactNode; type: "admin" | "portal" }) {
  const key = type === "admin" ? "admin_token" : "portal_token";
  if (!localStorage.getItem(key)) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AdminPage({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute type="admin">
      <AdminLayout>{children}</AdminLayout>
    </ProtectedRoute>
  );
}

function RequireMinRole({ children, minRole }: { children: React.ReactNode; minRole: string }) {
  const LEVELS: Record<string, number> = { super_admin: 3, admin: 2, operator: 1, viewer: 1 };
  const adminRole = localStorage.getItem("admin_role") || "admin";
  if ((LEVELS[adminRole] || 1) < (LEVELS[minRole] || 0)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  if (isPortal()) {
    return (
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<PortalLogin />} />
            <Route path="/" element={<ProtectedRoute type="portal"><Inbox /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<AdminLogin />} />
          <Route path="/" element={<AdminPage><Dashboard /></AdminPage>} />
          <Route path="/accounts/:email" element={<AdminPage><AccountDetail /></AdminPage>} />
          <Route path="/portal-users" element={<AdminPage><PortalUsersPage /></AdminPage>} />
          <Route path="/team" element={<AdminPage><RequireMinRole minRole="admin"><TeamManagement /></RequireMinRole></AdminPage>} />
          <Route path="/emails/:email" element={<AdminPage><CustomerEmails /></AdminPage>} />
          <Route path="/all-emails" element={<AdminPage><AllEmails /></AdminPage>} />
          <Route path="/analytics" element={<AdminPage><RequireMinRole minRole="admin"><Analytics /></RequireMinRole></AdminPage>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toaster richColors position="top-right" />
    </BrowserRouter>
  );
}
