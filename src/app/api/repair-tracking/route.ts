import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/firebase/firebase';
import { collection, query, where, getDocs, updateDoc, doc, orderBy, limit } from 'firebase/firestore';

// Enhanced tracking patterns (same as in the component)
const trackingPatterns = [
  { 
    name: 'UPS Tracking', 
    regex: /(1Z[0-9A-Z]{16})/gi,
    priority: 1,
    validator: (match: string) => /^1Z[0-9A-Z]{16}$/i.test(match)
  },
  { 
    name: 'FedEx URL Tracking', 
    regex: /fedex\.com.*tracknumbers[=%3D]([0-9]{12,15})/gi,
    priority: 1,
    validator: (match: string) => /^[0-9]{12,15}$/.test(match) && !isExcludedNumber(match)
  },
  { 
    name: 'FedEx URL Encoded', 
    regex: /tracknumbers%3D([0-9]{12,15})/gi,
    priority: 1,
    validator: (match: string) => /^[0-9]{12,15}$/.test(match) && !isExcludedNumber(match)
  },
  { 
    name: 'FedEx Standard', 
    regex: /(?:tracking.*?|number.*?)([0-9]{12})\b/gi,
    priority: 2,
    validator: (match: string) => /^[0-9]{12}$/.test(match) && !isExcludedNumber(match)
  },
  { 
    name: 'FedEx Express', 
    regex: /(?:tracking.*?|number.*?)([0-9]{14})\b/gi,
    priority: 2,
    validator: (match: string) => /^[0-9]{14}$/.test(match) && !isExcludedNumber(match)
  },
  { 
    name: 'USPS Priority', 
    regex: /(9[0-9]{21})\b/gi,
    priority: 3,
    validator: (match: string) => /^9[0-9]{21}$/.test(match)
  },
  { 
    name: 'USPS Standard', 
    regex: /(9[0-9]{19})\b/gi,
    priority: 3,
    validator: (match: string) => /^9[0-9]{19}$/.test(match)
  },
  { 
    name: 'StockX Custom', 
    regex: /([8-9][0-9]{11})\b/gi,
    priority: 4,
    validator: (match: string) => /^[8-9][0-9]{11}$/.test(match) && !isExcludedNumber(match)
  }
];

// Excluded numbers function
function isExcludedNumber(num: string): boolean {
  const excluded = [
    /^(0{8,}|1{8,})$/, // All zeros or ones
    /^(150|173|14|8|00)$/, // Short numbers
    /^[0-9]{1,3}$/, // Very short numbers
    /^[0-9]{4,6}$/, // Medium short numbers
    /^[0-9]{5}$/, // ZIP codes
    /^[0-9]{10}$/ // Phone numbers
  ];
  
  return excluded.some(pattern => pattern.test(num));
}

// Extract tracking number from email content using improved patterns
const extractTrackingNumber = (emailContent: string) => {
  const allAttempts: any[] = [];
  let bestMatch = null;

  // Try each pattern in priority order
  for (const pattern of trackingPatterns) {
    let regexMatch;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    
    while ((regexMatch = regex.exec(emailContent)) !== null) {
      const cleanMatch = regexMatch[1] ? regexMatch[1].replace(/[<>]/g, '').trim() : regexMatch[0].replace(/[<>]/g, '').trim();
      
      allAttempts.push({
        pattern: pattern.name,
        match: cleanMatch,
        priority: pattern.priority,
        valid: pattern.validator(cleanMatch)
      });

      if (pattern.validator(cleanMatch)) {
        if (!bestMatch || pattern.priority < bestMatch.priority) {
          bestMatch = {
            trackingNumber: cleanMatch,
            trackingType: pattern.name,
            priority: pattern.priority
          };
        }
      }
    }
  }

  return { bestMatch, allAttempts };
};

// Determine carrier from tracking number
const getCarrierFromTrackingNumber = (trackingNumber: string) => {
  if (/^1Z[0-9A-Z]{16}$/i.test(trackingNumber)) return 'UPS';
  if (/^[0-9]{12,15}$/.test(trackingNumber)) return 'FedEx';
  if (/^9[0-9]{19,21}$/.test(trackingNumber)) return 'USPS';
  if (/^[0-9]{10}$/.test(trackingNumber)) return 'DHL';
  return 'Unknown';
};

export async function POST(request: NextRequest) {
  try {
    console.log('🔧 Starting tracking number repair process...');

    // Get all purchases without tracking numbers
    const q = query(
      collection(db, 'purchases'),
      where('tracking', '==', ''),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const ordersWithoutTracking = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`📊 Found ${ordersWithoutTracking.length} orders without tracking numbers`);

    const repairResults = {
      totalProcessed: 0,
      trackingNumbersFound: 0,
      ordersUpdated: 0,
      errors: 0,
      details: [] as any[]
    };

    // Process each order
    for (let i = 0; i < ordersWithoutTracking.length; i++) {
      const order = ordersWithoutTracking[i];
      console.log(`🔍 Processing order ${order.orderNumber} (${i + 1}/${ordersWithoutTracking.length})...`);

      try {
        // Get the email content for this order
        const emailQuery = query(
          collection(db, 'emails'),
          where('orderNumber', '==', order.orderNumber),
          where('type', '==', 'shipping'),
          limit(1)
        );
        
        const emailSnapshot = await getDocs(emailQuery);
        
        if (emailSnapshot.empty) {
          repairResults.details.push({
            orderNumber: order.orderNumber,
            status: 'no_email',
            message: 'No shipping email found'
          });
          continue;
        }

        const emailDoc = emailSnapshot.docs[0];
        const emailData = emailDoc.data();
        const emailContent = emailData.content || emailData.body || '';

        // Extract tracking number using improved patterns
        const { bestMatch, allAttempts } = extractTrackingNumber(emailContent);

        repairResults.totalProcessed++;

        if (bestMatch) {
          const carrier = getCarrierFromTrackingNumber(bestMatch.trackingNumber);
          
          // Update the order with the tracking number
          const updatedData = {
            ...order,
            tracking: bestMatch.trackingNumber,
            carrier: carrier,
            trackingType: bestMatch.trackingType,
            lastUpdated: new Date().toISOString(),
            trackingSource: 'regex_repair_api'
          };

          await updateDoc(doc(db, 'purchases', order.id), updatedData);

          repairResults.trackingNumbersFound++;
          repairResults.ordersUpdated++;
          
          repairResults.details.push({
            orderNumber: order.orderNumber,
            status: 'success',
            trackingNumber: bestMatch.trackingNumber,
            carrier: carrier,
            pattern: bestMatch.trackingType,
            allAttempts: allAttempts
          });

          console.log(`✅ Found tracking ${bestMatch.trackingNumber} for order ${order.orderNumber}`);
        } else {
          repairResults.details.push({
            orderNumber: order.orderNumber,
            status: 'no_tracking',
            message: 'No valid tracking number found in email',
            allAttempts: allAttempts
          });
        }

      } catch (error) {
        console.error(`❌ Error processing order ${order.orderNumber}:`, error);
        repairResults.errors++;
        repairResults.details.push({
          orderNumber: order.orderNumber,
          status: 'error',
          message: error.message
        });
      }
    }

    console.log('🎉 Tracking number repair completed!');
    console.log(`📈 Results: ${repairResults.ordersUpdated} orders updated, ${repairResults.trackingNumbersFound} tracking numbers found`);

    return NextResponse.json({
      success: true,
      message: 'Tracking number repair completed successfully',
      results: repairResults
    });

  } catch (error) {
    console.error('❌ Error running tracking repair:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to run tracking repair',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
