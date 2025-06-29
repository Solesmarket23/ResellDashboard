'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, RotateCcw, Mail, Settings, X, Info } from 'lucide-react';
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
  const [isSaving, setIsSaving] = useState(false);
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

  const saveConfig = async () => {
    setIsSaving(true);
    // Simulate save delay for better UX
    await new Promise(resolve => setTimeout(resolve, 500));
    localStorage.setItem('emailParsingConfig', JSON.stringify(config));
    setHasChanges(false);
    setIsSaving(false);
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
      <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-8 py-6 rounded-t-2xl">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl text-white">
                <Settings className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Email Parsing Settings</h2>
                <p className="text-sm text-gray-600 mt-1">Configure how emails are detected and categorized</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all duration-200"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="px-8 py-6 space-y-8">
          {/* Explanation Section */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 shadow-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-indigo-500/5"></div>
            <div className="relative p-6">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 p-2 bg-blue-500 rounded-xl text-white">
                  <Info className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-blue-900 mb-3">Why configure these patterns?</h3>
                  <p className="text-blue-800 leading-relaxed">
                    These email subject patterns help our system automatically detect and categorize your purchase and sale emails from Gmail. 
                    The more accurate patterns you provide, the better we can track your purchases, sales, deliveries, and verification failures automatically - 
                    saving you time and ensuring nothing gets missed.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Marketplaces Section */}
          <div className="space-y-6">
            <div className="flex items-center space-x-3">
              <div className="p-1.5 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg text-white">
                <Mail className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Supported Marketplaces</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(config.marketplaces).map(([key, marketplace]) => (
                <label key={key} className={`group relative flex items-center space-x-4 p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer ${
                  marketplace.available 
                    ? 'bg-gradient-to-br from-blue-50 to-blue-50/50 hover:from-blue-100 hover:to-blue-100/50 border-blue-200 hover:border-blue-300 hover:shadow-md' 
                    : 'bg-gray-50 border-gray-200 cursor-not-allowed opacity-60'
                }`}>
                  <input
                    type="checkbox"
                    checked={marketplace.enabled && marketplace.available}
                    onChange={() => marketplace.available && toggleMarketplace(key)}
                    disabled={!marketplace.available}
                    className={`w-5 h-5 text-blue-600 bg-white border-2 border-gray-300 rounded-lg focus:ring-blue-500 focus:ring-2 transition-all duration-200 ${
                      !marketplace.available ? 'cursor-not-allowed opacity-50' : ''
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className={`font-semibold ${marketplace.available ? 'text-blue-900' : 'text-gray-500'}`}>
                        {marketplace.name}
                      </span>
                    </div>
                    <p className={`text-sm ${marketplace.available ? 'text-blue-700' : 'text-gray-400'} truncate`}>
                      {marketplace.emailDomain}
                    </p>
                  </div>
                  {marketplace.comingSoon && (
                    <span className="absolute -top-2 -right-2 px-3 py-1 bg-gradient-to-r from-orange-500 to-orange-600 text-white text-xs font-semibold rounded-full shadow-sm">
                      Coming Soon
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Categories Container */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {/* Purchases Section */}
            <div className="space-y-6">
              <div className="flex items-center space-x-3">
                <div className="p-1.5 bg-gradient-to-br from-green-500 to-green-600 rounded-lg text-white">
                  <Mail className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900">Purchases</h3>
              </div>
              <div className="space-y-4">
                {Object.entries(config.emailCategories).map(([categoryKey, category]) => (
                  <div key={categoryKey} className="group bg-white rounded-2xl border border-gray-200 hover:border-gray-300 shadow-sm hover:shadow-md transition-all duration-200">
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <Mail className="w-5 h-5 text-gray-400" />
                          <h4 className="font-semibold text-gray-900">{category.name}</h4>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
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
                          className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all duration-200"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Add Pattern</span>
                        </button>
                      </div>
                      
                      <div className="space-y-3">
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
                            <div key={index} className="flex items-center space-x-3 group/item">
                              <input
                                type="text"
                                value={pattern}
                                onChange={(e) => updateSubjectPattern(categoryKey, index, e.target.value)}
                                placeholder={getPlaceholder(categoryKey, index)}
                                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-gray-300"
                              />
                              <button
                                onClick={() => removeSubjectPattern(categoryKey, index)}
                                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all duration-200 opacity-0 group-hover/item:opacity-100"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sales Section */}
            <div className="space-y-6">
              <div className="flex items-center space-x-3">
                <div className="p-1.5 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg text-white">
                  <Mail className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900">Sales</h3>
              </div>
              <div className="space-y-4">
                {Object.entries(config.salesCategories).map(([categoryKey, category]) => (
                  <div key={categoryKey} className="group bg-white rounded-2xl border border-gray-200 hover:border-gray-300 shadow-sm hover:shadow-md transition-all duration-200">
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <Mail className="w-5 h-5 text-gray-400" />
                          <h4 className="font-semibold text-gray-900">{category.name}</h4>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            category.statusColor === 'green' ? 'bg-green-100 text-green-800' :
                            category.statusColor === 'red' ? 'bg-red-100 text-red-800' : ''
                          }`}>
                            {category.status}
                          </span>
                        </div>
                        <button
                          onClick={() => addSalesSubjectPattern(categoryKey)}
                          className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all duration-200"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Add Pattern</span>
                        </button>
                      </div>
                      
                      <div className="space-y-3">
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
                            <div key={index} className="flex items-center space-x-3 group/item">
                              <input
                                type="text"
                                value={pattern}
                                onChange={(e) => updateSalesSubjectPattern(categoryKey, index, e.target.value)}
                                placeholder={getSalesPlaceholder(categoryKey, index)}
                                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-gray-300"
                              />
                              <button
                                onClick={() => removeSalesSubjectPattern(categoryKey, index)}
                                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all duration-200 opacity-0 group-hover/item:opacity-100"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm border-t border-gray-100 px-8 py-6 rounded-b-2xl">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              {hasChanges && (
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                  <span>You have unsaved changes</span>
                </div>
              )}
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={resetToDefaults}
                className="flex items-center space-x-2 px-4 py-2.5 text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-medium"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset to Defaults</span>
              </button>
              <button
                onClick={saveConfig}
                disabled={!hasChanges || isSaving}
                className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl font-medium transition-all duration-200 ${
                  hasChanges && !isSaving
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 shadow-lg hover:shadow-xl'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailParsingSettings; 