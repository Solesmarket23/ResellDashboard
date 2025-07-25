import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { product, alert, webhookUrl } = await request.json();

    if (!webhookUrl) {
      return NextResponse.json({ error: 'No webhook URL provided' }, { status: 400 });
    }

    // Format the Slack message
    const message = {
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: alert.type === 'ask_drop' ? "🚨 Price Drop Alert!" : 
                  alert.type === 'flex_ask_drop' ? "🟣 Flex Price Drop Alert!" :
                  alert.type === 'target_hit' ? "🎯 Target Price Hit!" : 
                  alert.type === 'flex_target_hit' ? "🟣🎯 Flex Target Hit!" :
                  "📢 Price Alert",
            emoji: true
          }
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Product:*\n${product.brand} ${product.title}`
            },
            {
              type: "mrkdwn",
              text: `*Size:*\n${product.size}`
            },
            {
              type: "mrkdwn",
              text: `*Old Price:*\n$${alert.oldPrice}`
            },
            {
              type: "mrkdwn",
              text: `*New Price:*\n$${alert.newPrice}`
            },
            {
              type: "mrkdwn",
              text: `*Drop:*\n${alert.percentage.toFixed(1)}%`
            },
            {
              type: "mrkdwn",
              text: `*Profit Potential:*\n$${(alert.oldPrice - alert.newPrice).toFixed(2)}`
            }
          ]
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: alert.message
          }
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "View on StockX",
                emoji: true
              },
              url: product.stockxUrl || `https://stockx.com/${product.slug || product.urlKey || product.title.toLowerCase().replace(/\s+/g, '-')}${product.size ? `?size=${product.size}` : ''}`,
              style: "primary"
            }
          ]
        }
      ]
    };

    // Send to Slack
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.statusText}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Slack notification error:', error);
    return NextResponse.json(
      { error: 'Failed to send Slack notification' },
      { status: 500 }
    );
  }
}