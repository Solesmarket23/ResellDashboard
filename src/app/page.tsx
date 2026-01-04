import { redirect } from 'next/navigation';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export default function Home() {
  // Server-side redirect (doesn't depend on client JS loading).
  redirect('/landing');
}
