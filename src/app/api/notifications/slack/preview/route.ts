import { NextRequest, NextResponse } from 'next/server';
import { SlackNotificationService, type DeliverySummary } from '@/lib/notifications/slackService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/notifications/slack/preview
 * Dry-run endpoint: returns the Slack blocks that would be sent (no external network call).
 *
 * Body:
 * {
 *   type: "daily_summary" | "out_for_delivery",
 *   summary?: DeliverySummary,            // required for daily_summary
 *   deliveries?: DeliverySummary["deliveries"], // required for out_for_delivery
 *   timezone?: string,
 *   mention?: string | null
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const type = String(body?.type || 'daily_summary');
    const timezone = typeof body?.timezone === 'string' ? body.timezone : 'America/New_York';
    const mention = body?.mention === null ? null : (typeof body?.mention === 'string' ? body.mention : undefined);

    // Webhook URL is required by the constructor but not used in preview mode (we don't send).
    const slack = new SlackNotificationService({
      webhookUrl: 'https://example.com/preview-webhook',
      username: 'Delivery Tracker (Preview)',
      iconEmoji: ':package:',
      timezone,
      ...(mention !== undefined ? { mention } : {}),
    });

    if (type === 'out_for_delivery') {
      const deliveries = Array.isArray(body?.deliveries) ? (body.deliveries as DeliverySummary['deliveries']) : [];
      const blocks = slack.buildOutForDeliveryOnlyBlocks({ deliveries });
      return NextResponse.json({ success: true, type, blocks, blockCount: blocks.length });
    }

    const summary = body?.summary as DeliverySummary | undefined;
    if (!summary || !Array.isArray((summary as any)?.deliveries)) {
      return NextResponse.json({ success: false, error: 'Missing `summary` (DeliverySummary) for daily_summary preview' }, { status: 400 });
    }
    const parts = slack.buildDeliverySummaryMessages(summary);
    return NextResponse.json({
      success: true,
      type,
      parts: parts.map((p) => ({ blocks: p.blocks, blockCount: p.blocks.length })),
      partCount: parts.length,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Server error' }, { status: 500 });
  }
}

