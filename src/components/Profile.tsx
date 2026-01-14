'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { db } from '@/lib/firebase/firebase';
import { doc, updateDoc, getDoc, setDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
// import AutoEmailSync from './AutoEmailSync';
// import UserStockXApiManager from './UserStockXApiManager';
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Calendar,
  Shield,
  Bell,
  Database,
  CreditCard,
  Settings,
  Save,
  X,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

const Profile = () => {
  const { currentTheme, setTheme, themes } = useTheme();
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState('personal');
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    dateJoined: '',
    timezone: 'PST',
    language: 'English'
  });
  const [originalProfileData, setOriginalProfileData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    dateJoined: '',
    timezone: 'PST',
    language: 'English'
  });
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    sms: false,
    marketing: false
  });
  const [security, setSecurity] = useState({
    twoFactor: false,
    loginAlerts: true,
    sessionTimeout: 30
  });
  const [communityInsights, setCommunityInsights] = useState({
    shareData: false,
    anonymousStats: true,
    betaFeatures: false
  });
  const [gmailConnected, setGmailConnected] = useState(false);
  const [purchases, setPurchases] = useState<any[]>([]);

  const tabs = [
    { id: 'personal', label: 'Personal Info', icon: User },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'data', label: 'Data & Privacy', icon: Database },
    { id: 'subscription', label: 'Subscription', icon: CreditCard }
  ];

  const handleInputChange = (field: string, value: string) => {
    setProfileData(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    
    setIsSavingProfile(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        profile: profileData,
        updatedAt: new Date().toISOString()
      });
      
      setOriginalProfileData({ ...profileData });
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving profile:', error);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleCancelEdit = () => {
    setProfileData({ ...originalProfileData });
    setIsEditing(false);
  };

  const handleNotificationChange = (field: string, value: boolean) => {
    setNotifications(prev => ({ ...prev, [field]: value }));
  };

  const handleSecurityChange = (field: string, value: boolean | number) => {
    setSecurity(prev => ({ ...prev, [field]: value }));
  };

  const handleCommunityInsightsChange = (field: string, value: boolean) => {
    setCommunityInsights(prev => ({ ...prev, [field]: value }));
  };

  // Load user preferences from Firebase
  useEffect(() => {
    const loadUserPreferences = async () => {
      if (user) {
        try {
          const userRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userRef);
          if (userDoc.exists()) {
            const data = userDoc.data();
            
            // Load profile data
            if (data.profile) {
              const loadedProfile = {
                firstName: data.profile.firstName || '',
                lastName: data.profile.lastName || '',
                email: data.profile.email || user.email || '',
                phone: data.profile.phone || '',
                address: data.profile.address || '',
                dateJoined: user.metadata?.creationTime || new Date().toISOString(),
                timezone: 'PST',
                language: 'English'
              };
              setProfileData(loadedProfile);
              setOriginalProfileData(loadedProfile);
            } else {
              // If no profile exists, at least set the email from auth
              const defaultProfile = {
                firstName: '',
                lastName: '',
                email: user.email || '',
                phone: '',
                address: '',
                dateJoined: user.metadata?.creationTime || new Date().toISOString(),
                timezone: 'PST',
                language: 'English'
              };
              setProfileData(defaultProfile);
              setOriginalProfileData(defaultProfile);
            }
            
            // Load community insights
            if (data.communityInsights) {
              setCommunityInsights(data.communityInsights);
            }
          } else {
            // If user document doesn't exist, create it with initial data
            const userRef = doc(db, 'users', user.uid);
            await setDoc(userRef, {
              profile: {
                email: user.email || '',
                createdAt: new Date().toISOString()
              }
            }, { merge: true });
            
            // Update local state with email
            const defaultProfile = {
              firstName: '',
              lastName: '',
              email: user.email || '',
              phone: '',
              address: '',
              dateJoined: user.metadata?.creationTime || new Date().toISOString(),
              timezone: 'PST',
              language: 'English'
            };
            setProfileData(defaultProfile);
            setOriginalProfileData(defaultProfile);
          }
        } catch (error) {
          console.error('Error loading user preferences:', error);
        } finally {
          setIsLoadingProfile(false);
        }
      } else {
        setIsLoadingProfile(false);
      }
    };

    loadUserPreferences();
    
    // Check Gmail connection status
    const checkGmailStatus = async () => {
      try {
        const response = await fetch('/api/gmail/status');
        const data = await response.json();
        setGmailConnected(data.connected);
      } catch (error) {
        console.error('Error checking Gmail status:', error);
      }
    };
    
    checkGmailStatus();
    
    // Load purchases if user is logged in
    if (user) {
      const purchasesRef = collection(db, 'purchases');
      const q = query(purchasesRef, where('userId', '==', user.uid));
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const purchaseData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setPurchases(purchaseData);
      });
      
      return () => unsubscribe();
    }
  }, [user]);

  if (isLoadingProfile) {
    return (
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-6xl mx-auto p-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-8"></div>
            <div className="space-y-4">
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/3"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-6xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Profile Settings</h1>
              <p className="text-gray-600">Manage your account settings and preferences</p>
            </div>
            {isEditing ? (
              <div className="flex space-x-3">
                <button
                  onClick={handleCancelEdit}
                  className="px-4 py-2 text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center space-x-2"
                >
                  <X className="w-4 h-4" />
                  <span>Cancel</span>
                </button>
                <button
                  onClick={handleSaveProfile}
                  disabled={isSavingProfile}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSavingProfile ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
              >
                <Settings className="w-4 h-4" />
                <span>Edit Profile</span>
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-3 rounded-lg font-medium whitespace-nowrap border ${
                activeTab === tab.id
                  ? 'bg-purple-100 text-purple-700 border-purple-300'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {activeTab === 'personal' && (
            <div className="grid lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
                  <input
                    type="text"
                    value={profileData.firstName}
                    onChange={(e) => handleInputChange('firstName', e.target.value)}
                    disabled={!isEditing}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                  <input
                    type="text"
                    value={profileData.lastName}
                    onChange={(e) => handleInputChange('lastName', e.target.value)}
                    disabled={!isEditing}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={profileData.email}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500"
                  />
                  <p className="text-sm text-gray-500 mt-1">Email cannot be changed</p>
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                  <input
                    type="tel"
                    value={profileData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    disabled={!isEditing}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                  <textarea
                    value={profileData.address}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                    disabled={!isEditing}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date Joined</label>
                  <input
                    type="text"
                    value={new Date(profileData.dateJoined).toLocaleDateString()}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-8">
              <div className="grid lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-lg border border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Password & Security</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-gray-900">Two-Factor Authentication</h4>
                          <p className="text-sm text-gray-600">Add an extra layer of security</p>
                        </div>
                        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                          Enable
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-gray-900">Login Alerts</h4>
                          <p className="text-sm text-gray-600">Get notified of new logins</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={security.loginAlerts}
                            onChange={(e) => handleSecurityChange('loginAlerts', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* StockX API Configuration - Full Width */}
              <div>
                <div className="bg-white p-6 rounded-lg border border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">StockX API Configuration</h3>
                  <p className="text-gray-600">StockX API management temporarily disabled for debugging.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-lg border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Notification Preferences</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900">Email Notifications</h4>
                      <p className="text-sm text-gray-600">Receive updates via email</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notifications.email}
                        onChange={(e) => handleNotificationChange('email', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900">Push Notifications</h4>
                      <p className="text-sm text-gray-600">Receive browser notifications</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notifications.push}
                        onChange={(e) => handleNotificationChange('push', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-lg border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Data & Privacy</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900">Share Data for Insights</h4>
                      <p className="text-sm text-gray-600">Help improve the platform with anonymous data</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={communityInsights.shareData}
                        onChange={(e) => handleCommunityInsightsChange('shareData', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'subscription' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-lg border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Subscription</h3>
                <div className="text-center py-8">
                  <CreditCard className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h4 className="text-xl font-semibold text-gray-900 mb-2">Free Plan</h4>
                  <p className="text-gray-600 mb-6">You're currently on the free plan</p>
                  <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Upgrade to Pro
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