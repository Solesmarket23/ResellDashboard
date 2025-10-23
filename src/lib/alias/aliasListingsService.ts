// Alias Listings Service for managing product listings
import { AliasBaseService, PaginationParams, PaginatedResponse } from './aliasBaseService';
import { ALIAS_ENDPOINTS, ALIAS_ENUMS } from './aliasConfig';

export interface Listing {
  id: string;
  catalog_id: string;
  condition: string;
  packaging_condition: string;
  size: number;
  size_unit: string;
  sku: string;
  consigned: boolean;
  created_at: string;
  updated_at: string;
  status: string;
  price_cents: string;
  activated_at?: string;
  metadata: Record<string, any>;
  defects: string[];
  additional_defects?: string;
}

export interface CreateListingParams {
  catalog_id: string;
  price_cents: string;
  condition: string;
  packaging_condition: string;
  size: number;
  size_unit: string;
  activate?: boolean;
  metadata?: Record<string, any>;
  defects?: string[];
  additional_defects?: string;
}

export interface UpdateListingParams {
  catalog_id?: string;
  price_cents?: string;
  size?: number;
  size_unit?: string;
}

export interface SearchListingsParams extends PaginationParams {
  search_term?: string;
  facet_filters?: string[];
  numeric_filters?: string[];
  order?: {
    sort_by?: string;
    order_by?: string;
  };
}

export interface SearchListingsResponse extends PaginatedResponse<Listing> {
  listings: Listing[];
  pagination: {
    pagination_token?: string;
    has_more: boolean;
    total_count?: string;
  };
}

export class AliasListingsService extends AliasBaseService {
  /**
   * Search listings with filters
   */
  async searchListings(params: SearchListingsParams): Promise<AliasApiResponse<SearchListingsResponse>> {
    const queryParams: Record<string, any> = {};
    
    if (params.search_term) queryParams.search_term = params.search_term;
    if (params.facet_filters) queryParams.facet_filters = params.facet_filters;
    if (params.numeric_filters) queryParams.numeric_filters = params.numeric_filters;
    if (params.limit) queryParams.page_size = params.limit;
    if (params.pagination_token) queryParams.pagination_token = params.pagination_token;
    if (params.order?.sort_by) queryParams['order.sort_by'] = params.order.sort_by;
    if (params.order?.order_by) queryParams['order.order_by'] = params.order.order_by;

    return this.get<SearchListingsResponse>(ALIAS_ENDPOINTS.listings, queryParams);
  }

  /**
   * Get a specific listing by ID
   */
  async getListing(listingId: string): Promise<AliasApiResponse<{ listing: Listing }>> {
    return this.get<{ listing: Listing }>(ALIAS_ENDPOINTS.listing(listingId));
  }

  /**
   * Create a new listing
   */
  async createListing(params: CreateListingParams): Promise<AliasApiResponse<{ listing: Listing }>> {
    const queryParams: Record<string, any> = {
      catalog_id: params.catalog_id,
      price_cents: params.price_cents,
      condition: params.condition,
      packaging_condition: params.packaging_condition,
      size: params.size,
      size_unit: params.size_unit,
    };

    if (params.activate !== undefined) queryParams.activate = params.activate;
    if (params.metadata) queryParams.metadata = JSON.stringify(params.metadata);
    if (params.defects) queryParams.defects = params.defects;
    if (params.additional_defects) queryParams.additional_defects = params.additional_defects;

    return this.post<{ listing: Listing }>(ALIAS_ENDPOINTS.listings, queryParams);
  }

  /**
   * Update an existing listing
   */
  async updateListing(listingId: string, params: UpdateListingParams): Promise<AliasApiResponse<{ listing: Listing }>> {
    const queryParams: Record<string, any> = {};
    
    if (params.catalog_id) queryParams.catalog_id = params.catalog_id;
    if (params.price_cents) queryParams.price_cents = params.price_cents;
    if (params.size !== undefined) queryParams.size = params.size;
    if (params.size_unit) queryParams.size_unit = params.size_unit;

    return this.post<{ listing: Listing }>(ALIAS_ENDPOINTS.listing(listingId), queryParams);
  }

