import { redirect } from 'next/navigation';

export default function PnlPage() {
  redirect('/dashboard?section=pnl');
}

