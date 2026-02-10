import { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { CyberLogo } from '@/components/CyberLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { LogOut, Mail, ShoppingBag, Inbox, LogIn } from 'lucide-react';

interface PortalLayoutProps {
  children: ReactNode;
  requireAuth?: boolean;
}

export function PortalLayout({ children, requireAuth = false }: PortalLayoutProps) {
  const { portalUser, isLoading, isAuthenticated, logout } = usePortalAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (requireAuth && !isLoading && !isAuthenticated) {
      navigate('/portal/login');
    }
  }, [requireAuth, isLoading, isAuthenticated, navigate]);

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

  if (requireAuth && (!isAuthenticated || !portalUser)) return null;

  const isMarketActive = location.pathname === '/portal' || location.pathname === '/portal/market';
  const isMailActive = location.pathname === '/portal/mail';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Bar */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 lg:px-6 h-14">
          <div className="flex items-center gap-3">
            <CyberLogo size="sm" />
            <span className="text-xs text-muted-foreground hidden sm:inline">Musteri Portali</span>

            {/* Tab Navigation */}
            <nav className="flex items-center gap-1 ml-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/portal')}
                className={`text-sm ${isMarketActive ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground'}`}
              >
                <ShoppingBag size={15} className="mr-1.5" />
                Market
              </Button>
              {isAuthenticated && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/portal/mail')}
                  className={`text-sm ${isMailActive ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground'}`}
                >
                  <Inbox size={15} className="mr-1.5" />
                  Posta
                </Button>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {isAuthenticated && portalUser ? (
              <>
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
              </>
            ) : (
              <>
                <ThemeToggle />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/portal/login')}
                  className="text-sm"
                >
                  <LogIn size={15} className="mr-1.5" />
                  Giris Yap
                </Button>
              </>
            )}
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
