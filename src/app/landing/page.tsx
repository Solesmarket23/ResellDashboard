'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { TrendingUp, Shield, Zap, BarChart3, DollarSign, Target, ArrowRight, Mail, CheckCircle } from 'lucide-react';

// Email Collection Form Component
const EmailCollectionForm = ({ currentTheme }: { currentTheme: any }) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: data.message });
        setEmail('');
      } else {
        setMessage({ type: 'error', text: data.error || 'Something went wrong' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to subscribe. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto">
      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="flex-1 relative">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            required
            className={`w-full px-5 py-4 rounded-xl ${
              currentTheme.name === 'Neon'
                ? 'bg-gray-800/50 border border-cyan-500/30 text-white placeholder-gray-400 focus:border-cyan-500'
                : 'bg-gray-800/50 border border-purple-500/30 text-white placeholder-gray-400 focus:border-purple-500'
            } backdrop-blur-sm transition-all duration-200 focus:outline-none focus:ring-2 ${
              currentTheme.name === 'Neon' ? 'focus:ring-cyan-500/20' : 'focus:ring-purple-500/20'
            }`}
          />
          <Mail className={`absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 ${
            currentTheme.colors.textSecondary
          }`} />
        </div>
        
        <button
          type="submit"
          disabled={isLoading}
          className={`px-8 py-4 rounded-xl font-bold transition-all duration-300 ${
            currentTheme.name === 'Neon'
              ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:shadow-lg hover:shadow-cyan-500/25'
              : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:shadow-lg hover:shadow-purple-500/25'
          } disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105`}
        >
          {isLoading ? 'Subscribing...' : 'Get Early Access'}
        </button>
      </div>

      {message && (
        <div className={`flex items-center justify-center space-x-2 p-3 rounded-lg ${
          message.type === 'success'
            ? currentTheme.name === 'Neon'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-green-500/10 text-green-400 border border-green-500/20'
            : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {message.type === 'success' && <CheckCircle className="w-5 h-5" />}
          <span>{message.text}</span>
        </div>
      )}
    </form>
  );
};

const LandingPage = () => {
  const { currentTheme, setTheme, themes } = useTheme();
  const router = useRouter();
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleNavigation = (path: string) => {
    setIsTransitioning(true);
    setTimeout(() => {
      router.push(path);
    }, 300); // 300ms delay for fade-out animation
  };

  const features = [
    {
      icon: TrendingUp,
      title: "Real-Time Market Analytics",
      description: "Track sneaker prices, trends, and profit opportunities with live market data.",
      color: currentTheme.name === 'Neon' ? 'from-emerald-500 to-cyan-500' : 'from-purple-500 to-pink-500'
    },
    {
      icon: Shield,
      title: "Secure Gmail Integration",
      description: "Automatically parse purchase confirmations and track your inventory safely.",
      color: currentTheme.name === 'Neon' ? 'from-cyan-500 to-blue-500' : 'from-blue-500 to-purple-500'
    },
    {
      icon: BarChart3,
      title: "Advanced Profit Tracking",
      description: "Monitor your flips, calculate margins, and optimize your reselling strategy.",
      color: currentTheme.name === 'Neon' ? 'from-blue-500 to-purple-500' : 'from-pink-500 to-red-500'
    },
    {
      icon: Zap,
      title: "Lightning Fast Alerts",
      description: "Get instant notifications on price drops and profitable opportunities.",
      color: currentTheme.name === 'Neon' ? 'from-purple-500 to-pink-500' : 'from-yellow-500 to-orange-500'
    }
  ];

  return (
    <div className={`min-h-screen ${currentTheme.colors.background} ${currentTheme.colors.bodyClass} transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
      {/* Navigation */}
      <nav className="flex items-center justify-between p-6 max-w-7xl mx-auto">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center">
            <Image
              src="/flip-flow-logo.svg"
              alt="Flip Flow Logo"
              width={32}
              height={32}
              className="w-8 h-8"
            />
          </div>
          <span className={`text-xl font-bold ${currentTheme.colors.textPrimary}`}>
            Flip Flow
          </span>
        </div>
        
        {/* Theme Selector */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>Theme:</span>
            <div className="flex items-center space-x-1 p-1 rounded-lg bg-black/20 backdrop-blur-sm">
              {Object.values(themes).map((theme, index) => (
                <button
                  key={theme.name}
                  onClick={() => setTheme(theme.name)}
                  className={`w-8 h-8 rounded-md text-sm font-bold transition-all duration-200 flex items-center justify-center ${
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
          
          <button 
            onClick={() => handleNavigation('/password-protect')}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              currentTheme.name === 'Neon'
                ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:shadow-lg hover:shadow-cyan-500/25'
                : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:shadow-lg hover:shadow-purple-500/25'
            }`}
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-16 overflow-visible">
          <div className="flex justify-center mb-6">
            <div className={`relative p-4 rounded-2xl ${
              currentTheme.name === 'Neon' 
                ? 'bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-cyan-500/30' 
                : 'bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30'
            } backdrop-blur-sm`}>
              <Image
                src="/flip-flow-logo.svg"
                alt="Flip Flow Logo"
                width={48}
                height={48}
                className="w-12 h-12"
              />
              <div className={`absolute inset-0 rounded-2xl ${
                currentTheme.name === 'Neon' 
                  ? 'bg-gradient-to-r from-emerald-500/10 to-cyan-500/10' 
                  : 'bg-gradient-to-r from-purple-500/10 to-pink-500/10'
              } animate-pulse`}></div>
            </div>
          </div>
          
          <h1 className={`text-5xl lg:text-7xl font-bold leading-tight lg:leading-tight ${currentTheme.colors.textPrimary} mb-6 pb-2`}>
            Revolutionary
            <span className={`block bg-gradient-to-r ${
              currentTheme.name === 'Neon' 
                ? 'from-emerald-400 to-cyan-400' 
                : 'from-purple-400 to-pink-400'
            } bg-clip-text text-transparent leading-tight lg:leading-tight pb-2`}>
              Analytics Suite
            </span>
          </h1>
          
          <p className={`text-xl ${currentTheme.colors.textSecondary} max-w-3xl mx-auto mb-12 leading-relaxed`}>
            Transform your reselling business with AI-powered analytics, real-time market data, 
            and automated profit tracking. The future of sneaker reselling is here.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button 
              onClick={() => handleNavigation('/password-protect')}
              className={`px-8 py-4 rounded-xl font-bold text-lg leading-none transition-all duration-300 transform hover:scale-105 ${
                currentTheme.name === 'Neon'
                  ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:shadow-2xl hover:shadow-cyan-500/25'
                  : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:shadow-2xl hover:shadow-purple-500/25'
              } flex items-center justify-center space-x-2`}
            >
              <span>Get Started Free</span>
              <ArrowRight className="w-5 h-5" />
            </button>
            
            <button 
              onClick={() => alert('Demo video coming soon! Sign up to be notified when it\'s ready.')}
              className={`px-8 py-4 rounded-xl font-bold text-lg leading-none transition-all duration-300 ${
              currentTheme.name === 'Neon'
                ? 'border-2 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10'
                : 'border-2 border-purple-500/50 text-purple-400 hover:bg-purple-500/10'
            } backdrop-blur-sm flex items-center justify-center`}>
              Watch Demo
            </button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-20">
          {features.map((feature, index) => {
            const IconComponent = feature.icon;
            return (
              <div key={index} className={`p-6 rounded-2xl ${
                currentTheme.name === 'Neon'
                  ? 'bg-white/5 border border-cyan-500/20 hover:border-cyan-500/40'
                  : `${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border hover:border-purple-500/40`
              } backdrop-blur-sm transition-all duration-300 hover:transform hover:scale-105`}>
                <div className={`w-12 h-12 rounded-lg bg-gradient-to-r ${feature.color} flex items-center justify-center mb-4`}>
                  <IconComponent className="w-6 h-6 text-white" />
                </div>
                <h3 className={`text-lg font-bold leading-relaxed ${currentTheme.colors.textPrimary} mb-2`}>
                  {feature.title}
                </h3>
                <p className={`${currentTheme.colors.textSecondary} leading-relaxed`}>
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Stats Section */}
        <div className={`p-8 rounded-3xl ${
          currentTheme.name === 'Neon'
            ? 'bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-cyan-500/20'
            : 'bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20'
        } backdrop-blur-sm`}>
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <div className={`text-4xl font-bold leading-snug ${
                currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-purple-400'
              } mb-2`}>
                $2.3M+
              </div>
              <div className={`${currentTheme.colors.textSecondary} leading-relaxed`}>
                Total Profits Tracked
              </div>
            </div>
            <div>
              <div className={`text-4xl font-bold leading-snug ${
                currentTheme.name === 'Neon' ? 'text-emerald-400' : 'text-pink-400'
              } mb-2`}>
                15K+
              </div>
              <div className={`${currentTheme.colors.textSecondary} leading-relaxed`}>
                Active Resellers
              </div>
            </div>
            <div>
              <div className={`text-4xl font-bold leading-snug ${
                currentTheme.name === 'Neon' ? 'text-blue-400' : 'text-indigo-400'
              } mb-2`}>
                98%
              </div>
              <div className={`${currentTheme.colors.textSecondary} leading-relaxed`}>
                Accuracy Rate
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Email Collection Section */}
      <section className={`py-20`}>
        <div className="max-w-2xl mx-auto text-center px-6">
          <h2 className={`text-3xl font-bold leading-snug ${currentTheme.colors.textPrimary} mb-4`}>
            Get Early Access to SolesMarket
          </h2>
          <p className={`text-lg ${currentTheme.colors.textSecondary} leading-relaxed mb-8`}>
            Join the waitlist and be the first to know when we launch new features and exclusive deals.
          </p>
          
          <EmailCollectionForm currentTheme={currentTheme} />
        </div>
      </section>

      {/* CTA Section */}
      <section className={`py-20 ${
        currentTheme.name === 'Neon'
          ? 'bg-gradient-to-r from-gray-900 via-gray-800 to-slate-900'
          : 'bg-gradient-to-r from-purple-900/20 to-pink-900/20'
      }`}>
        <div className="max-w-4xl mx-auto text-center px-6">
          <h2 className={`text-4xl font-bold leading-snug ${currentTheme.colors.textPrimary} mb-6`}>
            Ready to Transform Your Business?
          </h2>
          <p className={`text-xl ${currentTheme.colors.textSecondary} leading-relaxed mb-8`}>
            Join thousands of successful resellers using our platform to maximize profits.
          </p>
          <Link 
            href="/password-protect"
            className={`inline-flex items-center justify-center space-x-2 px-8 py-4 rounded-xl font-bold text-lg leading-none transition-all duration-300 transform hover:scale-105 ${
              currentTheme.name === 'Neon'
                ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:shadow-2xl hover:shadow-cyan-500/25'
                : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:shadow-2xl hover:shadow-purple-500/25'
            }`}
          >
            <span>Start Your Free Trial</span>
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </div>
  );
};

export default LandingPage; 