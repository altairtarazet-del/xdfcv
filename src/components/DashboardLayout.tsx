import { ReactNode, useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { CyberLogo } from '@/components/CyberLogo';
import { Button } from '@/components/ui/button';
import {
  Mail,
  Users,
  Settings,
  LogOut,
  Shield,
  Activity,
  Menu,
  X,
  Server,
  FileSearch,
  PanelLeftClose,
  PanelLeft,
  Wallet,
  LayoutDashboard,
  CheckCircle,
} from 'lucide-react';
import { NotificationBell } from '@/components/NotificationBell';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, profile, isAdmin, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Desktop sidebar collapsed state (persisted in localStorage)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/auth');
    }
  }, [user, isLoading, navigate]);

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  if (isLoading) {
    return (
      <div className="min-h-screen matrix-bg flex items-center justify-center">
        <div className="text-center">
          <CyberLogo />
          <p className="text-muted-foreground mt-4 font-mono animate-pulse">
            Sistem yükleniyor...
          </p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const canManageEmails = isAdmin || profile?.permissions?.can_create_email || profile?.permissions?.can_change_password;
  const canViewCash = isAdmin || profile?.permissions?.can_view_cash || profile?.permissions?.can_manage_cash;
  const canViewBgcComplete = isAdmin || (profile?.permissions as any)?.can_view_bgc_complete;

  const navItems = [
    { to: '/dashboard/overview', icon: LayoutDashboard, label: 'Genel Bakış', show: true },
    { to: '/dashboard', icon: Mail, label: 'Postalar', show: true },
    { to: '/dashboard/users', icon: Users, label: 'Kullanıcılar', show: isAdmin },
    { to: '/dashboard/roles', icon: Shield, label: 'Roller', show: isAdmin },
    { to: '/dashboard/emails', icon: Server, label: 'Email Yönetimi', show: canManageEmails },
    { to: '/dashboard/background', icon: FileSearch, label: 'Background', show: canManageEmails },
    { to: '/dashboard/cash', icon: Wallet, label: 'Kasa', show: canViewCash },
    { to: '/dashboard/bgc-complete', icon: CheckCircle, label: 'BGC Complete', show: canViewBgcComplete },
    { to: '/dashboard/settings', icon: Settings, label: 'Ayarlar', show: true },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  return (
    <div className="min-h-screen matrix-bg flex">
      {/* Mobile Sidebar Toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 cyber-card rounded-lg"
      >
        {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Desktop Collapse Toggle (always visible) */}
      <button
        onClick={toggleSidebarCollapse}
        className={`hidden lg:flex fixed top-4 z-50 p-2 cyber-card rounded-lg hover:bg-primary/10 transition-all ${
          sidebarCollapsed ? 'left-4' : 'left-[232px]'
        }`}
        title={sidebarCollapsed ? 'Sidebar aç' : 'Sidebar kapat'}
      >
        {sidebarCollapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen bg-sidebar border-r border-sidebar-border flex flex-col z-40 transition-all duration-300 ${
          // Mobile behavior
          sidebarOpen ? 'translate-x-0 w-64 p-4' : '-translate-x-full w-64 p-4'
        } ${
          // Desktop behavior
          sidebarCollapsed ? 'lg:w-0 lg:overflow-hidden lg:invisible lg:p-0 lg:border-0' : 'lg:w-64 lg:translate-x-0 lg:visible lg:p-4'
        }`}
      >
        {/* Only render content when sidebar is visible */}
        {(!sidebarCollapsed || sidebarOpen) && (
          <>
            <div className="mb-8 pt-2">
              <CyberLogo size="sm" />
            </div>

            {/* User Info */}
            <div className="cyber-card rounded-lg p-3 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/50">
                  <span className="text-primary font-mono font-bold">
                    {profile?.email?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono truncate text-foreground">
                    {profile?.display_name || profile?.email?.split('@')[0]}
                  </p>
                  <div className="flex items-center gap-1">
                    {isAdmin && (
                      <span className="text-xs px-1.5 py-0.5 bg-primary/20 text-primary rounded font-mono">
                        ADMIN
                      </span>
                    )}
                    {profile?.custom_role && (
                      <span className="text-xs px-1.5 py-0.5 bg-secondary/20 text-secondary rounded font-mono">
                        {profile.custom_role.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-2">
              {navItems
                .filter((item) => item.show)
                .map((item) => {
                  const isActive = location.pathname === item.to;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-mono text-sm transition-all ${
                        isActive
                          ? 'bg-primary/20 text-primary cyber-glow-text border border-primary/30'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      }`}
                    >
                      <item.icon size={18} />
                      {item.label}
                    </Link>
                  );
                })}
            </nav>

            {/* Status */}
            <div className="py-4 border-t border-sidebar-border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                <Activity size={14} className="text-primary animate-pulse" />
                <span>Sistem Aktif</span>
              </div>
            </div>

            {/* Sign Out */}
            <Button
              variant="ghost"
              onClick={handleSignOut}
              className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10 font-mono"
            >
              <LogOut size={18} />
              Çıkış Yap
            </Button>
          </>
        )}
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className={`flex-1 min-h-screen overflow-auto transition-all duration-300 ${
        sidebarCollapsed ? 'lg:ml-0' : ''
      }`}>
        {/* Top Bar with Notification Bell */}
        {canViewBgcComplete && (
          <div className="flex justify-end items-center px-4 lg:px-8 pt-4">
            <NotificationBell />
          </div>
        )}
        <div className="p-4 lg:p-8 pt-2">
          {children}
        </div>
      </main>
    </div>
  );
}
