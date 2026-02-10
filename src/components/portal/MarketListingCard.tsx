import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageCircle, LogIn, Clock } from 'lucide-react';
import type { MarketListing, BgcStatus } from '@/types/market';

const BGC_BADGE: Record<BgcStatus, { label: string; className: string }> = {
  clear: { label: 'BGC Clear', className: 'bg-green-500/15 text-green-400 border-green-500/30' },
  consider: { label: 'BGC Consider', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  pending: { label: 'BGC Pending', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  processing: { label: 'BGC Processing', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
};

interface MarketListingCardProps {
  listing: MarketListing;
  index: number;
  isAuthenticated: boolean;
  onContact: (listing: MarketListing) => void;
  viewMode: 'grid' | 'list';
}

function isNew(created: string): boolean {
  return Date.now() - new Date(created).getTime() < 24 * 60 * 60 * 1000;
}

export function MarketListingCard({ listing, index, isAuthenticated, onContact, viewMode }: MarketListingCardProps) {
  const bgc = BGC_BADGE[listing.bgc_status] || BGC_BADGE.pending;
  const isNewListing = isNew(listing.created_at);
  const initial = (listing.title[0] || 'D').toUpperCase();

  if (viewMode === 'list') {
    return (
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.03, duration: 0.25 }}
        className="flex items-center gap-4 p-4 border border-border rounded-lg hover:border-primary/30 hover:bg-card/50 transition-all group"
      >
        {/* Avatar */}
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-lg font-bold text-primary shrink-0">
          {initial}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground truncate">{listing.title}</p>
            {isNewListing && (
              <Badge variant="default" className="text-[10px] h-4 px-1.5 bg-primary/20 text-primary border-0">
                <Clock size={10} className="mr-0.5" />Yeni
              </Badge>
            )}
          </div>
          {listing.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{listing.description}</p>
          )}
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className={`text-xs ${bgc.className}`}>{bgc.label}</Badge>
          <Badge variant="secondary" className="text-xs">{listing.account_type}</Badge>
          {listing.status === 'reserved' && (
            <Badge variant="outline" className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30 text-xs">Rezerve</Badge>
          )}
        </div>

        {/* Price + Action */}
        <Badge variant="default" className="text-base font-bold shrink-0 px-3">${listing.price}</Badge>
        <Button
          size="sm"
          variant={isAuthenticated ? 'default' : 'outline'}
          onClick={() => onContact(listing)}
          className="shrink-0"
        >
          {isAuthenticated ? <MessageCircle size={14} /> : <LogIn size={14} />}
        </Button>
      </motion.div>
    );
  }

  // Grid card
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="flex flex-col border border-border rounded-xl overflow-hidden hover:border-primary/30 transition-all group hover-lift"
    >
      {/* Gradient Header */}
      <div className="relative h-20 bg-gradient-to-r from-primary/10 via-accent/5 to-secondary/10 flex items-center justify-center">
        <div className="h-12 w-12 rounded-full bg-background/80 backdrop-blur flex items-center justify-center text-xl font-bold text-primary border border-primary/20">
          {initial}
        </div>
        {/* Price badge */}
        <Badge variant="default" className="absolute top-2 right-2 text-sm font-bold px-2.5">
          ${listing.price}
        </Badge>
        {/* New badge */}
        {isNewListing && (
          <Badge
            variant="default"
            className="absolute top-2 left-2 text-[10px] h-5 bg-primary/20 text-primary border-0"
          >
            <Clock size={10} className="mr-0.5" />
            Yeni
          </Badge>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground line-clamp-1">{listing.title}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className={`text-xs ${bgc.className}`}>{bgc.label}</Badge>
          <Badge variant="secondary" className="text-xs">{listing.account_type}</Badge>
          {listing.status === 'reserved' && (
            <Badge variant="outline" className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30 text-xs">Rezerve</Badge>
          )}
        </div>
        {listing.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{listing.description}</p>
        )}
      </div>

      {/* Action */}
      <div className="px-4 pb-4">
        <Button
          className="w-full"
          size="sm"
          variant={isAuthenticated ? 'default' : 'outline'}
          onClick={() => onContact(listing)}
        >
          {isAuthenticated ? (
            <>
              <MessageCircle size={14} className="mr-1.5" />
              Iletisim
            </>
          ) : (
            <>
              <LogIn size={14} className="mr-1.5" />
              Iletisim icin Giris Yap
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
}
