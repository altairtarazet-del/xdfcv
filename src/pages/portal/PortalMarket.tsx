import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PortalLayout } from '@/components/PortalLayout';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ShoppingBag, MessageCircle, LogIn, Phone, Send, Filter } from 'lucide-react';
import type { MarketListing, BgcStatus } from '@/types/market';

const BGC_BADGE: Record<BgcStatus, { label: string; className: string }> = {
  clear: { label: 'BGC Clear', className: 'bg-green-500/15 text-green-400 border-green-500/30' },
  consider: { label: 'BGC Consider', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  pending: { label: 'BGC Pending', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  processing: { label: 'BGC Processing', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
};

export default function PortalMarket() {
  const { isAuthenticated } = usePortalAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactListing, setContactListing] = useState<MarketListing | null>(null);
  const [bgcFilter, setBgcFilter] = useState<string>('all');

  const fetchListings = useCallback(async () => {
    try {
      const token = localStorage.getItem('portalToken');
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'getListings', portalToken: token || undefined },
      });
      if (error) throw error;
      setListings(data?.listings || []);
    } catch {
      toast({ variant: 'destructive', title: 'Hata', description: 'Ilanlar yuklenemedi' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const handleContact = (listing: MarketListing) => {
    if (!isAuthenticated) {
      toast({
        title: 'Giris Gerekli',
        description: 'Iletisim bilgilerini gormek icin giris yapin',
      });
      navigate('/portal/login');
      return;
    }
    setContactListing(listing);
  };

  const filtered = bgcFilter === 'all'
    ? listings
    : listings.filter(l => l.bgc_status === bgcFilter);

  return (
    <PortalLayout requireAuth={false}>
      <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ShoppingBag size={24} className="text-primary" />
              Hesap Market
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Satilik DoorDash hesaplarini inceleyin
            </p>
          </div>

          {/* BGC Filter */}
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-muted-foreground" />
            <Select value={bgcFilter} onValueChange={setBgcFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="BGC Durumu" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tumu</SelectItem>
                <SelectItem value="clear">BGC Clear</SelectItem>
                <SelectItem value="consider">BGC Consider</SelectItem>
                <SelectItem value="pending">BGC Pending</SelectItem>
                <SelectItem value="processing">BGC Processing</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Listings Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="space-y-2">
                  <div className="h-5 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                </CardHeader>
                <CardContent>
                  <div className="h-4 bg-muted rounded w-full mb-2" />
                  <div className="h-10 bg-muted rounded w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <ShoppingBag size={48} className="mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">
              {bgcFilter !== 'all' ? 'Bu filtreye uyan ilan bulunamadi' : 'Henuz ilan yok'}
            </h3>
            <p className="text-sm text-muted-foreground/60 mt-1">
              Yeni ilanlar eklendiginde burada gorunecek
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(listing => {
              const bgc = BGC_BADGE[listing.bgc_status] || BGC_BADGE.pending;
              return (
                <Card key={listing.id} className="flex flex-col hover:border-primary/30 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-tight">{listing.title}</CardTitle>
                      <Badge variant="default" className="text-base font-bold shrink-0 px-3">
                        ${listing.price}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className={bgc.className}>
                        {bgc.label}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {listing.account_type}
                      </Badge>
                      {listing.status === 'reserved' && (
                        <Badge variant="outline" className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30 text-xs">
                          Rezerve
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-between pt-0">
                    {listing.description && (
                      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                        {listing.description}
                      </p>
                    )}
                    <Button
                      className="w-full mt-auto"
                      variant={isAuthenticated ? 'default' : 'outline'}
                      onClick={() => handleContact(listing)}
                    >
                      {isAuthenticated ? (
                        <>
                          <MessageCircle size={16} className="mr-2" />
                          Iletisim
                        </>
                      ) : (
                        <>
                          <LogIn size={16} className="mr-2" />
                          Iletisim icin Giris Yap
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Contact Dialog */}
      <Dialog open={!!contactListing} onOpenChange={(open) => !open && setContactListing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Iletisim — {contactListing?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {contactListing?.contact_info?.whatsapp && (
              <a
                href={`https://wa.me/${contactListing.contact_info.whatsapp.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
              >
                <Phone size={20} className="text-green-500" />
                <div>
                  <p className="text-sm font-medium">WhatsApp</p>
                  <p className="text-xs text-muted-foreground">{contactListing.contact_info.whatsapp}</p>
                </div>
              </a>
            )}
            {contactListing?.contact_info?.telegram && (
              <a
                href={`https://t.me/${contactListing.contact_info.telegram.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
              >
                <Send size={20} className="text-blue-500" />
                <div>
                  <p className="text-sm font-medium">Telegram</p>
                  <p className="text-xs text-muted-foreground">{contactListing.contact_info.telegram}</p>
                </div>
              </a>
            )}
            {!contactListing?.contact_info?.whatsapp && !contactListing?.contact_info?.telegram && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Iletisim bilgisi eklenmemis
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}
