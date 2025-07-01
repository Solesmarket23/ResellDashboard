'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { TrendingUp, Mail, Lock, User, Eye, EyeOff, ArrowLeft, Sparkles } from 'lucide-react';

const LoginPage = () => {
  const { currentTheme, setTheme, themes } = useTheme();
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Simulate API call
    setTimeout(() => {
      router.push('/loading');
    }, 1500);
  };

  const handleGoogleAuth = () => {
    setIsLoading(true);
    setTimeout(() => {
      router.push('/loading');
    }, 1000);
  };

  return (
    <div className={`min-h-screen ${currentTheme.colors.background} ${currentTheme.colors.bodyClass} flex items-center justify-center p-4`}>
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className={`absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20 ${
          currentTheme.name === 'Neon' 
            ? 'bg-gradient-to-r from-emerald-500 to-cyan-500' 
            : 'bg-gradient-to-r from-purple-500 to-pink-500'
        }`}></div>
        <div className={`absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-20 ${
          currentTheme.name === 'Neon' 
            ? 'bg-gradient-to-r from-cyan-500 to-blue-500' 
            : 'bg-gradient-to-r from-pink-500 to-purple-500'
        }`}></div>
      </div>

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link 
            href="/landing"
            className={`flex items-center space-x-2 ${currentTheme.colors.textSecondary} hover:${currentTheme.colors.textPrimary} transition-colors`}
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </Link>
          
          {/* Theme Selector */}
          <div className="flex items-center space-x-2">
            <span className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>Theme:</span>
            <div className="flex items-center space-x-1 p-1 rounded-lg bg-black/20 backdrop-blur-sm">
              {Object.values(themes).map((theme, index) => (
                <button
                  key={theme.name}
                  onClick={() => setTheme(theme.name)}
                  className={`w-6 h-6 rounded text-xs font-bold transition-all duration-200 ${
                    currentTheme.name === theme.name 
                      ? 'bg-gradient-to-r from-cyan-500 to-purple-500 text-white shadow-lg scale-105' 
                      : 'text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className={`relative p-3 rounded-xl ${
              currentTheme.name === 'Neon' 
                ? 'bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-cyan-500/30' 
                : 'bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30'
            } backdrop-blur-sm`}>
              <TrendingUp className={`w-8 h-8 ${
                currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-purple-400'
              }`} />
            </div>
          </div>
          <h1 className={`text-2xl font-bold ${currentTheme.colors.textPrimary} mb-2`}>
            Welcome Back
          </h1>
          <p className={`${currentTheme.colors.textSecondary}`}>
            {isLogin ? 'Sign in to your account' : 'Create your account'}
          </p>
        </div>

        {/* Auth Card */}
        <div className={`p-8 rounded-2xl ${
          currentTheme.name === 'Neon'
            ? 'bg-white/5 border border-cyan-500/20 backdrop-blur-sm'
            : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border backdrop-blur-sm`
        }`}>
          {/* Toggle Login/Signup */}
          <div className={`flex rounded-lg p-1 mb-6 ${
            currentTheme.name === 'Neon' ? 'bg-white/10' : 'bg-gray-100'
          }`}>
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                isLogin 
                  ? currentTheme.name === 'Neon'
                    ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white shadow-lg'
                    : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                  : `${currentTheme.colors.textSecondary} hover:${currentTheme.colors.textPrimary}`
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                !isLogin 
                  ? currentTheme.name === 'Neon'
                    ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white shadow-lg'
                    : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                  : `${currentTheme.colors.textSecondary} hover:${currentTheme.colors.textPrimary}`
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <User className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 ${currentTheme.colors.textSecondary}`} />
                  <input
                    type="text"
                    name="firstName"
                    placeholder="First Name"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    className={`w-full pl-10 pr-4 py-3 rounded-lg ${
                      currentTheme.name === 'Neon'
                        ? 'bg-white/10 border border-cyan-500/30 text-white placeholder-gray-400 focus:border-cyan-500'
                        : 'bg-white border border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500'
                    } focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all duration-200`}
                    required={!isLogin}
                  />
                </div>
                <div className="relative">
                  <User className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 ${currentTheme.colors.textSecondary}`} />
                  <input
                    type="text"
                    name="lastName"
                    placeholder="Last Name"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    className={`w-full pl-10 pr-4 py-3 rounded-lg ${
                      currentTheme.name === 'Neon'
                        ? 'bg-white/10 border border-cyan-500/30 text-white placeholder-gray-400 focus:border-cyan-500'
                        : 'bg-white border border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500'
                    } focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all duration-200`}
                    required={!isLogin}
                  />
                </div>
              </div>
            )}

            <div className="relative">
              <Mail className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 ${currentTheme.colors.textSecondary}`} />
              <input
                type="email"
                name="email"
                placeholder="Email address"
                value={formData.email}
                onChange={handleInputChange}
                className={`w-full pl-10 pr-4 py-3 rounded-lg ${
                  currentTheme.name === 'Neon'
                    ? 'bg-white/10 border border-cyan-500/30 text-white placeholder-gray-400 focus:border-cyan-500'
                    : 'bg-white border border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500'
                } focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all duration-200`}
                required
              />
            </div>

            <div className="relative">
              <Lock className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 ${currentTheme.colors.textSecondary}`} />
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder="Password"
                value={formData.password}
                onChange={handleInputChange}
                className={`w-full pl-10 pr-12 py-3 rounded-lg ${
                  currentTheme.name === 'Neon'
                    ? 'bg-white/10 border border-cyan-500/30 text-white placeholder-gray-400 focus:border-cyan-500'
                    : 'bg-white border border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500'
                } focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all duration-200`}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={`absolute right-3 top-1/2 transform -translate-y-1/2 ${currentTheme.colors.textSecondary} hover:${currentTheme.colors.textPrimary}`}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {!isLogin && (
              <div className="relative">
                <Lock className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 ${currentTheme.colors.textSecondary}`} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  placeholder="Confirm Password"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className={`w-full pl-10 pr-4 py-3 rounded-lg ${
                    currentTheme.name === 'Neon'
                      ? 'bg-white/10 border border-cyan-500/30 text-white placeholder-gray-400 focus:border-cyan-500'
                      : 'bg-white border border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500'
                  } focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all duration-200`}
                  required={!isLogin}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3 rounded-lg font-bold transition-all duration-300 transform hover:scale-105 ${
                currentTheme.name === 'Neon'
                  ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:shadow-lg hover:shadow-cyan-500/25'
                  : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:shadow-lg hover:shadow-purple-500/25'
              } disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  <span>Please wait...</span>
                </div>
              ) : (
                isLogin ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center my-6">
            <div className={`flex-1 h-px ${
              currentTheme.name === 'Neon' ? 'bg-cyan-500/30' : 'bg-gray-300'
            }`}></div>
            <span className={`px-4 text-sm ${currentTheme.colors.textSecondary}`}>or</span>
            <div className={`flex-1 h-px ${
              currentTheme.name === 'Neon' ? 'bg-cyan-500/30' : 'bg-gray-300'
            }`}></div>
          </div>

          {/* Google Sign In */}
          <button
            onClick={handleGoogleAuth}
            disabled={isLoading}
            className={`w-full py-3 rounded-lg font-medium border transition-all duration-200 flex items-center justify-center space-x-2 ${
              currentTheme.name === 'Neon'
                ? 'border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/50'
                : 'border-purple-500/30 text-purple-600 hover:bg-purple-500/10 hover:border-purple-500/50'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>Continue with Google</span>
          </button>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
            By continuing, you agree to our{' '}
            <a href="#" className={`${
              currentTheme.name === 'Neon' ? 'text-cyan-400 hover:text-cyan-300' : 'text-purple-600 hover:text-purple-500'
            } underline`}>
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="#" className={`${
              currentTheme.name === 'Neon' ? 'text-cyan-400 hover:text-cyan-300' : 'text-purple-600 hover:text-purple-500'
            } underline`}>
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage; 