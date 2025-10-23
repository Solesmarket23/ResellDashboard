// Alias Pricing Insights Service for market data
import { AliasBaseService, PaginationParams } from './aliasBaseService';
import { ALIAS_ENDPOINTS, ALIAS_ENUMS } from './aliasConfig';

export interface PricingAvailability {
  lowest_listing_price_cents: string;
  highest_offer_price_cents: string;
  last_sold_listing_price_cents: string;
  global_indicator_price_cents: string;
}

export interface PricingVariant {
  size: number;
  product_condition: string;
  packaging_condition: string;
  consigned: boolean;
  availability: PricingAvailability;
}

export interface PricingInsightsParams {
  catalog_id: string;
  size: number;
  product_condition: string;
  packaging_condition: string;
  consigned?: boolean;
  region_id?: string;
}

export interface OfferHistogramBin {
  offer_price_cents: string;
  count: string;
}

export interface OfferHistogram {
  bins: OfferHistogramBin[];
}

export interface RecentSale {
  purchased_at: string;
  price_cents: string;
  size: number;
  consigned: boolean;
  catalog_id: string;
}

export interface RecentSalesParams extends PaginationParams {
  catalog_id: string;
  size?: number;
  product_condition?: string;
  packaging_condition?: string;
  consigned?: boolean;
  region_id?: string;
}

export class AliasPricingService extends AliasBaseService {
  /**
   * Get comprehensive pricing data for all variants of a product
   */
  async getPricingAvailabilities(
    catalogId: string,
    regionId?: string,
    consigned?: boolean
  ): Promise<AliasApiResponse<{ variants: PricingVariant[] }>> {
    const params: Record<string, any> = {};
    if (regionId) params.region_id = regionId;
    if (consigned !== undefined) params.consigned = consigned;

    return this.get<{ variants: PricingVariant[] }>(
      ALIAS_ENDPOINTS.pricingAvailability(catalogId),
      params
    );
  }

  /**
   * Get pricing insights for a specific product variant
   */
  async getPricingInsights(params: PricingInsightsParams): Promise<AliasApiResponse<{ availability: PricingAvailability }>> {
    const queryParams: Record<string, any> = {
      catalog_id: params.catalog_id,
      size: params.size,
      product_condition: params.product_condition,
      packaging_condition: params.packaging_condition,
    };

    if (params.consigned !== undefined) queryParams.consigned = params.consigned;
    if (params.region_id) queryParams.region_id = params.region_id;

    return this.get<{ availability: PricingAvailability }>(
      ALIAS_ENDPOINTS.pricingInsights,
      queryParams
    );
  }

  /**
   * Get offer price distribution histogram
   */
  async getOfferHistogram(params: Omit<PricingInsightsParams, 'consigned'>): Promise<AliasApiResponse<{ offer_histogram: OfferHistogram }>> {
    const queryParams: Record<string, any> = {
      catalog_id: params.catalog_id,
      size: params.size,
      product_condition: params.product_condition,
      packaging_condition: params.packaging_condition,
    };

    if (params.region_id) queryParams.region_id = params.region_id;

    return this.get<{ offer_histogram: OfferHistogram }>(
      ALIAS_ENDPOINTS.offerHistogram,
      queryParams
    );
  }

  /**
   * Get recent sales history
   */
  async getRecentSales(params: RecentSalesParams): Promise<AliasApiResponse<{ recent_sales: RecentSale[] }>> {
    const queryParams: Record<string, any> = {
      catalog_id: params.catalog_id,
    };

    if (params.size !== undefined) queryParams.size = params.size;
    if (params.product_condition) queryParams.product_condition = params.product_condition;
    if (params.packaging_condition) queryParams.packaging_condition = params.packaging_condition;
    if (params.consigned !== undefined) queryParams.consigned = params.consigned;
    if (params.region_id) queryParams.region_id = params.region_id;
    if (params.limit) queryParams.limit = params.limit;
    if (params.pagination_token) queryParams.pagination_token = params.pagination_token;

    return this.get<{ recent_sales: RecentSale[] }>(
      ALIAS_ENDPOINTS.recentSales,
      queryParams
    );
  }

  /**
   * Get market summary for a product
   */
  async getMarketSummary(catalogId: string, size: number, condition: string = ALIAS_ENUMS.PRODUCT_CONDITION.NEW): Promise<AliasApiResponse<{
    lowest_price: number;
    highest_offer: number;
    last_sold: number;
    market_price: number;
    sales_count: number;
  }>> {
    try {
      // Get pricing insights
      const pricingResponse = await this.getPricingInsights({
        catalog_id: catalogId,
        size,
        product_condition: condition,
        packaging_condition: ALIAS_ENUMS.PACKAGING_CONDITION.GOOD_CONDITION,
      });

      if (!pricingResponse.success || !pricingResponse.data) {
        return pricingResponse;
      }

      // Get recent sales for context
      const salesResponse = await this.getRecentSales({
        catalog_id: catalogId,
        size,
        product_condition: condition,
        limit: 10,
      });

      const pricing = pricingResponse.data.availability;
      const sales = salesResponse.success ? salesResponse.data?.recent_sales || [] : [];

      return {
        success: true,
        data: {
          lowest_price: parseInt(pricing.lowest_listing_price_cents) / 100,
          highest_offer: parseInt(pricing.highest_offer_price_cents) / 100,
          last_sold: parseInt(pricing.last_sold_listing_price_cents) / 100,
          market_price: parseInt(pricing.global_indicator_price_cents) / 100,
          sales_count: sales.length,
        },
        requestId: pricingResponse.requestId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get price trend analysis
   */
  async getPriceTrend(catalogId: string, size: number, days = 30): Promise<AliasApiResponse<{
    average_price: number;
    price_range: { min: number; max: number };
    trend: 'up' | 'down' | 'stable';
    sales_count: number;
  }>> {
    const salesResponse = await this.getRecentSales({
      catalog_id: catalogId,
      size,
      limit: 200, // Get more data for trend analysis
    });

    if (!salesResponse.success || !salesResponse.data) {
      return salesResponse;
    }

    const sales = salesResponse.data.recent_sales;
    const prices = sales.map(sale => parseInt(sale.price_cents) / 100);
    
    if (prices.length === 0) {
      return {
        success: true,
        data: {
          average_price: 0,
          price_range: { min: 0, max: 0 },
          trend: 'stable' as const,
          sales_count: 0,
        },
        requestId: salesResponse.requestId,
      };
    }

    const averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    // Simple trend analysis - compare first half vs second half
    const midPoint = Math.floor(prices.length / 2);
    const firstHalf = prices.slice(0, midPoint);
    const secondHalf = prices.slice(midPoint);
    
    const firstHalfAvg = firstHalf.reduce((sum, price) => sum + price, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, price) => sum + price, 0) / secondHalf.length;
    
    let trend: 'up' | 'down' | 'stable' = 'stable';
    const changePercent = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
    
    if (changePercent > 5) trend = 'up';
    else if (changePercent < -5) trend = 'down';

    return {
      success: true,
      data: {
        average_price: averagePrice,
        price_range: { min: minPrice, max: maxPrice },
        trend,
        sales_count: sales.length,
      },
      requestId: salesResponse.requestId,
    };
  }
}
