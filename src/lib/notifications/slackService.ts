/**
 * Slack Notification Service
 * Sends delivery summaries to Slack via Incoming Webhooks
 */

export interface DeliverySummary {
  totalDeliveries: number;
  arrivingToday: number;
  arrivingTomorrow: number;
  arrivingThisWeek: number;
  inTransit: number;
  projectedProfitToday?: number;
  projectedProfitTomorrow?: number;
  deliveries: Array<{
    productName: string;
    productBrand: string;
    productSize: string;
    trackingNumber: string;
    carrier: string;
    estimatedDelivery: string;
    status: string;
    purchasePrice?: number;
    marketPrice?: number;
    estimatedProfit?: number;
  }>;
}

export interface SlackNotificationOptions {
  webhookUrl: string;
  username?: string;
  iconEmoji?: string;
  channel?: string;
}

export class SlackNotificationService {
  private webhookUrl: string;
  private username: string;
  private iconEmoji: string;

  constructor(options: SlackNotificationOptions) {
    this.webhookUrl = options.webhookUrl;
    this.username = options.username || 'Delivery Bot';
    this.iconEmoji = options.iconEmoji || ':package:';
  }

  /**
   * Send a delivery summary to Slack
   */
  async sendDeliverySummary(summary: DeliverySummary): Promise<void> {
    const message = this.formatDeliverySummary(summary);
    
    await this.sendMessage({
      text: `📦 Daily Delivery Summary - ${new Date().toLocaleDateString()}`,
      blocks: message
    });
  }

