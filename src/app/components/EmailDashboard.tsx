"use client";

import { useState, useEffect } from "react";
import { getOrdersByStatus, getOrdersNeedingReview } from "@/lib/firebase/firebaseUtils";

interface Order {
  id: string;
  order_id?: string;
  status: string;
  items: Array<{
    name?: string;
    size?: string;
    quantity?: number;
    price?: number;
  }>;
  tracking: Array<{
    carrier?: string;
    number?: string;
    url?: string;
  }>;
  totals: {
    total?: number;
    currency?: string;
  };
  confidence: number;
  needs_review: boolean;
  createdAt: string;
  updatedAt: string;
  status_timeline: Array<{
    status: string;
    messageId: string;
    at: string;
  }>;
}

export default function EmailDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [showNeedsReview, setShowNeedsReview] = useState(false);

  const statuses = [
    { value: "all", label: "All Orders" },
    { value: "confirmed", label: "Confirmed" },
    { value: "shipped", label: "Shipped" },
    { value: "out_for_delivery", label: "Out for Delivery" },
    { value: "delivered", label: "Delivered" },
    { value: "canceled", label: "Canceled" },
    { value: "returned", label: "Returned" },
  ];

  const loadOrders = async () => {
    setLoading(true);
    try {
      if (showNeedsReview) {
        const reviewOrders = await getOrdersNeedingReview();
        setOrders(reviewOrders);
      } else if (selectedStatus === "all") {
        // Load all orders (you might want to implement this)
        setOrders([]);
      } else {
        const statusOrders = await getOrdersByStatus(selectedStatus);
        setOrders(statusOrders);
      }
    } catch (error) {
      console.error("Error loading orders:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [selectedStatus, showNeedsReview]);

  const getStatusColor = (status: string) => {
    const colors = {
      confirmed: "bg-blue-100 text-blue-800",
      shipped: "bg-yellow-100 text-yellow-800",
      out_for_delivery: "bg-orange-100 text-orange-800",
      delivered: "bg-green-100 text-green-800",
      canceled: "bg-red-100 text-red-800",
      returned: "bg-gray-100 text-gray-800",
    };
    return colors[status as keyof typeof colors] || "bg-gray-100 text-gray-800";
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatCurrency = (amount?: number, currency?: string) => {
    if (!amount) return "N/A";
    const symbol = currency === "USD" ? "$" : currency || "$";
    return `${symbol}${amount.toFixed(2)}`;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Email Order Dashboard</h1>
        <p className="text-gray-600">View and manage orders parsed from emails</p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-4">
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium text-gray-700">Status:</label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {statuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={showNeedsReview}
            onChange={(e) => setShowNeedsReview(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">Needs Review</span>
        </label>

        <button
          onClick={loadOrders}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Refresh
        </button>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">No orders found</p>
          <p className="text-gray-400 text-sm mt-2">
            {showNeedsReview 
              ? "No orders need review" 
              : "Try selecting a different status or check your email parsing setup"
            }
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {order.order_id || `Order ${order.id.slice(-8)}`}
                    </h3>
                    <p className="text-sm text-gray-500">
                      Created: {formatDate(order.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}
                    >
                      {order.status.replace("_", " ").toUpperCase()}
                    </span>
                    {order.needs_review && (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        REVIEW
                      </span>
                    )}
                  </div>
                </div>

                {/* Items */}
                {order.items && order.items.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Items:</h4>
                    <div className="space-y-2">
                      {order.items.map((item, index) => (
                        <div key={index} className="flex justify-between items-center text-sm">
                          <div>
                            <span className="font-medium">{item.name || "Unknown Item"}</span>
                            {item.size && <span className="text-gray-500 ml-2">Size: {item.size}</span>}
                            {item.quantity && <span className="text-gray-500 ml-2">Qty: {item.quantity}</span>}
                          </div>
                          {item.price && (
                            <span className="font-medium">
                              {formatCurrency(item.price, order.totals.currency)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tracking */}
                {order.tracking && order.tracking.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Tracking:</h4>
                    <div className="space-y-1">
                      {order.tracking.map((track, index) => (
                        <div key={index} className="text-sm">
                          <span className="font-medium">{track.carrier || "Unknown"}: </span>
                          {track.url ? (
                            <a
                              href={track.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 underline"
                            >
                              {track.number}
                            </a>
                          ) : (
                            <span>{track.number}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Totals */}
                {order.totals.total && (
                  <div className="mb-4">
                    <div className="flex justify-between items-center text-lg font-semibold">
                      <span>Total:</span>
                      <span>{formatCurrency(order.totals.total, order.totals.currency)}</span>
                    </div>
                  </div>
                )}

                {/* Status Timeline */}
                {order.status_timeline && order.status_timeline.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Status History:</h4>
                    <div className="space-y-1">
                      {order.status_timeline
                        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
                        .slice(0, 3)
                        .map((entry, index) => (
                          <div key={index} className="flex justify-between items-center text-xs text-gray-600">
                            <span className="capitalize">{entry.status.replace("_", " ")}</span>
                            <span>{formatDate(entry.at)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Confidence */}
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>Confidence: {Math.round((order.confidence || 0) * 100)}%</span>
                  <span>Updated: {formatDate(order.updatedAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}



