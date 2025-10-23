// Alias Orders Service for managing orders and fulfillment
import { AliasBaseService, PaginationParams, PaginatedResponse } from './aliasBaseService';
import { ALIAS_ENDPOINTS, ALIAS_ENUMS } from './aliasConfig';

export interface Order {
  id: string;
  status: string;
  fulfillment_status?: string;
  catalog_id: string;
  catalog_name: string;
  catalog_brand: string;
  catalog_sku: string;
  size: number;
  price_cents: number;
  price_cents_after_take: number;
  sales_channel: string;
  purchase_order_number: string;
  listing_id: string;
  label_type?: string;
  label_url?: string;
  label_tracking_number?: string;
  label_courier?: string;
  sold_at: string;
  label_generated_at?: string;
  in_transit_at?: string;
  updated_at: string;
  cancels_at?: string;
  customs_declaration?: {
    commercial_invoice_url: string;
    declared_customs_value_cents: number;
  };
}

export interface SearchOrdersParams extends PaginationParams {
  query?: string;
  facet_filters?: string[];
}

export interface SearchOrdersResponse extends PaginatedResponse<Order> {
  results: Order[];
  pagination: {
    next_page_token?: string;
  };
}

export interface OrderStats {
  total: number;
  confirmed: number;
  in_transit: number;
  completed: number;
  canceled: number;
  pending_confirmation: number;
}

export class AliasOrdersService extends AliasBaseService {
  /**
   * Search orders with filters
   */
  async searchOrders(params: SearchOrdersParams): Promise<AliasApiResponse<SearchOrdersResponse>> {
    const queryParams: Record<string, any> = {};
    
    if (params.query) queryParams.query = params.query;
    if (params.facet_filters) queryParams.facet_filters = params.facet_filters;
    if (params.limit) queryParams.page_size = params.limit;
    if (params.pagination_token) queryParams.pagination_token = params.pagination_token;

    return this.get<SearchOrdersResponse>(ALIAS_ENDPOINTS.orders, queryParams);
  }

