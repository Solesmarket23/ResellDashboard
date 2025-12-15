// StockX API Types and Interfaces

export interface StockXSale {
  id: string;
  orderNumber: string;
  orderType: 'STANDARD' | 'FLEX' | 'DIRECT' | 'DFS';
  status: OrderStatus;
  /**
   * StockX listing identifier for the specific unit/listing that sold (when provided by the API response).
   * We use this to prefer exact unit-level purchase linking (purchase.stockxListingId) before falling back to FIFO.
   */
  listingId?: string;
  product: StockXProduct;
  variant: StockXVariant;
  pricing: StockXPricing;
  authentication?: StockXAuthentication;
  shipping?: StockXShipping;
  createdAt: string;
  updatedAt: string;
  payoutDate?: string;
  source: 'stockx_api' | 'stockx_bulk_import_stream' | 'stockx_bulk_import';
  needsPayoutRefresh?: boolean;
}

export interface StockXProduct {
  productId: string;
  productName: string;
  brand: string;
  styleId?: string;
  retailPrice?: number;
  imageUrl?: string;
  category?: string;
  urlKey?: string;
}

export interface StockXVariant {
  variantId: string;
  size: string;
  sizeType?: string;
}

export interface StockXPricing {
  salePrice: number;
  buyerPaid: number;
  sellerFees: number;
  processingFee: number;
  shippingFee: number;
  transactionFee: number;
  paymentProcessingFee: number;
  totalPayout: number;
  currency: string;
  sellerLevel?: string;
  feePercentage?: number;
  adjustments?: Array<{
    type: string;
    amount: number;
    description?: string;
  }>;
}

export interface StockXAuthentication {
  status: 'PASSED' | 'FAILED' | 'PENDING' | 'NOT_REQUIRED';
  verificationDate?: string;
  failureReason?: string;
}

export interface StockXShipping {
  trackingNumber?: string;
  carrier?: string;
  shippedDate?: string;
  deliveredDate?: string;
  shippingLabel?: string;
  isDirectShip?: boolean;
}

export type OrderStatus = 
  | 'PENDING'
  | 'SHIPPED'
  | 'RECEIVED'
  | 'AUTHENTICATING'
  | 'AUTHENTICATED'
  | 'PAYOUT_PENDING'
  | 'PAYOUT_COMPLETED'
  | 'CANCELLED'
  | 'AUTHENTICATION_FAILED'
  | 'RETURNED';

export interface StockXSalesResponse {
  sales: StockXSale[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
    hasNext: boolean;
  };
  lastSyncTime?: string;
  cachedData?: boolean;
}

export interface StockXSyncStatus {
  isAuthenticated: boolean;
  lastSyncTime?: string;
  totalSales: number;
  totalRevenue: number;
  pendingPayouts: number;
  authenticationRate: number;
  error?: string;
}