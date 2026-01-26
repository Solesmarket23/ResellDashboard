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
  // Totals for ALL shipments "on the way" (shipped / in_transit / out_for_delivery)
  projectedProfitOnTheWay?: number;
  marketValueOnTheWay?: number;
  purchaseCostOnTheWay?: number;
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

  private toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const cleaned = value.replace(/[$,]/g, '').trim();
      const n = Number.parseFloat(cleaned);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  private formatMoneyLine(args: {
    purchasePrice?: unknown;
    marketPrice?: unknown;
    estimatedProfit?: unknown;
  }): { text: string | null; profit: number | null } {
    const purchase = this.toFiniteNumber(args.purchasePrice);
    const market = this.toFiniteNumber(args.marketPrice);
    const profitProvided = this.toFiniteNumber(args.estimatedProfit);
    const profitComputed =
      profitProvided ??
      (purchase !== null && market !== null
        ? market - purchase
        : null);

    const parts: string[] = [];
    if (purchase !== null) parts.push(`Purchase: $${purchase.toFixed(2)}`);
    if (market !== null) parts.push(`Market: $${market.toFixed(2)}`);
    if (profitComputed !== null) {
      const profitEmoji = profitComputed > 0 ? '💰' : '⚠️';
      parts.push(`${profitEmoji} Profit: $${profitComputed.toFixed(2)}`);
    }

    return { text: parts.length ? parts.join(' | ') : null, profit: profitComputed };
  }

  private getWebhookHostForLogs(): string {
    try {
      const u = new URL(this.webhookUrl);
      return u.host || '(unknown-host)';
    } catch {
      return '(invalid-webhook-url)';
    }
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
    const profitOnTheWay =
      typeof summary.projectedProfitOnTheWay === 'number' && Number.isFinite(summary.projectedProfitOnTheWay)
        ? summary.projectedProfitOnTheWay
        : null;
    const marketOnTheWay =
      typeof summary.marketValueOnTheWay === 'number' && Number.isFinite(summary.marketValueOnTheWay)
        ? summary.marketValueOnTheWay
        : null;
    const costOnTheWay =
      typeof summary.purchaseCostOnTheWay === 'number' && Number.isFinite(summary.purchaseCostOnTheWay)
        ? summary.purchaseCostOnTheWay
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
        ...(profitOnTheWay !== null
          ? [
              {
                type: 'mrkdwn',
                text: `*Projected Profit (On the way):*\n💰 $${profitOnTheWay.toFixed(2)}`
              }
            ]
          : []),
        ...(marketOnTheWay !== null
          ? [
              {
                type: 'mrkdwn',
                text: `*Market Value (On the way):*\n📈 $${marketOnTheWay.toFixed(2)}`
              }
            ]
          : []),
        ...(costOnTheWay !== null
          ? [
              {
                type: 'mrkdwn',
                text: `*Purchase Cost (On the way):*\n🧾 $${costOnTheWay.toFixed(2)}`
              }
            ]
          : []),
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

    // If we have purchase cost but no market/profit, call it out explicitly (usually means StockX creds missing).
    if (costOnTheWay !== null && marketOnTheWay === null && profitOnTheWay === null) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `⚠️ _Market price / profit totals unavailable (missing StockX market prices)._`
          }
        ]
      });
    }

    blocks.push({ type: 'divider' });

    // On the way (all active shipments): show per-item market/purchase/profit so you can sanity-check totals.
    const onTheWay = summary.deliveries.filter(d =>
      ['shipped', 'in_transit', 'out_for_delivery'].includes(String(d.status || '').toLowerCase())
    );
    if (onTheWay.length > 0) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '*📦 On the way (all shipments)*' }
      });

      const MAX_ITEMS = 18; // keep Slack blocks under limits
      const shown = onTheWay.slice(0, MAX_ITEMS);
      for (const delivery of shown) {
        const trackingLink = this.formatTrackingLink(delivery.trackingNumber, delivery.carrier);
        const eta = delivery.estimatedDelivery && delivery.estimatedDelivery !== 'TBD' ? delivery.estimatedDelivery : 'TBD';
        const money = this.formatMoneyLine({
          purchasePrice: (delivery as any).purchasePrice,
          marketPrice: (delivery as any).marketPrice,
          estimatedProfit: (delivery as any).estimatedProfit,
        });
        const moneyLine = money.text ?? 'Purchase/Market/Profit: (missing)';

        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              `• *${delivery.productName}* (${delivery.productBrand})\n` +
              `  Size: ${delivery.productSize} | ETA: ${eta}\n` +
              `  ${delivery.carrier}: ${trackingLink}\n` +
              `  ${moneyLine}`
          }
        });
      }

      const remaining = onTheWay.length - shown.length;
      if (remaining > 0) {
        blocks.push({
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `_…and ${remaining} more shipments_` }]
        });
      }
      blocks.push({ type: 'divider' });
    }

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
        const money = this.formatMoneyLine({
          purchasePrice: (delivery as any).purchasePrice,
          marketPrice: (delivery as any).marketPrice,
          estimatedProfit: (delivery as any).estimatedProfit,
        });
        const profitText = money.text ? `\n  ${money.text}` : '';
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
        const money = this.formatMoneyLine({
          purchasePrice: (delivery as any).purchasePrice,
          marketPrice: (delivery as any).marketPrice,
          estimatedProfit: (delivery as any).estimatedProfit,
        });
        const profitText = money.text ? `\n  ${money.text}` : '';
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
        
        const money = this.formatMoneyLine({
          purchasePrice: (delivery as any).purchasePrice,
          marketPrice: (delivery as any).marketPrice,
          estimatedProfit: (delivery as any).estimatedProfit,
        });
        const profitText = money.text ? `\n  ${money.text}` : '';
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
      let response: Response;
      try {
        response = await fetch(this.webhookUrl, {
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
      } catch (err) {
        const host = this.getWebhookHostForLogs();
        const cause = (err as any)?.cause;
        const causeMsg =
          cause instanceof Error
            ? cause.message
            : typeof cause === 'string'
              ? cause
              : cause && typeof cause === 'object'
                ? JSON.stringify(cause)
                : '';
        const details = causeMsg ? ` (cause: ${causeMsg})` : '';
        throw new Error(`Slack webhook fetch failed (host: ${host})${details}: ${(err as any)?.message || String(err)}`);
      }

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

