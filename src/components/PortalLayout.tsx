import { ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { CyberLogo } from '@/components/CyberLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { LogOut, Mail } from 'lucide-react';

interface PortalLayoutProps {
  children: ReactNode;
}

export function PortalLayout({ children }: PortalLayoutProps) {
  const { portalUser, isLoading, isAuthenticated, logout } = usePortalAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/portal/login');
    }
  }, [isLoading, isAuthenticated, navigate]);

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

  if (!isAuthenticated || !portalUser) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Bar */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 lg:px-6 h-14">
          <div className="flex items-center gap-3">
            <CyberLogo size="sm" />
            <span className="text-xs text-muted-foreground hidden sm:inline">Musteri Portali</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-lg">
              <Mail size={14} className="text-primary" />
              <span className="text-sm font-mono text-foreground hidden sm:inline">
                {portalUser.email}
              </span>
              <span className="text-sm text-foreground sm:hidden">
                {portalUser.first_name || portalUser.email.split('@')[0]}
              </span>
            </div>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <LogOut size={16} className="mr-1" />
              <span className="hidden sm:inline">Cikis</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
