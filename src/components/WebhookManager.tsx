'use client';

import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Plus, Trash2, Settings, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

interface WebhookSubscription {
  id: string;
  carrier: string;
  trackingNumber?: string;
  accountNumber?: string;
  webhookUrl: string;
  events: string[];
  active: boolean;
  createdAt: string;
  lastEvent?: string;
}

const WebhookManager: React.FC = () => {
  const { currentTheme } = useTheme();
  const [webhooks, setWebhooks] = useState<WebhookSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newWebhook, setNewWebhook] = useState({
    carrier: 'fedex',
    trackingNumber: '',
    accountNumber: '',
    events: ['status_update', 'delivery', 'exception']
  });

  // Load webhooks
  const loadWebhooks = async () => {
    try {
      const response = await fetch('/api/tracking/webhooks');
      const data = await response.json();
      
      if (data.success) {
        setWebhooks(data.data);
      }
    } catch (error) {
      console.error('Error loading webhooks:', error);
    } finally {
      setLoading(false);
    }
  };

  // Create webhook
  const createWebhook = async () => {
    setCreating(true);
    try {
      const response = await fetch('/api/tracking/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newWebhook)
      });
      
      const data = await response.json();
      
      if (data.success) {
        setShowCreateForm(false);
        setNewWebhook({
          carrier: 'fedex',
          trackingNumber: '',
          accountNumber: '',
          events: ['status_update', 'delivery', 'exception']
        });
        await loadWebhooks();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error creating webhook:', error);
      alert('Error creating webhook');
    } finally {
      setCreating(false);
    }
  };

  // Toggle webhook status
  const toggleWebhook = async (webhookId: string, active: boolean) => {
    try {
      const response = await fetch('/api/tracking/webhooks', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ webhookId, active })
      });
      
      const data = await response.json();
      
      if (data.success) {
        await loadWebhooks();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error toggling webhook:', error);
      alert('Error toggling webhook');
    }
  };

  useEffect(() => {
    loadWebhooks();
  }, []);

  const getStatusIcon = (active: boolean) => {
    return active ? (
      <CheckCircle className="w-4 h-4 text-green-500" />
    ) : (
      <XCircle className="w-4 h-4 text-red-500" />
    );
  };

  const getStatusColor = (active: boolean) => {
    return active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  if (loading) {
    return (
      <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border}`}>
        <div className="flex items-center justify-center">
          <div className={`w-6 h-6 border-2 border-transparent border-t-current rounded-full animate-spin ${currentTheme.colors.accent}`}></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border}`}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
            Webhook Management
          </h3>
          <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
            Manage real-time tracking webhooks for instant updates
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Webhook
        </button>
      </div>

      {/* Create Webhook Form */}
      {showCreateForm && (
        <div className={`mb-6 p-4 border rounded-lg ${currentTheme.colors.border}`}>
          <h4 className={`text-md font-medium ${currentTheme.colors.textPrimary} mb-4`}>
            Create New Webhook
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium ${currentTheme.colors.textPrimary} mb-2`}>
                Carrier
              </label>
              <select
                value={newWebhook.carrier}
                onChange={(e) => setNewWebhook({ ...newWebhook, carrier: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary}`}
              >
                <option value="fedex">FedEx (Advanced Integrated Visibility)</option>
                <option value="ups">UPS</option>
                <option value="usps">USPS</option>
              </select>
            </div>
            
            <div>
              <label className={`block text-sm font-medium ${currentTheme.colors.textPrimary} mb-2`}>
                Tracking Number (optional)
              </label>
              <input
                type="text"
                value={newWebhook.trackingNumber}
                onChange={(e) => setNewWebhook({ ...newWebhook, trackingNumber: e.target.value })}
                placeholder="Leave empty for account-wide tracking"
                className={`w-full px-3 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary}`}
              />
            </div>
            
            <div>
              <label className={`block text-sm font-medium ${currentTheme.colors.textPrimary} mb-2`}>
                Account Number (optional)
              </label>
              <input
                type="text"
                value={newWebhook.accountNumber}
                onChange={(e) => setNewWebhook({ ...newWebhook, accountNumber: e.target.value })}
                placeholder="For account-wide tracking"
                className={`w-full px-3 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary}`}
              />
            </div>
            
            <div>
              <label className={`block text-sm font-medium ${currentTheme.colors.textPrimary} mb-2`}>
                Events to Track
              </label>
              <div className="space-y-2">
                {['status_update', 'delivery', 'exception', 'delay'].map((event) => (
                  <label key={event} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={newWebhook.events.includes(event)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewWebhook({
                            ...newWebhook,
                            events: [...newWebhook.events, event]
                          });
                        } else {
                          setNewWebhook({
                            ...newWebhook,
                            events: newWebhook.events.filter(ev => ev !== event)
                          });
                        }
                      }}
                      className="mr-2"
                    />
                    <span className={`text-sm ${currentTheme.colors.textPrimary}`}>
                      {event.replace('_', ' ').toUpperCase()}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          
          <div className="flex gap-2 mt-4">
            <button
              onClick={createWebhook}
              disabled={creating}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                creating
                  ? 'bg-gray-400 cursor-not-allowed text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {creating ? (
                <>
                  <div className="w-4 h-4 border-2 border-transparent border-t-current rounded-full animate-spin"></div>
                  Creating...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Create Webhook
                </>
              )}
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Webhooks List */}
      <div className="space-y-4">
        {webhooks.length === 0 ? (
          <div className="text-center py-8">
            <WifiOff className={`w-12 h-12 mx-auto mb-4 ${currentTheme.colors.textSecondary}`} />
            <h3 className={`text-lg font-medium ${currentTheme.colors.textPrimary} mb-2`}>
              No Webhooks Configured
            </h3>
            <p className={`${currentTheme.colors.textSecondary} mb-4`}>
              Set up webhooks to receive real-time tracking updates
            </p>
          </div>
        ) : (
          webhooks.map((webhook) => (
            <div key={webhook.id} className={`p-4 border rounded-lg ${currentTheme.colors.border}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getStatusIcon(webhook.active)}
                  <div>
                    <h4 className={`font-medium ${currentTheme.colors.textPrimary}`}>
                      {webhook.carrier.toUpperCase()} Webhook
                    </h4>
                    <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                      {webhook.trackingNumber ? `Tracking: ${webhook.trackingNumber}` : 'Account-wide tracking'}
                    </p>
                    <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
                      Created: {new Date(webhook.createdAt).toLocaleString()}
                    </p>
                    {webhook.lastEvent && (
                      <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
                        Last event: {new Date(webhook.lastEvent).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(webhook.active)}`}>
                    {webhook.active ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    onClick={() => toggleWebhook(webhook.id, !webhook.active)}
                    className={`p-2 rounded-lg transition-colors ${
                      webhook.active
                        ? 'text-red-600 hover:bg-red-100'
                        : 'text-green-600 hover:bg-green-100'
                    }`}
                  >
                    {webhook.active ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              
              <div className="mt-3">
                <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
                  <strong>Webhook URL:</strong> {webhook.webhookUrl}
                </p>
                <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
                  <strong>Events:</strong> {webhook.events.join(', ')}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default WebhookManager;
