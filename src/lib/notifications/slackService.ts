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
  marketPriceNote?: string;
  deliveries: Array<{
    purchaseId?: string;
    productName: string;
    productBrand: string;
    productSize: string;
    productImage?: string;
    trackingNumber: string;
    carrier: string;
    estimatedDelivery: string;
    status: string;
    purchasePrice?: number;
    marketPrice?: number;
    estimatedProfit?: number;
    purchaseLink?: string;
    // Legacy (kept for backward compatibility if any callers still provide it)
    marketLink?: string;
    // New: direct links requested by user
    gmailLink?: string;
    stockxLink?: string;
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
    const profitToday =
      typeof summary.projectedProfitToday === 'number' && Number.isFinite(summary.projectedProfitToday)
        ? summary.projectedProfitToday
        : null;
    const profitText = profitToday !== null ? `$${profitToday.toFixed(2)}` : 'unknown';
    const subject = `${summary.arrivingToday} item${summary.arrivingToday === 1 ? '' : 's'} arriving today for a ${profitText} projected profit`;

    await this.sendMessage({
      // Slack push notification previews use this top-level `text`.
      // Keep it concise and informational.
      text: subject,
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
    const purchaseOnTheWay =
      typeof summary.purchaseCostOnTheWay === 'number' && Number.isFinite(summary.purchaseCostOnTheWay)
        ? summary.purchaseCostOnTheWay
        : null;

    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Arriving Today:*\n🚚 ${summary.arrivingToday}` },
        { type: 'mrkdwn', text: `*Arriving Tomorrow:*\n📅 ${summary.arrivingTomorrow}` },
        { type: 'mrkdwn', text: `*Arriving This Week:*\n🗓️ ${summary.arrivingThisWeek}` },
        { type: 'mrkdwn', text: `*In Transit:*\n📦 ${summary.inTransit}` },
      ],
    });

    const moneyFields: any[] = [];
    if (profitOnTheWay !== null) {
      moneyFields.push({ type: 'mrkdwn', text: `*Projected Profit (On the way):*\n💰 $${profitOnTheWay.toFixed(2)}` });
    }
    if (marketOnTheWay !== null) {
      moneyFields.push({ type: 'mrkdwn', text: `*Market Value (On the way):*\n📈 $${marketOnTheWay.toFixed(2)}` });
    }
    if (purchaseOnTheWay !== null) {
      moneyFields.push({ type: 'mrkdwn', text: `*Purchase Cost (On the way):*\n🧾 $${purchaseOnTheWay.toFixed(2)}` });
    }
    if (profitTomorrow !== null) {
      moneyFields.push({ type: 'mrkdwn', text: `*Projected Profit (Tomorrow):*\n💰 $${profitTomorrow.toFixed(2)}` });
    }
    if (profitToday !== null) {
      moneyFields.push({ type: 'mrkdwn', text: `*Projected Profit (Today):*\n💰 $${profitToday.toFixed(2)}` });
    }

    if (moneyFields.length) {
      blocks.push({ type: 'section', fields: moneyFields.slice(0, 10) });
    }

    if (typeof summary.marketPriceNote === 'string' && summary.marketPriceNote.trim()) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `_${summary.marketPriceNote.trim()}_` }],
      });
    }

    blocks.push({ type: 'divider' });

    // On the way (all shipments)
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*On the way (all shipments)*' },
    });

    const onTheWay = summary.deliveries.filter((d) => {
      const s = String(d.status || '').toLowerCase();
      return s === 'in_transit' || s === 'shipped' || s === 'out_for_delivery';
    });

    if (!onTheWay.length) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '_No shipments currently on the way._' },
      });
    } else {
      onTheWay.forEach((delivery) => {
        const eta = delivery.estimatedDelivery && delivery.estimatedDelivery !== 'TBD' ? delivery.estimatedDelivery : 'TBD';
        const money = this.formatMoneyLine({
          purchasePrice: (delivery as any).purchasePrice,
          marketPrice: (delivery as any).marketPrice,
          estimatedProfit: (delivery as any).estimatedProfit,
        });
        const moneyLine = money.text ? `\n  ${money.text}` : '';
        const trackingLink = this.formatTrackingLink(delivery.trackingNumber, delivery.carrier);
        const links = [delivery.purchaseLink, (delivery as any).gmailLink, (delivery as any).stockxLink, delivery.marketLink]
          .filter(Boolean)
          .join(' | ');
        const linksLine = links ? `\n  Links: ${links}` : '';

        const section: any = {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `• *${delivery.productName}* (${delivery.productBrand})\n  Size: ${delivery.productSize} | ETA: ${eta}\n  ${delivery.carrier}: ${trackingLink}${moneyLine}${linksLine}`,
          },
        };
        if (typeof (delivery as any).productImage === 'string' && (delivery as any).productImage.startsWith('https://')) {
          section.accessory = {
            type: 'image',
            image_url: (delivery as any).productImage,
            alt_text: String(delivery.productName || 'Product').slice(0, 200),
          };
        }
        blocks.push(section);
      });
    }

    blocks.push({ type: 'divider' });

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

