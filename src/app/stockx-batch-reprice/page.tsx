'use client';

import dynamic from 'next/dynamic';

const StockXBatchRepricer = dynamic(
  () => import('@/components/StockXBatchRepricer'),
  { ssr: false }
);

export default function StockXBatchRepricePage() {
  return <StockXBatchRepricer />;
}