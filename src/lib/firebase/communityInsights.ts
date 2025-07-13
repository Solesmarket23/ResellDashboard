import { db } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  query, 
  where, 
  updateDoc,
  deleteDoc,
  Timestamp
} from 'firebase/firestore';
import crypto from 'crypto';

// Hash user ID for privacy
const hashUserId = (userId: string): string => {
  // In browser environment, use a simple hash
  if (typeof window !== 'undefined') {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `user_${Math.abs(hash)}`;
  }
  return `user_${userId.substring(0, 8)}`;
};

// Contribute user's failure data
export const contributeFailureData = async (
  userId: string,
  monthKey: string, // Format: "2025-01"
  failureCount: number,
  totalSales: number = 0
) => {
  try {
    const hashedUserId = hashUserId(userId);
    const contributionRef = doc(db, 'communityMetrics', 'userContributions', monthKey, hashedUserId);
    
    await setDoc(contributionRef, {
      failureCount,
      totalSales,
      failureRate: totalSales > 0 ? (failureCount / totalSales) * 100 : 0,
      marketplace: 'stockx', // Default for now
      lastUpdated: Timestamp.now()
    });
    
    console.log('Contributed failure data for', monthKey);
  } catch (error) {
    console.error('Error contributing failure data:', error);
    throw error;
  }
};

// Remove user's contribution when they opt out
export const removeUserContribution = async (userId: string) => {
  try {
    const hashedUserId = hashUserId(userId);
    
    // Get all months where user has contributed
    const monthsRef = collection(db, 'communityMetrics', 'userContributions');
    const monthDocs = await getDocs(monthsRef);
    
    // Delete user's contribution from each month
    const deletePromises = monthDocs.docs.map(async (monthDoc) => {
      const userContributionRef = doc(db, 'communityMetrics', 'userContributions', monthDoc.id, hashedUserId);
      return deleteDoc(userContributionRef);
    });
    
    await Promise.all(deletePromises);
    console.log('Removed all user contributions');
  } catch (error) {
    console.error('Error removing user contributions:', error);
  }
};

// Get community aggregates for a specific month
export const getCommunityAggregates = async (monthKey: string) => {
  try {
    const aggregateRef = doc(db, 'communityMetrics', 'aggregates', 'monthly', monthKey);
    const aggregateDoc = await getDoc(aggregateRef);
    
    if (aggregateDoc.exists()) {
      return aggregateDoc.data();
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching community aggregates:', error);
    return null;
  }
};

// Get all available community aggregates
export const getAllCommunityAggregates = async () => {
  try {
    const aggregatesRef = collection(db, 'communityMetrics', 'aggregates', 'monthly');
    const aggregateDocs = await getDocs(aggregatesRef);
    
    const aggregates: { [key: string]: any } = {};
    aggregateDocs.forEach(doc => {
      aggregates[doc.id] = doc.data();
    });
    
    return aggregates;
  } catch (error) {
    console.error('Error fetching all community aggregates:', error);
    return {};
  }
};

// Calculate user's percentile based on their failure rate
export const calculateUserPercentile = (userRate: number, aggregateData: any): number => {
  if (!aggregateData || !aggregateData.percentiles) return 50;
  
  const { percentiles } = aggregateData;
  
  if (userRate <= percentiles['25th']) return 75; // Better than 75% of users
  if (userRate <= percentiles['50th']) return 50; // Better than 50% of users
  if (userRate <= percentiles['75th']) return 25; // Better than 25% of users
  return 10; // In the bottom 10%
};

// Function to be called periodically (via Cloud Function) to calculate aggregates
export const calculateMonthlyAggregates = async (monthKey: string) => {
  try {
    const contributionsRef = collection(db, 'communityMetrics', 'userContributions', monthKey);
    const contributionDocs = await getDocs(contributionsRef);
    
    if (contributionDocs.size < 10) {
      console.log('Not enough users for aggregation (minimum 10 required)');
      return;
    }
    
    const failureRates: number[] = [];
    let totalFailures = 0;
    let totalSales = 0;
    
    contributionDocs.forEach(doc => {
      const data = doc.data();
      if (data.failureRate !== undefined) {
        failureRates.push(data.failureRate);
      }
      totalFailures += data.failureCount || 0;
      totalSales += data.totalSales || 0;
    });
    
    // Sort for percentile calculation
    failureRates.sort((a, b) => a - b);
    
    // Calculate statistics
    const avgFailureRate = totalSales > 0 ? (totalFailures / totalSales) * 100 : 0;
    const medianRate = failureRates[Math.floor(failureRates.length / 2)] || 0;
    
    const percentiles = {
      '25th': failureRates[Math.floor(failureRates.length * 0.25)] || 0,
      '50th': medianRate,
      '75th': failureRates[Math.floor(failureRates.length * 0.75)] || 0
    };
    
    // Save aggregates
    const aggregateRef = doc(db, 'communityMetrics', 'aggregates', 'monthly', monthKey);
    await setDoc(aggregateRef, {
      totalUsers: contributionDocs.size,
      avgFailureRate,
      medianFailureRate: medianRate,
      percentiles,
      totalFailures,
      totalSales,
      lastCalculated: Timestamp.now()
    });
    
    console.log('Calculated aggregates for', monthKey);
  } catch (error) {
    console.error('Error calculating monthly aggregates:', error);
  }
};