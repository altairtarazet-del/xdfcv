import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, Send, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { MarketListing, BgcStatus } from '@/types/market';

const BGC_BADGE: Record<BgcStatus, { label: string; className: string }> = {
  clear: { label: 'BGC Clear', className: 'bg-green-500/15 text-green-400 border-green-500/30' },
  consider: { label: 'BGC Consider', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  pending: { label: 'BGC Pending', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  processing: { label: 'BGC Processing', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
};

interface MarketContactSheetProps {
  listing: MarketListing | null;
  onClose: () => void;
}

export function MarketContactSheet({ listing, onClose }: MarketContactSheetProps) {
  const { toast } = useToast();

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Kopyalandi', description: `${label} panoya kopyalandi` });
  };

  if (!listing) return null;

  const bgc = BGC_BADGE[listing.bgc_status] || BGC_BADGE.pending;

  return (
    <Sheet open={!!listing} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Iletisim</SheetTitle>
          <SheetDescription>Satici ile iletisime gecin</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Listing Preview */}
          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">{listing.title}</p>
              <Badge variant="default" className="text-base font-bold shrink-0">${listing.price}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className={`text-xs ${bgc.className}`}>{bgc.label}</Badge>
              <Badge variant="secondary" className="text-xs">{listing.account_type}</Badge>
            </div>
            {listing.description && (
              <p className="text-xs text-muted-foreground">{listing.description}</p>
            )}
          </div>

          {/* Contact Links */}
          <div className="space-y-3">
            {listing.contact_info?.whatsapp && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                <a
                  href={`https://wa.me/${listing.contact_info.whatsapp.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 flex-1"
                >
                  <div className="h-9 w-9 rounded-full bg-green-500/15 flex items-center justify-center">
                    <Phone size={18} className="text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">WhatsApp</p>
                    <p className="text-xs text-muted-foreground">{listing.contact_info.whatsapp}</p>
                  </div>
                </a>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => copyToClipboard(listing.contact_info!.whatsapp!, 'WhatsApp numarasi')}
                >
                  <Copy size={14} />
                </Button>
              </div>
            )}

            {listing.contact_info?.telegram && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                <a
                  href={`https://t.me/${listing.contact_info.telegram.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 flex-1"
                >
                  <div className="h-9 w-9 rounded-full bg-blue-500/15 flex items-center justify-center">
                    <Send size={18} className="text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Telegram</p>
                    <p className="text-xs text-muted-foreground">{listing.contact_info.telegram}</p>
                  </div>
                </a>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => copyToClipboard(listing.contact_info!.telegram!, 'Telegram kullanici adi')}
                >
                  <Copy size={14} />
                </Button>
              </div>
            )}

            {!listing.contact_info?.whatsapp && !listing.contact_info?.telegram && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Iletisim bilgisi eklenmemis
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
