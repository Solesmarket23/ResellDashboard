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
    // When marketPrice is missing, this can explain why (e.g. "unavailable — StockX not connected").
    marketStatus?: string;
    // Optional: show both StockX sides for clarity (Buy = Lowest Ask, Sell = Highest Bid)
    stockxLowestAsk?: number;
    stockxHighestBid?: number;
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
  private mention: string | null;
  private slackTimeZone: string;

  constructor(options: SlackNotificationOptions) {
    this.webhookUrl = options.webhookUrl;
    this.username = options.username || 'Delivery Bot';
    this.iconEmoji = options.iconEmoji || ':package:';
    // Optional mention string to prepend to summaries (e.g. "@solesmarket23" or "<!here>" or "<@U123...>").
    // Can be overridden via env so production can change without code edits.
    const envMention = (process.env.SLACK_DELIVERIES_MENTION || process.env.SLACK_MENTION || '').trim();
    this.mention = envMention || '@solesmarket23';
    this.slackTimeZone = (process.env.SLACK_TIMEZONE || process.env.TZ || 'America/New_York').trim() || 'America/New_York';
  }

  private toYmdInTimeZone(d: Date): string {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: this.slackTimeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    } catch {
      return d.toISOString().split('T')[0];
    }
  }

  private getLocalHourInTimeZone(d: Date): number {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: this.slackTimeZone,
        hour: '2-digit',
        hour12: false,
      }).formatToParts(d);
      const h = parts.find((p) => p.type === 'hour')?.value;
      const n = h ? Number.parseInt(h, 10) : NaN;
      return Number.isFinite(n) ? n : d.getHours();
    } catch {
      return d.getHours();
    }
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
    const mention = this.mention ? `${this.mention} ` : '';
    
    await this.sendMessage({
      // Slack push notification previews use this top-level `text`.
      // Keep it concise and informational.
      text: `${mention}${subject}`,
      blocks: message
    });
  }

  /**
   * Send an Out-for-Delivery-only breakdown to Slack
   */
  async sendOutForDeliveryOnly(args: { deliveries: DeliverySummary['deliveries'] }): Promise<void> {
    const count = Array.isArray(args.deliveries) ? args.deliveries.length : 0;
    const list = Array.isArray(args.deliveries) ? args.deliveries : [];
    const ofd = list.filter((d) => String((d as any)?.status || '').toLowerCase().trim() === 'out_for_delivery');
    const totalProfit = ofd.reduce((sum, d: any) => {
      const n = typeof d?.estimatedProfit === 'number' ? d.estimatedProfit : parseFloat(String(d?.estimatedProfit ?? ''));
      return Number.isFinite(n) ? sum + n : sum;
    }, 0);
    const blocks = this.formatOutForDeliveryOnly(list);
    const mention = this.mention ? `${this.mention} ` : '';
    await this.sendMessage({
      text: `${mention}${ofd.length} out-for-delivery item${ofd.length === 1 ? '' : 's'} — est. profit $${totalProfit.toFixed(2)}`,
      blocks,
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

    // Mention (first line) so Slack notifies the user/channel if supported by workspace settings.
    if (this.mention) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `${this.mention}` },
      });
    }

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

    const now = new Date();
    const today = this.toYmdInTimeZone(now);
    const tomorrow = (() => {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      return this.toYmdInTimeZone(d);
    })();

    // Late-night behavior: after 9pm local time, include tomorrow's breakdown too.
    const localHour = this.getLocalHourInTimeZone(now);
    const includeTomorrowBreakdown = localHour >= 21;

    const buildBreakdown = (args: { label: string; ymd: string; emptyText: string }) => {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*${args.label} (breakdown)*` },
      });

      const itemsAll = summary.deliveries.filter((d) => {
        const eta = String(d.estimatedDelivery || '').trim();
        const s = String(d.status || '').toLowerCase().trim();
        return eta === args.ymd || (args.ymd === today && s === 'out_for_delivery');
      });

      // Slack hard limit: 50 blocks. Each delivery item here is one block + overhead.
      const MAX_ITEMS = includeTomorrowBreakdown ? 20 : 40;
      const truncated = itemsAll.length > MAX_ITEMS;
      const items = itemsAll.slice(0, MAX_ITEMS);

      if (truncated) {
        blocks.push({
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `_Showing ${MAX_ITEMS} of ${itemsAll.length} to stay within Slack limits._` }],
        });
        }

      if (!items.length) {
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: args.emptyText },
        });
        return;
      }

      items.forEach((delivery) => {
        const eta = delivery.estimatedDelivery && delivery.estimatedDelivery !== 'TBD' ? delivery.estimatedDelivery : 'TBD';
        const money = this.formatMoneyLine({
          purchasePrice: (delivery as any).purchasePrice,
          marketPrice: (delivery as any).marketPrice,
          estimatedProfit: (delivery as any).estimatedProfit,
        });
        const ask = this.toFiniteNumber((delivery as any).stockxLowestAsk);
        const bid = this.toFiniteNumber((delivery as any).stockxHighestBid);
        const hasMarket = this.toFiniteNumber((delivery as any).marketPrice) !== null;
        const marketStatus = typeof (delivery as any).marketStatus === 'string' ? (delivery as any).marketStatus.trim() : '';
        const moneyWithMarketStatus =
          money.text && !hasMarket && marketStatus
            ? `${money.text} | Market: (${marketStatus})`
            : money.text;
        const moneyLine =
          moneyWithMarketStatus
            ? `\n  ${moneyWithMarketStatus}`
            : marketStatus && !hasMarket
              ? `\n  Market: (${marketStatus})`
              : '';
        const twoSidedLine =
          ask !== null || bid !== null
            ? `\n  Buy (Ask): ${ask !== null ? `$${ask.toFixed(2)}` : '—'} | Sell (Bid): ${bid !== null ? `$${bid.toFixed(2)}` : '—'}`
            : '';
        const trackingLink = this.formatTrackingLink(delivery.trackingNumber, delivery.carrier);
        const links = [delivery.purchaseLink, (delivery as any).gmailLink, (delivery as any).stockxLink, delivery.marketLink]
          .filter(Boolean)
          .join(' | ');
        const linksLine = links ? `\n  Links: ${links}` : '';
        
        const section: any = {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `• *${delivery.productName}* (${delivery.productBrand})\n  Size: ${delivery.productSize} | ETA: ${eta}\n  ${delivery.carrier}: ${trackingLink}${moneyLine}${twoSidedLine}${linksLine}`,
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
    };

    buildBreakdown({
      label: '🚚 Arriving Today',
      ymd: today,
      emptyText: '_No items arriving today._',
    });

    if (includeTomorrowBreakdown) {
      blocks.push({ type: 'divider' });
      buildBreakdown({
        label: '📅 Arriving Tomorrow',
        ymd: tomorrow,
        emptyText: '_No items arriving tomorrow._',
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

  private formatOutForDeliveryOnly(deliveries: DeliverySummary['deliveries']): any[] {
    const blocks: any[] = [];

    if (this.mention) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `${this.mention}` },
      });
    }

    blocks.push({
      type: 'header',
      text: { type: 'plain_text', text: '🚚 Out for Delivery', emoji: true },
    });

    const list = Array.isArray(deliveries) ? deliveries : [];
    const only = list.filter((d) => String((d as any)?.status || '').toLowerCase().trim() === 'out_for_delivery');

    if (!only.length) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '_No items are out for delivery right now._' } });
      return blocks;
    }

    const totalProfit = only.reduce((sum, d: any) => {
      const n = typeof d?.estimatedProfit === 'number' ? d.estimatedProfit : parseFloat(String(d?.estimatedProfit ?? ''));
      return Number.isFinite(n) ? sum + n : sum;
    }, 0);

    // Slack hard limit: 50 blocks.
    const MAX_ITEMS = 40;
    const truncated = only.length > MAX_ITEMS;
    const items = only.slice(0, MAX_ITEMS);

    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*${only.length}* item${only.length === 1 ? '' : 's'} out for delivery\n*Total est. profit:* $${totalProfit.toFixed(2)}` },
    });

    if (truncated) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `_Showing ${MAX_ITEMS} of ${only.length} to stay within Slack limits._` }],
      });
    }

    items.forEach((delivery) => {
      const money = this.formatMoneyLine({
        purchasePrice: (delivery as any).purchasePrice,
        marketPrice: (delivery as any).marketPrice,
        estimatedProfit: (delivery as any).estimatedProfit,
      });
      const trackingLink = this.formatTrackingLink((delivery as any).trackingNumber, (delivery as any).carrier);
      const links = [
        (delivery as any).purchaseLink,
        (delivery as any).gmailLink,
        (delivery as any).stockxLink,
        (delivery as any).marketLink,
      ]
        .filter(Boolean)
        .join(' | ');
      const linksLine = links ? `\n  Links: ${links}` : '';
      const moneyLine = money.text ? `\n  ${money.text}` : '';

      const section: any = {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• *${(delivery as any).productName}* (${(delivery as any).productBrand})\n  Size: ${(delivery as any).productSize} | ${(delivery as any).carrier}: ${trackingLink}${moneyLine}${linksLine}`,
        },
      };
      if (typeof (delivery as any).productImage === 'string' && (delivery as any).productImage.startsWith('https://')) {
        section.accessory = {
          type: 'image',
          image_url: (delivery as any).productImage,
          alt_text: String((delivery as any).productName || 'Product').slice(0, 200),
        };
      }
      blocks.push(section);
    });

    return blocks;
  }

  /**
   * Send raw message to Slack
   */
  private async sendMessage(payload: any): Promise<void> {
    try {
      let response: Response;
      const attempt = async (): Promise<Response> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12_000);
        try {
          return await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
            signal: controller.signal,
        body: JSON.stringify({
          username: this.username,
          icon_emoji: this.iconEmoji,
          ...payload
        })
      });
        } finally {
          clearTimeout(timeoutId);
        }
      };

      try {
        response = await attempt();
      } catch (err: any) {
        // One quick retry for transient network/timeout issues.
        if (String(err?.name || '').toLowerCase().includes('abort')) {
          await new Promise((r) => setTimeout(r, 500));
          response = await attempt();
        } else {
          throw err;
        }
      }

      // fetch() succeeded but we still might want richer context if it wasn't OK.
      if (!response) {
        throw new Error('Slack webhook fetch failed: no response');
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Slack API error: ${response.status} ${error}`);
      }

      console.log('✅ Slack notification sent successfully');
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
      const msg = (err as any)?.message || String(err);
      const wrapped = new Error(`Slack send failed (host: ${host})${details}: ${msg}`);
      console.error('❌ Failed to send Slack notification:', wrapped);
      throw wrapped;
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

