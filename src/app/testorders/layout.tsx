import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Test orders | Solesmarket',
};

export default function TestOrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
