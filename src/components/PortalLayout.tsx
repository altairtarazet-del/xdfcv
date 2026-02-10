import { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { CyberLogo } from '@/components/CyberLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut, Mail, ShoppingBag, Inbox, LogIn, Home, User } from 'lucide-react';
import { SenderAvatar } from '@/components/portal/SenderAvatar';

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

  const isLandingActive = location.pathname === '/portal' && !location.pathname.includes('/portal/');
  const isMarketActive = location.pathname === '/portal/market';
  const isMailActive = location.pathname === '/portal/mail';

  const navItems = [
    { label: 'Portal', icon: Home, path: '/portal', active: isLandingActive },
    { label: 'Market', icon: ShoppingBag, path: '/portal/market', active: isMarketActive },
    ...(isAuthenticated
      ? [{ label: 'Posta', icon: Inbox, path: '/portal/mail', active: isMailActive }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Premium Top Nav */}
      <header className="border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 lg:px-6 h-14">
          {/* Left: Logo + Nav */}
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/portal')} className="flex items-center gap-2">
              <CyberLogo size="sm" />
            </button>

            <Separator orientation="vertical" className="h-6 hidden sm:block" />

            <nav className="flex items-center gap-0.5 ml-1">
              {navItems.map((item) => (
                <Button
                  key={item.path}
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(item.path)}
                  className={`text-sm gap-1.5 ${
                    item.active
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <item.icon size={15} />
                  <span className="hidden sm:inline">{item.label}</span>
                </Button>
              ))}
            </nav>
          </div>

          {/* Right: Theme + Auth */}
          <div className="flex items-center gap-2">
            <ThemeToggle />

            {isAuthenticated && portalUser ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors">
                    <SenderAvatar name={portalUser.first_name || portalUser.email} size="sm" />
                    <span className="text-sm font-medium text-foreground hidden md:inline max-w-[140px] truncate">
                      {portalUser.first_name || portalUser.email.split('@')[0]}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex items-center gap-2">
                      <SenderAvatar name={portalUser.first_name || portalUser.email} size="md" />
                      <div className="flex flex-col space-y-0.5">
                        <p className="text-sm font-medium">
                          {portalUser.first_name
                            ? `${portalUser.first_name} ${portalUser.last_name || ''}`
                            : portalUser.email.split('@')[0]}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">{portalUser.email}</p>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/portal/mail')}>
                    <Mail size={14} className="mr-2" />
                    Posta Kutusu
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                    <LogOut size={14} className="mr-2" />
                    Cikis Yap
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={() => navigate('/portal/login')}
                className="text-sm gap-1.5"
              >
                <LogIn size={15} />
                <span className="hidden sm:inline">Giris Yap</span>
              </Button>
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
