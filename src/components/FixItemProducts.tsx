'use client';

import { useState } from 'react';
import { Trash2, Wrench, Search, X, AlertTriangle } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';

interface ItemPurchase {
  id: string;
  productName: string;
  orderNumber: string;
  subject: string;
  fromEmail: string;
  status: string;
  dateAdded: string;
}

interface FixItemProductsProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export default function FixItemProducts({ isOpen, onClose, onComplete }: FixItemProductsProps) {
  const [loading, setLoading] = useState(false);
  const [itemPurchases, setItemPurchases] = useState<ItemPurchase[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<any>(null);
  const { currentTheme } = useTheme();
  const { user } = useAuth();

  if (!isOpen) return null;

  const searchForItems = async () => {
    if (!user) {
      alert('Please sign in to continue');
      return;
    }

    setLoading(true);
    setHasSearched(true);
    try {
      const response = await fetch(`/api/gmail/fix-item-products?userId=${user.uid}&action=list`);
      const data = await response.json();
      
      if (response.ok) {
        setItemPurchases(data.purchases);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error searching for items:', error);
      alert('Failed to search for items');
    } finally {
      setLoading(false);
    }
  };

  const fixItems = async () => {
    if (!user) {
      alert('Please sign in to continue');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/gmail/fix-item-products?userId=${user.uid}&action=fix`);
      const data = await response.json();
      
      if (response.ok) {
        setResults(data);
        // Refresh the list
        await searchForItems();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error fixing items:', error);
      alert('Failed to fix items');
    } finally {
      setLoading(false);
    }
  };

  const deleteItems = async () => {
    if (!user) {
      alert('Please sign in to continue');
      return;
    }

    const confirmDelete = confirm(
      `Are you sure you want to delete all ${itemPurchases.length} purchases with "item" as the product name?\n\n` +
      'This action cannot be undone. These entries appear to be from sales verification emails and not actual purchases.'
    );

    if (!confirmDelete) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/gmail/fix-item-products?userId=${user.uid}&action=delete`);
      const data = await response.json();
      
      if (response.ok) {
        setResults(data);
        // Clear the list since items were deleted
        setItemPurchases([]);
        
        // Notify parent component to refresh
        setTimeout(() => {
          onComplete();
        }, 2000);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error deleting items:', error);
      alert('Failed to delete items');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div 
        className={`relative w-full max-w-4xl max-h-[85vh] rounded-2xl p-6 border-2 overflow-hidden ${
          currentTheme.card
        } ${currentTheme.cardBorder}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className={`text-2xl font-bold ${currentTheme.text}`}>
              Fix "Item" Products
            </h2>
            <p className={`text-sm ${currentTheme.textSecondary} mt-1`}>
              Find and fix purchases showing "item" as the product name
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-all ${currentTheme.hover}`}
          >
            <X className={`w-5 h-5 ${currentTheme.textSecondary}`} />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 overflow-y-auto max-h-[calc(85vh-200px)]">
          {!hasSearched && (
            <div className="text-center py-8">
              <AlertTriangle className={`w-12 h-12 mx-auto mb-4 ${currentTheme.accent}`} />
              <p className={`${currentTheme.text} mb-4`}>
                Some purchases may show "item" as the product name due to email parsing issues.
              </p>
              <p className={`${currentTheme.textSecondary} mb-6 text-sm`}>
                These are typically from "An Update Regarding Your Sale" emails which are sales verification failures, not purchases.
              </p>
              <button
                onClick={searchForItems}
                disabled={loading}
                className={`px-6 py-3 rounded-lg font-medium transition-all flex items-center gap-2 mx-auto ${
                  currentTheme.accent
                } bg-opacity-20 hover:bg-opacity-30`}
              >
                <Search className="w-4 h-4" />
                {loading ? 'Searching...' : 'Search for "Item" Products'}
              </button>
            </div>
          )}

          {hasSearched && itemPurchases.length === 0 && (
            <div className="text-center py-8">
              <div className={`text-6xl mb-4`}>🎉</div>
              <p className={`${currentTheme.text} text-lg font-medium`}>
                No purchases found with "item" as the product name!
              </p>
              <p className={`${currentTheme.textSecondary} mt-2`}>
                Your purchase data looks good.
              </p>
            </div>
          )}

          {hasSearched && itemPurchases.length > 0 && (
            <>
              <div className={`p-4 rounded-lg ${currentTheme.accent} bg-opacity-10 border ${currentTheme.accentBorder}`}>
                <p className={`${currentTheme.text} font-medium`}>
                  Found {itemPurchases.length} purchases with "item" as the product name
                </p>
                <p className={`${currentTheme.textSecondary} text-sm mt-1`}>
                  These appear to be from sales-related emails that were incorrectly categorized as purchases.
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={fixItems}
                  disabled={loading}
                  className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                    currentTheme.accent
                  } bg-opacity-20 hover:bg-opacity-30`}
                >
                  <Wrench className="w-4 h-4" />
                  {loading ? 'Attempting to Fix...' : 'Attempt to Fix Names'}
                </button>
                <button
                  onClick={deleteItems}
                  disabled={loading}
                  className="flex-1 px-4 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30"
                >
                  <Trash2 className="w-4 h-4" />
                  {loading ? 'Deleting...' : 'Delete All Items'}
                </button>
              </div>

              {/* Results */}
              {results && (
                <div className={`p-4 rounded-lg ${currentTheme.hover}`}>
                  <h3 className={`font-medium ${currentTheme.text} mb-2`}>
                    {results.fixed > 0 ? 'Fix Results:' : 'Delete Results:'}
                  </h3>
                  {results.fixed !== undefined && (
                    <div className="space-y-1">
                      <p className={`text-sm ${currentTheme.textSecondary}`}>
                        Fixed: <span className="text-green-400">{results.fixed}</span>
                      </p>
                      <p className={`text-sm ${currentTheme.textSecondary}`}>
                        Failed: <span className="text-red-400">{results.failed}</span>
                      </p>
                    </div>
                  )}
                  {results.deleted !== undefined && (
                    <div className="space-y-1">
                      <p className={`text-sm ${currentTheme.textSecondary}`}>
                        Deleted: <span className="text-green-400">{results.deleted}</span>
                      </p>
                      {results.errors > 0 && (
                        <p className={`text-sm ${currentTheme.textSecondary}`}>
                          Errors: <span className="text-red-400">{results.errors}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Item list */}
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {itemPurchases.slice(0, 10).map((purchase) => (
                  <div
                    key={purchase.id}
                    className={`p-3 rounded-lg ${currentTheme.hover} border ${currentTheme.border}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className={`font-medium ${currentTheme.text}`}>
                          {purchase.subject}
                        </p>
                        <p className={`text-sm ${currentTheme.textSecondary}`}>
                          Order: {purchase.orderNumber} • Status: {purchase.status}
                        </p>
                        <p className={`text-xs ${currentTheme.textSecondary} mt-1`}>
                          From: {purchase.fromEmail}
                        </p>
                      </div>
                      <span className={`text-xs ${currentTheme.textSecondary}`}>
                        {purchase.dateAdded}
                      </span>
                    </div>
                  </div>
                ))}
                {itemPurchases.length > 10 && (
                  <p className={`text-center text-sm ${currentTheme.textSecondary} py-2`}>
                    And {itemPurchases.length - 10} more...
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}