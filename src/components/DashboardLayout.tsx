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
  Menu,
  X,
  Server,
  FileSearch,
  PanelLeftClose,
  PanelLeft,
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

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/auth');
    }
  }, [user, isLoading, navigate]);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <CyberLogo />
          <p className="text-muted-foreground text-sm animate-pulse">
            Yükleniyor...
          </p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const canManageEmails = isAdmin || profile?.permissions?.can_create_email || profile?.permissions?.can_change_password;
  const canViewBgcComplete = isAdmin || (profile?.permissions as any)?.can_view_bgc_complete;

  const navItems = [
    { to: '/dashboard/overview', icon: LayoutDashboard, label: 'Genel Bakış', show: true },
    { to: '/dashboard', icon: Mail, label: 'Postalar', show: true },
    { to: '/dashboard/users', icon: Users, label: 'Kullanıcılar', show: isAdmin },
    { to: '/dashboard/roles', icon: Shield, label: 'Roller', show: isAdmin },
    { to: '/dashboard/emails', icon: Server, label: 'Email Yönetimi', show: canManageEmails },
    { to: '/dashboard/background', icon: FileSearch, label: 'Background', show: canManageEmails },
    { to: '/dashboard/bgc-complete', icon: CheckCircle, label: 'BGC Complete', show: canViewBgcComplete },
    { to: '/dashboard/settings', icon: Settings, label: 'Ayarlar', show: true },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-card border border-border hover:bg-muted transition-colors"
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Desktop collapse toggle */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className={`hidden lg:flex fixed top-5 z-50 p-1.5 rounded-md bg-card border border-border hover:bg-muted transition-all text-muted-foreground hover:text-foreground ${
          sidebarCollapsed ? 'left-4' : 'left-[228px]'
        }`}
      >
        {sidebarCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen bg-sidebar border-r border-sidebar-border flex flex-col z-40 transition-all duration-300 ${
          sidebarOpen ? 'translate-x-0 w-60 p-4' : '-translate-x-full w-60 p-4'
        } ${
          sidebarCollapsed ? 'lg:w-0 lg:overflow-hidden lg:invisible lg:p-0 lg:border-0' : 'lg:w-60 lg:translate-x-0 lg:visible lg:p-4'
        }`}
      >
        {(!sidebarCollapsed || sidebarOpen) && (
          <>
            {/* Logo */}
            <div className="mb-6 pt-1">
              <CyberLogo size="sm" />
            </div>

            {/* User card */}
            <div className="rounded-lg bg-muted/50 border border-border/50 p-3 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center text-primary font-semibold text-sm">
                  {profile?.email?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-foreground">
                    {profile?.display_name || profile?.email?.split('@')[0]}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    {isAdmin && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-primary/15 text-primary rounded-md font-medium">
                        Admin
                      </span>
                    )}
                    {profile?.custom_role && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-accent/15 text-accent rounded-md font-medium">
                        {profile.custom_role.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 space-y-0.5">
              {navItems
                .filter((item) => item.show)
                .map((item) => {
                  const isActive = location.pathname === item.to;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                        isActive
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      }`}
                    >
                      <item.icon size={17} />
                      {item.label}
                    </Link>
                  );
                })}
            </nav>

            {/* Bottom */}
            <div className="pt-3 border-t border-sidebar-border space-y-1">
              <Button
                variant="ghost"
                onClick={handleSignOut}
                className="w-full justify-start gap-2.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-sm h-9"
              >
                <LogOut size={17} />
                Çıkış Yap
              </Button>
            </div>
          </>
        )}
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <main className={`flex-1 min-h-screen overflow-auto transition-all duration-300 ${
        sidebarCollapsed ? 'lg:ml-0' : ''
      }`}>
        {/* Top bar */}
        <div className="flex justify-end items-center px-4 lg:px-8 pt-4 gap-3">
          {canViewBgcComplete && <NotificationBell />}
        </div>
        <div className="p-4 lg:p-8 pt-2">
          {children}
        </div>
      </main>
    </div>
  );
}
