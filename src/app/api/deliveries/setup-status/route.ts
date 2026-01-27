import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function hasNonEmptyEnv(name: string): boolean {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0;
}

export async function GET() {
  const firebase = {
    projectId: hasNonEmptyEnv('FIREBASE_PROJECT_ID') || hasNonEmptyEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
    clientEmail: hasNonEmptyEnv('FIREBASE_CLIENT_EMAIL'),
    privateKey: hasNonEmptyEnv('FIREBASE_PRIVATE_KEY'),
  };

  const tracking = {
    fedex: {
      apiKey: hasNonEmptyEnv('FEDEX_API_KEY'),
      secretKey: hasNonEmptyEnv('FEDEX_SECRET_KEY'),
    },
    ups: {
      clientId: hasNonEmptyEnv('UPS_CLIENT_ID'),
      clientSecret: hasNonEmptyEnv('UPS_CLIENT_SECRET'),
      accountNumber: hasNonEmptyEnv('UPS_ACCOUNT_NUMBER'),
    },
    upsOauth: {
      clientId: hasNonEmptyEnv('UPS_OAUTH_CLIENT_ID'),
      clientSecret: hasNonEmptyEnv('UPS_OAUTH_CLIENT_SECRET'),
      redirectUri: hasNonEmptyEnv('UPS_OAUTH_REDIRECT_URI'),
    },
  };

  let firebaseAdminOk = false;
  let firebaseAdminError: string | null = null;
  try {
    // Exercise initialization without leaking any values.
    const db = getAdminDb();
    firebaseAdminOk = !!db;
  } catch (e: any) {
    firebaseAdminOk = false;
    firebaseAdminError = String(e?.message || e);
  }

  const firebaseEnvOk = firebase.projectId && firebase.clientEmail && firebase.privateKey;
  const fedexOk = tracking.fedex.apiKey && tracking.fedex.secretKey;
  const upsOk = tracking.ups.clientId && tracking.ups.clientSecret && tracking.ups.accountNumber;
  const upsOauthOk = tracking.upsOauth.clientId && tracking.upsOauth.clientSecret && tracking.upsOauth.redirectUri;

  return NextResponse.json({
    success: true,
    firebase: {
      envOk: firebaseEnvOk,
      adminOk: firebaseAdminOk,
      adminError: firebaseAdminError,
      checks: firebase,
    },
    tracking: {
      fedexOk,
      upsOk,
      upsOauthOk,
      checks: tracking,
    },
  });
}

