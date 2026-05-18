import { NextRequest, NextResponse } from 'next/server';
import { getStripe, isStripeConfigured } from '@/lib/stripe/server';
import { createServiceClient } from '@/lib/auth/ownership';
import { isSupabaseConfigured } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { createLogger } from '@/lib/log';

const log = createLogger('api.share.checkout');
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/share/[token]/checkout
 *   body: { license_type: 'lease' | 'exclusive', track_ids: string[], buyer_email: string }
 *
 * Creates a Stripe Checkout Session for the requested license against
 * the share's owner. We resolve the price from the owner's
 * creator_profiles row (locked-in at checkout time so a producer
 * mid-flight can't accidentally change the price a buyer sees).
 *
 * Returns { url } — the client redirects the browser to it.
 *
 * Webhook (`/api/stripe/webhook`) handles the post-payment flow:
 *   - inserts a `license_purchases` row
 *   - sends the buyer a receipt with the gated WAV download link
 *   - the share page polls or refreshes to flip the license card
 *     from "Buy" → "Purchased — download"
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const licenseType = body.license_type as 'lease' | 'exclusive';
    const trackIds = Array.isArray(body.track_ids) ? body.track_ids : [];
    const buyerEmail = typeof body.buyer_email === 'string' ? body.buyer_email.trim() : '';

    if (!['lease', 'exclusive'].includes(licenseType)) {
      return NextResponse.json({ error: 'Invalid license_type' }, { status: 400 });
    }
    if (!trackIds.length) {
      return NextResponse.json({ error: 'No tracks selected' }, { status: 400 });
    }
    if (!buyerEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyerEmail)) {
      return NextResponse.json({ error: 'Valid buyer email required' }, { status: 400 });
    }

    const admin = createServiceClient();

    // Resolve the share → owner → creator profile to get the price.
    // We trust the owner's profile, not anything the client sent —
    // never let the buyer dictate the price.
    const { data: share } = await admin
      .from('project_shares')
      .select('project_id, projects(user_id, name)')
      .eq('token', token)
      .maybeSingle();

    if (!share) {
      return NextResponse.json({ error: 'Share not found' }, { status: 404 });
    }
    const sellerUserId = (share as any).projects?.user_id as string | undefined;
    const projectName = (share as any).projects?.name as string | undefined;
    if (!sellerUserId) {
      return NextResponse.json({ error: 'Share has no owner' }, { status: 400 });
    }

    const { data: profile } = await admin
      .from('creator_profiles')
      .select('license_lease_price_usd, license_exclusive_price_usd, display_name')
      .eq('user_id', sellerUserId)
      .maybeSingle();

    const price = licenseType === 'lease'
      ? profile?.license_lease_price_usd
      : profile?.license_exclusive_price_usd;
    if (price == null || Number(price) <= 0) {
      return NextResponse.json({ error: `Owner hasn't set a ${licenseType} price` }, { status: 400 });
    }

    // Resolve track titles for the line-item description. Best-effort —
    // if the titles fetch fails we still create the session with a
    // generic description rather than blocking the sale.
    const { data: tracks } = await admin
      .from('tracks')
      .select('id, title')
      .in('id', trackIds);
    const titleSummary = (tracks ?? []).map((t: any) => t.title).join(' · ') || 'Selected tracks';

    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://uche-beatstore-g.vercel.app';
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: buyerEmail,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(Number(price) * 100),
            product_data: {
              name: licenseType === 'exclusive'
                ? `Exclusive license — ${projectName ?? titleSummary}`
                : `Lease license — ${projectName ?? titleSummary}`,
              description: titleSummary.slice(0, 220),
            },
          },
          quantity: 1,
        },
      ],
      // Stash everything the webhook needs in metadata so we don't
      // have to re-resolve from the database. Stripe metadata values
      // are strings — we JSON.stringify arrays.
      metadata: {
        share_token: token,
        license_type: licenseType,
        track_ids: JSON.stringify(trackIds),
        seller_user_id: sellerUserId,
        buyer_email: buyerEmail,
      },
      success_url: `${APP_URL}/projects/share/${token}?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/projects/share/${token}?purchase=cancelled`,
    });

    return NextResponse.json({ url: session.url, session_id: session.id });
  } catch (err) {
    log.error('checkout failed', { token, error: errorMessage(err) });
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
