import { ReactNode, useEffect, useState, useCallback } from 'react';
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
  Brain,
  Search,
} from 'lucide-react';
import { NotificationBell } from '@/components/NotificationBell';
import { GlobalSearch } from '@/components/GlobalSearch';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, profile, isAdmin, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSearch: useCallback(() => setSearchOpen(true), []),
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
            Yukleniyor...
          </p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const canManageEmails = isAdmin || profile?.permissions?.can_create_email || profile?.permissions?.can_change_password;
  const canViewBgcComplete = isAdmin || (profile?.permissions as any)?.can_view_bgc_complete;

  const navItems = [
    { to: '/dashboard/overview', icon: LayoutDashboard, label: 'Genel Bakis', show: true, key: '1' },
    { to: '/dashboard', icon: Mail, label: 'Postalar', show: true, key: '2' },
    { to: '/dashboard/users', icon: Users, label: 'Kullanicilar', show: isAdmin, key: '' },
    { to: '/dashboard/roles', icon: Shield, label: 'Roller', show: isAdmin, key: '' },
    { to: '/dashboard/emails', icon: Server, label: 'Email Yonetimi', show: canManageEmails, key: '' },
    { to: '/dashboard/background', icon: FileSearch, label: 'Background', show: canManageEmails, key: '3' },
    { to: '/dashboard/bgc-complete', icon: CheckCircle, label: 'BGC Complete', show: canViewBgcComplete, key: '4' },
    { to: '/dashboard/intelligence', icon: Brain, label: 'Istihbarat', show: canViewBgcComplete, key: '5' },
    { to: '/dashboard/settings', icon: Settings, label: 'Ayarlar', show: true, key: '7' },
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

            {/* Search button */}
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all mb-2 w-full"
            >
              <Search size={17} />
              <span className="flex-1 text-left">Ara...</span>
              <kbd className="text-[10px] px-1.5 py-0.5 bg-muted rounded border border-border font-mono">Ctrl+K</kbd>
            </button>

            {/* Nav */}
            <nav className="flex-1 space-y-0.5 overflow-y-auto">
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
                      <span className="flex-1">{item.label}</span>
                      {item.key && (
                        <kbd className="text-[9px] px-1 py-0.5 bg-muted/50 rounded border border-border/50 font-mono text-muted-foreground hidden lg:inline">
                          {item.key}
                        </kbd>
                      )}
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
                Cikis Yap
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
        <div className="flex justify-end items-center px-4 lg:px-8 pt-4 gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearchOpen(true)}
            className="hidden sm:flex items-center gap-2 text-muted-foreground hover:text-foreground h-9 px-3"
          >
            <Search size={14} />
            <span className="text-xs">Ara</span>
            <kbd className="text-[10px] px-1.5 py-0.5 bg-muted rounded border border-border font-mono ml-2">Ctrl+K</kbd>
          </Button>
          <ThemeToggle />
          {canViewBgcComplete && <NotificationBell />}
        </div>
        <div className="p-4 lg:p-8 pt-2">
          {children}
        </div>
      </main>

      {/* Global Search */}
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
