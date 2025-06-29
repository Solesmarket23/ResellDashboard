'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, RotateCcw, Mail, Settings, X } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

interface EmailCategory {
  name: string;
  status: string;
  statusColor: string;
  subjectPatterns: string[];
}

interface Marketplace {
  name: string;
  emailDomain: string;
  senderEmails: string[];
  enabled: boolean;
  available: boolean;
  comingSoon?: boolean;
}

interface EmailParsingConfig {
  emailCategories: {
    [key: string]: EmailCategory;
  };
  salesCategories: {
    [key: string]: EmailCategory;
  };
  marketplaces: {
    [key: string]: Marketplace;
  };
}

const defaultConfig: EmailParsingConfig = {
  emailCategories: {
    orderPlaced: {
      name: "Order Placed",
      status: "Ordered",
      statusColor: "orange",
      subjectPatterns: [
        "Order Confirmation"
      ]
    },
    orderShipped: {
      name: "Order Shipped",
      status: "Shipped", 
      statusColor: "blue",
      subjectPatterns: [
        "Your order has shipped"
      ]
    },
    orderDelivered: {
      name: "Order Delivered",
      status: "Delivered",
      statusColor: "green", 
      subjectPatterns: [
        "Order delivered"
      ]
    },
    orderDelayed: {
      name: "Order Delayed",
      status: "Delayed",
      statusColor: "orange",
      subjectPatterns: [
        "Order delayed"
      ]
    },
    orderCanceled: {
      name: "Order Canceled/Refunded", 
      status: "Canceled",
      statusColor: "red",
      subjectPatterns: [
        "Order canceled"
      ]
    }
  },
  salesCategories: {
    saleMade: {
      name: "Sale Made",
      status: "Sold",
      statusColor: "green",
      subjectPatterns: [
        "Sale confirmed"
      ]
    },
    verificationFailed: {
      name: "Verification Failed",
      status: "Failed Verification",
      statusColor: "red",
      subjectPatterns: [
        "Verification failed"
      ]
    }
  },
  marketplaces: {
    stockx: {
      name: "StockX",
      emailDomain: "stockx.com",
      senderEmails: ["noreply@stockx.com"],
      enabled: true,
      available: true
    },
    goat: {
      name: "GOAT",
      emailDomain: "goat.com", 
      senderEmails: [],
      enabled: false,
      available: false,
      comingSoon: true
    },
    alias: {
      name: "Alias",
      emailDomain: "alias.com",
      senderEmails: [],
      enabled: false,
      available: false,
      comingSoon: true
    },
    ebay: {
      name: "eBay", 
      emailDomain: "ebay.com",
      senderEmails: [],
      enabled: false,
      available: false,
      comingSoon: true
    }
  }
};

interface EmailParsingSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const EmailParsingSettings = ({ isOpen, onClose }: EmailParsingSettingsProps) => {
  const [config, setConfig] = useState<EmailParsingConfig>(defaultConfig);
  const [hasChanges, setHasChanges] = useState(false);
  const { currentTheme } = useTheme();

  useEffect(() => {
    // Load saved config from localStorage
    const savedConfig = localStorage.getItem('emailParsingConfig');
    if (savedConfig) {
      try {
        setConfig(JSON.parse(savedConfig));
      } catch (error) {
        console.error('Error loading email parsing config:', error);
      }
    }
  }, []);

  const saveConfig = () => {
    localStorage.setItem('emailParsingConfig', JSON.stringify(config));
    setHasChanges(false);
    // Trigger a custom event to notify other components
    window.dispatchEvent(new CustomEvent('emailConfigUpdated', { detail: config }));
  };

  const resetToDefaults = () => {
    setConfig(defaultConfig);
    setHasChanges(true);
  };

  const addSubjectPattern = (categoryKey: string) => {
    const newConfig = { ...config };
    newConfig.emailCategories[categoryKey].subjectPatterns.push('');
    setConfig(newConfig);
    setHasChanges(true);
  };

  const updateSubjectPattern = (categoryKey: string, index: number, value: string) => {
    const newConfig = { ...config };
    newConfig.emailCategories[categoryKey].subjectPatterns[index] = value;
    setConfig(newConfig);
    setHasChanges(true);
  };

