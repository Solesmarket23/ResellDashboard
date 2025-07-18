'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock } from 'lucide-react';
import ParticleBackground from '@/components/ParticleBackground';

function LoginForm() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('🔐 Password verified successfully:', data);
        // Store user info in localStorage for client-side use
        if (data.userId) {
          localStorage.setItem('siteUserId', data.userId);
          localStorage.setItem('siteUserEmail', data.email || 'user@solesmarket.com');
          console.log('🔐 Stored user data in localStorage');
        }
        // Redirect to login/signup page
        const loginUrl = `/login?from=${encodeURIComponent(from)}`;
        console.log('🔐 Redirecting to login:', loginUrl);
        window.location.href = loginUrl;
      } else {
        setError('Invalid password');
      }
    } catch (error) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 relative">
      <ParticleBackground />
      <div className="max-w-md w-full relative z-10">
        <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-lg shadow-2xl p-8 border border-cyan-500/20 shadow-cyan-500/10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 rounded-full mb-4 shadow-lg shadow-cyan-500/50 animate-pulse">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              SolesMarket Dashboard
            </h1>
            <p className="text-gray-400 mt-2">Enter password to access</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-4 py-3 bg-gray-900/50 border border-cyan-500/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 focus:shadow-lg focus:shadow-cyan-500/20 transition-all duration-200"
                required
                autoFocus
              />
              <div className="absolute inset-0 -z-10 bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 blur-xl rounded-lg opacity-0 group-focus-within:opacity-100 transition-opacity duration-300"></div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm animate-pulse">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 hover:from-cyan-600 hover:via-teal-600 hover:to-emerald-600 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  Verifying...
                </span>
              ) : (
                'Access Dashboard'
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            <p className="bg-gradient-to-r from-gray-600 to-gray-400 bg-clip-text text-transparent">
              Affiliate links remain publicly accessible
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center relative">
        <ParticleBackground />
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-cyan-500 border-t-transparent shadow-lg shadow-cyan-500/50 relative z-10"></div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}