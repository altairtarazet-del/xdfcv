import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, X, LayoutGrid, List, SlidersHorizontal } from 'lucide-react';
import type { BgcStatus } from '@/types/market';

export type SortBy = 'newest' | 'price_asc' | 'price_desc' | 'bgc';
export type ViewMode = 'grid' | 'list';

interface MarketFilterBarProps {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  bgcFilters: BgcStatus[];
  onBgcToggle: (status: BgcStatus) => void;
  priceRange: [number, number];
  maxPrice: number;
  onPriceChange: (range: [number, number]) => void;
  sortBy: SortBy;
  onSortChange: (v: SortBy) => void;
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
}

const BGC_OPTIONS: { value: BgcStatus; label: string; color: string }[] = [
  { value: 'clear', label: 'Clear', color: 'bg-green-500/15 text-green-400 border-green-500/30 hover:bg-green-500/25' },
  { value: 'consider', label: 'Consider', color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/25' },
  { value: 'pending', label: 'Pending', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/25' },
  { value: 'processing', label: 'Processing', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/25' },
];

export function MarketFilterBar({
  searchQuery,
  onSearchChange,
  bgcFilters,
  onBgcToggle,
  priceRange,
  maxPrice,
  onPriceChange,
  sortBy,
  onSortChange,
  viewMode,
  onViewModeChange,
  activeFilterCount,
  onClearFilters,
}: MarketFilterBarProps) {
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);

  useEffect(() => {
    const timer = setTimeout(() => onSearchChange(debouncedSearch), 300);
    return () => clearTimeout(timer);
  }, [debouncedSearch, onSearchChange]);

  return (
    <div className="sticky top-14 z-30 bg-background/80 backdrop-blur-md border-b border-border py-3 px-4 lg:px-6 space-y-3">
      {/* Row 1: Search + Sort + View Toggle */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input
            placeholder="Ilan ara (baslik, aciklama, hesap tipi)..."
            value={debouncedSearch}
            onChange={(e) => setDebouncedSearch(e.target.value)}
            className="pl-9 pr-9 text-sm h-9"
          />
          {debouncedSearch && (
            <button
              onClick={() => { setDebouncedSearch(''); onSearchChange(''); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortBy)}>
          <SelectTrigger className="w-[150px] h-9 text-sm">
            <SlidersHorizontal size={14} className="mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">En Yeni</SelectItem>
            <SelectItem value="price_asc">Fiyat: Dusuk</SelectItem>
            <SelectItem value="price_desc">Fiyat: Yuksek</SelectItem>
            <SelectItem value="bgc">BGC Status</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center border border-border rounded-md">
          <Button
            variant="ghost"
            size="icon"
            className={`h-9 w-9 rounded-r-none ${viewMode === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
            onClick={() => onViewModeChange('grid')}
          >
            <LayoutGrid size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`h-9 w-9 rounded-l-none ${viewMode === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
            onClick={() => onViewModeChange('list')}
          >
            <List size={16} />
          </Button>
        </div>
      </div>

      {/* Row 2: BGC Pills + Price Slider + Clear */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          {BGC_OPTIONS.map((opt) => {
            const active = bgcFilters.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => onBgcToggle(opt.value)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                  active ? opt.color + ' ring-1 ring-current/20' : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 min-w-[180px]">
          <span className="text-xs text-muted-foreground whitespace-nowrap">${priceRange[0]}</span>
          <Slider
            min={0}
            max={maxPrice || 500}
            step={5}
            value={priceRange}
            onValueChange={(v) => onPriceChange(v as [number, number])}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">${priceRange[1]}</span>
        </div>

        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onClearFilters} className="text-xs text-muted-foreground h-7 gap-1">
            <X size={12} />
            Temizle
            <Badge variant="secondary" className="ml-0.5 text-[10px] h-4 px-1.5">{activeFilterCount}</Badge>
          </Button>
        )}
      </div>
    </div>
  );
}
