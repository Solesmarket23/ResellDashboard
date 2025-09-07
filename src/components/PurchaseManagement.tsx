'use client';

import React, { useState, useEffect } from 'react';
import { Search, Plus, Edit3, Trash2, Package, DollarSign, Calendar, ExternalLink, Filter, SortAsc, SortDesc, ShoppingCart, Receipt, AlertCircle, CheckCircle } from 'lucide-react';
import PurchaseLinkPopup from './PurchaseLinkPopup';

interface PurchaseData {
  orderNumber: string;
  purchasePrice: number;
  purchaseDate: string;
  purchaseSource: string;
  shippingCost?: number;
  taxAmount?: number;
  notes?: string;
}

interface LinkedPurchase {
  id: string;
  opportunityId?: string;
  productId?: string;
  variantId?: string;
  productName: string;
  brand?: string;
  size?: string;
  imageUrl?: string;
  purchaseData: PurchaseData;
  linkedAt: string;
  // Sales tracking
  soldPrice?: number;
  soldDate?: string;
  soldPlatform?: string;
  fees?: number;
  actualProfit?: number;
  status: 'purchased' | 'listed' | 'sold';
}

const PurchaseManagement: React.FC = () => {
  const [purchases, setPurchases] = useState<LinkedPurchase[]>([]);
  const [filteredPurchases, setFilteredPurchases] = useState<LinkedPurchase[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('purchaseDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<LinkedPurchase | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load purchases from localStorage on mount
  useEffect(() => {
    const savedPurchases = localStorage.getItem('allPurchases');
    const linkedPurchases = localStorage.getItem('linkedPurchases');
    
    let allPurchases: LinkedPurchase[] = [];
    
    // Load from new storage format
    if (savedPurchases) {
      try {
        allPurchases = JSON.parse(savedPurchases);
      } catch (error) {
        console.error('Error loading purchases:', error);
      }
    }
    
    // Migrate from old linked purchases format
    if (linkedPurchases && allPurchases.length === 0) {
      try {
        const oldLinked = JSON.parse(linkedPurchases);
        allPurchases = oldLinked.map((linked: any) => ({
          id: `${linked.productId}-${linked.variantId}`,
          ...linked,
          productName: linked.productName || 'Unknown Product',
          status: 'purchased' as const
        }));
        // Save in new format
        localStorage.setItem('allPurchases', JSON.stringify(allPurchases));
      } catch (error) {
        console.error('Error migrating purchases:', error);
      }
    }
    
    setPurchases(allPurchases);
  }, []);

  // Save purchases to localStorage
  useEffect(() => {
    localStorage.setItem('allPurchases', JSON.stringify(purchases));
  }, [purchases]);

  // Filter and sort purchases
  useEffect(() => {
    let filtered = [...purchases];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(purchase =>
        purchase.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        purchase.purchaseData.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        purchase.brand?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        purchase.purchaseData.purchaseSource.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(purchase => purchase.status === statusFilter);
    }

    // Source filter
    if (sourceFilter !== 'all') {
      filtered = filtered.filter(purchase => purchase.purchaseData.purchaseSource === sourceFilter);
    }

    // Sort
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortBy) {
        case 'purchaseDate':
          aValue = new Date(a.purchaseData.purchaseDate);
          bValue = new Date(b.purchaseData.purchaseDate);
          break;
        case 'purchasePrice':
          aValue = a.purchaseData.purchasePrice;
          bValue = b.purchaseData.purchasePrice;
          break;
        case 'productName':
          aValue = a.productName.toLowerCase();
          bValue = b.productName.toLowerCase();
          break;
        case 'profit':
          aValue = a.actualProfit || 0;
          bValue = b.actualProfit || 0;
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        default:
          aValue = a.purchaseData.purchaseDate;
          bValue = b.purchaseData.purchaseDate;
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    setFilteredPurchases(filtered);
  }, [purchases, searchQuery, statusFilter, sourceFilter, sortBy, sortOrder]);

  const handleAddPurchase = async (opportunityData: any, purchaseData: PurchaseData) => {
    const newPurchase: LinkedPurchase = {
      id: Date.now().toString(),
      productName: opportunityData?.title || 'Manual Entry',
      brand: opportunityData?.brand,
      size: opportunityData?.size,
      imageUrl: opportunityData?.imageUrl,
      purchaseData,
      linkedAt: new Date().toISOString(),
      status: 'purchased'
    };

    setPurchases(prev => [...prev, newPurchase]);
    setSuccessMessage(`✅ Purchase added: ${purchaseData.orderNumber}`);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const handleEditPurchase = async (opportunityData: any, purchaseData: PurchaseData) => {
    if (!editingPurchase) return;

    setPurchases(prev => prev.map(purchase =>
      purchase.id === editingPurchase.id
        ? { ...purchase, purchaseData, productName: opportunityData?.title || purchase.productName }
        : purchase
    ));

    setSuccessMessage(`✅ Purchase updated: ${purchaseData.orderNumber}`);
    setTimeout(() => setSuccessMessage(null), 5000);
    setEditingPurchase(null);
  };

  const handleDeletePurchase = (purchaseId: string) => {
    if (confirm('Are you sure you want to delete this purchase record?')) {
      setPurchases(prev => prev.filter(p => p.id !== purchaseId));
      setSuccessMessage(`🗑️ Purchase record deleted`);
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  };

  const handleMarkAsSold = (purchaseId: string) => {
    const soldPrice = prompt('Enter sold price:');
    const soldPlatform = prompt('Enter platform (StockX, GOAT, etc.):') || 'StockX';
    
    if (soldPrice) {
      const price = parseFloat(soldPrice);
      const purchase = purchases.find(p => p.id === purchaseId);
      if (purchase) {
        const totalCost = purchase.purchaseData.purchasePrice + 
                         (purchase.purchaseData.shippingCost || 0) + 
                         (purchase.purchaseData.taxAmount || 0);
        const fees = price * 0.095 + 3; // Approximate platform fees
        const profit = price - fees - totalCost;

        setPurchases(prev => prev.map(p =>
          p.id === purchaseId
            ? {
                ...p,
                soldPrice: price,
                soldDate: new Date().toISOString(),
                soldPlatform,
                fees,
                actualProfit: profit,
                status: 'sold' as const
              }
            : p
        ));

        setSuccessMessage(`✅ Marked as sold for $${price}`);
        setTimeout(() => setSuccessMessage(null), 5000);
      }
    }
  };

  const getTotalCost = (purchase: LinkedPurchase) => {
    return purchase.purchaseData.purchasePrice + 
           (purchase.purchaseData.shippingCost || 0) + 
           (purchase.purchaseData.taxAmount || 0);
  };

  const getUniqueSources = () => {
    const sources = [...new Set(purchases.map(p => p.purchaseData.purchaseSource))];
    return sources.sort();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'purchased': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'listed': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'sold': return 'bg-green-500/20 text-green-400 border-green-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const stats = {
    total: purchases.length,
    purchased: purchases.filter(p => p.status === 'purchased').length,
    listed: purchases.filter(p => p.status === 'listed').length,
    sold: purchases.filter(p => p.status === 'sold').length,
    totalInvested: purchases.reduce((sum, p) => sum + getTotalCost(p), 0),
    totalRevenue: purchases.filter(p => p.soldPrice).reduce((sum, p) => sum + (p.soldPrice || 0), 0),
    totalProfit: purchases.filter(p => p.actualProfit).reduce((sum, p) => sum + (p.actualProfit || 0), 0)
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Purchase Management</h1>
            <p className="text-gray-400">Track your purchases and calculate actual profits</p>
          </div>
          <button
            onClick={() => setShowAddPurchase(true)}
            className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center gap-2 w-fit"
          >
            <Plus className="w-5 h-5" />
            Add Purchase
          </button>
        </div>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="mb-6 p-4 bg-green-900/20 border border-green-500/30 rounded-lg text-green-400 flex items-center gap-2">
          <CheckCircle className="w-5 h-5" />
          {successMessage}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total</p>
              <p className="text-xl font-bold text-white">{stats.total}</p>
            </div>
            <Package className="w-6 h-6 text-gray-400" />
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Purchased</p>
              <p className="text-xl font-bold text-blue-400">{stats.purchased}</p>
            </div>
            <ShoppingCart className="w-6 h-6 text-blue-400" />
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Listed</p>
              <p className="text-xl font-bold text-yellow-400">{stats.listed}</p>
            </div>
            <Edit3 className="w-6 h-6 text-yellow-400" />
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Sold</p>
              <p className="text-xl font-bold text-green-400">{stats.sold}</p>
            </div>
            <CheckCircle className="w-6 h-6 text-green-400" />
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Invested</p>
              <p className="text-xl font-bold text-cyan-400">${stats.totalInvested.toFixed(0)}</p>
            </div>
            <DollarSign className="w-6 h-6 text-cyan-400" />
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Revenue</p>
              <p className="text-xl font-bold text-purple-400">${stats.totalRevenue.toFixed(0)}</p>
            </div>
            <Receipt className="w-6 h-6 text-purple-400" />
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Profit</p>
              <p className={`text-xl font-bold ${stats.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${stats.totalProfit.toFixed(0)}
              </p>
            </div>
            <DollarSign className={`w-6 h-6 ${stats.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`} />
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-gray-800 rounded-lg p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Search */}
          <div className="lg:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search products, order numbers, brands..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="purchased">Purchased</option>
              <option value="listed">Listed</option>
              <option value="sold">Sold</option>
            </select>
          </div>

          {/* Source Filter */}
          <div>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Sources</option>
              {getUniqueSources().map(source => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div className="flex gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="purchaseDate">Date</option>
              <option value="purchasePrice">Price</option>
              <option value="productName">Product</option>
              <option value="profit">Profit</option>
              <option value="status">Status</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className="px-3 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white hover:bg-gray-600 transition-colors"
            >
              {sortOrder === 'desc' ? <SortDesc className="w-5 h-5" /> : <SortAsc className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Purchases List */}
      <div className="space-y-4">
        {filteredPurchases.length === 0 ? (
          <div className="text-center py-12">
            <div className="bg-gray-800 rounded-lg p-8">
              <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-300 mb-2">
                {purchases.length === 0 ? 'No Purchases Yet' : 'No Matching Purchases'}
              </h3>
              <p className="text-gray-400 max-w-md mx-auto mb-6">
                {purchases.length === 0 
                  ? 'Start by adding your first purchase to track profits and inventory.'
                  : 'Try adjusting your search filters to find what you\'re looking for.'
                }
              </p>
              {purchases.length === 0 && (
                <button
                  onClick={() => setShowAddPurchase(true)}
                  className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center gap-2 mx-auto"
                >
                  <Plus className="w-5 h-5" />
                  Add Your First Purchase
                </button>
              )}
            </div>
          </div>
        ) : (
          filteredPurchases.map((purchase) => (
            <div key={purchase.id} className="bg-gray-800 rounded-lg p-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                {/* Product Info */}
                <div className="flex items-center gap-4">
                  {purchase.imageUrl && (
                    <img
                      src={purchase.imageUrl}
                      alt={purchase.productName}
                      className="w-16 h-16 object-cover rounded-lg bg-gray-700"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = '/placeholder-shoe.png';
                      }}
                    />
                  )}
                  <div>
                    <h3 className="font-semibold text-white text-lg">{purchase.productName}</h3>
                    {purchase.brand && <p className="text-gray-400">{purchase.brand}</p>}
                    {purchase.size && <p className="text-gray-400">Size: {purchase.size}</p>}
                    <div className="flex items-center gap-3 mt-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(purchase.status)}`}>
                        {purchase.status.charAt(0).toUpperCase() + purchase.status.slice(1)}
                      </span>
                      <span className="text-gray-400 text-sm">Order #{purchase.purchaseData.orderNumber}</span>
                    </div>
                  </div>
                </div>

                {/* Purchase Details */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-gray-400 text-sm">Total Cost</p>
                    <p className="text-white font-semibold">${getTotalCost(purchase).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Source</p>
                    <p className="text-white font-semibold">{purchase.purchaseData.purchaseSource}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Date</p>
                    <p className="text-white font-semibold">
                      {new Date(purchase.purchaseData.purchaseDate).toLocaleDateString()}
                    </p>
                  </div>
                  {purchase.actualProfit !== undefined ? (
                    <div>
                      <p className="text-gray-400 text-sm">Profit</p>
                      <p className={`font-semibold ${purchase.actualProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        ${purchase.actualProfit.toFixed(2)}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-gray-400 text-sm">Action</p>
                      <button
                        onClick={() => handleMarkAsSold(purchase.id)}
                        className="text-green-400 hover:text-green-300 font-semibold text-sm"
                      >
                        Mark Sold
                      </button>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingPurchase(purchase)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded-lg transition-colors flex items-center gap-2"
                    title="Edit Purchase"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeletePurchase(purchase.id)}
                    className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-3 rounded-lg transition-colors flex items-center gap-2"
                    title="Delete Purchase"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Additional Details */}
              {purchase.purchaseData.notes && (
                <div className="mt-4 p-3 bg-gray-700/50 rounded-lg">
                  <p className="text-gray-300 text-sm">{purchase.purchaseData.notes}</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Purchase Popup */}
      <PurchaseLinkPopup
        isOpen={showAddPurchase || !!editingPurchase}
        onClose={() => {
          setShowAddPurchase(false);
          setEditingPurchase(null);
        }}
        opportunity={editingPurchase ? {
          id: editingPurchase.id,
          productId: editingPurchase.productId || '',
          variantId: editingPurchase.variantId || '',
          title: editingPurchase.productName,
          size: editingPurchase.size || '',
          imageUrl: editingPurchase.imageUrl,
          sellingPrice: editingPurchase.soldPrice
        } : null}
        onSavePurchase={editingPurchase ? handleEditPurchase : handleAddPurchase}
        existingPurchase={editingPurchase?.purchaseData || null}
      />
    </div>
  );
};

export default PurchaseManagement;
