'use client';

import React, { useState } from 'react';
import { Check, X, Zap, TrendingUp, Crown, Star, ArrowRight, Gift, Shield, Clock, Sparkles, Target, Rocket, Users, Award, Palette, CheckCircle } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

const Plans = () => {
  const { currentTheme } = useTheme();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annually'>('monthly');
  
  // Dynamic theme detection for consistent neon styling
  const isNeon = currentTheme.name === 'Neon';

  const plans = [
    {
      id: 'starter',
      name: 'Starter',
      icon: Zap,
      description: 'Perfect for beginners starting their resell journey',
      monthlyPrice: 19,
      annualPrice: 190,
      features: [
        'Gmail integration',
        'Up to 100 purchases/month',
        'Basic profit tracking',
        'Email support',
        'Mobile app access',
        'Basic analytics dashboard'
      ],
      notIncluded: [
        'Advanced analytics',
        'Auto profit calculations',
        'Priority support',
        'Custom alerts'
      ],
      color: 'bg-blue-500',
      popular: false,
      trial: true
    },
    {
      id: 'professional',
      name: 'Professional',
      icon: TrendingUp,
      description: 'Most popular choice for serious resellers',
      monthlyPrice: 49,
      annualPrice: 490,
      features: [
        'Everything in Starter',
        'Up to 1,000 purchases/month',
        'Advanced profit tracking',
        'Auto profit calculations',
        'Priority email support',
        'Advanced analytics & insights',
        'Custom alerts & notifications',
        'Export data capabilities',
        'Mobile & desktop apps'
      ],
      notIncluded: [
        'Phone support',
        'Custom integrations',
        'Dedicated account manager'
      ],
      color: 'bg-purple-500',
      popular: true,
      trial: true
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      icon: Crown,
      description: 'For high-volume resellers and teams',
      monthlyPrice: 99,
      annualPrice: 990,
      features: [
        'Everything in Professional',
        'Unlimited purchases',
        'Team collaboration tools',
        'Phone & priority support',
        'Custom integrations',
        'Dedicated account manager',
        'Advanced reporting suite',
        'API access',
        'White-label options',
        'Custom onboarding'
      ],
      notIncluded: [],
      color: 'bg-yellow-500',
      popular: false,
      trial: true
    }
  ];

  return (
    <div className={`min-h-screen relative overflow-hidden py-4 sm:py-8 px-4 flex-1 ${currentTheme.colors.background}`}>
        {/* Neon theme background effects */}
        {isNeon && (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/20 via-slate-900/50 to-emerald-900/20"></div>
            <div className="absolute inset-0">
              <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
            </div>
          </>
        )}
        
        <div className="relative z-10 max-w-7xl mx-auto">
          {/* Header Section */}
          <div className="text-center mb-6 sm:mb-10">
            {isNeon && (
              <div className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-cyan-600/20 to-emerald-600/20 rounded-full border border-cyan-500/30 mb-4 backdrop-blur-xl">
                <Sparkles className="w-4 h-4 text-cyan-400 mr-2" />
                <span className="text-cyan-300 text-sm font-medium">Premium Pricing Plans</span>
              </div>
            )}
            
            <h1 className={`text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-4 leading-tight ${
              isNeon 
                ? 'text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-100 to-emerald-100' 
                : 'text-gray-900'
            }`}>
              {isNeon ? (
                <>
                  Elevate Your{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-emerald-400 to-cyan-300">
                    Reselling Game
                  </span>
                </>
              ) : (
                'Choose Your Plan'
              )}
            </h1>
            
            <p className={`text-base sm:text-lg mb-2 max-w-4xl mx-auto leading-relaxed ${
              isNeon 
                ? 'text-slate-300' 
                : 'text-gray-600'
            }`}>
              {isNeon ? (
                'Join thousands of successful resellers who trust FlipFlow to maximize their profits.'
              ) : (
                'Scale your reselling business with our powerful tools. All plans include a 14-day free trial.'
              )}
            </p>
            
            {isNeon && (
              <p className="text-base sm:text-lg mb-4 sm:mb-6 max-w-4xl mx-auto leading-relaxed text-center">
                <span className="text-cyan-400 font-semibold">Start your 14-day free trial today.</span>
              </p>
            )}
            
            {/* Billing Toggle */}
            <div className="flex items-center justify-center space-x-3 mb-4 sm:mb-6 pt-10">
              {isNeon ? (
                <div className="relative">
                  {/* 17% OFF Badge positioned above the Annually button */}
                  <div className="absolute -top-10 right-4 z-20">
                    <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 text-slate-900 text-xs font-bold px-3 py-1.5 rounded-full shadow-lg border border-emerald-300/50">
                      17% OFF
                    </span>
                  </div>
                  <div className="dark-neon-card rounded-xl p-1.5">
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => setBillingPeriod('monthly')}
                        className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ${
                          billingPeriod === 'monthly'
                            ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-lg shadow-cyan-500/25'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Monthly
                      </button>
                      <button
                        onClick={() => setBillingPeriod('annually')}
                        className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ${
                          billingPeriod === 'annually'
                            ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-lg shadow-cyan-500/25'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Annually
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <span className={`text-sm font-medium transition-colors ${billingPeriod === 'monthly' ? 'text-purple-600' : 'text-gray-500'}`}>Monthly</span>
                  <button
                    onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'annually' : 'monthly')}
                    className="relative inline-flex h-5 w-9 items-center rounded-full bg-purple-600 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                    aria-label="Toggle billing period"
                  >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${billingPeriod === 'annually' ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                  <span className={`text-sm font-medium transition-colors ${billingPeriod === 'annually' ? 'text-purple-600' : 'text-gray-500'}`}>Annually</span>
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full">Save 17%</span>
                </>
              )}
            </div>
          </div>

          {/* Plans Grid */}
          <div className="relative">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-10 pt-8">
              {plans.map((plan, index) => (
                <div
                  key={plan.id}
                  className={`relative group transition-all duration-300 ${
                    plan.popular ? 'lg:scale-105' : ''
                  } ${isNeon ? 'hover:transform hover:scale-105' : ''}`}
                >
                  {/* Most Popular Badge - Outside the card to prevent clipping */}
                  {plan.popular && (
                    <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 z-[100]">
                      <span className={`px-4 py-1.5 rounded-full text-xs font-semibold flex items-center shadow-2xl whitespace-nowrap ${
                        isNeon 
                          ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-white border border-cyan-400/50' 
                          : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                      }`}>
                        <Star className="w-3 h-3 mr-1 flex-shrink-0" />
                        Most Popular
                      </span>
                    </div>
                  )}

                  {/* Neon glow effect */}
                  {isNeon && (
                    <div className={`absolute inset-0 bg-gradient-to-br rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-500 ${
                      plan.popular 
                        ? 'from-cyan-500/20 to-emerald-500/20' 
                        : 'from-slate-800/50 to-slate-900/50'
                    }`}></div>
                  )}
                  
                  <div className={`relative rounded-xl transition-all duration-300 ${
                    isNeon 
                      ? `dark-neon-card border ${
                          plan.popular 
                            ? 'border-cyan-500/50 shadow-xl shadow-cyan-500/25' 
                            : 'border-slate-700/50 group-hover:border-cyan-500/50'
                        }` 
                      : `bg-white shadow-lg border-2 hover:shadow-xl ${
                          plan.popular 
                            ? 'border-purple-500 ring-2 ring-purple-100' 
                            : 'border-gray-200 hover:border-purple-300'
                        }`
                  }`}>
                  
                  <div className="p-4 sm:p-6">
                    {/* Plan Header */}
                    <div className="flex items-center mb-3">
                      <div className={`p-2 rounded-lg mr-3 flex-shrink-0 ${
                        isNeon 
                          ? `${plan.popular ? 'bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30' : 'bg-slate-800/50 border border-slate-700/50'}` 
                          : `${plan.color} bg-opacity-10`
                      }`}>
                        <plan.icon className={`w-5 h-5 sm:w-6 sm:h-6 ${
                          isNeon 
                            ? `${plan.popular ? 'text-cyan-400' : 'text-emerald-400'}` 
                            : plan.color.replace('bg-', 'text-')
                        }`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className={`text-lg sm:text-xl font-bold truncate ${
                          isNeon ? 'text-white' : 'text-gray-900'
                        }`}>{plan.name}</h3>
                        <p className={`text-xs leading-tight ${
                          isNeon ? 'text-slate-400' : 'text-gray-600'
                        }`}>{plan.description}</p>
                      </div>
                    </div>

                    {/* Pricing */}
                    <div className="mb-4">
                      <div className="flex items-baseline">
                        <span className={`text-2xl sm:text-3xl font-bold ${
                          isNeon ? 'text-white' : 'text-gray-900'
                        }`}>
                          ${billingPeriod === 'monthly' ? plan.monthlyPrice : Math.floor(plan.annualPrice / 12)}
                        </span>
                        <span className={`ml-1 text-sm ${
                          isNeon ? 'text-slate-400' : 'text-gray-600'
                        }`}>/month</span>
                      </div>
                      {billingPeriod === 'annually' && (
                        <p className={`text-xs mt-1 font-semibold ${
                          isNeon ? 'text-emerald-400' : 'text-green-600'
                        }`}>
                          {isNeon ? `$${plan.annualPrice} billed annually` : `Billed annually ($${plan.annualPrice}/year)`}
                        </p>
                      )}
                    </div>

                    {/* Features */}
                    <ul className="space-y-2 mb-6">
                      {plan.features.slice(0, 5).map((feature, index) => (
                        <li key={index} className="flex items-start">
                          {isNeon ? (
                            <div className="flex-shrink-0 w-4 h-4 bg-gradient-to-br from-emerald-400 to-cyan-400 rounded-full flex items-center justify-center mr-3 mt-0.5">
                              <Check className="w-2.5 h-2.5 text-slate-900" />
                            </div>
                          ) : (
                            <Check className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                          )}
                          <span className={`text-sm leading-relaxed ${
                            isNeon ? 'text-slate-300' : 'text-gray-700'
                          }`}>{feature}</span>
                        </li>
                      ))}
                      {plan.features.length > 5 && (
                        <li className={`text-xs font-medium ${
                          isNeon ? 'text-center' : ''
                        }`}>
                          <span className={isNeon ? 'text-cyan-400' : 'text-purple-600'}>
                            +{plan.features.length - 5} more features
                          </span>
                        </li>
                      )}
                    </ul>

                    {/* CTA Button */}
                    <button className={`w-full py-2.5 sm:py-3 px-4 rounded-lg font-semibold text-sm transition-all duration-300 ${
                      isNeon 
                        ? `transform hover:scale-105 ${
                            plan.popular
                              ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-xl shadow-cyan-500/25 hover:shadow-2xl hover:shadow-cyan-500/40'
                              : 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white shadow-xl shadow-emerald-500/25 hover:shadow-2xl hover:shadow-emerald-500/40'
                          }` 
                        : `${plan.popular
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 shadow-lg hover:shadow-xl transform hover:scale-105'
                            : 'bg-gray-900 text-white hover:bg-gray-800 shadow-md hover:shadow-lg'
                          }`
                    }`}>
                      {isNeon ? (
                        <>
                          Start 14-Day Free Trial
                          <ArrowRight className="w-4 h-4 inline ml-2" />
                        </>
                      ) : (
                        'Start Free Trial'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            </div>
          </div>

          {/* Trust Indicators */}
          <div className="text-center">
            {isNeon ? (
              <div className="grid md:grid-cols-3 gap-4 sm:gap-6">
                <div className="text-center">
                  <div className="dark-neon-card p-4 border border-slate-700/50">
                    <TrendingUp className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                    <h4 className="text-white font-semibold mb-1">Real-Time Tracking</h4>
                    <p className="text-slate-400 text-xs">Live profit analytics and insights</p>
                  </div>
                </div>
                <div className="text-center">
                  <div className="dark-neon-card p-4 border border-slate-700/50">
                    <CheckCircle className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
                    <h4 className="text-white font-semibold mb-1">30-Day Money-Back Guarantee</h4>
                    <p className="text-slate-400 text-xs">Risk-free trial with full refund</p>
                  </div>
                </div>
                <div className="text-center">
                  <div className="dark-neon-card p-4 border border-slate-700/50">
                    <Shield className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                    <h4 className="text-white font-semibold mb-1">Enterprise Security</h4>
                    <p className="text-slate-400 text-xs">Bank-level encryption and security</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row justify-center items-center space-y-2 sm:space-y-0 sm:space-x-6 text-sm text-gray-600">
                <div className="flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-green-500" />
                  <span>14-day free trial</span>
                </div>
                <div className="flex items-center space-x-2">
                  <X className="w-4 h-4 text-green-500" />
                  <span>No credit card required</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-green-500" />
                  <span>Cancel anytime</span>
                </div>
              </div>
            )}
          </div>
        </div>
    </div>
  );
};

export default Plans;
