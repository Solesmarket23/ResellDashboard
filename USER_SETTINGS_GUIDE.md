# User Settings Storage Guide

## 🎯 **Recommended Storage Strategy**

### **Firebase Firestore - Primary Choice**
- **Collection**: `userSettings`
- **Document ID**: `userId` (Firebase Auth UID)
- **Structure**: Nested objects for different setting categories

### **Why Firebase?**
- ✅ **User-specific**: Each user gets their own settings
- ✅ **Persistent**: Survives browser refreshes and device changes
- ✅ **Real-time**: Can sync across multiple devices
- ✅ **Secure**: Only authenticated users can access their settings
- ✅ **Scalable**: Handles millions of users efficiently

## 📁 **Firestore Structure**

```javascript
// Collection: userSettings
// Document ID: userId

{
  // Dashboard settings
  customizableStats: ["total_profit", "total_revenue", "unsold_inventory"],
  
  // Deliveries settings
  deliveriesCustomizableStats: ["total", "in_transit", "delivered", "live_tracking"],
  
  // UI preferences
  theme: "Neon",
  sidebarCollapsed: false,
  viewMode: "split", // or "table"
  
  // Date range preferences
  activeTimePeriod: "This Month",
  customDateRange: {
    startDate: "2024-01-01",
    endDate: "2024-01-31"
  },
  
  // Notification preferences
  notifications: {
    email: true,
    push: false,
    sms: false
  },
  
  // Last updated timestamp
  lastUpdated: "2024-01-15T10:30:00Z"
}
```

## 🔧 **Implementation Pattern**

### **1. Save Settings Function**
```javascript
const saveUserSettings = async (settings) => {
  if (!user) return;
  
  try {
    const userSettingsRef = doc(db, 'userSettings', user.uid);
    await setDoc(userSettingsRef, {
      ...settings,
      lastUpdated: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    console.error('Error saving settings:', error);
    showNotification('Failed to save settings', 'error');
  }
};
```

### **2. Load Settings Function**
```javascript
const loadUserSettings = async () => {
  if (!user) return;
  
  try {
    const userSettingsRef = doc(db, 'userSettings', user.uid);
    const userSettingsDoc = await getDoc(userSettingsRef);
    
    if (userSettingsDoc.exists()) {
      const data = userSettingsDoc.data();
      // Update state with loaded settings
      setCustomizableStats(data.customizableStats || defaultStats);
      setTheme(data.theme || 'Default');
      // ... etc
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
};
```

### **3. Load on Component Mount**
```javascript
useEffect(() => {
  loadUserSettings();
}, [user]);
```

## 📊 **Setting Categories**

### **Dashboard Settings**
- `customizableStats`: Array of selected metric IDs
- `activeTimePeriod`: Current time period selection
- `customDateRange`: Custom date range object

### **Deliveries Settings**
- `deliveriesCustomizableStats`: Array of selected stat IDs
- `viewMode`: "split" or "table"
- `defaultFilters`: Saved filter preferences

### **UI Preferences**
- `theme`: Selected theme name
- `sidebarCollapsed`: Sidebar state
- `showBackground`: Background visibility preference

### **Notification Settings**
- `notifications`: Object with notification preferences
- `emailAlerts`: Email notification settings
- `pushAlerts`: Push notification settings

## 🚀 **Alternative Storage Options**

### **Local Storage (Fallback)**
```javascript
// For non-critical settings or when Firebase is unavailable
const saveToLocalStorage = (key, value) => {
  try {
    localStorage.setItem(`userSettings_${key}`, JSON.stringify(value));
  } catch (error) {
    console.error('Error saving to localStorage:', error);
  }
};

const loadFromLocalStorage = (key, defaultValue) => {
  try {
    const stored = localStorage.getItem(`userSettings_${key}`);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (error) {
    console.error('Error loading from localStorage:', error);
    return defaultValue;
  }
};
```

### **URL Parameters (Temporary)**
```javascript
// For sharing specific views or states
const saveToURL = (params) => {
  const url = new URL(window.location);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  window.history.replaceState({}, '', url);
};
```

## ⚡ **Performance Considerations**

### **Debounced Saves**
```javascript
import { debounce } from 'lodash';

const debouncedSave = debounce((settings) => {
  saveUserSettings(settings);
}, 1000); // Save 1 second after last change
```

### **Batch Updates**
```javascript
// Update multiple settings at once
const updateMultipleSettings = async (updates) => {
  const userSettingsRef = doc(db, 'userSettings', user.uid);
  await setDoc(userSettingsRef, {
    ...updates,
    lastUpdated: new Date().toISOString()
  }, { merge: true });
};
```

## 🔒 **Security Rules**

### **Firestore Security Rules**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /userSettings/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 📝 **Best Practices**

1. **Always provide defaults** - Don't assume settings exist
2. **Use merge: true** - Don't overwrite entire document
3. **Handle errors gracefully** - Show user-friendly error messages
4. **Debounce frequent saves** - Don't save on every keystroke
5. **Validate settings** - Ensure loaded settings are valid
6. **Version settings** - Add version field for future migrations
7. **Clean up old settings** - Remove unused settings periodically

## 🎯 **Current Implementation**

Both Dashboard and Deliveries components now save their customizable stats to Firebase:

- **Dashboard**: `customizableStats` array
- **Deliveries**: `deliveriesCustomizableStats` array

Settings are automatically loaded when the user logs in and saved when they make changes.