  /**
   * Get a specific order by ID
   */
  async getOrder(orderId: string): Promise<AliasApiResponse<{ order: Order }>> {
    return this.get<{ order: Order }>(ALIAS_ENDPOINTS.order(orderId));
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<AliasApiResponse<{ order: Order }>> {
    return this.post<{ order: Order }>(ALIAS_ENDPOINTS.orderCancel(orderId));
  }

  /**
   * Confirm an order
   */
  async confirmOrder(orderId: string): Promise<AliasApiResponse<{ order: Order }>> {
    return this.post<{ order: Order }>(ALIAS_ENDPOINTS.orderConfirm(orderId));
  }

  /**
   * Generate a shipping label for an order
   */
  async generateLabel(orderId: string, labelType = ALIAS_ENUMS.LABEL_TYPE.SHIPPING): Promise<AliasApiResponse<{ order: Order }>> {
    return this.post<{ order: Order }>(ALIAS_ENDPOINTS.orderGenerateLabel(orderId), { label_type: labelType });
  }

  /**
   * Regenerate a shipping label for an order
   */
  async regenerateLabel(orderId: string, labelType?: string): Promise<AliasApiResponse<{ order: Order }>> {
    const params: Record<string, any> = {};
    if (labelType) params.label_type = labelType;

    return this.post<{ order: Order }>(ALIAS_ENDPOINTS.orderRegenerateLabel(orderId), params);
  }

  /**
   * Mark an order as shipped
   */
  async shipOrder(orderId: string): Promise<AliasApiResponse<{ order: Order }>> {
    return this.post<{ order: Order }>(ALIAS_ENDPOINTS.orderShip(orderId));
  }

  /**
   * Get orders by status
   */
  async getOrdersByStatus(status: string, limit = 25): Promise<AliasApiResponse<SearchOrdersResponse>> {
    return this.searchOrders({
      facet_filters: [`status: ${status}`],
      limit,
    });
  }

  /**
   * Get confirmed orders
   */
  async getConfirmedOrders(limit = 25): Promise<AliasApiResponse<SearchOrdersResponse>> {
    return this.getOrdersByStatus(ALIAS_ENUMS.ORDER_STATUS.CONFIRMED, limit);
  }

  /**
   * Get in-transit orders
   */
  async getInTransitOrders(limit = 25): Promise<AliasApiResponse<SearchOrdersResponse>> {
    return this.getOrdersByStatus(ALIAS_ENUMS.ORDER_STATUS.IN_TRANSIT, limit);
  }

  /**
   * Get completed orders
   */
  async getCompletedOrders(limit = 25): Promise<AliasApiResponse<SearchOrdersResponse>> {
    return this.getOrdersByStatus(ALIAS_ENUMS.ORDER_STATUS.COMPLETED, limit);
  }

  /**
   * Get canceled orders
   */
  async getCanceledOrders(limit = 25): Promise<AliasApiResponse<SearchOrdersResponse>> {
    return this.getOrdersByStatus(ALIAS_ENUMS.ORDER_STATUS.CANCELED, limit);
  }

  /**
   * Get orders by fulfillment status
   */
  async getOrdersByFulfillmentStatus(fulfillmentStatus: string, limit = 25): Promise<AliasApiResponse<SearchOrdersResponse>> {
    return this.searchOrders({
      facet_filters: [`fulfillment_status: ${fulfillmentStatus}`],
      limit,
    });
  }

  /**
   * Get orders that need labels generated
   */
  async getOrdersNeedingLabels(limit = 25): Promise<AliasApiResponse<SearchOrdersResponse>> {
    return this.getOrdersByStatus(ALIAS_ENUMS.ORDER_STATUS.CONFIRMED, limit);
  }

  /**
   * Get orders that need to be shipped
   */
  async getOrdersNeedingShipment(limit = 25): Promise<AliasApiResponse<SearchOrdersResponse>> {
    return this.getOrdersByStatus(ALIAS_ENUMS.ORDER_STATUS.LABEL_GENERATED, limit);
  }

  /**
   * Get orders by date range
   */
  async getOrdersByDateRange(startDate: string, endDate: string, limit = 25): Promise<AliasApiResponse<SearchOrdersResponse>> {
    // Note: This would require the API to support date filtering
    // For now, we'll get all orders and filter client-side
    const response = await this.searchOrders({ limit: 1000 });
    
    if (!response.success || !response.data) {
      return response;
    }

    const filteredOrders = response.data.results.filter(order => {
      const orderDate = new Date(order.sold_at);
      const start = new Date(startDate);
      const end = new Date(endDate);
      return orderDate >= start && orderDate <= end;
    });

    return {
      success: true,
      data: {
        results: filteredOrders.slice(0, limit),
        pagination: {
          next_page_token: undefined,
        },
      },
      requestId: response.requestId,
    };
  }

  /**
   * Get order statistics
   */
  async getOrderStats(): Promise<AliasApiResponse<OrderStats>> {
    try {
      const [confirmedResponse, inTransitResponse, completedResponse, canceledResponse] = await Promise.all([
        this.getConfirmedOrders(1),
        this.getInTransitOrders(1),
        this.getCompletedOrders(1),
        this.getCanceledOrders(1),
      ]);

      const total = (confirmedResponse.data?.results.length || 0) +
                   (inTransitResponse.data?.results.length || 0) +
                   (completedResponse.data?.results.length || 0) +
                   (canceledResponse.data?.results.length || 0);

      return {
        success: true,
        data: {
          total,
          confirmed: confirmedResponse.data?.results.length || 0,
          in_transit: inTransitResponse.data?.results.length || 0,
          completed: completedResponse.data?.results.length || 0,
          canceled: canceledResponse.data?.results.length || 0,
          pending_confirmation: 0, // Would need a specific status for this
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get orders requiring action (confirmation, label generation, shipping)
   */
  async getOrdersRequiringAction(): Promise<AliasApiResponse<{
    needs_confirmation: Order[];
    needs_labels: Order[];
    needs_shipping: Order[];
  }>> {
    try {
      const [confirmedOrders, labelGeneratedOrders] = await Promise.all([
        this.getConfirmedOrders(50),
        this.getOrdersByStatus(ALIAS_ENUMS.ORDER_STATUS.LABEL_GENERATED, 50),
      ]);

      return {
        success: true,
        data: {
          needs_confirmation: [], // Would need to identify orders that need confirmation
          needs_labels: confirmedOrders.data?.results || [],
          needs_shipping: labelGeneratedOrders.data?.results || [],
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get revenue summary
   */
  async getRevenueSummary(): Promise<AliasApiResponse<{
    total_revenue: number;
    revenue_after_take: number;
    order_count: number;
    average_order_value: number;
  }>> {
    try {
      const response = await this.searchOrders({ limit: 1000 });
      
      if (!response.success || !response.data) {
        return response;
      }

      const orders = response.data.results;
      const totalRevenue = orders.reduce((sum, order) => sum + order.price_cents, 0);
      const revenueAfterTake = orders.reduce((sum, order) => sum + order.price_cents_after_take, 0);
      const orderCount = orders.length;
      const averageOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

      return {
        success: true,
        data: {
          total_revenue: totalRevenue / 100, // Convert cents to dollars
          revenue_after_take: revenueAfterTake / 100,
          order_count: orderCount,
          average_order_value: averageOrderValue / 100,
        },
        requestId: response.requestId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