  /**
   * Send a single delivery update to Slack
   */
  async sendDeliveryUpdate(delivery: {
    productName: string;
    trackingNumber: string;
    status: string;
    estimatedDelivery: string;
    carrier?: string;
  }): Promise<void> {
    const statusEmoji = this.getStatusEmoji(delivery.status);
    const trackingLink = this.formatTrackingLink(delivery.trackingNumber, delivery.carrier);
    
    await this.sendMessage({
      text: `${statusEmoji} Delivery Update: ${delivery.productName}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${statusEmoji} *Delivery Update*\n\n*Product:* ${delivery.productName}\n*Tracking:* ${trackingLink}\n*Status:* ${delivery.status}\n*Estimated:* ${delivery.estimatedDelivery}`
          }
        }
      ]
    });
  }

  private buildCarrierTrackingUrl(trackingNumber: string, carrier?: string): string {
    const tn = encodeURIComponent((trackingNumber || '').trim());
    const c = (carrier || '').toLowerCase();
    if (c.includes('fedex')) return `https://www.fedex.com/apps/fedextrack/?tracknumbers=${tn}`;
    if (c.includes('ups')) return `https://www.ups.com/track?loc=en_US&tracknum=${tn}`;
    if (c.includes('usps')) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tn}`;
    // Fallback: FedEx-style parameter works for your primary use-case
    return `https://www.fedex.com/apps/fedextrack/?tracknumbers=${tn}`;
  }

  private formatTrackingLink(trackingNumber: string, carrier?: string): string {
    const tn = (trackingNumber || '').trim();
    if (!tn) return '`(missing)`';
    const url = this.buildCarrierTrackingUrl(tn, carrier);
    // Slack mrkdwn link: <url|text>
    return `<${url}|${tn}>`;
  }

  /**
   * Format delivery summary into Slack blocks
   */
  private formatDeliverySummary(summary: DeliverySummary): any[] {
    const blocks: any[] = [];

    // Header
    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📦 Daily Delivery Summary',
        emoji: true
      }
    });

    // Summary stats
    const profitToday =
      typeof summary.projectedProfitToday === 'number' && Number.isFinite(summary.projectedProfitToday)
        ? summary.projectedProfitToday
        : null;
    const profitTomorrow =
      typeof summary.projectedProfitTomorrow === 'number' && Number.isFinite(summary.projectedProfitTomorrow)
        ? summary.projectedProfitTomorrow
        : null;
    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Arriving Today:*\n🚚 ${summary.arrivingToday}`
        },
        {
          type: 'mrkdwn',
          text: `*Arriving Tomorrow:*\n📅 ${summary.arrivingTomorrow}`
        },
        {
          type: 'mrkdwn',
          text: `*Arriving This Week:*\n📆 ${summary.arrivingThisWeek || 0}`
        },
        ...(profitTomorrow !== null
          ? [
              {
                type: 'mrkdwn',
                text: `*Projected Profit (Tomorrow):*\n💰 $${profitTomorrow.toFixed(2)}`
              }
            ]
          : []),
        ...(profitToday !== null
          ? [
              {
                type: 'mrkdwn',
                text: `*Projected Profit (Today):*\n💰 $${profitToday.toFixed(2)}`
              }
            ]
          : [])
      ]
    });

    blocks.push({ type: 'divider' });

    // Items arriving today
    if (summary.arrivingToday > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*🚚 Arriving Today*'
        }
      });

      const today = new Date().toISOString().split('T')[0];
      const todayDeliveries = summary.deliveries.filter(d => 
        d.estimatedDelivery === today || d.status === 'out_for_delivery'
      );

      todayDeliveries.forEach(delivery => {
        let profitText = '';
        if (delivery.purchasePrice && delivery.marketPrice && delivery.estimatedProfit !== undefined) {
          const profitEmoji = delivery.estimatedProfit > 0 ? '💰' : '⚠️';
          profitText = `\n  Purchase: $${delivery.purchasePrice.toFixed(2)} | Market: $${delivery.marketPrice.toFixed(2)} | ${profitEmoji} Profit: $${delivery.estimatedProfit.toFixed(2)}`;
        }
        const trackingLink = this.formatTrackingLink(delivery.trackingNumber, delivery.carrier);
        
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `• *${delivery.productName}* (${delivery.productBrand})\n  Size: ${delivery.productSize} | ${delivery.carrier}: ${trackingLink}${profitText}`
          }
        });
      });

      blocks.push({ type: 'divider' });
    }

    // Items arriving tomorrow
    if (summary.arrivingTomorrow > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*📅 Arriving Tomorrow*'
        }
      });

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      
      const tomorrowDeliveries = summary.deliveries.filter(d => 
        d.estimatedDelivery === tomorrowStr
      );

      tomorrowDeliveries.forEach(delivery => {
        let profitText = '';
        if (delivery.purchasePrice && delivery.marketPrice && delivery.estimatedProfit !== undefined) {
          const profitEmoji = delivery.estimatedProfit > 0 ? '💰' : '⚠️';
          profitText = `\n  Purchase: $${delivery.purchasePrice.toFixed(2)} | Market: $${delivery.marketPrice.toFixed(2)} | ${profitEmoji} Profit: $${delivery.estimatedProfit.toFixed(2)}`;
        }
        const trackingLink = this.formatTrackingLink(delivery.trackingNumber, delivery.carrier);
        
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `• *${delivery.productName}* (${delivery.productBrand})\n  Size: ${delivery.productSize} | ${delivery.carrier}: ${trackingLink}${profitText}`
          }
        });
      });

      blocks.push({ type: 'divider' });
    }

    // Items arriving this week (excluding today and tomorrow)
    if (summary.arrivingThisWeek > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*📆 Arriving This Week*'
        }
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const thisWeekDeliveries = summary.deliveries.filter(d => {
        if (!d.estimatedDelivery || d.estimatedDelivery === 'TBD') return false;
        const deliveryDate = new Date(d.estimatedDelivery);
        return deliveryDate > tomorrow && deliveryDate <= weekEnd && 
               d.estimatedDelivery !== todayStr && 
               d.estimatedDelivery !== tomorrowStr;
      });

      thisWeekDeliveries.forEach(delivery => {
        const etaDate = new Date(delivery.estimatedDelivery);
        const etaFormatted = isNaN(etaDate.getTime()) ? 'TBD' : etaDate.toLocaleDateString();
        
        let profitText = '';
        if (delivery.purchasePrice && delivery.marketPrice && delivery.estimatedProfit !== undefined) {
          const profitEmoji = delivery.estimatedProfit > 0 ? '💰' : '⚠️';
          profitText = `\n  Purchase: $${delivery.purchasePrice.toFixed(2)} | Market: $${delivery.marketPrice.toFixed(2)} | ${profitEmoji} Profit: $${delivery.estimatedProfit.toFixed(2)}`;
        }
        const trackingLink = this.formatTrackingLink(delivery.trackingNumber, delivery.carrier);
        
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `• *${delivery.productName}* (${delivery.productBrand})\n  Size: ${delivery.productSize} | ${delivery.carrier}: ${trackingLink} | ETA: ${etaFormatted}${profitText}`
          }
        });
      });

      blocks.push({ type: 'divider' });
    }

    // Footer
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `_Last updated: ${new Date().toLocaleString()}_`
        }
      ]
    });

    return blocks;
  }

  /**
   * Send raw message to Slack
   */
  private async sendMessage(payload: any): Promise<void> {
    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: this.username,
          icon_emoji: this.iconEmoji,
          ...payload
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Slack API error: ${response.status} ${error}`);
      }

      console.log('✅ Slack notification sent successfully');
    } catch (error) {
      console.error('❌ Failed to send Slack notification:', error);
      throw error;
    }
  }

  /**
   * Get emoji for delivery status
   */
  private getStatusEmoji(status: string): string {
    const emojiMap: Record<string, string> = {
      'delivered': '✅',
      'out_for_delivery': '🚚',
      'in_transit': '📦',
      'shipped': '📮',
      'exception': '⚠️',
      'unknown': '❓'
    };
    return emojiMap[status] || '📦';
  }
}

/**
 * Create a Slack notification service instance from environment variables
 */
export function createSlackService(): SlackNotificationService | null {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.warn('⚠️ SLACK_WEBHOOK_URL not configured');
    return null;
  }

  return new SlackNotificationService({
    webhookUrl,
    username: 'Delivery Tracker',
    iconEmoji: ':package:'
  });
}

