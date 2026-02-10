export type ListingStatus = 'available' | 'reserved' | 'sold' | 'delisted';
export type BgcStatus = 'clear' | 'consider' | 'pending' | 'processing';

export interface MarketListing {
  id: string;
  title: string;
  description: string | null;
  account_type: string;
  bgc_status: BgcStatus;
  price: number;
  contact_info?: { whatsapp?: string; telegram?: string };
  status: ListingStatus;
  created_at: string;
  updated_at?: string;
}
