import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PortalLayout } from '@/components/PortalLayout';
import { CyberBackground } from '@/components/CyberBackground';
import { CyberLogo } from '@/components/CyberLogo';
import { StatCard } from '@/components/portal/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import {
  ShoppingBag,
  Mail,
  TrendingUp,
  ShieldCheck,
  DollarSign,
  ArrowRight,
  Lock,
  Sparkles,
} from 'lucide-react';
import type { MarketListing } from '@/types/market';

export default function PortalLanding() {
  const navigate = useNavigate();
  const { isAuthenticated } = usePortalAuth();
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchListings = useCallback(async () => {
    try {
      const token = localStorage.getItem('portalToken');
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'getListings', portalToken: token || undefined },
      });
      if (error) throw error;
      setListings(data?.listings || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const activeCount = listings.filter((l) => l.status === 'available').length;
  const clearCount = listings.filter((l) => l.bgc_status === 'clear').length;
  const clearRate = listings.length > 0 ? Math.round((clearCount / listings.length) * 100) : 0;
  const avgPrice = listings.length > 0
    ? Math.round(listings.reduce((s, l) => s + l.price, 0) / listings.length)
    : 0;

  const featured = listings.slice(0, 3);

  const BGC_COLORS: Record<string, string> = {
    clear: 'bg-green-500/15 text-green-400 border-green-500/30',
    consider: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    pending: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    processing: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  };

  return (
    <PortalLayout requireAuth={false}>
      <div className="relative min-h-[calc(100vh-3.5rem)]">
        <CyberBackground />

        <div className="relative z-10 max-w-5xl mx-auto px-4 py-12 lg:py-20 space-y-12">
          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center space-y-4"
          >
            <div className="flex justify-center mb-6">
              <CyberLogo size="lg" />
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold">
              <span className="gradient-text">XDFCV</span>{' '}
              <span className="text-foreground">Portal</span>
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg max-w-lg mx-auto">
              DoorDash hesap market ve guvenli posta sisteminiz. Her sey tek yerden.
            </p>
          </motion.div>

          {/* Stats Bar */}
          {!loading && listings.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatCard icon={TrendingUp} label="Aktif Ilan" value={activeCount} delay={0.1} />
              <StatCard icon={ShieldCheck} label="BGC Clear Oran" value={`%${clearRate}`} delay={0.2} />
              <StatCard icon={DollarSign} label="Ort. Fiyat" value={`$${avgPrice}`} delay={0.3} />
            </div>
          )}

          {/* Navigation Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Market Card */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => navigate('/portal/market')}
              className="glass-card p-6 text-left group hover:border-primary/40 transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="rounded-xl bg-primary/10 p-3">
                  <ShoppingBag size={24} className="text-primary" />
                </div>
                <ArrowRight
                  size={20}
                  className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all"
                />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-1">Hesap Market</h2>
              <p className="text-sm text-muted-foreground">
                BGC kontrollu DoorDash hesaplarini inceleyin ve satin alin
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Badge variant="secondary" className="text-xs">
                  <Sparkles size={12} className="mr-1" />
                  Herkese Acik
                </Badge>
              </div>
            </motion.button>

            {/* Mail Card */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => navigate(isAuthenticated ? '/portal/mail' : '/portal/login')}
              className="glass-card p-6 text-left group hover:border-accent/40 transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="rounded-xl bg-accent/10 p-3">
                  <Mail size={24} className="text-accent" />
                </div>
                <div className="flex items-center gap-1.5">
                  {!isAuthenticated && <Lock size={14} className="text-muted-foreground" />}
                  <ArrowRight
                    size={20}
                    className="text-muted-foreground group-hover:text-accent group-hover:translate-x-1 transition-all"
                  />
                </div>
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-1">Posta Kutusu</h2>
              <p className="text-sm text-muted-foreground">
                Email'lerinizi guvenli bir sekilde okuyun ve gonderin
              </p>
              <div className="flex items-center gap-2 mt-3">
                {isAuthenticated ? (
                  <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-500/30">
                    Giris Yapildi
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    <Lock size={10} className="mr-1" />
                    Giris Gerekli
                  </Badge>
                )}
              </div>
            </motion.button>
          </div>

          {/* Featured Listings */}
          {!loading && featured.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.4 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Son Ilanlar</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/portal/market')}
                  className="text-muted-foreground hover:text-primary gap-1"
                >
                  Tumunu Gor
                  <ArrowRight size={14} />
                </Button>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
                {featured.map((listing) => (
                  <div
                    key={listing.id}
                    onClick={() => navigate('/portal/market')}
                    className="glass-card p-4 min-w-[260px] snap-start cursor-pointer hover:border-primary/30 transition-colors flex-shrink-0"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-sm font-medium text-foreground line-clamp-1 flex-1">
                        {listing.title}
                      </p>
                      <Badge variant="default" className="ml-2 text-sm font-bold shrink-0">
                        ${listing.price}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${BGC_COLORS[listing.bgc_status] || ''}`}
                      >
                        {listing.bgc_status.toUpperCase()}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {listing.account_type}
                      </Badge>
                    </div>
                    {listing.description && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-1">
                        {listing.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Footer */}
          <div className="text-center pt-8 border-t border-border/30">
            <p className="text-muted-foreground/50 text-xs">
              XDFCV &copy; {new Date().getFullYear()} — Guvenli & Hizli
            </p>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
