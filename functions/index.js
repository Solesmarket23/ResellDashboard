const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp();

// Export community insights functions
exports.communityInsights = require('./communityInsights');