'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Package, DollarSign, TrendingUp, TrendingDown, Search, Filter, Download } from 'lucide-react';

interface InventoryItem {
  id: string;
  productId?: string;
  name: string;
  brand: string;
  size: string;
  condition: 'New' | 'Used' | 'Deadstock';
  purchasePrice: number;
  currentPrice?: number;
  quantity: number;
  purchaseDate: string;
  notes?: string;
  imageUrl?: string;
  stockxData?: {
    lastSale: number;
    avgPrice: number;
    priceChange: number;
  };
}

const StockXInventory = () => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBrand, setFilterBrand] = useState('all');
  const [filterCondition, setFilterCondition] = useState('all');
  const [loading, setLoading] = useState(false);

  const [newItem, setNewItem] = useState<Partial<InventoryItem>>({
    name: '',
    brand: '',
    size: '',
    condition: 'New',
    purchasePrice: 0,
    quantity: 1,
    purchaseDate: new Date().toISOString().split('T')[0],
    notes: ''
  });

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = () => {
    // Load from localStorage for demo
    const saved = localStorage.getItem('stockx-inventory');
    if (saved) {
      setInventory(JSON.parse(saved));
    } else {
      // Demo data
      const demoInventory: InventoryItem[] = [
        {
          id: '1',
          name: 'Air Jordan 1 High OG "Chicago"',
          brand: 'Jordan',
          size: '10.5',
          condition: 'Deadstock',
          purchasePrice: 170,
          currentPrice: 2500,
          quantity: 1,
          purchaseDate: '2023-01-15',
          notes: 'Retail purchase',
          stockxData: {
            lastSale: 2450,
            avgPrice: 2500,
            priceChange: 15.2
          }
        },
        {
          id: '2',
          name: 'Yeezy Boost 350 V2 "Zebra"',
          brand: 'Yeezy',
          size: '11',
          condition: 'New',
          purchasePrice: 220,
          currentPrice: 320,
          quantity: 2,
          purchaseDate: '2023-02-20',
          stockxData: {
            lastSale: 315,
            avgPrice: 320,
            priceChange: -5.8
          }
        }
      ];
      setInventory(demoInventory);
    }
  };

  const saveInventory = (newInventory: InventoryItem[]) => {
    localStorage.setItem('stockx-inventory', JSON.stringify(newInventory));
    setInventory(newInventory);
  };

  const addItem = async () => {
    if (!newItem.name || !newItem.brand || !newItem.purchasePrice) return;

    setLoading(true);
    
    // Simulate StockX data fetch
    const stockxData = {
      lastSale: Math.floor(Math.random() * 1000) + 100,
      avgPrice: Math.floor(Math.random() * 1200) + 150,
      priceChange: (Math.random() - 0.5) * 50
    };

    const item: InventoryItem = {
      id: Date.now().toString(),
      ...newItem as InventoryItem,
      currentPrice: stockxData.avgPrice,
      stockxData
    };

    const updatedInventory = [...inventory, item];
    saveInventory(updatedInventory);
    
    setNewItem({
      name: '',
      brand: '',
      size: '',
      condition: 'New',
      purchasePrice: 0,
      quantity: 1,
      purchaseDate: new Date().toISOString().split('T')[0],
      notes: ''
    });
    
    setShowAddModal(false);
    setLoading(false);
  };

  const deleteItem = (id: string) => {
    const updatedInventory = inventory.filter(item => item.id !== id);
    saveInventory(updatedInventory);
  };

  const refreshPrices = async () => {
    setLoading(true);
    
    // Simulate price refresh from StockX
    const updatedInventory = inventory.map(item => ({
      ...item,
      stockxData: {
        lastSale: Math.floor(Math.random() * 1000) + 100,
        avgPrice: Math.floor(Math.random() * 1200) + 150,
        priceChange: (Math.random() - 0.5) * 50
      }
    }));
    
    saveInventory(updatedInventory);
    setLoading(false);
  };

  const filteredInventory = inventory.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.brand.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesBrand = filterBrand === 'all' || item.brand === filterBrand;
    const matchesCondition = filterCondition === 'all' || item.condition === filterCondition;
    
    return matchesSearch && matchesBrand && matchesCondition;
  });

  const calculateMetrics = () => {
    const totalValue = inventory.reduce((sum, item) => sum + (item.currentPrice || 0) * item.quantity, 0);
    const totalCost = inventory.reduce((sum, item) => sum + item.purchasePrice * item.quantity, 0);
    const totalProfit = totalValue - totalCost;
    const profitMargin = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
    
    return {
      totalValue,
      totalCost,
      totalProfit,
      profitMargin,
      itemCount: inventory.length
    };
  };

  const metrics = calculateMetrics();
  const brands = [...new Set(inventory.map(item => item.brand))];

  const getProfitColor = (profit: number) => {
    if (profit > 0) return 'text-green-400';
    if (profit < 0) return 'text-red-400';
    return 'text-gray-400';
  };

  const getItemProfit = (item: InventoryItem) => {
    const currentValue = (item.currentPrice || 0) * item.quantity;
    const cost = item.purchasePrice * item.quantity;
    return currentValue - cost;
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Inventory Manager</h1>
          <p className="text-gray-400">Track your resell inventory with real-time StockX pricing</p>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={refreshPrices}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh Prices'}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white rounded-lg hover:from-emerald-600 hover:to-cyan-600"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Items</p>
              <p className="text-2xl font-bold text-white">{metrics.itemCount}</p>
            </div>
            <Package className="w-8 h-8 text-emerald-400" />
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Total Cost</p>
              <p className="text-2xl font-bold text-white">${metrics.totalCost.toFixed(0)}</p>
            </div>
            <DollarSign className="w-8 h-8 text-red-400" />
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Current Value</p>
              <p className="text-2xl font-bold text-white">${metrics.totalValue.toFixed(0)}</p>
            </div>
            <DollarSign className="w-8 h-8 text-emerald-400" />
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Total Profit</p>
              <p className={`text-2xl font-bold ${getProfitColor(metrics.totalProfit)}`}>
                ${metrics.totalProfit.toFixed(0)}
              </p>
            </div>
            {metrics.totalProfit >= 0 ? 
              <TrendingUp className="w-8 h-8 text-green-400" /> : 
              <TrendingDown className="w-8 h-8 text-red-400" />
            }
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Profit Margin</p>
              <p className={`text-2xl font-bold ${getProfitColor(metrics.totalProfit)}`}>
                {metrics.profitMargin.toFixed(1)}%
              </p>
            </div>
            {metrics.profitMargin >= 0 ? 
              <TrendingUp className="w-8 h-8 text-green-400" /> : 
              <TrendingDown className="w-8 h-8 text-red-400" />
            }
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search items..."
              className="w-full px-4 py-2 rounded-lg bg-slate-700/60 text-white placeholder-slate-300 border border-slate-500/50 focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div>
            <select
              value={filterBrand}
              onChange={(e) => setFilterBrand(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-700/60 text-white border border-slate-500/50 focus:ring-2 focus:ring-emerald-400"
            >
              <option value="all">All Brands</option>
              {brands.map(brand => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
          </div>
          <div>
            <select
              value={filterCondition}
              onChange={(e) => setFilterCondition(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-700/60 text-white border border-slate-500/50 focus:ring-2 focus:ring-emerald-400"
            >
              <option value="all">All Conditions</option>
              <option value="New">New</option>
              <option value="Used">Used</option>
              <option value="Deadstock">Deadstock</option>
            </select>
          </div>
        </div>
      </div>

      {/* Inventory List */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
        <h3 className="text-xl font-bold text-white mb-4">Inventory Items</h3>
        <div className="space-y-4">
          {filteredInventory.map(item => (
            <div key={item.id} className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="font-semibold text-white">{item.name}</h4>
                  <p className="text-sm text-gray-400">{item.brand} • Size {item.size} • {item.condition}</p>
                  <p className="text-sm text-gray-500">Qty: {item.quantity} • Purchased: {item.purchaseDate}</p>
                  {item.notes && <p className="text-sm text-gray-500">Notes: {item.notes}</p>}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-right">
                  <div>
                    <p className="text-sm text-gray-400">Purchase Price</p>
                    <p className="font-bold text-white">${item.purchasePrice}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Current Price</p>
                    <p className="font-bold text-white">${item.currentPrice || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Profit</p>
                    <p className={`font-bold ${getProfitColor(getItemProfit(item))}`}>
                      ${getItemProfit(item).toFixed(0)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingItem(item)}
                      className="p-2 text-blue-400 hover:bg-blue-500/20 rounded"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="p-2 text-red-400 hover:bg-red-500/20 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
              {item.stockxData && (
                <div className="mt-2 pt-2 border-t border-slate-600">
                  <div className="flex items-center gap-6 text-sm">
                    <span className="text-gray-400">StockX Data:</span>
                    <span className="text-white">Last Sale: ${item.stockxData.lastSale}</span>
                    <span className="text-white">Avg Price: ${item.stockxData.avgPrice}</span>
                    <span className={getProfitColor(item.stockxData.priceChange)}>
                      {item.stockxData.priceChange > 0 ? '+' : ''}{item.stockxData.priceChange.toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
          {filteredInventory.length === 0 && (
            <div className="text-center py-12">
              <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">No Items Found</h3>
              <p className="text-gray-400">Add your first inventory item to get started</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-white mb-4">Add New Item</h3>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Item name"
                value={newItem.name || ''}
                onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                className="w-full px-3 py-2 rounded-lg bg-slate-700/60 text-white border border-slate-500/50"
              />
              <input
                type="text"
                placeholder="Brand"
                value={newItem.brand || ''}
                onChange={(e) => setNewItem({...newItem, brand: e.target.value})}
                className="w-full px-3 py-2 rounded-lg bg-slate-700/60 text-white border border-slate-500/50"
              />
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Size"
                  value={newItem.size || ''}
                  onChange={(e) => setNewItem({...newItem, size: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg bg-slate-700/60 text-white border border-slate-500/50"
                />
                <select
                  value={newItem.condition || 'New'}
                  onChange={(e) => setNewItem({...newItem, condition: e.target.value as any})}
                  className="w-full px-3 py-2 rounded-lg bg-slate-700/60 text-white border border-slate-500/50"
                >
                  <option value="New">New</option>
                  <option value="Used">Used</option>
                  <option value="Deadstock">Deadstock</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="number"
                  placeholder="Purchase Price"
                  value={newItem.purchasePrice || ''}
                  onChange={(e) => setNewItem({...newItem, purchasePrice: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 rounded-lg bg-slate-700/60 text-white border border-slate-500/50"
                />
                <input
                  type="number"
                  placeholder="Quantity"
                  value={newItem.quantity || 1}
                  onChange={(e) => setNewItem({...newItem, quantity: parseInt(e.target.value) || 1})}
                  className="w-full px-3 py-2 rounded-lg bg-slate-700/60 text-white border border-slate-500/50"
                />
              </div>
              <input
                type="date"
                value={newItem.purchaseDate || ''}
                onChange={(e) => setNewItem({...newItem, purchaseDate: e.target.value})}
                className="w-full px-3 py-2 rounded-lg bg-slate-700/60 text-white border border-slate-500/50"
              />
              <textarea
                placeholder="Notes (optional)"
                value={newItem.notes || ''}
                onChange={(e) => setNewItem({...newItem, notes: e.target.value})}
                className="w-full px-3 py-2 rounded-lg bg-slate-700/60 text-white border border-slate-500/50"
                rows={2}
              />
            </div>
            <div className="flex gap-4 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={addItem}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white rounded-lg hover:from-emerald-600 hover:to-cyan-600 disabled:opacity-50"
              >
                {loading ? 'Adding...' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockXInventory; 