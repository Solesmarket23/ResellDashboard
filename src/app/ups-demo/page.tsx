'use client';

import { useState } from 'react';
import UPSOAuthButton from '../../components/UPSOAuthButton';
import UPSOAuthExample from '../../components/UPSOAuthExample';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useSiteAuth } from '../../lib/hooks/useSiteAuth';

export default function UPSDemoPage() {
  const { user: firebaseUser } = useAuth();
  const { user: siteUser } = useSiteAuth();
  const user = firebaseUser || siteUser;
  const [showExample, setShowExample] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">
            UPS OAuth Integration Demo
          </h1>
          
          <div className="space-y-8">
            {/* Basic OAuth Button */}
            <div className="border rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Basic OAuth Button
              </h2>
              <p className="text-gray-600 mb-4">
                This is the basic UPS OAuth button that you can use anywhere in your app.
              </p>
              <UPSOAuthButton 
                userId={user?.uid || 'demo-user'}
                onAuthSuccess={(tokenInfo) => {
                  console.log('OAuth Success:', tokenInfo);
                  alert('UPS OAuth successful! Check the console for details.');
                }}
                onAuthError={(error) => {
                  console.error('OAuth Error:', error);
                  alert('UPS OAuth failed: ' + error);
                }}
              />
            </div>

            {/* Full Example Component */}
            <div className="border rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  Full Integration Example
                </h2>
                <button
                  onClick={() => setShowExample(!showExample)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {showExample ? 'Hide' : 'Show'} Example
                </button>
              </div>
              <p className="text-gray-600 mb-4">
                This shows a complete example with tracking functionality.
              </p>
              
              {showExample && (
                <UPSOAuthExample userId={user?.uid || 'demo-user'} />
              )}
            </div>

            {/* Usage Instructions */}
            <div className="border rounded-lg p-6 bg-blue-50">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                How to Use in Your Components
              </h2>
              <div className="space-y-4 text-sm">
                <div>
                  <h3 className="font-semibold text-gray-800">1. Import the Component:</h3>
                  <code className="block bg-gray-100 p-2 rounded mt-1">
                    import UPSOAuthButton from '@/components/UPSOAuthButton';
                  </code>
                </div>
                
                <div>
                  <h3 className="font-semibold text-gray-800">2. Use in Your JSX:</h3>
                  <code className="block bg-gray-100 p-2 rounded mt-1">
                    {`<UPSOAuthButton 
  userId="user123"
  onAuthSuccess={(tokenInfo) => console.log('Success:', tokenInfo)}
  onAuthError={(error) => console.error('Error:', error)}
/>`}
                  </code>
                </div>
                
                <div>
                  <h3 className="font-semibold text-gray-800">3. Use the Hook for Custom Logic:</h3>
                  <code className="block bg-gray-100 p-2 rounded mt-1">
                    {`import { useUPSOAuth } from '@/lib/hooks/useUPSOAuth';

const { isAuthenticated, startAuth, tokenInfo } = useUPSOAuth('user123');`}
                  </code>
                </div>
              </div>
            </div>

            {/* API Endpoints */}
            <div className="border rounded-lg p-6 bg-green-50">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Available API Endpoints
              </h2>
              <div className="space-y-2 text-sm">
                <div>
                  <code className="bg-gray-100 px-2 py-1 rounded">GET /api/ups/oauth/authorize</code>
                  <span className="ml-2 text-gray-600">- Start OAuth flow</span>
                </div>
                <div>
                  <code className="bg-gray-100 px-2 py-1 rounded">GET /api/ups/oauth/callback</code>
                  <span className="ml-2 text-gray-600">- Handle OAuth callback</span>
                </div>
                <div>
                  <code className="bg-gray-100 px-2 py-1 rounded">GET /api/ups/oauth/token</code>
                  <span className="ml-2 text-gray-600">- Get current token info</span>
                </div>
                <div>
                  <code className="bg-gray-100 px-2 py-1 rounded">POST /api/ups/oauth/refresh</code>
                  <span className="ml-2 text-gray-600">- Refresh access token</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
