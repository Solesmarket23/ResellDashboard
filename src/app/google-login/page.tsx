'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { 
  CheckCircle, 
  ArrowLeft,
  Shield,
  Zap,
  User
} from 'lucide-react';

function GoogleLoginForm() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signInWithGoogle, loading, error, clearError } = useAuth();
  const { currentTheme } = useTheme();
  const from = searchParams.get('from') || '/dashboard';

  const isNeon = currentTheme.name === 'Neon';

  useEffect(() => {
    // Check if user is already authenticated
    const checkAuth = () => {
      const siteUserId = localStorage.getItem('siteUserId');
      const siteUserEmail = localStorage.getItem('siteUserEmail');
      
      if (!siteUserId || !siteUserEmail) {
        // User hasn't completed password verification, redirect back to login
        router.push('/login');
        return;
      }
    };

    checkAuth();
  }, [router]);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    clearError();
    
    try {
      await signInWithGoogle();
      // If successful, redirect to intended destination
      router.push(from);
    } catch (error) {
      console.error('Google sign-in failed:', error);
      // Error is handled by the AuthContext
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToPassword = () => {
    router.push('/login');
  };

  return (
    <div className={`min-h-screen flex items-center justify-center px-4 ${
      isNeon 
        ? 'bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900' 
        : 'bg-gray-900'
    }`}>
      <div className="max-w-md w-full">
        <div className={`rounded-lg shadow-xl p-8 ${
          isNeon 
            ? 'bg-gray-800/50 backdrop-blur-sm border border-purple-500/20' 
            : 'bg-gray-800'
        }`}>
          {/* Header */}
          <div className="text-center mb-8">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${
              isNeon 
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 shadow-lg shadow-purple-500/25' 
                : 'bg-gradient-to-r from-purple-500 to-pink-500'
            }`}>
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className={`text-2xl font-bold ${
              isNeon ? 'text-white' : 'text-white'
            }`}>
              Welcome to Flip Flow
            </h1>
            <p className={`mt-2 ${
              isNeon ? 'text-purple-300' : 'text-gray-400'
            }`}>
              Sign in with Google to access your dashboard
            </p>
          </div>

          {/* Features List */}
          <div className="mb-8 space-y-4">
            <div className={`flex items-center p-3 rounded-lg ${
              isNeon 
                ? 'bg-purple-500/10 border border-purple-500/20' 
                : 'bg-gray-700'
            }`}>
              <CheckCircle className={`w-5 h-5 mr-3 ${
                isNeon ? 'text-purple-400' : 'text-green-400'
              }`} />
              <span className={`text-sm ${
                isNeon ? 'text-purple-200' : 'text-gray-300'
              }`}>
                Secure authentication with Google
              </span>
            </div>
            
            <div className={`flex items-center p-3 rounded-lg ${
              isNeon 
                ? 'bg-cyan-500/10 border border-cyan-500/20' 
                : 'bg-gray-700'
            }`}>
              <Zap className={`w-5 h-5 mr-3 ${
                isNeon ? 'text-cyan-400' : 'text-yellow-400'
              }`} />
              <span className={`text-sm ${
                isNeon ? 'text-cyan-200' : 'text-gray-300'
              }`}>
                Access to all dashboard features
              </span>
            </div>
            
            <div className={`flex items-center p-3 rounded-lg ${
              isNeon 
                ? 'bg-emerald-500/10 border border-emerald-500/20' 
                : 'bg-gray-700'
            }`}>
              <User className={`w-5 h-5 mr-3 ${
                isNeon ? 'text-emerald-400' : 'text-blue-400'
              }`} />
              <span className={`text-sm ${
                isNeon ? 'text-emerald-200' : 'text-gray-300'
              }`}>
                Personalized experience
              </span>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className={`mb-6 p-4 rounded-lg border ${
              isNeon 
                ? 'bg-red-500/10 border-red-500/30 text-red-400' 
                : 'bg-red-500/10 border-red-500/50 text-red-400'
            }`}>
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium">
                    Authentication Error
                  </h3>
                  <div className="mt-2 text-sm">
                    <p>{error}</p>
                    {error.includes("unauthorized-domain") && (
                      <div className="mt-3 p-3 bg-red-500/20 rounded">
                        <p className="font-semibold">Quick Fix:</p>
                        <ol className="list-decimal list-inside mt-2 space-y-1">
                          <li>Go to <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="underline">Firebase Console</a></li>
                          <li>Select project: <code className="bg-red-500/30 px-1 rounded">flip-flow-4d55c</code></li>
                          <li>Go to Authentication → Settings → Authorized domains</li>
                          <li>Add your deployment domain</li>
                          <li>Save and redeploy</li>
                        </ol>
                      </div>
                    )}
                  </div>
                </div>
                <div className="ml-auto pl-3">
                  <button
                    onClick={clearError}
                    className={`inline-flex rounded-md p-1.5 ${
                      isNeon 
                        ? 'text-red-400 hover:bg-red-500/20' 
                        : 'text-red-500 hover:bg-red-100'
                    } focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2`}
                  >
                    <span className="sr-only">Dismiss</span>
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Google Sign In Button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading || isLoading}
            className={`w-full flex justify-center items-center px-4 py-3 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white transition-all duration-200 ${
              isNeon 
                ? 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400 shadow-lg shadow-blue-500/25' 
                : 'bg-blue-600 hover:bg-blue-700'
            } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
              (loading || isLoading) ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {(loading || isLoading) ? (
              <div className="flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Signing in...
              </div>
            ) : (
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </div>
            )}
          </button>

          {/* Back Button */}
          <div className="mt-6 text-center">
            <button
              onClick={handleBackToPassword}
              className={`inline-flex items-center text-sm ${
                isNeon 
                  ? 'text-purple-300 hover:text-purple-200' 
                  : 'text-gray-400 hover:text-gray-300'
              } transition-colors duration-200`}
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to password entry
            </button>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center text-xs text-gray-500">
            <p>By signing in, you agree to our terms of service and privacy policy</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GoogleLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    }>
      <GoogleLoginForm />
    </Suspense>
  );
} 