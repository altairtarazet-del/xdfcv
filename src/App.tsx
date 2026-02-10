import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Overview from "./pages/Overview";
import Users from "./pages/Users";
import Roles from "./pages/Roles";
import EmailManagement from "./pages/EmailManagement";
import Background from "./pages/Background";

import Settings from "./pages/Settings";
import BgcComplete from "./pages/BgcComplete";
import AccountDetail from "./pages/AccountDetail";
import Intelligence from "./pages/Intelligence";

import PortalLogin from "./pages/portal/PortalLogin";
import PortalInbox from "./pages/portal/PortalInbox";
import PortalMarket from "./pages/portal/PortalMarket";
import PortalLanding from "./pages/portal/PortalLanding";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/overview" element={<Overview />} />
            <Route path="/dashboard/users" element={<Users />} />
            <Route path="/dashboard/roles" element={<Roles />} />
            <Route path="/dashboard/emails" element={<EmailManagement />} />
            <Route path="/dashboard/background" element={<Background />} />

            <Route path="/dashboard/bgc-complete" element={<BgcComplete />} />
            <Route path="/dashboard/account/:email" element={<AccountDetail />} />
            <Route path="/dashboard/intelligence" element={<Intelligence />} />
            <Route path="/dashboard/settings" element={<Settings />} />
            <Route path="/portal/login" element={<PortalLogin />} />
            <Route path="/portal" element={<PortalLanding />} />
            <Route path="/portal/market" element={<PortalMarket />} />
            <Route path="/portal/mail" element={<PortalInbox />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
