'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, RotateCcw, Mail, Settings } from 'lucide-react';
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
  enabled: boolean;
}

interface EmailParsingConfig {
  emailCategories: {
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
        "Order Confirmation",
        "Your order has been placed",
        "Purchase confirmed",
        "Order received"
      ]
    },
    orderShipped: {
      name: "Order Shipped",
      status: "Shipped", 
      statusColor: "blue",
      subjectPatterns: [
        "Your order has shipped",
        "Shipment notification",
        "Order shipped",
        "Package on the way"
      ]
    },
    orderDelivered: {
      name: "Order Delivered",
      status: "Delivered",
      statusColor: "green", 
      subjectPatterns: [
        "Order delivered",
        "Package delivered", 
        "Delivery confirmation",
        "Your package has arrived"
      ]
    },
    orderDelayed: {
      name: "Order Delayed",
      status: "Delayed",
      statusColor: "orange",
      subjectPatterns: [
        "Order delayed",
        "Shipping delay",
        "Delivery postponed",
        "Expected delivery updated"
      ]
    },
    orderCanceled: {
      name: "Order Canceled/Refunded", 
      status: "Canceled",
      statusColor: "red",
      subjectPatterns: [
        "Order canceled",
        "Order cancelled",
        "Refund processed", 
        "Order refunded",
        "Purchase refund"
      ]
    }
  },
  marketplaces: {
    stockx: {
      name: "StockX",
      emailDomain: "stockx.com",
      enabled: true
    },
    goat: {
      name: "GOAT",
      emailDomain: "goat.com", 
      enabled: true
    },
    flightclub: {
      name: "Flight Club",
      emailDomain: "flightclub.com",
      enabled: true
    },
    deadstock: {
      name: "Deadstock",
      emailDomain: "deadstock.com",
      enabled: true
    },
    novelship: {
      name: "Novelship", 
      emailDomain: "novelship.com",
      enabled: true
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

  const toggleMarketplace = (marketplaceKey: string) => {
    const newConfig = { ...config };
    newConfig.marketplaces[marketplaceKey].enabled = !newConfig.marketplaces[marketplaceKey].enabled;
    setConfig(newConfig);
    setHasChanges(true);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <Settings className="w-6 h-6 text-blue-600 mr-3" />
            <h2 className="text-xl font-semibold text-gray-900">Email Parsing Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Marketplaces Section */}
          <div className="mb-8">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Supported Marketplaces</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Object.entries(config.marketplaces).map(([key, marketplace]) => (
                <label key={key} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    checked={marketplace.enabled}
                    onChange={() => toggleMarketplace(key)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div>
                    <div className="font-medium text-gray-900">{marketplace.name}</div>
                    <div className="text-sm text-gray-500">{marketplace.emailDomain}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Email Categories Section */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Email Categories & Subject Line Patterns</h3>
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
                    {category.subjectPatterns.map((pattern, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={pattern}
                          onChange={(e) => updateSubjectPattern(categoryKey, index, e.target.value)}
                          placeholder="Enter email subject line pattern..."
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button
                          onClick={() => removeSubjectPattern(categoryKey, index)}
                          className="text-red-600 hover:text-red-700 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200">
          <button
            onClick={resetToDefaults}
            className="flex items-center px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset to Defaults
          </button>
          
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={saveConfig}
              disabled={!hasChanges}
              className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailParsingSettings; 