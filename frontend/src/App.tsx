import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AdminLogin from "./pages/admin/Login";
import Dashboard from "./pages/admin/Dashboard";
import AccountDetail from "./pages/admin/AccountDetail";
import PortalUsersPage from "./pages/admin/PortalUsers";
import TeamManagement from "./pages/admin/TeamManagement";
import CustomerEmails from "./pages/admin/CustomerEmails";
import Analytics from "./pages/admin/Analytics";
import AllEmails from "./pages/admin/AllEmails";
import AdminLayout from "./components/AdminLayout";
import PortalLogin from "./pages/portal/Login";
import Inbox from "./pages/portal/Inbox";

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

export default function App() {
  if (isPortal()) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PortalLogin />} />
          <Route path="/" element={<ProtectedRoute type="portal"><Inbox /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AdminLogin />} />
        <Route path="/" element={<AdminPage><Dashboard /></AdminPage>} />
        <Route path="/accounts/:email" element={<AdminPage><AccountDetail /></AdminPage>} />
        <Route path="/portal-users" element={<AdminPage><PortalUsersPage /></AdminPage>} />
        <Route path="/team" element={<AdminPage><TeamManagement /></AdminPage>} />
        <Route path="/emails/:email" element={<AdminPage><CustomerEmails /></AdminPage>} />
        <Route path="/all-emails" element={<AdminPage><AllEmails /></AdminPage>} />
        <Route path="/analytics" element={<AdminPage><Analytics /></AdminPage>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
