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
  timezone?: string; // IANA timezone override (e.g. "America/New_York")
  mention?: string | null; // override mention (otherwise env default)
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
    this.mention = typeof options.mention === 'string' ? options.mention : (options.mention === null ? null : (envMention || '@solesmarket23'));
    const isUtcishTz = (tz: string): boolean => {
      const t = String(tz || '').trim().toUpperCase();
      return t === 'UTC' || t === 'GMT' || t === 'ETC/UTC' || t === 'ETC/GMT';
    };
    const sanitizeIanaTz = (tz: string): string | null => {
      const s = String(tz || '').trim();
      if (!s) return null;
      if (isUtcishTz(s)) return null;
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: s }).format(new Date());
        return s;
      } catch {
        return null;
      }
    };

    // IMPORTANT: Do NOT use process.env.TZ here (often UTC in serverless).
    // Prefer explicit per-user setting; otherwise default to ET.
    const fallbackTz = sanitizeIanaTz(process.env.SLACK_TIMEZONE || '') || 'America/New_York';
    this.slackTimeZone = sanitizeIanaTz(options.timezone || '') || fallbackTz;
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
    const profitToday =
      typeof summary.projectedProfitToday === 'number' && Number.isFinite(summary.projectedProfitToday)
        ? summary.projectedProfitToday
        : null;
    const profitTomorrow =
      typeof summary.projectedProfitTomorrow === 'number' && Number.isFinite(summary.projectedProfitTomorrow)
        ? summary.projectedProfitTomorrow
        : null;
    const profitText = profitToday !== null ? `$${profitToday.toFixed(2)}` : 'unknown';
    const subject =
      summary.arrivingToday > 0
        ? `${summary.arrivingToday} item${summary.arrivingToday === 1 ? '' : 's'} arriving today for a ${profitText} projected profit`
        : (() => {
            const pt = profitTomorrow !== null ? `$${profitTomorrow.toFixed(2)}` : 'unknown';
            return `${summary.arrivingTomorrow} item${summary.arrivingTomorrow === 1 ? '' : 's'} arriving tomorrow for a ${pt} projected profit`;
          })();
    const mention = this.mention ? `${this.mention} ` : '';

    const parts = this.formatDeliverySummaryParts(summary);
    if (parts.length === 0) return;

    // First message: include mention + the main subject line for Slack notification previews.
    await this.sendMessage({
      text: `${mention}${subject}`,
      blocks: parts[0]!.blocks,
    });

    // Continuations: send as additional Slack messages (prevents block-limit truncation).
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i]!;
      await this.sendMessage({
        text: `📦 Daily Delivery Summary (continued ${i + 1}/${parts.length})`,
        blocks: p.blocks,
      });
    }
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
  private formatDeliverySummaryParts(summary: DeliverySummary): Array<{ blocks: any[] }> {
    const MAX_BLOCKS = 50; // Slack hard limit

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

    const baseBlocks: any[] = [];

    // Mention (first line) so Slack notifies the user/channel if supported by workspace settings.
    if (this.mention) {
      baseBlocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `${this.mention}` },
      });
    }

    baseBlocks.push({
      type: 'header',
      text: { type: 'plain_text', text: '📦 Daily Delivery Summary', emoji: true },
    });

    baseBlocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Arriving Today:*\n🚚 ${summary.arrivingToday}` },
        { type: 'mrkdwn', text: `*Arriving Tomorrow:*\n📅 ${summary.arrivingTomorrow}` },
        { type: 'mrkdwn', text: `*Arriving This Week:*\n🗓️ ${summary.arrivingThisWeek}` },
        { type: 'mrkdwn', text: `*In Transit:*\n📦 ${summary.inTransit}` },
      ],
    });

    const moneyFields: any[] = [];
    if (profitOnTheWay !== null) moneyFields.push({ type: 'mrkdwn', text: `*Projected Profit (On the way):*\n💰 $${profitOnTheWay.toFixed(2)}` });
    if (marketOnTheWay !== null) moneyFields.push({ type: 'mrkdwn', text: `*Market Value (On the way):*\n📈 $${marketOnTheWay.toFixed(2)}` });
    if (purchaseOnTheWay !== null) moneyFields.push({ type: 'mrkdwn', text: `*Purchase Cost (On the way):*\n🧾 $${purchaseOnTheWay.toFixed(2)}` });
    if (profitTomorrow !== null) moneyFields.push({ type: 'mrkdwn', text: `*Projected Profit (Tomorrow):*\n💰 $${profitTomorrow.toFixed(2)}` });
    if (profitToday !== null) moneyFields.push({ type: 'mrkdwn', text: `*Projected Profit (Today):*\n💰 $${profitToday.toFixed(2)}` });
    if (moneyFields.length) baseBlocks.push({ type: 'section', fields: moneyFields.slice(0, 10) });

    if (typeof summary.marketPriceNote === 'string' && summary.marketPriceNote.trim()) {
      baseBlocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `_${summary.marketPriceNote.trim()}_` }] });
    }

    baseBlocks.push({ type: 'divider' });

    const now = new Date();
    const localHour = this.getLocalHourInTimeZone(now);
    // "Today" in Slack summaries should follow the local calendar day for the configured timezone.
    const today = this.toYmdInTimeZone(now);
    const tomorrow = (() => {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      return this.toYmdInTimeZone(d);
    })();

    const includeTomorrowBreakdown = localHour >= 21 || (summary.arrivingToday === 0 && summary.arrivingTomorrow > 0);
    const showTodayBreakdown = summary.arrivingToday > 0;

    const toPriority = (d: any): number => {
      const s = String(d?.status || '').toLowerCase().trim();
      if (s === 'out_for_delivery') return 3;
      if (s === 'in_transit') return 2;
      if (s === 'shipped') return 1;
      return 0;
    };

    const makeEntryBlock = (delivery: any): any => {
      const eta = delivery.estimatedDelivery && delivery.estimatedDelivery !== 'TBD' ? delivery.estimatedDelivery : 'TBD';
      const trackingLink = this.formatTrackingLink(String(delivery.trackingNumber || ''), String(delivery.carrier || ''));
      const brand = String(delivery.productBrand || '').trim();
      const size = String(delivery.productSize || '').trim() || '—';
      const money = this.formatMoneyLine({
        purchasePrice: delivery.purchasePrice,
        marketPrice: delivery.marketPrice,
        estimatedProfit: delivery.estimatedProfit,
      });
      const moneyLine = money.text ? `\n${money.text}` : '';
      const links = [delivery.purchaseLink, delivery.gmailLink, delivery.stockxLink, delivery.marketLink].filter(Boolean).join(' | ');
      const linksLine = links ? `\nLinks: ${links}` : '';

      const text =
        `• *${delivery.productName || 'Unknown Product'}*` +
        (brand ? `\n(${brand})` : '') +
        `\nSize: ${size} | ETA: ${eta}` +
        `\n${delivery.carrier || 'Carrier'}: ${trackingLink}` +
        `${moneyLine}` +
        `${linksLine}`;

      const section: any = {
        type: 'section',
        text: { type: 'mrkdwn', text },
      };

      if (typeof delivery.productImage === 'string' && delivery.productImage.startsWith('https://')) {
        section.accessory = {
          type: 'image',
          image_url: delivery.productImage,
          alt_text: String(delivery.productName || 'Product').slice(0, 200),
        };
      }
      return section;
    };

    const buildGroupBlocks = (args: { label: string; ymd: string; emptyText: string }): any[] => {
      const header = { type: 'section', text: { type: 'mrkdwn', text: `*${args.label} (breakdown)*` } };
      const itemsAll = summary.deliveries.filter((d: any) => {
        const eta = String(d?.estimatedDelivery || '').trim();
        const s = String(d?.status || '').toLowerCase().trim();
        return eta === args.ymd || (args.ymd === today && s === 'out_for_delivery');
      });
      if (!itemsAll.length) return [header, { type: 'section', text: { type: 'mrkdwn', text: args.emptyText } }];

      const sorted = [...itemsAll].sort((a: any, b: any) => {
        const ps = toPriority(b) - toPriority(a);
        if (ps) return ps;
        const ap = this.toFiniteNumber(a?.estimatedProfit);
        const bp = this.toFiniteNumber(b?.estimatedProfit);
        if (ap !== null && bp !== null && ap !== bp) return bp - ap;
        if (ap === null && bp !== null) return 1;
        if (ap !== null && bp === null) return -1;
        return String(a?.productName || '').localeCompare(String(b?.productName || ''));
      });

      return [header, ...sorted.map(makeEntryBlock)];
    };

    const breakdownGroups: any[] = [];
    if (showTodayBreakdown) breakdownGroups.push(...buildGroupBlocks({ label: '🚚 Arriving Today', ymd: today, emptyText: '_No items arriving today._' }));
    if (includeTomorrowBreakdown) {
      if (showTodayBreakdown) breakdownGroups.push({ type: 'divider' });
      breakdownGroups.push(...buildGroupBlocks({ label: '📅 Arriving Tomorrow', ymd: tomorrow, emptyText: '_No items arriving tomorrow._' }));
    }

    const footer: any = {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `_Last updated: ${new Date().toLocaleString()}_` }],
    };

    // Pack into 1+ messages (Slack limit: 50 blocks/message).
    const parts: Array<{ blocks: any[] }> = [];
    let current: any[] = [...baseBlocks];

    const pushPart = () => {
      if (!current.length) return;
      parts.push({ blocks: current });
      current = [];
    };

    const continuationHeader = (idx: number): any[] => ([
      { type: 'header', text: { type: 'plain_text', text: `📦 Daily Delivery Summary (continued)`, emoji: true } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `_Part ${idx}_` }] },
      { type: 'divider' },
    ]);

    const canFit = (arr: any[], more: any[]) => arr.length + more.length <= MAX_BLOCKS;

    // Add breakdown blocks, splitting across messages as needed.
    for (let i = 0; i < breakdownGroups.length; i++) {
      const block = breakdownGroups[i]!;
      if (canFit(current, [block])) {
        current.push(block);
        continue;
      }
      // finalize current part (add footer only to the last part, later)
      pushPart();
      const cont = continuationHeader(parts.length + 1);
      current = [...cont];
      // if even the continuation header + this block doesn't fit, drop the block (should never happen)
      if (canFit(current, [block])) current.push(block);
    }

    // Footer: append to the last message (or the first if nothing else was added).
    if (!current.length) current = [...baseBlocks];
    if (!canFit(current, [footer])) {
      pushPart();
      current = [...continuationHeader(parts.length + 1), footer];
    } else {
      current.push({ type: 'divider' });
      current.push(footer);
    }
    pushPart();

    // Ensure no part exceeds MAX_BLOCKS (safety).
    return parts.map((p) => ({ blocks: p.blocks.slice(0, MAX_BLOCKS) }));
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

