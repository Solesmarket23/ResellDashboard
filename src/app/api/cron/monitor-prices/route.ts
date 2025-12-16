import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getStockXApiCredentials, validateApiCredentials } from '@/lib/utils/userApiKeyHelper';

// Verify this is a legitimate cron request
function verifyCronRequest(request: NextRequest) {
  const authHeader = headers().get('authorization');
  const userAgent = headers().get('user-agent');
  const host = headers().get('host');
  
  // Allow requests from:
  // 1. Vercel crons (with secret)
  // 2. GitHub Actions (specific user agent)
  // 3. Localhost (development)
  return authHeader === `Bearer ${process.env.CRON_SECRET}` || 
         userAgent?.includes('GitHub-Actions') ||
         host?.includes('localhost') ||
         host?.includes('solesmarket.com');
}

interface MonitoredProduct {
  id: string;
  userId: string;
  productId: string;
  variantId: string;
  title: string;
  brand: string;
  size: string;
  currentAsk: number;
  currentBid: number;
  currentFlexAsk?: number;
  targetAskPrice?: number;
  targetFlexAskPrice?: number;
  targetBidPrice?: number;
  priceDropThreshold: number;
  flexPriceDropThreshold: number;
  priceHistory: Array<{
    timestamp: number;
    highestBid: number;
    lowestAsk: number;
    flexLowestAsk?: number;
  }>;
  lastChecked: number;
  alerts: Array<{
    id: string;
    type: string;
    message: string;
    timestamp: number;
    oldPrice: number;
    newPrice: number;
    percentage: number;
  }>;
}

type SlackSettings = {
  enabled: boolean;
  webhookUrl: string;
};

