'use client';

import React, { useState } from 'react';
import { Search, Package, Plus, X, AlertCircle, CheckCircle, Upload } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import { addDocument } from '../lib/firebase/firebaseUtils';
import NeonNotification, { NotificationType } from './NeonNotification';

interface CatalogItem {
  catalog_id: string;
  name: string;
  sku: string;
  brand: string;
  gender: string;
  release_date: string;
  product_category_v2: string;
  product_type: string;
  size_unit: string;
  allowed_sizes: Array<{
    display_name: string;
    value: number;
    us_size_equivalent: number;
  }>;
  minimum_listing_price_cents: number;
  maximum_listing_price_cents: number;
  main_picture_url: string;
  retail_price_cents: number;
  colorway: string;
  nickname: string;
  requires_listing_pictures: boolean;
  resellable: boolean;
}

interface ListingFormData {
  catalog_id: string;
  size: number;
  size_unit: string;
  condition: string;
  packaging_condition: string;
  price_cents: number;
  metadata?: any;
  defects?: string[];
  additional_defects?: string;
  activate: boolean;
}

const AliasListingCreator = () => {
  const { currentTheme } = useTheme();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CatalogItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  
  const [formData, setFormData] = useState<ListingFormData>({
    catalog_id: '',
    size: 0,
    size_unit: 'SIZE_UNIT_US',
    condition: 'CONDITION_NEW',
    packaging_condition: 'PACKAGING_CONDITION_GOOD_CONDITION',
    price_cents: 0,
    activate: true,
    defects: [],
    additional_defects: ''
  });

  const [notification, setNotification] = useState<{
    isVisible: boolean;
    message: string;
    type: NotificationType;
  }>({ isVisible: false, message: '', type: 'success' });

  const showNotification = (message: string, type: NotificationType) => {
    setNotification({ isVisible: true, message, type });
  };

  // Search catalog
  const searchCatalog = async () => {
    if (!searchQuery.trim()) return;
    
    setSearching(true);
    try {
      const response = await fetch(`/api/alias/catalog?query=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();

      if (data.success) {
        setSearchResults(data.catalogItems);
        if (data.catalogItems.length === 0) {
          showNotification('No products found', 'warning');
        }
      } else {
        showNotification(data.error || 'Search failed', 'error');
      }
    } catch (error) {
      console.error('Search error:', error);
      showNotification('Failed to search catalog', 'error');
    } finally {
      setSearching(false);
    }
  };

  // Select catalog item
  const selectCatalogItem = (item: CatalogItem) => {
    setSelectedItem(item);
    setFormData({
      ...formData,
      catalog_id: item.catalog_id,
      size_unit: item.size_unit,
      price_cents: Math.round(item.retail_price_cents * 1.5) // Default to 1.5x retail
    });
    setSearchResults([]);
  };

  // Create listing
  const createListing = async () => {
    if (!selectedItem) {
      showNotification('Please select a product', 'error');
      return;
    }

    if (!formData.size || formData.price_cents <= 0) {
      showNotification('Please fill in all required fields', 'error');
      return;
    }

    setCreating(true);
    try {
      const response = await fetch('/api/alias/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await response.json();

      if (data.success) {
        showNotification('Listing created successfully!', 'success');
        
        // Save to Firebase for records
        if (user) {
          await addDocument('aliasListings', {
            ...data.listing,
            userId: user.uid,
            platform: 'alias',
            productName: selectedItem.name,
            brand: selectedItem.brand,
            imageUrl: selectedItem.main_picture_url,
            createdAt: new Date().toISOString()
          });
        }

        // Reset form
        resetForm();
      } else {
        showNotification(data.error || 'Failed to create listing', 'error');
      }
    } catch (error) {
      console.error('Create listing error:', error);
      showNotification('Failed to create listing', 'error');
    } finally {
      setCreating(false);
    }
  };

  // Reset form
  const resetForm = () => {
    setSelectedItem(null);
    setSearchQuery('');
    setFormData({
      catalog_id: '',
      size: 0,
      size_unit: 'SIZE_UNIT_US',
      condition: 'CONDITION_NEW',
      packaging_condition: 'PACKAGING_CONDITION_GOOD_CONDITION',
      price_cents: 0,
      activate: true,
      defects: [],
      additional_defects: ''
    });
  };

  const conditionOptions = [
    { value: 'CONDITION_NEW', label: 'New' },
    { value: 'CONDITION_USED', label: 'Used' },
    { value: 'CONDITION_NEW_WITH_DEFECTS', label: 'New with Defects' }
  ];

  const packagingOptions = [
    { value: 'PACKAGING_CONDITION_GOOD_CONDITION', label: 'Good Condition' },
    { value: 'PACKAGING_CONDITION_MISSING_LID', label: 'Missing Lid' },
    { value: 'PACKAGING_CONDITION_BADLY_DAMAGED', label: 'Badly Damaged' },
    { value: 'PACKAGING_CONDITION_NO_ORIGINAL_BOX', label: 'No Original Box' }
  ];

  const defectOptions = [
    { value: 'LISTING_DEFECT_HAS_ODOR', label: 'Has Odor' },
    { value: 'LISTING_DEFECT_HAS_DISCOLORATION', label: 'Has Discoloration' },
    { value: 'LISTING_DEFECT_HAS_MISSING_INSOLES', label: 'Missing Insoles' },
    { value: 'LISTING_DEFECT_HAS_SCUFFS', label: 'Has Scuffs' },
    { value: 'LISTING_DEFECT_HAS_TEARS', label: 'Has Tears' },
    { value: 'LISTING_DEFECT_B_GRADE', label: 'B-Grade' }
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className={`text-2xl font-bold ${currentTheme.colors.textPrimary} mb-2`}>
          Create Alias Listing
        </h2>
        <p className={`${currentTheme.colors.textSecondary}`}>
          Search for products and create listings on Alias marketplace
        </p>
      </div>

      {/* Search Section */}
      <div className={`${currentTheme.colors.cardBackground} ${currentTheme.colors.cardBorder} border rounded-lg p-6 mb-6`}>
        <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary} mb-4`}>
          Product Search
        </h3>
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${currentTheme.colors.textSecondary} w-5 h-5`} />
            <input
              type="text"
              placeholder="Search by product name, SKU, or brand..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && searchCatalog()}
              className={`w-full pl-10 pr-4 py-2 rounded-lg ${currentTheme.colors.inputBackground} ${currentTheme.colors.inputBorder} border ${currentTheme.colors.textPrimary} placeholder-gray-500`}
            />
          </div>
          <button
            onClick={searchCatalog}
            disabled={searching || !searchQuery.trim()}
            className={`px-6 py-2 rounded-lg ${currentTheme.colors.buttonPrimary} text-white font-medium disabled:opacity-50`}
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="mt-4 max-h-96 overflow-y-auto">
            <div className="grid grid-cols-1 gap-2">
              {searchResults.map((item) => (
                <div
                  key={item.catalog_id}
                  onClick={() => selectCatalogItem(item)}
                  className={`p-4 rounded-lg border ${currentTheme.colors.cardBorder} hover:${currentTheme.colors.tableRowHover} cursor-pointer transition-colors`}
                >
                  <div className="flex items-center gap-4">
                    {item.main_picture_url && (
                      <img
                        src={item.main_picture_url}
                        alt={item.name}
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                    )}
                    <div className="flex-1">
                      <p className={`font-medium ${currentTheme.colors.textPrimary}`}>
                        {item.name}
                      </p>
                      <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                        {item.brand} • {item.sku} • {item.colorway}
                      </p>
                      <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                        Retail: ${(item.retail_price_cents / 100).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Selected Product */}
      {selectedItem && (
        <div className={`${currentTheme.colors.cardBackground} ${currentTheme.colors.cardBorder} border rounded-lg p-6 mb-6`}>
          <div className="flex items-start justify-between mb-4">
            <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
              Selected Product
            </h3>
            <button
              onClick={resetForm}
              className={`p-1 rounded hover:bg-gray-100 ${currentTheme.colors.textSecondary}`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex items-center gap-4">
            {selectedItem.main_picture_url && (
              <img
                src={selectedItem.main_picture_url}
                alt={selectedItem.name}
                className="w-24 h-24 rounded-lg object-cover"
              />
            )}
            <div>
              <p className={`font-medium ${currentTheme.colors.textPrimary}`}>
                {selectedItem.name}
              </p>
              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                {selectedItem.brand} • {selectedItem.sku}
              </p>
              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                Price Range: ${(selectedItem.minimum_listing_price_cents / 100).toFixed(2)} - 
                ${(selectedItem.maximum_listing_price_cents / 100).toFixed(2)}
              </p>
              {selectedItem.requires_listing_pictures && (
                <p className="text-sm text-yellow-600 mt-1">
                  <AlertCircle className="w-4 h-4 inline mr-1" />
                  Pictures required for this listing
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Listing Form */}
      {selectedItem && (
        <div className={`${currentTheme.colors.cardBackground} ${currentTheme.colors.cardBorder} border rounded-lg p-6`}>
          <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary} mb-4`}>
            Listing Details
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Size */}
            <div>
              <label className={`block text-sm font-medium ${currentTheme.colors.textPrimary} mb-1`}>
                Size *
              </label>
              <select
                value={formData.size}
                onChange={(e) => setFormData({ ...formData, size: parseFloat(e.target.value) })}
                className={`w-full px-3 py-2 rounded-lg ${currentTheme.colors.inputBackground} ${currentTheme.colors.inputBorder} border ${currentTheme.colors.textPrimary}`}
              >
                <option value="0">Select Size</option>
                {selectedItem.allowed_sizes.map((size) => (
                  <option key={size.value} value={size.value}>
                    {size.display_name} ({size.size_unit})
                  </option>
                ))}
              </select>
            </div>

            {/* Price */}
            <div>
              <label className={`block text-sm font-medium ${currentTheme.colors.textPrimary} mb-1`}>
                Price (USD) *
              </label>
              <input
                type="number"
                min={selectedItem.minimum_listing_price_cents / 100}
                max={selectedItem.maximum_listing_price_cents / 100}
                step="1"
                value={(formData.price_cents / 100).toFixed(2)}
                onChange={(e) => setFormData({ ...formData, price_cents: Math.round(parseFloat(e.target.value) * 100) })}
                className={`w-full px-3 py-2 rounded-lg ${currentTheme.colors.inputBackground} ${currentTheme.colors.inputBorder} border ${currentTheme.colors.textPrimary}`}
              />
              <p className={`text-xs ${currentTheme.colors.textSecondary} mt-1`}>
                Min: ${(selectedItem.minimum_listing_price_cents / 100).toFixed(2)} - 
                Max: ${(selectedItem.maximum_listing_price_cents / 100).toFixed(2)}
              </p>
            </div>

            {/* Condition */}
            <div>
              <label className={`block text-sm font-medium ${currentTheme.colors.textPrimary} mb-1`}>
                Condition *
              </label>
              <select
                value={formData.condition}
                onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                className={`w-full px-3 py-2 rounded-lg ${currentTheme.colors.inputBackground} ${currentTheme.colors.inputBorder} border ${currentTheme.colors.textPrimary}`}
              >
                {conditionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Packaging Condition */}
            <div>
              <label className={`block text-sm font-medium ${currentTheme.colors.textPrimary} mb-1`}>
                Packaging Condition *
              </label>
              <select
                value={formData.packaging_condition}
                onChange={(e) => setFormData({ ...formData, packaging_condition: e.target.value })}
                className={`w-full px-3 py-2 rounded-lg ${currentTheme.colors.inputBackground} ${currentTheme.colors.inputBorder} border ${currentTheme.colors.textPrimary}`}
              >
                {packagingOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Defects (if condition is not new) */}
          {formData.condition !== 'CONDITION_NEW' && (
            <div className="mt-4">
              <label className={`block text-sm font-medium ${currentTheme.colors.textPrimary} mb-1`}>
                Defects
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {defectOptions.map((defect) => (
                  <label key={defect.value} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.defects?.includes(defect.value) || false}
                      onChange={(e) => {
                        const defects = formData.defects || [];
                        if (e.target.checked) {
                          setFormData({ ...formData, defects: [...defects, defect.value] });
                        } else {
                          setFormData({ ...formData, defects: defects.filter(d => d !== defect.value) });
                        }
                      }}
                      className="rounded"
                    />
                    <span className={`text-sm ${currentTheme.colors.textPrimary}`}>
                      {defect.label}
                    </span>
                  </label>
                ))}
              </div>
              
              <textarea
                placeholder="Additional defect details..."
                value={formData.additional_defects || ''}
                onChange={(e) => setFormData({ ...formData, additional_defects: e.target.value })}
                className={`w-full mt-2 px-3 py-2 rounded-lg ${currentTheme.colors.inputBackground} ${currentTheme.colors.inputBorder} border ${currentTheme.colors.textPrimary}`}
                rows={2}
              />
            </div>
          )}

          {/* Activate Listing */}
          <div className="mt-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.activate}
                onChange={(e) => setFormData({ ...formData, activate: e.target.checked })}
                className="rounded"
              />
              <span className={`${currentTheme.colors.textPrimary}`}>
                Activate listing immediately
              </span>
            </label>
            {!formData.activate && (
              <p className={`text-sm ${currentTheme.colors.textSecondary} mt-1`}>
                Listing will be created as inactive and can be activated later
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between items-center mt-6">
            <button
              onClick={() => setShowBulkModal(true)}
              className={`px-4 py-2 rounded-lg border ${currentTheme.colors.cardBorder} ${currentTheme.colors.textPrimary} font-medium hover:bg-gray-100`}
            >
              Bulk Create
            </button>
            
            <div className="flex gap-3">
              <button
                onClick={resetForm}
                className={`px-6 py-2 rounded-lg border ${currentTheme.colors.cardBorder} ${currentTheme.colors.textPrimary} font-medium hover:bg-gray-100`}
              >
                Cancel
              </button>
              <button
                onClick={createListing}
                disabled={creating || !formData.size || formData.price_cents <= 0}
                className={`px-6 py-2 rounded-lg ${currentTheme.colors.buttonPrimary} text-white font-medium disabled:opacity-50 flex items-center gap-2`}
              >
                {creating ? (
                  <>Creating...</>
                ) : (
                  <>
                    <Plus className="w-5 h-5" />
                    Create Listing
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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

export default AliasListingCreator;