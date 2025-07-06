import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

interface ScheduledRepricingConfig {
  id: string;
  name: string;
  enabled: boolean;
  schedule: string; // cron expression
  strategy: {
    type: 'competitive' | 'margin_based' | 'velocity_based' | 'hybrid';
    settings: any;
  };
  filters: {
    minDaysListed?: number;
    maxPrice?: number;
    minPrice?: number;
    brands?: string[];
    categories?: string[];
    excludeListingIds?: string[];
  };
  notifications: {
    email?: string;
    webhook?: string;
    minPriceChange?: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    // This endpoint would typically be called by a cron service
    const { configId, dryRun = false } = await request.json();
    
    console.log(`🤖 Scheduled repricing triggered - Config: ${configId}, Dry Run: ${dryRun}`);

    // In a real implementation, you'd fetch the config from your database
    const config = await getRepricingConfig(configId);
    
    if (!config || !config.enabled) {
      return NextResponse.json({ 
        error: 'Configuration not found or disabled',
        configId 
      }, { status: 404 });
    }

    // Get access token - in production this might come from a service account
    const accessToken = await getServiceAccessToken();
    
    if (!accessToken) {
      return NextResponse.json({ error: 'No service access token available' }, { status: 401 });
    }

    // Fetch listings based on filters
    const listings = await fetchFilteredListings(config.filters, accessToken);
    
    if (listings.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No listings match the configured filters',
        configId,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`📊 Found ${listings.length} listings matching filters`);

    // Execute repricing using the same logic as manual repricing
    const repricingResponse = await executeRepricing({
      listings,
      strategy: config.strategy,
      dryRun,
      notificationEmail: config.notifications.email
    }, accessToken);

    // Filter results by minimum price change threshold
    const significantChanges = repricingResponse.results.filter(result => {
      const priceChange = Math.abs(result.newPrice - result.currentPrice);
      return priceChange >= (config.notifications.minPriceChange || 0);
    });

    // Send notifications if enabled
    if (config.notifications.email && significantChanges.length > 0) {
      await sendScheduledRepricingNotification({
        email: config.notifications.email,
        configName: config.name,
        results: significantChanges,
        dryRun,
        timestamp: new Date()
      });
    }

    if (config.notifications.webhook && significantChanges.length > 0) {
      await sendWebhookNotification(config.notifications.webhook, {
        configId,
        configName: config.name,
        results: significantChanges,
        dryRun,
        timestamp: new Date().toISOString()
      });
    }

    // Log the execution for audit trails
    await logRepricingExecution({
      configId,
      configName: config.name,
      totalListings: listings.length,
      updatedListings: repricingResponse.results.filter(r => r.action === 'updated').length,
      significantChanges: significantChanges.length,
      dryRun,
      timestamp: new Date()
    });

    return NextResponse.json({
      success: true,
      configId,
      configName: config.name,
      summary: {
        totalListings: listings.length,
        processedListings: repricingResponse.results.length,
        updated: repricingResponse.results.filter(r => r.action === 'updated').length,
        noChange: repricingResponse.results.filter(r => r.action === 'no_change').length,
        significantChanges: significantChanges.length,
        errors: repricingResponse.errors.length,
        dryRun
      },
      nextScheduledRun: getNextScheduledRun(config.schedule),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Scheduled repricing error:', error);
    return NextResponse.json({ 
      error: 'Failed to execute scheduled repricing', 
      details: error.message 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // Return all scheduled repricing configurations
    const configs = await getAllRepricingConfigs();
    
    return NextResponse.json({
      success: true,
      configs: configs.map(config => ({
        id: config.id,
        name: config.name,
        enabled: config.enabled,
        schedule: config.schedule,
        nextRun: getNextScheduledRun(config.schedule),
        strategyType: config.strategy.type,
        lastExecution: config.lastExecution || null
      }))
    });
  } catch (error) {
    console.error('Failed to fetch repricing configs:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch configurations' 
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Create or update a scheduled repricing configuration
    const config: ScheduledRepricingConfig = await request.json();
    
    // Validate the configuration
    const validation = validateRepricingConfig(config);
    if (!validation.valid) {
      return NextResponse.json({ 
        error: 'Invalid configuration', 
        details: validation.errors 
      }, { status: 400 });
    }

    const savedConfig = await saveRepricingConfig(config);
    
    return NextResponse.json({
      success: true,
      config: savedConfig,
      nextRun: getNextScheduledRun(savedConfig.schedule)
    });
  } catch (error) {
    console.error('Failed to save repricing config:', error);
    return NextResponse.json({ 
      error: 'Failed to save configuration' 
    }, { status: 500 });
  }
}

// Helper functions (these would be implemented with your database/storage)
async function getRepricingConfig(configId: string): Promise<ScheduledRepricingConfig | null> {
  // In production, fetch from database
  // This is a mock implementation
  const mockConfig: ScheduledRepricingConfig = {
    id: configId,
    name: 'Daily Competitive Repricing',
    enabled: true,
    schedule: '0 9 * * *', // Daily at 9 AM
    strategy: {
      type: 'competitive',
      settings: {
        minProfitMargin: 0.15,
        maxPriceReduction: 0.10,
        competitiveBuffer: 1
      }
    },
    filters: {
      minDaysListed: 3,
      maxPrice: 1000
    },
    notifications: {
      email: 'notifications@example.com',
      minPriceChange: 5
    }
  };
  
  return mockConfig;
}

async function getServiceAccessToken(): Promise<string | null> {
  // In production, this would fetch a service account token
  // or use stored user tokens with proper refresh logic
  const cookieStore = cookies();
  return cookieStore.get('stockx_access_token')?.value || null;
}

async function fetchFilteredListings(filters: any, accessToken: string) {
  // Fetch listings from StockX API with filters applied
  const response = await fetch('https://api.stockx.com/v2/selling/listings', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'x-api-key': process.env.STOCKX_API_KEY!,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch listings: ${response.status}`);
  }

  const data = await response.json();
  // Apply filters and return filtered listings
  return data.listings || [];
}

async function executeRepricing(params: any, accessToken: string) {
  // Call the main repricing endpoint
  const response = await fetch('/api/stockx/repricing', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `stockx_access_token=${accessToken}`
    },
    body: JSON.stringify(params)
  });

  return await response.json();
}

async function sendScheduledRepricingNotification(params: any) {
  console.log('📧 Sending scheduled repricing notification:', params);
  // Implement email notification logic
}

async function sendWebhookNotification(webhook: string, data: any) {
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    console.log('🔗 Webhook notification sent successfully');
  } catch (error) {
    console.error('Failed to send webhook notification:', error);
  }
}

async function logRepricingExecution(data: any) {
  console.log('📝 Logging repricing execution:', data);
  // Store execution log in database
}

async function getAllRepricingConfigs(): Promise<ScheduledRepricingConfig[]> {
  // Fetch all configurations from database
  return [];
}

async function saveRepricingConfig(config: ScheduledRepricingConfig): Promise<ScheduledRepricingConfig> {
  // Save configuration to database
  return config;
}

function validateRepricingConfig(config: ScheduledRepricingConfig) {
  const errors: string[] = [];
  
  if (!config.name || config.name.trim().length === 0) {
    errors.push('Configuration name is required');
  }
  
  if (!config.schedule || !isValidCronExpression(config.schedule)) {
    errors.push('Valid cron schedule expression is required');
  }
  
  if (!config.strategy || !config.strategy.type) {
    errors.push('Repricing strategy is required');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

function isValidCronExpression(expression: string): boolean {
  // Basic cron validation - in production use a proper cron parser
  const parts = expression.split(' ');
  return parts.length === 5;
}

function getNextScheduledRun(cronExpression: string): string {
  // Calculate next run time based on cron expression
  // In production, use a proper cron parser library
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // Mock: tomorrow
} 