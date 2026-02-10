import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "./i18n/LanguageContext";
import AdminLogin from "./pages/admin/Login";
import Dashboard from "./pages/admin/Dashboard";
import AccountDetail from "./pages/admin/AccountDetail";
import PortalUsersPage from "./pages/admin/PortalUsers";
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

export default function App() {
  if (isPortal()) {
    return (
      <LanguageProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<PortalLogin />} />
            <Route path="/" element={<ProtectedRoute type="portal"><Inbox /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </LanguageProvider>
    );
  }

  return (
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<AdminLogin />} />
          <Route path="/" element={<ProtectedRoute type="admin"><Dashboard /></ProtectedRoute>} />
          <Route path="/accounts/:email" element={<ProtectedRoute type="admin"><AccountDetail /></ProtectedRoute>} />
          <Route path="/portal-users" element={<ProtectedRoute type="admin"><PortalUsersPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  );
}
