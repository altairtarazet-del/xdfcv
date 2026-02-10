import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PortalLayout } from '@/components/PortalLayout';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { ShoppingBag } from 'lucide-react';
import { EmptyState } from '@/components/portal/EmptyState';
import { MarketFilterBar, type SortBy, type ViewMode } from '@/components/portal/MarketFilterBar';
import { MarketListingCard } from '@/components/portal/MarketListingCard';
import { MarketContactSheet } from '@/components/portal/MarketContactSheet';
import type { MarketListing, BgcStatus } from '@/types/market';

const BGC_ORDER: Record<string, number> = { clear: 0, consider: 1, pending: 2, processing: 3 };

export default function PortalMarket() {
  const { isAuthenticated } = usePortalAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactListing, setContactListing] = useState<MarketListing | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [bgcFilters, setBgcFilters] = useState<BgcStatus[]>([]);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 500]);
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('marketViewMode') as ViewMode) || 'grid';
  });

  const fetchListings = useCallback(async () => {
    try {
      const token = localStorage.getItem('portalToken');
      const { data, error } = await supabase.functions.invoke('smtp-api', {
        body: { action: 'getListings', portalToken: token || undefined },
      });
      if (error) throw error;
      const list = data?.listings || [];
      setListings(list);
      // Set initial price range from data
      if (list.length > 0) {
        const max = Math.max(...list.map((l: MarketListing) => l.price));
        setPriceRange([0, Math.ceil(max / 10) * 10]);
      }
    } catch {
      toast({ variant: 'destructive', title: 'Hata', description: 'Ilanlar yuklenemedi' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  useEffect(() => {
    localStorage.setItem('marketViewMode', viewMode);
  }, [viewMode]);

  const maxPrice = useMemo(() => {
    if (listings.length === 0) return 500;
    return Math.ceil(Math.max(...listings.map((l) => l.price)) / 10) * 10;
  }, [listings]);

  const handleContact = (listing: MarketListing) => {
    if (!isAuthenticated) {
      toast({ title: 'Giris Gerekli', description: 'Iletisim bilgilerini gormek icin giris yapin' });
      navigate('/portal/login');
      return;
    }
    setContactListing(listing);
  };

  const handleBgcToggle = (status: BgcStatus) => {
    setBgcFilters((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setBgcFilters([]);
    setPriceRange([0, maxPrice]);
    setSortBy('newest');
  };

  const activeFilterCount =
    (searchQuery ? 1 : 0) +
    bgcFilters.length +
    (priceRange[0] > 0 || priceRange[1] < maxPrice ? 1 : 0) +
    (sortBy !== 'newest' ? 1 : 0);

  const filtered = useMemo(() => {
    let result = [...listings];

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          (l.description || '').toLowerCase().includes(q) ||
          l.account_type.toLowerCase().includes(q),
      );
    }

    // BGC filters
    if (bgcFilters.length > 0) {
      result = result.filter((l) => bgcFilters.includes(l.bgc_status));
    }

    // Price range
    result = result.filter((l) => l.price >= priceRange[0] && l.price <= priceRange[1]);

    // Sort
    switch (sortBy) {
      case 'price_asc':
        result.sort((a, b) => a.price - b.price);
        break;
      case 'price_desc':
        result.sort((a, b) => b.price - a.price);
        break;
      case 'bgc':
        result.sort((a, b) => (BGC_ORDER[a.bgc_status] ?? 9) - (BGC_ORDER[b.bgc_status] ?? 9));
        break;
      case 'newest':
      default:
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return result;
  }, [listings, searchQuery, bgcFilters, priceRange, sortBy]);

  return (
    <PortalLayout requireAuth={false}>
      {/* Filter Bar */}
      <MarketFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        bgcFilters={bgcFilters}
        onBgcToggle={handleBgcToggle}
        priceRange={priceRange}
        maxPrice={maxPrice}
        onPriceChange={setPriceRange}
        sortBy={sortBy}
        onSortChange={setSortBy}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        activeFilterCount={activeFilterCount}
        onClearFilters={handleClearFilters}
      />

      <div className="p-4 lg:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShoppingBag size={24} className="text-primary" />
            Hesap Market
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {loading ? 'Yukleniyor...' : `${filtered.length} ilan bulundu`}
          </p>
        </div>

        {/* Content */}
        {loading ? (
          <div className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
              : 'space-y-3'
          }>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="border border-border rounded-xl overflow-hidden">
                <Skeleton className="h-20 w-full" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title={activeFilterCount > 0 ? 'Filtreye uyan ilan bulunamadi' : 'Henuz ilan yok'}
            description={
              activeFilterCount > 0
                ? 'Filtre kriterlerinizi degistirmeyi deneyin'
                : 'Yeni ilanlar eklendiginde burada gorunecek'
            }
            actionLabel={activeFilterCount > 0 ? 'Filtreleri Temizle' : undefined}
            onAction={activeFilterCount > 0 ? handleClearFilters : undefined}
          />
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((listing, i) => (
              <MarketListingCard
                key={listing.id}
                listing={listing}
                index={i}
                isAuthenticated={isAuthenticated}
                onContact={handleContact}
                viewMode="grid"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((listing, i) => (
              <MarketListingCard
                key={listing.id}
                listing={listing}
                index={i}
                isAuthenticated={isAuthenticated}
                onContact={handleContact}
                viewMode="list"
              />
            ))}
          </div>
        )}
      </div>

      {/* Contact Sheet */}
      <MarketContactSheet listing={contactListing} onClose={() => setContactListing(null)} />
    </PortalLayout>
  );
}
