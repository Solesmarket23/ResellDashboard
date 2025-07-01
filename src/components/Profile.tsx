'use client';

import { useState } from 'react';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Calendar,
  Shield,
  Bell,
  Download,
  Upload,
  CreditCard,
  Key,
  Eye,
  EyeOff,
  Save,
  Edit3,
  Check,
  X,
  Settings,
  Smartphone,
  Globe,
  Lock,
  Trash2,
  AlertTriangle
} from 'lucide-react';

const Profile = () => {
  const { currentTheme, setTheme, themes } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState('personal');
  
  const [profileData, setProfileData] = useState({
    firstName: 'Mike',
    lastName: 'Milburn',
    email: 'mike@example.com',
    phone: '+1 (555) 123-4567',
    address: 'San Francisco, CA',
    dateJoined: '2024-01-15',
    timezone: 'PST',
    language: 'English'
  });

  const [notifications, setNotifications] = useState({
    emailAlerts: true,
    smsAlerts: false,
    pushNotifications: true,
    marketingEmails: false,
    weeklyReports: true,
    profitAlerts: true
  });

  const [security, setSecurity] = useState({
    twoFactorAuth: false,
    loginAlerts: true,
    deviceTracking: true
  });

  const tabs = [
    { id: 'personal', label: 'Personal Info', icon: User },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'data', label: 'Data & Privacy', icon: Download },
    { id: 'subscription', label: 'Subscription', icon: CreditCard }
  ];

  const handleInputChange = (field: string, value: string) => {
    setProfileData(prev => ({ ...prev, [field]: value }));
  };

  const handleNotificationChange = (field: string, value: boolean) => {
    setNotifications(prev => ({ ...prev, [field]: value }));
  };

  const handleSecurityChange = (field: string, value: boolean) => {
    setSecurity(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    // Save logic here
    setIsEditing(false);
  };

  return (
    <div className={`flex-1 overflow-y-auto ${
      currentTheme.name === 'Neon'
        ? 'bg-gray-900'
        : 'bg-gray-50'
    }`}>
      <div className="max-w-6xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-3xl font-bold ${currentTheme.colors.textPrimary} mb-2`}>
                Profile Settings
              </h1>
              <p className={`${currentTheme.colors.textSecondary}`}>
                Manage your account settings and preferences
              </p>
            </div>
            <div className="flex items-center space-x-3">
              {isEditing ? (
                <>
                  <button
                    onClick={handleSave}
                    className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                      currentTheme.name === 'Neon'
                        ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:shadow-lg hover:shadow-cyan-500/25'
                        : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:shadow-lg hover:shadow-purple-500/25'
                    }`}
                  >
                    <Check className="w-4 h-4 mr-2 inline" />
                    Save Changes
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className={`px-4 py-2 rounded-lg border transition-all duration-200 ${
                      currentTheme.name === 'Neon'
                        ? 'border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10'
                        : 'border-purple-500/30 text-purple-600 hover:bg-purple-500/10'
                    }`}
                  >
                    <X className="w-4 h-4 mr-2 inline" />
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className={`px-4 py-2 rounded-lg border transition-all duration-200 ${
                    currentTheme.name === 'Neon'
                      ? 'border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10'
                      : 'border-purple-500/30 text-purple-600 hover:bg-purple-500/10'
                  }`}
                >
                  <Edit3 className="w-4 h-4 mr-2 inline" />
                  Edit Profile
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 mb-8 overflow-x-auto">
          {tabs.map((tab) => {
            const IconComponent = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-4 py-3 rounded-lg font-medium transition-all duration-200 whitespace-nowrap ${
                  activeTab === tab.id
                    ? currentTheme.name === 'Neon'
                      ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : `${currentTheme.colors.primary} text-white`
                    : `${currentTheme.colors.textSecondary} hover:bg-white/5 hover:text-white`
                }`}
              >
                <IconComponent className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {activeTab === 'personal' && (
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Profile Picture */}
              <div className={`p-6 rounded-2xl ${
                currentTheme.name === 'Neon'
                  ? 'bg-white/5 border border-cyan-500/20'
                  : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border`
              }`}>
                <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary} mb-4`}>
                  Profile Picture
                </h3>
                <div className="flex items-center space-x-4">
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
                    currentTheme.name === 'Neon' 
                      ? 'bg-gradient-to-r from-emerald-500 to-cyan-500' 
                      : 'bg-gradient-to-r from-purple-500 to-pink-500'
                  }`}>
                    <User className="w-10 h-10 text-white" />
                  </div>
                  <div>
                    <p className={`font-medium ${currentTheme.colors.textPrimary} mb-1`}>
                      {profileData.firstName} {profileData.lastName}
                    </p>
                    <p className={`text-sm ${currentTheme.colors.textSecondary} mb-3`}>
                      Pro Member since {new Date(profileData.dateJoined).toLocaleDateString()}
                    </p>
                    <button className={`text-sm font-medium ${
                      currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-purple-600'
                    } hover:underline`}>
                      Change Photo
                    </button>
                  </div>
                </div>
              </div>

              {/* Personal Information */}
              <div className={`p-6 rounded-2xl ${
                currentTheme.name === 'Neon'
                  ? 'bg-white/5 border border-cyan-500/20'
                  : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border`
              }`}>
                <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary} mb-4`}>
                  Personal Information
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={`block text-sm font-medium ${currentTheme.colors.textSecondary} mb-1`}>
                        First Name
                      </label>
                      <input
                        type="text"
                        value={profileData.firstName}
                        onChange={(e) => handleInputChange('firstName', e.target.value)}
                        disabled={!isEditing}
                        className={`w-full px-3 py-2 rounded-lg ${
                          currentTheme.name === 'Neon'
                            ? 'bg-white/10 border border-cyan-500/30 text-white placeholder-gray-400 focus:border-cyan-500'
                            : 'bg-white border border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500'
                        } focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all duration-200 disabled:opacity-50`}
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium ${currentTheme.colors.textSecondary} mb-1`}>
                        Last Name
                      </label>
                      <input
                        type="text"
                        value={profileData.lastName}
                        onChange={(e) => handleInputChange('lastName', e.target.value)}
                        disabled={!isEditing}
                        className={`w-full px-3 py-2 rounded-lg ${
                          currentTheme.name === 'Neon'
                            ? 'bg-white/10 border border-cyan-500/30 text-white placeholder-gray-400 focus:border-cyan-500'
                            : 'bg-white border border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500'
                        } focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all duration-200 disabled:opacity-50`}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className={`block text-sm font-medium ${currentTheme.colors.textSecondary} mb-1`}>
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={profileData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      disabled={!isEditing}
                      className={`w-full px-3 py-2 rounded-lg ${
                        currentTheme.name === 'Neon'
                          ? 'bg-white/10 border border-cyan-500/30 text-white placeholder-gray-400 focus:border-cyan-500'
                          : 'bg-white border border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500'
                      } focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all duration-200 disabled:opacity-50`}
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium ${currentTheme.colors.textSecondary} mb-1`}>
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={profileData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      disabled={!isEditing}
                      className={`w-full px-3 py-2 rounded-lg ${
                        currentTheme.name === 'Neon'
                          ? 'bg-white/10 border border-cyan-500/30 text-white placeholder-gray-400 focus:border-cyan-500'
                          : 'bg-white border border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500'
                      } focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all duration-200 disabled:opacity-50`}
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium ${currentTheme.colors.textSecondary} mb-1`}>
                      Location
                    </label>
                    <input
                      type="text"
                      value={profileData.address}
                      onChange={(e) => handleInputChange('address', e.target.value)}
                      disabled={!isEditing}
                      className={`w-full px-3 py-2 rounded-lg ${
                        currentTheme.name === 'Neon'
                          ? 'bg-white/10 border border-cyan-500/30 text-white placeholder-gray-400 focus:border-cyan-500'
                          : 'bg-white border border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500'
                      } focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all duration-200 disabled:opacity-50`}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Security Settings */}
              <div className={`p-6 rounded-2xl ${
                currentTheme.name === 'Neon'
                  ? 'bg-white/5 border border-cyan-500/20'
                  : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border`
              }`}>
                <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary} mb-4`}>
                  Security Settings
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`font-medium ${currentTheme.colors.textPrimary}`}>
                        Two-Factor Authentication
                      </p>
                      <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                        Add an extra layer of security to your account
                      </p>
                    </div>
                    <button
                      onClick={() => handleSecurityChange('twoFactorAuth', !security.twoFactorAuth)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        security.twoFactorAuth
                          ? currentTheme.name === 'Neon' ? 'bg-emerald-500' : 'bg-purple-500'
                          : 'bg-gray-400'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          security.twoFactorAuth ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`font-medium ${currentTheme.colors.textPrimary}`}>
                        Login Alerts
                      </p>
                      <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                        Get notified of new sign-ins to your account
                      </p>
                    </div>
                    <button
                      onClick={() => handleSecurityChange('loginAlerts', !security.loginAlerts)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        security.loginAlerts
                          ? currentTheme.name === 'Neon' ? 'bg-emerald-500' : 'bg-purple-500'
                          : 'bg-gray-400'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          security.loginAlerts ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`font-medium ${currentTheme.colors.textPrimary}`}>
                        Device Tracking
                      </p>
                      <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                        Track devices that access your account
                      </p>
                    </div>
                    <button
                      onClick={() => handleSecurityChange('deviceTracking', !security.deviceTracking)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        security.deviceTracking
                          ? currentTheme.name === 'Neon' ? 'bg-emerald-500' : 'bg-purple-500'
                          : 'bg-gray-400'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          security.deviceTracking ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Password Change */}
              <div className={`p-6 rounded-2xl ${
                currentTheme.name === 'Neon'
                  ? 'bg-white/5 border border-cyan-500/20'
                  : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border`
              }`}>
                <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary} mb-4`}>
                  Change Password
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className={`block text-sm font-medium ${currentTheme.colors.textSecondary} mb-1`}>
                      Current Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className={`w-full px-3 py-2 rounded-lg ${
                          currentTheme.name === 'Neon'
                            ? 'bg-white/10 border border-cyan-500/30 text-white placeholder-gray-400 focus:border-cyan-500'
                            : 'bg-white border border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500'
                        } focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all duration-200`}
                        placeholder="Enter current password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2"
                      >
                        {showPassword ? 
                          <EyeOff className={`w-5 h-5 ${currentTheme.colors.textSecondary}`} /> : 
                          <Eye className={`w-5 h-5 ${currentTheme.colors.textSecondary}`} />
                        }
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium ${currentTheme.colors.textSecondary} mb-1`}>
                      New Password
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className={`w-full px-3 py-2 rounded-lg ${
                        currentTheme.name === 'Neon'
                          ? 'bg-white/10 border border-cyan-500/30 text-white placeholder-gray-400 focus:border-cyan-500'
                          : 'bg-white border border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500'
                      } focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all duration-200`}
                      placeholder="Enter new password"
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium ${currentTheme.colors.textSecondary} mb-1`}>
                      Confirm New Password
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className={`w-full px-3 py-2 rounded-lg ${
                        currentTheme.name === 'Neon'
                          ? 'bg-white/10 border border-cyan-500/30 text-white placeholder-gray-400 focus:border-cyan-500'
                          : 'bg-white border border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500'
                      } focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all duration-200`}
                      placeholder="Confirm new password"
                    />
                  </div>

                  <button className={`w-full py-2 px-4 rounded-lg font-medium transition-all duration-200 ${
                    currentTheme.name === 'Neon'
                      ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:shadow-lg hover:shadow-cyan-500/25'
                      : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:shadow-lg hover:shadow-purple-500/25'
                  }`}>
                    Update Password
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className={`p-6 rounded-2xl ${
              currentTheme.name === 'Neon'
                ? 'bg-white/5 border border-cyan-500/20'
                : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border`
            }`}>
              <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary} mb-6`}>
                Notification Preferences
              </h3>
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-medium ${currentTheme.colors.textPrimary}`}>
                      Email Alerts
                    </p>
                    <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                      Receive important updates via email
                    </p>
                  </div>
                  <button
                    onClick={() => handleNotificationChange('emailAlerts', !notifications.emailAlerts)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      notifications.emailAlerts
                        ? currentTheme.name === 'Neon' ? 'bg-emerald-500' : 'bg-purple-500'
                        : 'bg-gray-400'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        notifications.emailAlerts ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-medium ${currentTheme.colors.textPrimary}`}>
                      SMS Alerts
                    </p>
                    <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                      Get text messages for urgent notifications
                    </p>
                  </div>
                  <button
                    onClick={() => handleNotificationChange('smsAlerts', !notifications.smsAlerts)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      notifications.smsAlerts
                        ? currentTheme.name === 'Neon' ? 'bg-emerald-500' : 'bg-purple-500'
                        : 'bg-gray-400'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        notifications.smsAlerts ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-medium ${currentTheme.colors.textPrimary}`}>
                      Push Notifications
                    </p>
                    <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                      Browser and mobile push notifications
                    </p>
                  </div>
                  <button
                    onClick={() => handleNotificationChange('pushNotifications', !notifications.pushNotifications)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      notifications.pushNotifications
                        ? currentTheme.name === 'Neon' ? 'bg-emerald-500' : 'bg-purple-500'
                        : 'bg-gray-400'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        notifications.pushNotifications ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-medium ${currentTheme.colors.textPrimary}`}>
                      Profit Alerts
                    </p>
                    <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                      Notifications when profitable opportunities are found
                    </p>
                  </div>
                  <button
                    onClick={() => handleNotificationChange('profitAlerts', !notifications.profitAlerts)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      notifications.profitAlerts
                        ? currentTheme.name === 'Neon' ? 'bg-emerald-500' : 'bg-purple-500'
                        : 'bg-gray-400'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        notifications.profitAlerts ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-medium ${currentTheme.colors.textPrimary}`}>
                      Weekly Reports
                    </p>
                    <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                      Weekly summary of your performance and analytics
                    </p>
                  </div>
                  <button
                    onClick={() => handleNotificationChange('weeklyReports', !notifications.weeklyReports)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      notifications.weeklyReports
                        ? currentTheme.name === 'Neon' ? 'bg-emerald-500' : 'bg-purple-500'
                        : 'bg-gray-400'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        notifications.weeklyReports ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-medium ${currentTheme.colors.textPrimary}`}>
                      Marketing Emails
                    </p>
                    <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                      Product updates, tips, and promotional content
                    </p>
                  </div>
                  <button
                    onClick={() => handleNotificationChange('marketingEmails', !notifications.marketingEmails)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      notifications.marketingEmails
                        ? currentTheme.name === 'Neon' ? 'bg-emerald-500' : 'bg-purple-500'
                        : 'bg-gray-400'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        notifications.marketingEmails ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Data Export */}
              <div className={`p-6 rounded-2xl ${
                currentTheme.name === 'Neon'
                  ? 'bg-white/5 border border-cyan-500/20'
                  : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border`
              }`}>
                <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary} mb-4`}>
                  Data Export
                </h3>
                <p className={`text-sm ${currentTheme.colors.textSecondary} mb-6`}>
                  Download a copy of your data for backup or migration purposes.
                </p>
                <div className="space-y-3">
                  <button className={`w-full flex items-center justify-center px-4 py-3 rounded-lg border transition-all duration-200 ${
                    currentTheme.name === 'Neon'
                      ? 'border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10'
                      : 'border-purple-500/30 text-purple-600 hover:bg-purple-500/10'
                  }`}>
                    <Download className="w-4 h-4 mr-2" />
                    Export Purchase Data
                  </button>
                  <button className={`w-full flex items-center justify-center px-4 py-3 rounded-lg border transition-all duration-200 ${
                    currentTheme.name === 'Neon'
                      ? 'border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10'
                      : 'border-purple-500/30 text-purple-600 hover:bg-purple-500/10'
                  }`}>
                    <Download className="w-4 h-4 mr-2" />
                    Export Sales Data
                  </button>
                  <button className={`w-full flex items-center justify-center px-4 py-3 rounded-lg border transition-all duration-200 ${
                    currentTheme.name === 'Neon'
                      ? 'border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10'
                      : 'border-purple-500/30 text-purple-600 hover:bg-purple-500/10'
                  }`}>
                    <Download className="w-4 h-4 mr-2" />
                    Export Full Profile
                  </button>
                </div>
              </div>

              {/* Data Privacy */}
              <div className={`p-6 rounded-2xl ${
                currentTheme.name === 'Neon'
                  ? 'bg-white/5 border border-cyan-500/20'
                  : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border`
              }`}>
                <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary} mb-4`}>
                  Privacy & Data Deletion
                </h3>
                <p className={`text-sm ${currentTheme.colors.textSecondary} mb-6`}>
                  Manage your privacy settings and data retention preferences.
                </p>
                <div className="space-y-3">
                  <button className={`w-full flex items-center justify-center px-4 py-3 rounded-lg border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 transition-all duration-200`}>
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Request Data Deletion
                  </button>
                  <button className={`w-full flex items-center justify-center px-4 py-3 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all duration-200`}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Account
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'subscription' && (
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Current Plan */}
              <div className={`p-6 rounded-2xl ${
                currentTheme.name === 'Neon'
                  ? 'bg-white/5 border border-cyan-500/20'
                  : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border`
              }`}>
                <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary} mb-4`}>
                  Current Plan
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className={`font-medium ${currentTheme.colors.textPrimary}`}>
                      Pro Plan
                    </span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      currentTheme.name === 'Neon'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      Active
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={currentTheme.colors.textSecondary}>
                      Monthly billing
                    </span>
                    <span className={`font-medium ${currentTheme.colors.textPrimary}`}>
                      $29.99/month
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={currentTheme.colors.textSecondary}>
                      Next billing date
                    </span>
                    <span className={`font-medium ${currentTheme.colors.textPrimary}`}>
                      Feb 15, 2024
                    </span>
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <button className={`w-full py-2 px-4 rounded-lg font-medium transition-all duration-200 ${
                    currentTheme.name === 'Neon'
                      ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:shadow-lg hover:shadow-cyan-500/25'
                      : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:shadow-lg hover:shadow-purple-500/25'
                  }`}>
                    Manage Subscription
                  </button>
                </div>
              </div>

              {/* Billing History */}
              <div className={`p-6 rounded-2xl ${
                currentTheme.name === 'Neon'
                  ? 'bg-white/5 border border-cyan-500/20'
                  : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border`
              }`}>
                <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary} mb-4`}>
                  Billing History
                </h3>
                <div className="space-y-3">
                  {[
                    { date: 'Jan 15, 2024', amount: '$29.99', status: 'Paid' },
                    { date: 'Dec 15, 2023', amount: '$29.99', status: 'Paid' },
                    { date: 'Nov 15, 2023', amount: '$29.99', status: 'Paid' },
                    { date: 'Oct 15, 2023', amount: '$29.99', status: 'Paid' }
                  ].map((invoice, index) => (
                    <div key={index} className="flex items-center justify-between py-2">
                      <div>
                        <p className={`font-medium ${currentTheme.colors.textPrimary}`}>
                          {invoice.date}
                        </p>
                        <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                          Monthly Pro Plan
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-medium ${currentTheme.colors.textPrimary}`}>
                          {invoice.amount}
                        </p>
                        <p className={`text-sm ${
                          currentTheme.name === 'Neon' ? 'text-emerald-400' : 'text-green-600'
                        }`}>
                          {invoice.status}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <button className={`w-full py-2 px-4 rounded-lg border font-medium transition-all duration-200 ${
                    currentTheme.name === 'Neon'
                      ? 'border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10'
                      : 'border-purple-500/30 text-purple-600 hover:bg-purple-500/10'
                  }`}>
                    View All Invoices
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile; 