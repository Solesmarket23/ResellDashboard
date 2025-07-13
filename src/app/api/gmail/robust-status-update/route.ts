import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';

class GmailRobustSearch {
  constructor(auth: any) {
    this.gmail = google.gmail({ version: 'v1', auth });
    this.searchCache = new Map();
    this.retryDelays = [1000, 2000, 5000]; // Progressive delays
  }

  private gmail: any;
  private searchCache: Map<string, any>;
  private retryDelays: number[];

  async searchWithRetries(query: string, maxResults = 500, retries = 3) {
    const cacheKey = `${query}-${maxResults}`;
    
    // Check cache first
    if (this.searchCache.has(cacheKey)) {
      console.log(`🎯 Cache hit for: ${query}`);
      return this.searchCache.get(cacheKey);
    }

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        console.log(`🔍 Attempt ${attempt + 1} for: ${query}`);
        
        const response = await this.gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults
        });

        const result = response.data.messages || [];
        
        // Cache successful results
        this.searchCache.set(cacheKey, result);
        
        console.log(`✅ Found ${result.length} emails for: ${query}`);
        return result;

      } catch (error: any) {
        console.log(`❌ Attempt ${attempt + 1} failed: ${error.message}`);
        
        if (attempt < retries - 1) {
          const delay = this.retryDelays[attempt] || 5000;
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await this.delay(delay);
        } else {
          throw error;
        }
      }
    }
  }

  async findOrderWithFallbacks(orderNumber: string) {
    console.log(`🎯 Finding order ${orderNumber} with all fallback strategies`);
    
    const strategies = [
      // Primary searches
      {
        name: 'exact_delivered',
        query: `from:noreply@stockx.com "Xpress Ship Order Delivered" "${orderNumber}"`,
        priority: 1
      },
      {
        name: 'delivered_generic',
        query: `from:noreply@stockx.com "Order Delivered" "${orderNumber}"`,
        priority: 2
      },
      {
        name: 'stockx_delivered',
        query: `from:noreply@stockx.com delivered "${orderNumber}"`,
        priority: 3
      },
      
      // Fallback searches
      {
        name: 'order_exact',
        query: `"${orderNumber}"`,
        priority: 4
      },
      {
        name: 'order_labeled',
        query: `"Order number: ${orderNumber}"`,
        priority: 5
      },
      {
        name: 'stockx_broad',
        query: `from:noreply@stockx.com "${orderNumber}"`,
        priority: 6
      },
      
      // Last resort searches
      {
        name: 'partial_order',
        query: `"${orderNumber.split('-')[1]}"`,
        priority: 7
      },
      {
        name: 'recent_stockx',
        query: `from:noreply@stockx.com newer_than:30d`,
        priority: 8,
        needsFiltering: true
      }
    ];

    let bestResult: any = null;
    let bestPriority = Infinity;

    for (const strategy of strategies) {
      try {
        console.log(`🔎 Strategy: ${strategy.name} - ${strategy.query}`);
        
        const messages = await this.searchWithRetries(strategy.query, 500);
        
        let foundEmails: any[] = [];
        
        if (strategy.needsFiltering) {
          // For broad searches, filter by checking email content
          foundEmails = await this.filterEmailsByOrder(messages, orderNumber);
        } else {
          // For specific searches, check if any results contain our order
          foundEmails = await this.verifyOrderInEmails(messages, orderNumber);
        }

        if (foundEmails.length > 0) {
          console.log(`✅ Found ${foundEmails.length} emails via ${strategy.name}`);
          
          // Check if this is better than our current best result
          if (strategy.priority < bestPriority) {
            bestResult = {
              emails: foundEmails,
              strategy: strategy.name,
              priority: strategy.priority,
              query: strategy.query
            };
            bestPriority = strategy.priority;
          }
          
          // If this is a high-priority match, we can stop searching
          if (strategy.priority <= 3) {
            break;
          }
        } else {
          console.log(`❌ No results for ${strategy.name}`);
        }
        
        // Rate limiting between searches
        await this.delay(300);
        
      } catch (error: any) {
        console.error(`❌ Strategy ${strategy.name} failed:`, error.message);
      }
    }

    return bestResult;
  }

  async filterEmailsByOrder(messages: any[], orderNumber: string) {
    const matchingEmails: any[] = [];
    
    // Process in batches to avoid rate limits
    const batchSize = 20;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      
      for (const message of batch) {
        try {
          const fullMessage = await this.gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'full'
          });

          const content = this.getEmailContent(fullMessage.data);
          if (content.includes(orderNumber)) {
            matchingEmails.push({
              id: message.id,
              message: fullMessage.data,
              isDelivery: this.isDeliveryEmail(fullMessage.data)
            });
          }
        } catch (error: any) {
          console.error(`Error checking message ${message.id}:`, error.message);
        }
      }
      
      // Rate limiting between batches
      if (i + batchSize < messages.length) {
        await this.delay(1000);
      }
    }
    
    return matchingEmails;
  }

  async verifyOrderInEmails(messages: any[], orderNumber: string) {
    // For targeted searches, check first few emails only
    const samplesToCheck = Math.min(messages.length, 10);
    const foundEmails: any[] = [];
    
    for (let i = 0; i < samplesToCheck; i++) {
      try {
        const fullMessage = await this.gmail.users.messages.get({
          userId: 'me',
          id: messages[i].id,
          format: 'full'
        });

        const content = this.getEmailContent(fullMessage.data);
        if (content.includes(orderNumber)) {
          foundEmails.push({
            id: messages[i].id,
            message: fullMessage.data,
            isDelivery: this.isDeliveryEmail(fullMessage.data)
          });
        }
      } catch (error: any) {
        console.error(`Error verifying message ${messages[i].id}:`, error.message);
      }
    }
    
    return foundEmails;
  }

  isDeliveryEmail(message: any) {
    const subject = this.getSubject(message);
    const content = this.getEmailContent(message);
    
    const deliveryKeywords = [
      'Order Delivered',
      'Xpress Ship Order Delivered',
      'has been delivered',
      'delivery confirmation',
      '🎉'
    ];
    
    return deliveryKeywords.some(keyword => 
      subject.includes(keyword) || content.includes(keyword)
    );
  }

  getSubject(message: any) {
    const headers = message.payload?.headers || [];
    const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === 'subject');
    return subjectHeader ? subjectHeader.value : '';
  }

  getEmailContent(message: any) {
    let content = '';
    
    if (message.payload) {
      if (message.payload.body && message.payload.body.data) {
        content += this.decodeBase64(message.payload.body.data);
      }
      
      if (message.payload.parts) {
        message.payload.parts.forEach((part: any) => {
          if (part.body && part.body.data) {
            content += this.decodeBase64(part.body.data);
          }
        });
      }
    }
    
    return content;
  }

  decodeBase64(data: string) {
    try {
      return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    } catch (e) {
      return '';
    }
  }

  delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const accessToken = cookieStore.get('gmail_access_token')?.value;
    const refreshToken = cookieStore.get('gmail_refresh_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 });
    }

    const { orders, targetOrder } = await request.json();
    
    if (!orders && !targetOrder) {
      return NextResponse.json({ error: 'Either orders array or targetOrder required' }, { status: 400 });
    }

    // Set up OAuth2 client
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/gmail/callback`;

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken
    });
    
    const robustSearch = new GmailRobustSearch(oauth2Client);

    if (targetOrder) {
      // Single order analysis
      console.log(`🎯 Analyzing single order: ${targetOrder}`);
      
      const result = await robustSearch.findOrderWithFallbacks(targetOrder);
      
      if (result) {
        const deliveryEmails = result.emails.filter((e: any) => e.isDelivery);
        
        return NextResponse.json({
          success: true,
          orderNumber: targetOrder,
          found: true,
          strategy: result.strategy,
          query: result.query,
          totalEmails: result.emails.length,
          deliveryEmails: deliveryEmails.length,
          status: deliveryEmails.length > 0 ? 'Delivered' : 'Unknown',
          emails: result.emails.map((e: any) => ({
            id: e.id,
            subject: robustSearch.getSubject(e.message),
            isDelivery: e.isDelivery
          }))
        });
      } else {
        return NextResponse.json({
          success: true,
          orderNumber: targetOrder,
          found: false,
          message: 'Order not found with any search strategy'
        });
      }
    } else {
      // Batch processing
      console.log(`📦 Processing ${orders.length} orders with robust search`);
      
      const results: any = {};
      const statusUpdates: any = {};
      
      for (const order of orders) {
        const orderNum = order.orderNumber || order;
        console.log(`\n🔍 Processing order: ${orderNum}`);
        
        try {
          const result = await robustSearch.findOrderWithFallbacks(orderNum);
          
          if (result) {
            const deliveryEmails = result.emails.filter((e: any) => e.isDelivery);
            
            results[orderNum] = {
              found: true,
              strategy: result.strategy,
              emailCount: result.emails.length,
              deliveryCount: deliveryEmails.length
            };
            
            if (deliveryEmails.length > 0) {
              statusUpdates[orderNum] = {
                orderNumber: orderNum,
                status: 'Delivered',
                statusColor: 'green',
                priority: 5,
                subject: `${result.strategy}: ${robustSearch.getSubject(deliveryEmails[0].message)}`,
                date: new Date().toISOString(),
                emailId: deliveryEmails[0].id,
                source: `robust_search_${result.strategy}`
              };
              console.log(`✅ ROBUST UPDATE: ${orderNum} → Delivered (via ${result.strategy})`);
            }
          } else {
            results[orderNum] = {
              found: false,
              strategy: 'none'
            };
            console.log(`❌ ROBUST SEARCH: ${orderNum} not found with any strategy`);
          }
        } catch (error: any) {
          console.error(`Error processing ${orderNum}:`, error.message);
          results[orderNum] = {
            error: error.message
          };
        }
        
        // Rate limiting between orders
        await robustSearch.delay(500);
      }
      
      const updatedOrders = Object.values(statusUpdates);
      const summary = {
        totalOrders: orders.length,
        foundOrders: Object.values(results).filter((r: any) => r.found).length,
        updated: updatedOrders.length,
        errorCount: Object.values(results).filter((r: any) => r.error).length
      };
      
      console.log(`📊 ROBUST SUMMARY: Found ${summary.foundOrders}/${summary.totalOrders} orders, updated ${summary.updated} statuses`);
      
      return NextResponse.json({
        success: true,
        summary,
        updatedOrders,
        results,
        searchType: 'robust_fallback'
      });
    }

  } catch (error: any) {
    console.error('❌ Robust status update error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update status with robust search',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Use POST method with orders array or targetOrder to use robust Gmail search',
    example: {
      method: 'POST',
      body: {
        orders: ['01-3KF7CE560J', '01-B56RWN58RD'],
        // OR
        targetOrder: '01-3KF7CE560J'
      }
    }
  });
}