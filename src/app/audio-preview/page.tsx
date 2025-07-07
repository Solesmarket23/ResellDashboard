'use client';

import AudioPreview from '@/components/AudioPreview';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export default function AudioPreviewPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <AudioPreview />
    </div>
  );
} 