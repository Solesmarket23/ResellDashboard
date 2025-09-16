import { NextRequest, NextResponse } from 'next/server';
import { webhookManager } from '../../../../lib/tracking/webhookManager';

// Get all webhook subscriptions
export async function GET(request: NextRequest) {
  try {
    const webhooks = webhookManager.getAllWebhooks();
    
    return NextResponse.json({
      success: true,
      data: webhooks
    });
    
  } catch (error) {
    console.error('❌ Error fetching webhooks:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Create a new webhook subscription
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { carrier, trackingNumber, accountNumber, events } = body;
    
    if (!carrier) {
      return NextResponse.json({
        success: false,
        error: 'Carrier is required'
      }, { status: 400 });
    }
    
    // Get the webhook URL (this would be your server's URL)
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const webhookUrl = `${baseUrl}/api/tracking/webhook/${carrier}`;
    
    const webhookId = await webhookManager.registerWebhook({
      carrier,
      trackingNumber,
      accountNumber,
      webhookUrl,
      events: events || ['status_update', 'delivery', 'exception'],
      active: true
    });
    
    return NextResponse.json({
      success: true,
      data: {
        webhookId,
        webhookUrl,
        message: 'Webhook registered successfully'
      }
    });
    
  } catch (error) {
    console.error('❌ Error creating webhook:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Update webhook subscription
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { webhookId, active } = body;
    
    if (!webhookId) {
      return NextResponse.json({
        success: false,
        error: 'Webhook ID is required'
      }, { status: 400 });
    }
    
    if (active === false) {
      await webhookManager.deactivateWebhook(webhookId);
    }
    
    return NextResponse.json({
      success: true,
      message: 'Webhook updated successfully'
    });
    
  } catch (error) {
    console.error('❌ Error updating webhook:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
