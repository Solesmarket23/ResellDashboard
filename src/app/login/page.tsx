'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { 
  Lock, 
  Mail, 
  User,
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react';

function LoginForm() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, loading, error, clearError } = useAuth();
  const { currentTheme } = useTheme();
  const from = searchParams.get('from') || '/dashboard';

  const isNeon = currentTheme.name === 'Neon';

  useEffect(() => {
    // Check if user has passed site password protection
    const siteUserId = localStorage.getItem('siteUserId');
    if (!siteUserId) {
      // No site password auth, redirect to password protection
      console.log('🔐 No site password auth, redirecting to password protection');
      router.push('/password-protect');
      return;
    }
  }, [router]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    clearError();

    try {
      if (isSignUp) {
        await signUpWithEmail(email, password, name);
      } else {
        await signInWithEmail(email, password);
      }
      // If successful, redirect to intended destination
      router.push(from);
    } catch (error) {
      console.error('Authentication failed:', error);
      // Error is handled by the AuthContext
    } finally {
      setIsLoading(false);
    }
  };

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
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className={`text-2xl font-bold ${
              isNeon ? 'text-white' : 'text-white'
            }`}>
              {isSignUp ? 'Create Account' : 'Welcome Back'}
            </h1>
            <p className={`mt-2 ${
              isNeon ? 'text-purple-300' : 'text-gray-400'
            }`}>
              {isSignUp ? 'Sign up to access your dashboard' : 'Sign in to your account'}
            </p>
          </div>

          {/* Tabs */}
          <div className="flex mb-6">
            <button
              onClick={() => setIsSignUp(false)}
              className={`flex-1 py-2 text-center font-medium transition-all duration-200 ${
                !isSignUp
                  ? isNeon
                    ? 'text-purple-300 border-b-2 border-purple-400'
                    : 'text-white border-b-2 border-purple-500'
                  : isNeon
                    ? 'text-gray-400 border-b border-gray-700'
                    : 'text-gray-500 border-b border-gray-700'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setIsSignUp(true)}
              className={`flex-1 py-2 text-center font-medium transition-all duration-200 ${
                isSignUp
                  ? isNeon
                    ? 'text-purple-300 border-b-2 border-purple-400'
                    : 'text-white border-b-2 border-purple-500'
                  : isNeon
                    ? 'text-gray-400 border-b border-gray-700'
                    : 'text-gray-500 border-b border-gray-700'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleEmailAuth} className="space-y-4">
            {isSignUp && (
              <div>
                <label htmlFor="name" className="sr-only">Name</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className={`h-5 w-5 ${
                      isNeon ? 'text-purple-400' : 'text-gray-400'
                    }`} />
                  </div>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    required={isSignUp}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={`block w-full pl-10 pr-3 py-3 border rounded-lg bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent ${
                      isNeon
                        ? 'focus:ring-purple-500'
                        : 'focus:ring-purple-500'
                    }`}
                    placeholder="Full name"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="sr-only">Email address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className={`h-5 w-5 ${
                    isNeon ? 'text-purple-400' : 'text-gray-400'
                  }`} />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`block w-full pl-10 pr-3 py-3 border rounded-lg bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent ${
                    isNeon
                      ? 'focus:ring-purple-500'
                      : 'focus:ring-purple-500'
                  }`}
                  placeholder="Email address"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className={`h-5 w-5 ${
                    isNeon ? 'text-purple-400' : 'text-gray-400'
                  }`} />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`block w-full pl-10 pr-10 py-3 border rounded-lg bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent ${
                    isNeon
                      ? 'focus:ring-purple-500'
                      : 'focus:ring-purple-500'
                  }`}
                  placeholder="Password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  {showPassword ? (
                    <EyeOff className={`h-5 w-5 ${
                      isNeon ? 'text-purple-400' : 'text-gray-400'
                    } hover:text-gray-300`} />
                  ) : (
                    <Eye className={`h-5 w-5 ${
                      isNeon ? 'text-purple-400' : 'text-gray-400'
                    } hover:text-gray-300`} />
                  )}
                </button>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className={`p-3 rounded-lg border ${
                isNeon 
                  ? 'bg-red-500/10 border-red-500/30 text-red-400' 
                  : 'bg-red-500/10 border-red-500/50 text-red-400'
              }`}>
                <div className="flex items-start">
                  <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || isLoading}
              className={`w-full py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white transition-all duration-200 ${
                isNeon 
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 shadow-lg shadow-purple-500/25' 
                  : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600'
              } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 ${
                (loading || isLoading) ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {(loading || isLoading) ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </span>
              ) : (
                isSignUp ? 'Sign Up' : 'Sign In'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className={`w-full border-t ${
                  isNeon ? 'border-gray-700' : 'border-gray-700'
                }`}></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className={`px-2 ${
                  isNeon ? 'bg-gray-800/50 text-gray-400' : 'bg-gray-800 text-gray-400'
                }`}>or</span>
              </div>
            </div>
          </div>

          {/* Google Sign In */}
          <div className="mt-6">
            <button
              onClick={handleGoogleSignIn}
              disabled={loading || isLoading}
              className={`w-full flex justify-center items-center px-4 py-3 border rounded-lg shadow-sm text-sm font-medium transition-all duration-200 ${
                isNeon 
                  ? 'border-gray-600 text-white bg-gray-700 hover:bg-gray-600' 
                  : 'border-gray-600 text-white bg-gray-700 hover:bg-gray-600'
              } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 ${
                (loading || isLoading) ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
          </div>

          {/* Footer */}
          <div className="mt-6 text-center text-xs text-gray-500">
            <p>By continuing, you agree to our</p>
            <div className="mt-1">
              <a href="#" className={`${
                isNeon ? 'text-purple-400 hover:text-purple-300' : 'text-purple-400 hover:text-purple-300'
              }`}>Terms of Service</a>
              {' and '}
              <a href="#" className={`${
                isNeon ? 'text-purple-400 hover:text-purple-300' : 'text-purple-400 hover:text-purple-300'
              }`}>Privacy Policy</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}