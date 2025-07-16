import SovrnDebug from '@/components/SovrnDebug';

export default function SovrnDebugPage() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Sovrn Integration Debug</h1>
      <SovrnDebug />
      
      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900 rounded-lg">
        <h3 className="font-semibold mb-2">Quick Fix Instructions:</h3>
        <ol className="list-decimal list-inside space-y-2 text-sm">
          <li>
            <strong>In Vercel Dashboard:</strong>
            <ul className="list-disc list-inside ml-4 mt-1">
              <li>Go to Settings → Environment Variables</li>
              <li>Add NEXT_PUBLIC_SOVRN_API_KEY with your API key value</li>
              <li>Add NEXT_PUBLIC_SOVRN_ENABLE_OPTIMIZATION with value "true" or "false"</li>
              <li>Make sure both are set for Production environment</li>
            </ul>
          </li>
          <li>
            <strong>Important:</strong> After adding the variables, you must redeploy:
            <ul className="list-disc list-inside ml-4 mt-1">
              <li>Go to Deployments tab</li>
              <li>Click the three dots on the latest deployment</li>
              <li>Select "Redeploy"</li>
            </ul>
          </li>
          <li>
            <strong>Verify:</strong> After redeployment, visit this page again to confirm the variables are loaded
          </li>
        </ol>
      </div>
    </div>
  );
}