  const removeSubjectPattern = (categoryKey: string, index: number) => {
    const newConfig = { ...config };
    newConfig.emailCategories[categoryKey].subjectPatterns.splice(index, 1);
    setConfig(newConfig);
    setHasChanges(true);
  };

  const addSalesSubjectPattern = (categoryKey: string) => {
    const newConfig = { ...config };
    newConfig.salesCategories[categoryKey].subjectPatterns.push('');
    setConfig(newConfig);
    setHasChanges(true);
  };

  const updateSalesSubjectPattern = (categoryKey: string, index: number, value: string) => {
    const newConfig = { ...config };
    newConfig.salesCategories[categoryKey].subjectPatterns[index] = value;
    setConfig(newConfig);
    setHasChanges(true);
  };

  const removeSalesSubjectPattern = (categoryKey: string, index: number) => {
    const newConfig = { ...config };
    newConfig.salesCategories[categoryKey].subjectPatterns.splice(index, 1);
    setConfig(newConfig);
    setHasChanges(true);
  };

  const toggleMarketplace = (marketplaceKey: string) => {
    const newConfig = { ...config };
    const marketplace = newConfig.marketplaces[marketplaceKey];
    
    // Only allow toggling if the marketplace is available
    if (marketplace.available) {
      marketplace.enabled = !marketplace.enabled;
      setConfig(newConfig);
      setHasChanges(true);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Email Parsing Settings</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Explanation Section */}
          <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-medium text-blue-900 mb-2">Why configure these patterns?</h3>
                <p className="text-sm text-blue-800">
                  These email subject patterns help our system automatically detect and categorize your purchase and sale emails from Gmail. 
                  The more accurate patterns you provide, the better we can track your purchases, sales, deliveries, and verification failures automatically - 
                  saving you time and ensuring nothing gets missed.
                </p>
              </div>
            </div>
          </div>

          {/* Marketplaces Section */}
          <div className="mb-8">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Supported Marketplaces</h3>
                         <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
               {Object.entries(config.marketplaces).map(([key, marketplace]) => (
                 <label key={key} className={`flex items-center space-x-3 p-3 rounded-lg relative ${
                   marketplace.available ? 'bg-blue-50 hover:bg-blue-100 cursor-pointer border border-blue-200' : 'bg-gray-50 cursor-not-allowed opacity-60 border border-gray-200'
                 }`}>
                   <input
                     type="checkbox"
                     checked={marketplace.enabled && marketplace.available}
                     onChange={() => marketplace.available && toggleMarketplace(key)}
                     disabled={!marketplace.available}
                     className={`w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500 ${
                       !marketplace.available ? 'cursor-not-allowed opacity-50' : ''
                     }`}
                   />
                                        <div className="flex-1">
                       <div className="font-medium">
                        <div className="flex items-center space-x-2">
                          <span className={`text-sm font-medium ${marketplace.available ? 'text-blue-900' : 'text-gray-500'}`}>{marketplace.name}</span>
                        </div>
                       </div>
                     <div className={`text-sm ${marketplace.available ? 'text-blue-700' : 'text-gray-400'}`}>
                       {marketplace.emailDomain}
                     </div>
                   </div>
                   {marketplace.comingSoon && (
                     <span className="absolute top-2 right-2 px-2 py-1 bg-orange-100 text-orange-800 text-xs font-medium rounded-full">
                       Coming Soon
                     </span>
                   )}
                 </label>
               ))}
            </div>
          </div>

          {/* Email Categories Section */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Purchases</h3>
            <div className="space-y-6">
              {Object.entries(config.emailCategories).map(([categoryKey, category]) => (
                <div key={categoryKey} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <Mail className="w-5 h-5 text-gray-400 mr-2" />
                      <h4 className="font-medium text-gray-900">{category.name}</h4>
                      <span className={`ml-3 px-2 py-1 rounded-full text-xs font-medium ${
                        category.statusColor === 'green' ? 'bg-green-100 text-green-800' :
                        category.statusColor === 'blue' ? 'bg-blue-100 text-blue-800' :
                        category.statusColor === 'orange' ? 'bg-orange-100 text-orange-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {category.status}
                      </span>
                    </div>
                    <button
                      onClick={() => addSubjectPattern(categoryKey)}
                      className="flex items-center text-sm text-blue-600 hover:text-blue-700"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Pattern
                    </button>
                  </div>
                  
                  <div className="space-y-2">
                    {category.subjectPatterns.map((pattern, index) => {
                      // Get appropriate placeholder text based on category
                      const getPlaceholder = (catKey: string, idx: number) => {
                        const placeholders = {
                          orderPlaced: [
                            "Example: Order Confirmation",
                            "Example: Your order has been placed",
                            "Example: Purchase confirmed",
                            "Example: Order received"
                          ],
                          orderShipped: [
                            "Example: Your order has shipped", 
                            "Example: Shipment notification",
                            "Example: Order shipped",
                            "Example: Package on the way"
                          ],
                          orderDelivered: [
                            "Example: Order delivered",
                            "Example: Package delivered",
                            "Example: Delivery confirmation", 
                            "Example: Your package has arrived"
                          ],
                          orderDelayed: [
                            "Example: Order delayed",
                            "Example: Shipping delay",
                            "Example: Delivery postponed",
                            "Example: Expected delivery updated"
                          ],
                          orderCanceled: [
                            "Example: Order canceled",
                            "Example: Order cancelled", 
                            "Example: Refund processed",
                            "Example: Order refunded"
                          ]
                        };
                        const categoryPlaceholders = placeholders[catKey as keyof typeof placeholders] || [];
                        return categoryPlaceholders[idx] || "Example: Enter email subject line pattern...";
                      };

                      return (
                        <div key={index} className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={pattern}
                            onChange={(e) => updateSubjectPattern(categoryKey, index, e.target.value)}
                            placeholder={getPlaceholder(categoryKey, index)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <button
                            onClick={() => removeSubjectPattern(categoryKey, index)}
                            className="text-red-600 hover:text-red-700 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sales Categories Section */}
          <div className="mt-8">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Sales</h3>
            <div className="space-y-6">
              {Object.entries(config.salesCategories).map(([categoryKey, category]) => (
                <div key={categoryKey} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <Mail className="w-5 h-5 text-gray-400 mr-2" />
                      <h4 className="font-medium text-gray-900">{category.name}</h4>
                      <span className={`ml-3 px-2 py-1 rounded-full text-xs font-medium ${
                        category.statusColor === 'green' ? 'bg-green-100 text-green-800' :
                        category.statusColor === 'red' ? 'bg-red-100 text-red-800' : ''
                      }`}>
                        {category.status}
                      </span>
                    </div>
                    <button
                      onClick={() => addSalesSubjectPattern(categoryKey)}
                      className="flex items-center text-sm text-blue-600 hover:text-blue-700"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Pattern
                    </button>
                  </div>
                  
                  <div className="space-y-2">
                    {category.subjectPatterns.map((pattern, index) => {
                      // Get appropriate placeholder text based on sales category
                      const getSalesPlaceholder = (catKey: string, idx: number) => {
                        const placeholders = {
                          saleMade: [
                            "Example: Sale confirmed",
                            "Example: Your item sold",
                            "Example: Sale notification",
                            "Example: Item purchased"
                          ],
                          verificationFailed: [
                            "Example: Verification failed",
                            "Example: Unable to verify",
                            "Example: Authentication failed",
                            "Example: Item not authentic"
                          ]
                        };
                        const categoryPlaceholders = placeholders[catKey as keyof typeof placeholders] || [];
                        return categoryPlaceholders[idx] || "Example: Enter email subject line pattern...";
                      };

                      return (
                        <div key={index} className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={pattern}
                            onChange={(e) => updateSalesSubjectPattern(categoryKey, index, e.target.value)}
                            placeholder={getSalesPlaceholder(categoryKey, index)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <button
                            onClick={() => removeSalesSubjectPattern(categoryKey, index)}
                            className="text-red-600 hover:text-red-700 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <button
              onClick={resetToDefaults}
              className="flex items-center px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset to Defaults
            </button>
            <button
              onClick={saveConfig}
              disabled={!hasChanges}
              className={`flex items-center px-6 py-2 rounded-md ${
                hasChanges
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailParsingSettings; 