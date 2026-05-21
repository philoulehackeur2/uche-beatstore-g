import { NextRequest, NextResponse } from 'next/server';
import { getAppUrl } from '@/lib/env';
import { getStripe, isStripeConfigured } from '@/lib/stripe/server';
import { createServiceClient } from '@/lib/auth/ownership';
import { isSupabaseConfigured } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { createLogger } from '@/lib/log';

const log = createLogger('api.store.checkout');
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/store/checkout
 *   body: {
 *     buyer_email: string,
 *     items: Array<{ track_id: string, license_type: 'lease' | 'exclusive' }>
 *   }
 *
 * Public-facing Stripe Checkout flow for the /store page. Differs
 * from /api/share/[token]/checkout in that there's no share token —
 * the cart is composed from arbitrary storefront-listed tracks.
 *
 * Security note: we NEVER trust the client price. For each item the
 * server resolves the effective price from the track's override
 * column (lease_price_usd / exclusive_price_usd) falling back to the
 * creator_profiles default. An item priced at zero on both layers
 * is rejected by name so the operator knows which one to fix.
 */
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const buyerEmail = typeof body.buyer_email === 'string' ? body.buyer_email.trim() : '';
    const items = Array.isArray(body.items) ? body.items : [];

    if (!buyerEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyerEmail)) {
      return NextResponse.json({ error: 'Valid buyer email required' }, { status: 400 });
    }
    if (!items.length) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
    }
    // Validate item shape once up-front so the downstream code can
    // assume well-formed input.
    for (const i of items) {
      if (typeof i.track_id !== 'string' || !i.track_id) {
        return NextResponse.json({ error: 'Item missing track_id' }, { status: 400 });
      }
      if (!['lease', 'exclusive'].includes(i.license_type)) {
        return NextResponse.json({ error: `Invalid license_type for ${i.track_id}` }, { status: 400 });
      }
    }

    const admin = createServiceClient();
    const trackIds = [...new Set(items.map((i: any) => i.track_id as string))];

    // Pull tracks + their seller's profile in two queries. We need
    // the per-track prices AND the profile defaults to fall back on.
    const { data: tracks } = await admin
      .from('tracks')
      .select('id, user_id, title, store_listed, lease_price_usd, exclusive_price_usd')
      .in('id', trackIds);

    if (!tracks || tracks.length === 0) {
      return NextResponse.json({ error: 'No matching tracks' }, { status: 400 });
    }

    // Refuse anything not store_listed — protects against a buyer
    // hand-crafting a request with hidden track ids.
    const unlisted = tracks.filter((t: any) => !t.store_listed).map((t: any) => t.title);
    if (unlisted.length) {
      return NextResponse.json(
        { error: `Not for sale: ${unlisted.join(', ')}` },
        { status: 400 },
      );
    }

    const sellerUserId = (tracks[0] as any).user_id as string | undefined;
    let profileLease: number | null = null;
    let profileExclusive: number | null = null;
    if (sellerUserId) {
      const { data: profile } = await admin
        .from('creator_profiles')
        .select('license_lease_price_usd, license_exclusive_price_usd')
        .eq('user_id', sellerUserId)
        .maybeSingle();
      profileLease = profile?.license_lease_price_usd ?? null;
      profileExclusive = profile?.license_exclusive_price_usd ?? null;
    }

    const trackById = new Map((tracks as any[]).map((t) => [t.id, t]));
    const lineItems: any[] = [];
    const unpriced: string[] = [];
    const compositeTrackIds: string[] = [];

    for (const it of items) {
      const t = trackById.get(it.track_id) as any;
      if (!t) continue;
      const override = it.license_type === 'lease' ? t.lease_price_usd : t.exclusive_price_usd;
      const profileDefault = it.license_type === 'lease' ? profileLease : profileExclusive;
      const effective = override != null && Number(override) > 0
        ? Number(override)
        : (profileDefault != null && Number(profileDefault) > 0 ? Number(profileDefault) : null);
      if (effective == null) {
        unpriced.push(`${t.title} (${it.license_type})`);
        continue;
      }
      compositeTrackIds.push(t.id);
      lineItems.push({
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(effective * 100),
          product_data: {
            name: `${it.license_type === 'exclusive' ? 'Exclusive' : 'Lease'} — ${t.title}`,
          },
        },
        quantity: 1,
      });
    }

    if (unpriced.length) {
      return NextResponse.json(
        { error: `Missing price on: ${unpriced.join(', ')}` },
        { status: 400 },
      );
    }

    const APP_URL = getAppUrl();
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: buyerEmail,
      line_items: lineItems,
      // Webhook reads these on checkout.session.completed to record
      // the purchase, mirroring how the share-link checkout works.
      // Single-line metadata limits apply: stringify everything we
      // can't pack into the flat key/value space.
      // Metadata format matches the existing /api/share/[token]/checkout
      // contract so the webhook can fan into a single handler. Notable:
      // `cart_items` shape is [{track_id, license_id}], and the webhook
      // normalises license_id → DB license_type at write time. `source`
      // tells the receipt email to point at /store instead of /share/X.
      metadata: {
        source: 'store',
        cart_items: JSON.stringify(
          items
            .slice(0, 25)
            .map((i: any) => ({ track_id: i.track_id, license_id: i.license_type })),
        ),
        seller_user_id: sellerUserId ?? '',
        buyer_email: buyerEmail,
      },
      success_url: `${APP_URL}/store?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/store?purchase=cancelled`,
    });

    return NextResponse.json({ url: session.url, session_id: session.id });
  } catch (err) {
    log.error('store checkout failed', { error: errorMessage(err) });
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
