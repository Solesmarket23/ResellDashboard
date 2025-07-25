import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const cookieStore = cookies();
  
  const accessToken = cookieStore.get('stockx_access_token')?.value;
  const refreshToken = cookieStore.get('stockx_refresh_token')?.value;
  const tokenExpiresAt = cookieStore.get('stockx_token_expires_at')?.value;
  
  const now = Date.now();
  const expiresAt = tokenExpiresAt ? parseInt(tokenExpiresAt) : null;
  const isExpired = expiresAt ? now >= expiresAt : null;
  const timeRemaining = expiresAt ? expiresAt - now : null;
  
  // Convert time remaining to human readable
  let timeRemainingHuman = 'Unknown';
  if (timeRemaining !== null) {
    if (timeRemaining <= 0) {
      timeRemainingHuman = 'Expired';
    } else {
      const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
      const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);
      timeRemainingHuman = `${hours}h ${minutes}m ${seconds}s`;
    }
  }
  
  return NextResponse.json({
    hasAccessToken: !!accessToken,
    hasRefreshToken: !!refreshToken,
    hasExpirationData: !!tokenExpiresAt,
    tokenExpired: isExpired,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    timeRemaining: timeRemainingHuman,
    currentTime: new Date(now).toISOString(),
    debug: {
      accessTokenPreview: accessToken ? `${accessToken.substring(0, 20)}...` : null,
      refreshTokenPreview: refreshToken ? `${refreshToken.substring(0, 20)}...` : null,
      expiresAtRaw: tokenExpiresAt
    }
  });
}