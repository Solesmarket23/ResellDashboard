'use client';

import React, { useState } from 'react';
import { X, DollarSign, Calendar, Package, Receipt, Link, CheckCircle, AlertCircle } from 'lucide-react';

interface PurchaseData {
  orderNumber: string;
  purchasePrice: number;
  purchaseDate: string;
  purchaseSource: string;
  shippingCost?: number;
  taxAmount?: number;
  notes?: string;
}

interface ArbitrageOpportunity {
  id: string;
  productId: string;
  variantId: string;
  title: string;
  size: string;
  imageUrl?: string;
  profit?: number;
  sellingPrice?: number;
  costPrice?: number;
}

interface PurchaseLinkPopupProps {
  isOpen: boolean;
  onClose: () => void;
  opportunity: ArbitrageOpportunity | null;
  onSavePurchase: (opportunity: ArbitrageOpportunity, purchaseData: PurchaseData) => void;
  existingPurchase?: PurchaseData | null;
}

const PurchaseLinkPopup: React.FC<PurchaseLinkPopupProps> = ({
  isOpen,
  onClose,
  opportunity,
  onSavePurchase,
  existingPurchase
}) => {
  const [formData, setFormData] = useState<PurchaseData>({
    orderNumber: existingPurchase?.orderNumber || '',
    purchasePrice: existingPurchase?.purchasePrice || 0,
    purchaseDate: existingPurchase?.purchaseDate || new Date().toISOString().split('T')[0],
    purchaseSource: existingPurchase?.purchaseSource || 'eBay',
    shippingCost: existingPurchase?.shippingCost || 0,
    taxAmount: existingPurchase?.taxAmount || 0,
    notes: existingPurchase?.notes || ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const purchaseSources = [
    'eBay', 'Amazon', 'StockX', 'GOAT', 'Facebook Marketplace', 
    'Mercari', 'Poshmark', 'Grailed', 'Depop', 'Local Purchase', 'Other'
  ];

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.orderNumber.trim()) {
      newErrors.orderNumber = 'Order number is required';
    }

    if (!formData.purchasePrice || formData.purchasePrice <= 0) {
      newErrors.purchasePrice = 'Valid purchase price is required';
    }

    if (!formData.purchaseDate) {
      newErrors.purchaseDate = 'Purchase date is required';
    }

    if (!formData.purchaseSource) {
      newErrors.purchaseSource = 'Purchase source is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm() || !opportunity) return;

    setIsSaving(true);
    try {
      await onSavePurchase(opportunity, formData);
      onClose();
    } catch (error) {
      console.error('Error saving purchase:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const calculateTotalCost = () => {
    return (formData.purchasePrice || 0) + (formData.shippingCost || 0) + (formData.taxAmount || 0);
  };

  const calculateActualProfit = () => {
    if (!opportunity?.sellingPrice) return 0;
    const totalCost = calculateTotalCost();
    const stockxFees = (opportunity.sellingPrice * 0.095) + 3; // Approximate StockX fees
    return opportunity.sellingPrice - stockxFees - totalCost;
  };

  const calculateProfitMargin = () => {
    const profit = calculateActualProfit();
    const totalCost = calculateTotalCost();
    if (totalCost === 0) return 0;
    return (profit / totalCost) * 100;
  };

  if (!isOpen || !opportunity) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-blue-500 rounded-lg flex items-center justify-center">
              <Link className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {existingPurchase ? 'Edit Purchase Record' : 'Link Purchase'}
              </h2>
              <p className="text-gray-400 text-sm">Track actual purchase for accurate profit calculation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Product Info */}
        <div className="p-6 border-b border-gray-700 bg-gray-800/30">
          <div className="flex items-center gap-4">
            {opportunity.imageUrl && (
              <img
                src={opportunity.imageUrl}
                alt={opportunity.title}
                className="w-16 h-16 object-cover rounded-lg bg-gray-800"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = '/placeholder-shoe.png';
                }}
              />
            )}
            <div>
              <h3 className="font-semibold text-white">{opportunity.title}</h3>
              <p className="text-gray-400">Size: {opportunity.size}</p>
              <p className="text-sm text-gray-500">ID: {opportunity.productId}</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Order Number */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <Receipt className="inline w-4 h-4 mr-2" />
              Order Number *
            </label>
            <input
              type="text"
              value={formData.orderNumber}
              onChange={(e) => setFormData(prev => ({ ...prev, orderNumber: e.target.value }))}
              placeholder="e.g., 123456789, Order #ABC123"
              className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.orderNumber ? 'border-red-500' : 'border-gray-600'
              }`}
            />
            {errors.orderNumber && (
              <p className="text-red-400 text-sm mt-1 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.orderNumber}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Purchase Price */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                <DollarSign className="inline w-4 h-4 mr-2" />
                Purchase Price *
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.purchasePrice || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, purchasePrice: parseFloat(e.target.value) || 0 }))}
                placeholder="0.00"
                className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.purchasePrice ? 'border-red-500' : 'border-gray-600'
                }`}
              />
              {errors.purchasePrice && (
                <p className="text-red-400 text-sm mt-1">{errors.purchasePrice}</p>
              )}
            </div>

            {/* Purchase Date */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                <Calendar className="inline w-4 h-4 mr-2" />
                Purchase Date *
              </label>
              <input
                type="date"
                value={formData.purchaseDate}
                onChange={(e) => setFormData(prev => ({ ...prev, purchaseDate: e.target.value }))}
                className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.purchaseDate ? 'border-red-500' : 'border-gray-600'
                }`}
              />
              {errors.purchaseDate && (
                <p className="text-red-400 text-sm mt-1">{errors.purchaseDate}</p>
              )}
            </div>

            {/* Purchase Source */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                <Package className="inline w-4 h-4 mr-2" />
                Purchase Source *
              </label>
              <select
                value={formData.purchaseSource}
                onChange={(e) => setFormData(prev => ({ ...prev, purchaseSource: e.target.value }))}
                className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.purchaseSource ? 'border-red-500' : 'border-gray-600'
                }`}
              >
                {purchaseSources.map(source => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
              {errors.purchaseSource && (
                <p className="text-red-400 text-sm mt-1">{errors.purchaseSource}</p>
              )}
            </div>

            {/* Shipping Cost */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Shipping Cost
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.shippingCost || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, shippingCost: parseFloat(e.target.value) || 0 }))}
                placeholder="0.00"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Tax Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Tax Amount
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.taxAmount || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, taxAmount: parseFloat(e.target.value) || 0 }))}
                placeholder="0.00"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Any additional notes about this purchase..."
              rows={3}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Profit Preview */}
          {formData.purchasePrice > 0 && opportunity.sellingPrice && (
            <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                Profit Preview
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">Total Cost</p>
                  <p className="text-white font-semibold">${calculateTotalCost().toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Selling Price</p>
                  <p className="text-white font-semibold">${opportunity.sellingPrice.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Net Profit</p>
                  <p className={`font-semibold ${calculateActualProfit() >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ${calculateActualProfit().toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Profit Margin</p>
                  <p className={`font-semibold ${calculateProfitMargin() >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {calculateProfitMargin().toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  {existingPurchase ? 'Update Purchase' : 'Link Purchase'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PurchaseLinkPopup;