async function sendSlackWebhook(webhookUrl: string, payload: any): Promise<void> {
  if (!webhookUrl) return;
  // Basic safety: only allow https webhooks
  if (!/^https:\/\//i.test(webhookUrl)) return;

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Slack webhook failed: ${res.status} ${text}`.trim());
  }
}

export async function GET(request: NextRequest) {
  try {
    if (process.env.CRON_PAUSED === '1' || process.env.CRON_PAUSED === 'true') {
      return NextResponse.json({
        success: true,
        paused: true,
        message: 'Cron paused via CRON_PAUSED',
        timestamp: new Date().toISOString()
      });
    }

    // Verify this is a legitimate cron request
    if (!verifyCronRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Import adminDb lazily to avoid initialization errors
    const { getAdminDb } = await import('@/lib/firebase/firebaseAdmin');
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ 
        error: 'Firebase Admin not initialized',
        message: 'Missing Firebase Admin credentials'
      }, { status: 500 });
    }

    console.log('🔄 Cron job started: monitor-prices');
    
    // Get all users with monitoring enabled
    const usersSnapshot = await adminDb.collection('users').get();
    const activeUsers: string[] = [];
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      // Check if user has monitoring enabled (we'll check their monitored products)
      const monitoringEnabled = userData.stockxMonitoringActive !== false;
      if (monitoringEnabled) {
        activeUsers.push(userDoc.id);
      }
    }

    console.log(`📊 Found ${activeUsers.length} active users to check`);

    let totalProductsChecked = 0;
    let totalAlertsCreated = 0;
    const errors: string[] = [];

    // Process each user's monitored products
    for (const userId of activeUsers) {
      try {
        // Get user's monitored products
        const productsSnapshot = await adminDb
          .collection('monitored_products')
          .where('userId', '==', userId)
          .get();

        if (productsSnapshot.empty) {
          continue;
        }

        console.log(`👤 Processing ${productsSnapshot.size} products for user ${userId}`);

        // Get user's API credentials
        const credentials = await getStockXApiCredentials(userId);
        const validation = validateApiCredentials(credentials);
        
        if (!validation.isValid) {
          console.log(`❌ Invalid API credentials for user ${userId}`);
          continue;
        }

        // Get user's access token
        const userDoc = await adminDb.collection('users').doc(userId).get();
        const userData = userDoc.data();
        const stockxTokens = userData?.stockxTokens;
        
        if (!stockxTokens?.access_token) {
          console.log(`❌ No access token for user ${userId}`);
          continue;
        }

        // Load user's Slack settings (so we can notify even when the UI isn't open)
        const slack: SlackSettings | null =
          userData?.stockxPriceMonitorSlack && typeof userData.stockxPriceMonitorSlack === 'object'
            ? {
                enabled: userData.stockxPriceMonitorSlack.enabled === true,
                webhookUrl: String(userData.stockxPriceMonitorSlack.webhookUrl || '').trim(),
              }
            : null;

        // Check if we need to check products (respect rate limits)
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000); // 1 hour (matches Vercel cron cadence)
        
        // Batch products that need checking
        const productsToCheck: MonitoredProduct[] = [];
        
        for (const doc of productsSnapshot.docs) {
          const product = doc.data() as MonitoredProduct;
          
          // Only check if it's been at least 1 hour since last check
          if (!product.lastChecked || product.lastChecked < oneHourAgo) {
            productsToCheck.push({ ...product, id: doc.id });
          }
        }

        if (productsToCheck.length === 0) {
          console.log(`⏭️ No products need checking for user ${userId}`);
          continue;
        }

        console.log(`🔍 Checking ${productsToCheck.length} products for user ${userId}`);

        // Process products in batches of 10 to avoid rate limits
        const batchSize = 10;
        for (let i = 0; i < productsToCheck.length; i += batchSize) {
          const batch = productsToCheck.slice(i, i + batchSize);
          
          try {
            // Fetch market data for all products in batch
            const marketDataUrl = 'https://api.stockx.com/v2/catalog/products/market-data';
            
            // Create request for each product
            const requests = batch.map(async (product) => {
              try {
                const response = await fetch(`${marketDataUrl}?productId=${product.productId}&variantId=${product.variantId}`, {
                  headers: {
                    'Authorization': `Bearer ${stockxTokens.access_token}`,
                    'X-API-Key': credentials.apiKey,
                    'Accept': 'application/json',
                    'User-Agent': 'ResellDashboard-Cron/1.0'
                  }
                });

                if (!response.ok) {
                  throw new Error(`API error: ${response.status}`);
                }

                const data = await response.json();
                return { product, marketData: data };
              } catch (error) {
                console.error(`Error fetching data for ${product.title}:`, error);
                return null;
              }
            });

            const results = await Promise.all(requests);

            // Process results and create alerts
            for (const result of results) {
              if (!result) continue;
              
              const { product, marketData } = result;
              totalProductsChecked++;

              // Extract current prices
              const currentData = Array.isArray(marketData) ? marketData[0] : marketData;
              const newAsk = parseInt(currentData?.lowestAskAmount) || 0;
              const newBid = parseInt(currentData?.highestBidAmount) || 0;
              const newFlexAsk = currentData?.flexLowestAskAmount ? parseInt(currentData.flexLowestAskAmount) : undefined;

              // Check for alerts
              const alerts: any[] = [];
              
              // Check ask price drop
              if (newAsk > 0 && product.currentAsk > 0) {
                const askDropPercent = ((product.currentAsk - newAsk) / product.currentAsk) * 100;
                
                if (askDropPercent >= product.priceDropThreshold) {
                  alerts.push({
                    id: `${Date.now()}-ask-${Math.random().toString(36).substr(2, 9)}`,
                    type: 'ask_drop',
                    message: `Ask price dropped ${askDropPercent.toFixed(1)}% from $${product.currentAsk} to $${newAsk}`,
                    timestamp: now,
                    oldPrice: product.currentAsk,
                    newPrice: newAsk,
                    percentage: askDropPercent
                  });
                }
                
                // Check if target ask price hit
                if (product.targetAskPrice && newAsk <= product.targetAskPrice) {
                  alerts.push({
                    id: `${Date.now()}-target-${Math.random().toString(36).substr(2, 9)}`,
                    type: 'target_hit',
                    message: `Target ask price reached! Current: $${newAsk} (Target: $${product.targetAskPrice})`,
                    timestamp: now,
                    oldPrice: product.currentAsk,
                    newPrice: newAsk,
                    percentage: askDropPercent
                  });
                }
              }

              // Check flex ask drop
              if (newFlexAsk && product.currentFlexAsk) {
                const flexDropPercent = ((product.currentFlexAsk - newFlexAsk) / product.currentFlexAsk) * 100;
                
                if (flexDropPercent >= product.flexPriceDropThreshold) {
                  alerts.push({
                    id: `${Date.now()}-flex-${Math.random().toString(36).substr(2, 9)}`,
                    type: 'flex_ask_drop',
                    message: `Flex ask dropped ${flexDropPercent.toFixed(1)}% from $${product.currentFlexAsk} to $${newFlexAsk}`,
                    timestamp: now,
                    oldPrice: product.currentFlexAsk,
                    newPrice: newFlexAsk,
                    percentage: flexDropPercent
                  });
                }
              }

              // Update product in Firebase
              const updatedProduct = {
                ...product,
                currentAsk: newAsk || product.currentAsk,
                currentBid: newBid || product.currentBid,
                currentFlexAsk: newFlexAsk,
                lastChecked: now,
                priceHistory: [
                  ...product.priceHistory.slice(-99), // Keep last 100 entries
                  {
                    timestamp: now,
                    highestBid: newBid,
                    lowestAsk: newAsk,
                    flexLowestAsk: newFlexAsk
                  }
                ],
                alerts: [...product.alerts, ...alerts].slice(-50) // Keep last 50 alerts
              };

              await adminDb
                .collection('monitored_products')
                .doc(product.id)
                .update(updatedProduct);

              totalAlertsCreated += alerts.length;

              // Log alerts
              if (alerts.length > 0) {
                console.log(`🚨 Created ${alerts.length} alerts for ${product.title} (${product.size})`);
              }

              // Slack notify (best-effort, don't fail the cron run)
              if (slack?.enabled && slack.webhookUrl && alerts.length > 0) {
                for (const a of alerts) {
                  try {
                    const header =
                      a.type === 'ask_drop'
                        ? '🚨 Price Drop Alert'
                        : a.type === 'flex_ask_drop'
                          ? '🟣 Flex Price Drop Alert'
                          : a.type === 'target_hit'
                            ? '🎯 Target Price Hit'
                            : a.type === 'flex_target_hit'
                              ? '🟣🎯 Flex Target Hit'
                              : '📢 Price Alert';

                    await sendSlackWebhook(slack.webhookUrl, {
                      blocks: [
                        {
                          type: 'header',
                          text: { type: 'plain_text', text: header, emoji: true },
                        },
                        {
                          type: 'section',
                          fields: [
                            { type: 'mrkdwn', text: `*Product:*\n${product.brand} ${product.title}` },
                            { type: 'mrkdwn', text: `*Size:*\n${product.size}` },
                            { type: 'mrkdwn', text: `*Old Price:*\n$${a.oldPrice}` },
                            { type: 'mrkdwn', text: `*New Price:*\n$${a.newPrice}` },
                            { type: 'mrkdwn', text: `*Change:*\n${Number(a.percentage).toFixed(1)}%` },
                          ],
                        },
                        {
                          type: 'section',
                          text: { type: 'mrkdwn', text: String(a.message || '').slice(0, 2900) },
                        },
                      ],
                    });
                  } catch (err) {
                    console.warn('⚠️ Slack notify failed (non-fatal)', {
                      userId,
                      productId: product.productId,
                      variantId: product.variantId,
                      error: err instanceof Error ? err.message : String(err),
                    });
                  }
                }
              }
            }

            // Add delay between batches to respect rate limits
            if (i + batchSize < productsToCheck.length) {
              await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
            }

          } catch (error) {
            console.error(`Error processing batch for user ${userId}:`, error);
            errors.push(`User ${userId}: ${error.message}`);
          }
        }

      } catch (error) {
        console.error(`Error processing user ${userId}:`, error);
        errors.push(`User ${userId}: ${error.message}`);
      }
    }

    const summary = {
      success: true,
      timestamp: new Date().toISOString(),
      usersProcessed: activeUsers.length,
      productsChecked: totalProductsChecked,
      alertsCreated: totalAlertsCreated,
      errors: errors.length > 0 ? errors : undefined
    };

    console.log('✅ Cron job completed:', summary);

    return NextResponse.json(summary);

  } catch (error) {
    console.error('❌ Cron job error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}