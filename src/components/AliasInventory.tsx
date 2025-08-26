'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Package, DollarSign, TrendingUp, TrendingDown, Search, Filter, Download, RefreshCw, Eye } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import { getDocuments, addDocument, updateDocument, deleteDocument } from '../lib/firebase/firebaseUtils';
import NeonNotification, { NotificationType } from './NeonNotification';

interface AliasListing {
  id: string;
  catalog_id: string;
  name: string;
  brand: string;
  sku: string;
  size: number;
  size_unit: string;
  condition: string;
  packaging_condition: string;
  price_cents: number;
  status: string;
  created_at: string;
  updated_at: string;
  activated_at?: string;
  consigned: boolean;
  metadata?: any;
  // Local fields
  imageUrl?: string;
  marketData?: {
    lowestListingPrice: number;
    highestOfferPrice: number;
    lastSoldPrice: number;
    globalIndicatorPrice: number;
  };
}

const AliasInventory = () => {
  const { currentTheme } = useTheme();
  const { user } = useAuth();
  const [listings, setListings] = useState<AliasListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingListing, setEditingListing] = useState<AliasListing | null>(null);
  const [notification, setNotification] = useState<{
    isVisible: boolean;
    message: string;
    type: NotificationType;
  }>({ isVisible: false, message: '', type: 'success' });

  const showNotification = (message: string, type: NotificationType) => {
    setNotification({ isVisible: true, message, type });
  };

  // Load listings from Alias API
  const loadListings = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const params = new URLSearchParams({
        pageSize: '100',
        ...(searchQuery && { searchTerm: searchQuery })
      });

      if (filterStatus !== 'all') {
        params.append('facetFilter', `status: ${filterStatus}`);
      }

      const response = await fetch(`/api/alias/listings?${params}`);
      const data = await response.json();

      if (data.success && data.listings) {
        // Enhance listings with catalog data
        const enhancedListings = await Promise.all(
          data.listings.map(async (listing: any) => {
            // Get catalog item details
            const catalogResponse = await fetch(`/api/alias/catalog?query=${listing.catalog_id}&limit=1`);
            const catalogData = await catalogResponse.json();
            const catalogItem = catalogData.catalogItems?.[0];

            return {
              ...listing,
              name: catalogItem?.name || 'Unknown Product',
              brand: catalogItem?.brand || 'Unknown',
              sku: catalogItem?.sku || listing.catalog_id,
              imageUrl: catalogItem?.main_picture_url,
              price_cents: parseInt(listing.price_cents)
            };
          })
        );

        setListings(enhancedListings);
        
        // Save to Firebase for offline access
        await saveListingsToFirebase(enhancedListings);
      }
    } catch (error) {
      console.error('Error loading Alias listings:', error);
      showNotification('Failed to load listings', 'error');
      
      // Fall back to Firebase data
      await loadListingsFromFirebase();
    } finally {
      setLoading(false);
    }
  };

  // Save listings to Firebase
  const saveListingsToFirebase = async (listings: AliasListing[]) => {
    if (!user) return;

    try {
      // Clear existing Alias listings
      const existingListings = await getDocuments('aliasListings');
      const userListings = existingListings.filter((doc: any) => doc.userId === user.uid);
      
      for (const listing of userListings) {
        await deleteDocument('aliasListings', listing.id);
      }

      // Save new listings
      for (const listing of listings) {
        await addDocument('aliasListings', {
          ...listing,
          userId: user.uid,
          platform: 'alias',
          savedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error saving listings to Firebase:', error);
    }
  };

  // Load listings from Firebase
  const loadListingsFromFirebase = async () => {
    if (!user) return;

    try {
      const allListings = await getDocuments('aliasListings');
      const userListings = allListings.filter((doc: any) => doc.userId === user.uid);
      setListings(userListings);
    } catch (error) {
      console.error('Error loading listings from Firebase:', error);
    }
  };

  // Delete a listing
  const handleDeleteListing = async (listingId: string) => {
    if (!confirm('Are you sure you want to delete this listing?')) return;

    try {
      const response = await fetch(`/api/alias/listings?id=${listingId}`, {
        method: 'DELETE'
      });
      const data = await response.json();

      if (data.success) {
        showNotification('Listing deleted successfully', 'success');
        loadListings();
      } else {
        showNotification(data.error || 'Failed to delete listing', 'error');
      }
    } catch (error) {
      console.error('Error deleting listing:', error);
      showNotification('Failed to delete listing', 'error');
    }
  };

  // Toggle listing status
  const handleToggleStatus = async (listing: AliasListing) => {
    const newStatus = listing.status === 'LISTING_STATUS_ACTIVE' ? 'deactivate' : 'activate';
    
    try {
      const response = await fetch(`/api/alias/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: newStatus,
          data: [listing.id]
        })
      });
      const data = await response.json();

      if (data.success) {
        showNotification(`Listing ${newStatus}d successfully`, 'success');
        loadListings();
      } else {
        showNotification(data.error || `Failed to ${newStatus} listing`, 'error');
      }
    } catch (error) {
      console.error(`Error ${newStatus}ing listing:`, error);
      showNotification(`Failed to ${newStatus} listing`, 'error');
    }
  };

  useEffect(() => {
    loadListings();
  }, [user]);

  // Filter listings
  const filteredListings = listings.filter(listing => {
    const matchesSearch = 
      listing.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      listing.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
      listing.sku.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || 
      (filterStatus === 'active' && listing.status === 'LISTING_STATUS_ACTIVE') ||
      (filterStatus === 'inactive' && listing.status !== 'LISTING_STATUS_ACTIVE');

    return matchesSearch && matchesStatus;
  });

  // Calculate totals
  const totalValue = filteredListings.reduce((sum, listing) => sum + (listing.price_cents / 100), 0);
  const activeListings = filteredListings.filter(l => l.status === 'LISTING_STATUS_ACTIVE').length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className={`text-2xl font-bold ${currentTheme.colors.textPrimary} mb-2`}>
          Alias Inventory
        </h2>
        <p className={`${currentTheme.colors.textSecondary}`}>
          Manage your listings on Alias marketplace
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className={`${currentTheme.colors.cardBackground} ${currentTheme.colors.cardBorder} border rounded-lg p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>Total Listings</p>
              <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>
                {filteredListings.length}
              </p>
            </div>
            <Package className={`w-8 h-8 ${currentTheme.colors.accent}`} />
          </div>
        </div>

        <div className={`${currentTheme.colors.cardBackground} ${currentTheme.colors.cardBorder} border rounded-lg p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>Active Listings</p>
              <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>
                {activeListings}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className={`${currentTheme.colors.cardBackground} ${currentTheme.colors.cardBorder} border rounded-lg p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>Total Value</p>
              <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>
                ${totalValue.toLocaleString()}
              </p>
            </div>
            <DollarSign className={`w-8 h-8 ${currentTheme.colors.accent}`} />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col lg:flex-row gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${currentTheme.colors.textSecondary} w-5 h-5`} />
          <input
            type="text"
            placeholder="Search by name, brand, or SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 rounded-lg ${currentTheme.colors.inputBackground} ${currentTheme.colors.inputBorder} border ${currentTheme.colors.textPrimary} placeholder-gray-500`}
          />
        </div>
        
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className={`px-4 py-2 rounded-lg ${currentTheme.colors.inputBackground} ${currentTheme.colors.inputBorder} border ${currentTheme.colors.textPrimary}`}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <button
          onClick={loadListings}
          className={`px-4 py-2 rounded-lg ${currentTheme.colors.buttonPrimary} text-white font-medium flex items-center gap-2`}
        >
          <RefreshCw className="w-5 h-5" />
          Refresh
        </button>
      </div>

      {/* Listings Table */}
      <div className={`${currentTheme.colors.cardBackground} ${currentTheme.colors.cardBorder} border rounded-lg overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={`${currentTheme.colors.tableHeader} border-b ${currentTheme.colors.cardBorder}`}>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Size
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Condition
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className={`${currentTheme.colors.cardBackground} divide-y ${currentTheme.colors.cardBorder}`}>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center">
                    <div className="flex justify-center items-center">
                      <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                      Loading listings...
                    </div>
                  </td>
                </tr>
              ) : filteredListings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                    No listings found
                  </td>
                </tr>
              ) : (
                filteredListings.map((listing) => (
                  <tr key={listing.id} className={`hover:${currentTheme.colors.tableRowHover}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {listing.imageUrl && (
                          <img
                            src={listing.imageUrl}
                            alt={listing.name}
                            className="w-10 h-10 rounded-lg mr-3 object-cover"
                          />
                        )}
                        <div>
                          <div className={`text-sm font-medium ${currentTheme.colors.textPrimary}`}>
                            {listing.name}
                          </div>
                          <div className={`text-sm ${currentTheme.colors.textSecondary}`}>
                            {listing.brand} • {listing.sku}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${currentTheme.colors.textPrimary}`}>
                      {listing.size} {listing.size_unit}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${currentTheme.colors.textPrimary}`}>
                      {listing.condition.replace('CONDITION_', '')}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${currentTheme.colors.textPrimary}`}>
                      ${(listing.price_cents / 100).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        listing.status === 'LISTING_STATUS_ACTIVE'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {listing.status === 'LISTING_STATUS_ACTIVE' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleStatus(listing)}
                          className={`p-1 rounded hover:bg-gray-100 ${currentTheme.colors.textSecondary}`}
                          title={listing.status === 'LISTING_STATUS_ACTIVE' ? 'Deactivate' : 'Activate'}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingListing(listing)}
                          className={`p-1 rounded hover:bg-gray-100 ${currentTheme.colors.textSecondary}`}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteListing(listing.id)}
                          className="p-1 rounded hover:bg-red-100 text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notification */}
      {notification.isVisible && (
        <NeonNotification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification({ ...notification, isVisible: false })}
        />
      )}
    </div>
  );
};

export default AliasInventory;