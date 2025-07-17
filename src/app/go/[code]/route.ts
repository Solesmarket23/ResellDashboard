import { NextRequest } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  // Redirect to the API route that handles the actual redirect
  const { code } = params;
  const apiUrl = new URL(`/api/go/${code}`, request.url);
  
  // Perform a server-side redirect to the API route
  return Response.redirect(apiUrl.toString(), 307);
}