  /**
   * Delete a listing
   */
  async deleteListing(listingId: string): Promise<AliasApiResponse<{ id: string }>> {
    return this.delete<{ id: string }>(ALIAS_ENDPOINTS.listing(listingId));
  }

  /**
   * Activate a listing
   */
  async activateListing(listingId: string): Promise<AliasApiResponse<{ listing: Listing }>> {
    return this.post<{ listing: Listing }>(ALIAS_ENDPOINTS.listingActivate(listingId));
  }

  /**
   * Deactivate a listing
   */
  async deactivateListing(listingId: string): Promise<AliasApiResponse<{ listing: Listing }>> {
    return this.post<{ listing: Listing }>(ALIAS_ENDPOINTS.listingDeactivate(listingId));
  }

  /**
   * Add metadata to a listing
   */
  async addListingMetadata(listingId: string, metadata: Record<string, any>): Promise<AliasApiResponse<{ listing: Listing }>> {
    return this.post<{ listing: Listing }>(ALIAS_ENDPOINTS.listingMetadata(listingId), { metadata });
  }

  /**
   * Remove metadata from a listing
   */
  async removeListingMetadata(listingId: string, keys: string[]): Promise<AliasApiResponse<{ listing: Listing }>> {
    return this.post<{ listing: Listing }>(ALIAS_ENDPOINTS.listingMetadataDelete(listingId), { keys });
  }

  /**
   * Get listings by status
   */
  async getListingsByStatus(status: string, limit = 25): Promise<AliasApiResponse<SearchListingsResponse>> {
    return this.searchListings({
      facet_filters: [`status: ${status}`],
      limit,
    });
  }

  /**
   * Get active listings
   */
  async getActiveListings(limit = 25): Promise<AliasApiResponse<SearchListingsResponse>> {
    return this.getListingsByStatus(ALIAS_ENUMS.LISTING_STATUS.ACTIVE, limit);
  }

  /**
   * Get inactive listings
   */
  async getInactiveListings(limit = 25): Promise<AliasApiResponse<SearchListingsResponse>> {
    return this.getListingsByStatus(ALIAS_ENUMS.LISTING_STATUS.INACTIVE, limit);
  }

  /**
   * Get listings by price range
   */
  async getListingsByPriceRange(minPrice: number, maxPrice: number, limit = 25): Promise<AliasApiResponse<SearchListingsResponse>> {
    return this.searchListings({
      numeric_filters: [
        `price_cents >= ${minPrice * 100}`,
        `price_cents <= ${maxPrice * 100}`,
      ],
      limit,
    });
  }

  /**
   * Get listings by size
   */
  async getListingsBySize(size: number, limit = 25): Promise<AliasApiResponse<SearchListingsResponse>> {
    return this.searchListings({
      numeric_filters: [`size = ${size}`],
      limit,
    });
  }

  /**
   * Get listings by catalog ID
   */
  async getListingsByCatalogId(catalogId: string, limit = 25): Promise<AliasApiResponse<SearchListingsResponse>> {
    return this.searchListings({
      search_term: catalogId,
      limit,
    });
  }

  /**
   * Get listing statistics
   */
  async getListingStats(): Promise<AliasApiResponse<{
    total: number;
    active: number;
    inactive: number;
    pending: number;
  }>> {
    try {
      const [activeResponse, inactiveResponse, pendingResponse] = await Promise.all([
        this.getActiveListings(1),
        this.getInactiveListings(1),
        this.getListingsByStatus(ALIAS_ENUMS.LISTING_STATUS.PENDING, 1),
      ]);

      const total = (activeResponse.data?.pagination.total_count ? parseInt(activeResponse.data.pagination.total_count) : 0) +
                   (inactiveResponse.data?.pagination.total_count ? parseInt(inactiveResponse.data.pagination.total_count) : 0) +
                   (pendingResponse.data?.pagination.total_count ? parseInt(pendingResponse.data.pagination.total_count) : 0);

      return {
        success: true,
        data: {
          total,
          active: activeResponse.data?.pagination.total_count ? parseInt(activeResponse.data.pagination.total_count) : 0,
          inactive: inactiveResponse.data?.pagination.total_count ? parseInt(inactiveResponse.data.pagination.total_count) : 0,
          pending: pendingResponse.data?.pagination.total_count ? parseInt(pendingResponse.data.pagination.total_count) : 0,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
