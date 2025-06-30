'use client';

import React, { useState } from 'react';
import { Check, X, Zap, TrendingUp, Crown, Star, ArrowRight, Gift, Shield, Clock, Sparkles, Target, Rocket, Users, Award, Palette } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

const Plans = () => {
  const { currentTheme } = useTheme();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annually'>('monthly');
  
  // Map current theme to design version for display
  const getDesignVersion = () => {
    switch (currentTheme.name) {
      case 'Light': return 1;
      case 'Dark': return 2; 
      case 'Premium': return 3;
      default: return 1;
    }
  };

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
    <div className="min-h-screen relative ml-80">
      {/* Design Version 1 - Compact Clean & Professional */}
      {getDesignVersion() === 1 && (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 py-4 sm:py-8 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-6 sm:mb-10">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2 sm:mb-4 leading-tight">Choose Your Plan</h1>
              <p className="text-base sm:text-lg text-gray-600 mb-4 sm:mb-6 max-w-2xl mx-auto leading-relaxed">
                Scale your reselling business with our powerful tools. All plans include a 14-day free trial.
              </p>
              
              {/* Compact Billing Toggle */}
              <div className="flex items-center justify-center space-x-3 mb-4 sm:mb-6">
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
              </div>
            </div>

            {/* Compact Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-10">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className={`relative bg-white rounded-xl shadow-lg border-2 transition-all duration-300 hover:shadow-xl ${
                    plan.popular ? 'border-purple-500 ring-2 ring-purple-100 lg:scale-105' : 'border-gray-200 hover:border-purple-300'
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                      <span className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center">
                        <Star className="w-3 h-3 mr-1" />
                        Most Popular
                      </span>
                    </div>
                  )}
                  
                  <div className="p-4 sm:p-6">
                    <div className="flex items-center mb-3">
                      <div className={`p-2 rounded-lg ${plan.color} bg-opacity-10 mr-3 flex-shrink-0`}>
                        <plan.icon className={`w-5 h-5 sm:w-6 sm:h-6 ${plan.color.replace('bg-', 'text-')}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg sm:text-xl font-bold text-gray-900 truncate">{plan.name}</h3>
                        <p className="text-gray-600 text-xs leading-tight">{plan.description}</p>
                      </div>
                    </div>

                    <div className="mb-4">
                      <div className="flex items-baseline">
                        <span className="text-2xl sm:text-3xl font-bold text-gray-900">
                          ${billingPeriod === 'monthly' ? plan.monthlyPrice : Math.floor(plan.annualPrice / 12)}
                        </span>
                        <span className="text-gray-600 ml-1 text-sm">/month</span>
                      </div>
                      {billingPeriod === 'annually' && (
                        <p className="text-xs text-green-600 mt-1">Billed annually (${plan.annualPrice}/year)</p>
                      )}
                    </div>

                    <ul className="space-y-2 mb-6">
                      {plan.features.slice(0, 5).map((feature, index) => (
                        <li key={index} className="flex items-start">
                          <Check className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-700 text-sm leading-relaxed">{feature}</span>
                        </li>
                      ))}
                      {plan.features.length > 5 && (
                        <li className="text-xs text-purple-600 font-medium">
                          +{plan.features.length - 5} more features
                        </li>
                      )}
                    </ul>

                    <button className={`w-full py-2.5 sm:py-3 px-4 rounded-lg font-semibold text-sm transition-all duration-300 ${
                      plan.popular
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 shadow-lg hover:shadow-xl transform hover:scale-105'
                        : 'bg-gray-900 text-white hover:bg-gray-800 shadow-md hover:shadow-lg'
                    }`}>
                      Start Free Trial
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Compact Trust Indicators */}
            <div className="text-center">
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
            </div>
          </div>
        </div>
      )}

      {/* Design Version 2 - Compact Dark Premium */}
      {getDesignVersion() === 2 && (
        <div className="min-h-screen bg-slate-950 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-purple-900/20 to-pink-900/20"></div>
          <div className="absolute inset-0">
            <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl"></div>
          </div>
          
          <div className="relative z-10 py-6 sm:py-12 px-4">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-8 sm:mb-12">
                <div className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-full border border-blue-500/30 mb-4">
                  <Sparkles className="w-3 h-3 text-blue-400 mr-2" />
                  <span className="text-blue-300 text-sm font-medium">Premium Pricing Plans</span>
                </div>
                
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-blue-100 to-purple-100 mb-4 leading-tight">
                  Elevate Your<br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
                    Reselling Game
                  </span>
                </h1>
                
                <p className="text-lg text-slate-300 mb-6 max-w-3xl mx-auto leading-relaxed">
                  Join thousands of successful resellers who trust FlipFlow to maximize their profits.{' '}
                  <span className="text-blue-400 font-semibold">Start your 14-day free trial today.</span>
                </p>
                
                <div className="flex items-center justify-center mb-8">
                  <div className="relative bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-1.5">
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => setBillingPeriod('monthly')}
                        className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ${
                          billingPeriod === 'monthly'
                            ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Monthly
                      </button>
                      <button
                        onClick={() => setBillingPeriod('annually')}
                        className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 relative ${
                          billingPeriod === 'annually'
                            ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Annually
                        <span className="absolute -top-1 -right-1 bg-gradient-to-r from-green-400 to-emerald-400 text-slate-900 text-xs font-bold px-1.5 py-0.5 rounded-full">
                          17% OFF
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-12">
                {plans.map((plan, index) => (
                  <div
                    key={plan.id}
                    className={`relative group ${plan.popular ? 'lg:scale-105' : ''}`}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${
                      plan.popular ? 'from-purple-500/20 to-pink-500/20' : 'from-slate-800/50 to-slate-900/50'
                    } rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-500`}></div>
                    
                    <div className={`relative bg-slate-900/80 backdrop-blur-xl border rounded-2xl transition-all duration-500 group-hover:border-opacity-100 ${
                      plan.popular ? 'border-purple-500/50 shadow-xl shadow-purple-500/25' : 'border-slate-700/50 group-hover:border-blue-500/50'
                    }`}>
                      
                      {plan.popular && (
                        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-20">
                          <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-1.5 rounded-full text-xs font-bold flex items-center shadow-lg">
                            <Crown className="w-3 h-3 mr-1" />
                            MOST POPULAR
                          </div>
                        </div>
                      )}
                      
                      <div className="p-5 sm:p-6">
                        <div className="text-center mb-6">
                          <div className={`inline-flex p-3 rounded-xl mb-3 ${
                            plan.popular ? 'bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30' : 'bg-slate-800/50 border border-slate-700/50'
                          }`}>
                            <plan.icon className={`w-6 h-6 ${plan.popular ? 'text-purple-400' : 'text-blue-400'}`} />
                          </div>
                          
                          <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                          <p className="text-slate-400 text-sm">{plan.description}</p>
                        </div>

                        <div className="text-center mb-6">
                          <div className="flex items-baseline justify-center mb-2">
                            <span className="text-3xl sm:text-4xl font-black text-white">
                              ${billingPeriod === 'monthly' ? plan.monthlyPrice : Math.floor(plan.annualPrice / 12)}
                            </span>
                            <span className="text-slate-400 ml-2 text-lg">/mo</span>
                          </div>
                          {billingPeriod === 'annually' && (
                            <p className="text-green-400 text-sm font-semibold">${plan.annualPrice} billed annually</p>
                          )}
                        </div>

                        <div className="space-y-3 mb-6">
                          {plan.features.slice(0, 5).map((feature, featureIndex) => (
                            <div key={featureIndex} className="flex items-start">
                              <div className="flex-shrink-0 w-4 h-4 bg-gradient-to-br from-green-400 to-emerald-400 rounded-full flex items-center justify-center mr-3 mt-0.5">
                                <Check className="w-2.5 h-2.5 text-slate-900" />
                              </div>
                              <span className="text-slate-300 text-sm">{feature}</span>
                            </div>
                          ))}
                          {plan.features.length > 5 && (
                            <div className="text-center">
                              <span className="text-blue-400 text-sm font-semibold">+{plan.features.length - 5} more features</span>
                            </div>
                          )}
                        </div>

                        <button className={`w-full py-3 px-5 rounded-xl font-bold text-sm transition-all duration-300 transform hover:scale-105 ${
                          plan.popular
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-xl shadow-purple-500/25 hover:shadow-2xl hover:shadow-purple-500/40'
                            : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-xl shadow-blue-500/25 hover:shadow-2xl hover:shadow-blue-500/40'
                        }`}>
                          Start 14-Day Free Trial
                          <ArrowRight className="w-4 h-4 inline ml-2" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid md:grid-cols-3 gap-4 sm:gap-6">
                <div className="text-center">
                  <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4">
                    <Shield className="w-6 h-6 text-green-400 mx-auto mb-2" />
                    <h4 className="text-white font-semibold mb-1">Enterprise Security</h4>
                    <p className="text-slate-400 text-xs">Bank-level encryption and security</p>
                  </div>
                </div>
                <div className="text-center">
                  <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4">
                    <Users className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                    <h4 className="text-white font-semibold mb-1">10,000+ Users</h4>
                    <p className="text-slate-400 text-xs">Trusted by resellers worldwide</p>
                  </div>
                </div>
                <div className="text-center">
                  <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4">
                    <Clock className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                    <h4 className="text-white font-semibold mb-1">24/7 Support</h4>
                    <p className="text-slate-400 text-xs">Always here when you need us</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Design Version 3 - Compact Revolutionary Creative */}
      {getDesignVersion() === 3 && (
        <div className="min-h-screen relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-900 via-purple-900 to-pink-900">
            <div className="absolute inset-0 opacity-30">
              <div className="absolute animate-pulse top-1/4 left-1/4 w-64 h-64 bg-cyan-400 rounded-full mix-blend-multiply filter blur-xl"></div>
              <div className="absolute animate-pulse top-1/3 right-1/4 w-64 h-64 bg-purple-400 rounded-full mix-blend-multiply filter blur-xl" style={{animationDelay: '2s'}}></div>
              <div className="absolute animate-pulse bottom-1/4 left-1/3 w-64 h-64 bg-pink-400 rounded-full mix-blend-multiply filter blur-xl" style={{animationDelay: '4s'}}></div>
            </div>
          </div>
          
          <div className="relative z-10 py-6 sm:py-12 px-4">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-10 sm:mb-16">
                <div className="inline-block mb-6">
                  <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-cyan-400 to-purple-400 rounded-full mb-4 mx-auto shadow-2xl">
                    <Rocket className="w-8 h-8 text-white" />
                  </div>
                  <div className="bg-white/10 backdrop-blur-xl rounded-full px-4 py-2 border border-white/20">
                    <span className="text-white/90 font-semibold text-sm tracking-wide">REVOLUTIONARY PRICING</span>
                  </div>
                </div>
                
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black mb-6 leading-none">
                  <span className="block text-transparent bg-clip-text bg-gradient-to-r from-white to-purple-200">Transform</span>
                  <span className="block text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 relative">
                    Your Business
                    <div className="absolute -inset-4 bg-gradient-to-r from-cyan-400/20 to-pink-400/20 blur-2xl -z-10"></div>
                  </span>
                </h1>
                
                <p className="text-lg sm:text-xl text-white/80 mb-8 max-w-4xl mx-auto font-light leading-relaxed">
                  Join the future of reselling with our cutting-edge platform that{' '}
                  <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">revolutionizes</span>{' '}
                  how you track, analyze, and grow your business.
                </p>
              </div>

              <div className="flex justify-center mb-10 sm:mb-12">
                <div className="relative">
                  <div className="bg-black/20 backdrop-blur-2xl rounded-2xl p-2 border border-white/10">
                    <div className="flex items-center">
                      <button
                        onClick={() => setBillingPeriod('monthly')}
                        className={`px-6 py-3 rounded-xl font-bold text-sm transition-all duration-500 relative overflow-hidden ${
                          billingPeriod === 'monthly' ? 'text-white' : 'text-white/60 hover:text-white/90'
                        }`}
                      >
                        {billingPeriod === 'monthly' && (
                          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-xl"></div>
                        )}
                        <span className="relative z-10">Monthly</span>
                      </button>
                      
                      <div className="mx-3 w-px h-6 bg-white/20"></div>
                      
                      <button
                        onClick={() => setBillingPeriod('annually')}
                        className={`px-6 py-3 rounded-xl font-bold text-sm transition-all duration-500 relative overflow-hidden ${
                          billingPeriod === 'annually' ? 'text-white' : 'text-white/60 hover:text-white/90'
                        }`}
                      >
                        {billingPeriod === 'annually' && (
                          <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl"></div>
                        )}
                        <span className="relative z-10">Annually</span>
                        <div className="absolute -top-1 -right-1 bg-gradient-to-r from-yellow-400 to-orange-400 text-black text-xs font-black px-2 py-1 rounded-full shadow-lg">
                          SAVE 17%
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-3 gap-6 sm:gap-8 mb-10 sm:mb-16">
                {plans.map((plan, index) => {
                  const isPopular = plan.popular;
                  const gradients = ['from-blue-500 to-cyan-500', 'from-purple-500 to-pink-500', 'from-orange-500 to-red-500'];
                  
                  return (
                    <div key={plan.id} className={`relative group ${isPopular ? 'lg:scale-105' : ''}`}>
                      <div className={`absolute -inset-3 bg-gradient-to-r ${gradients[index]} opacity-20 group-hover:opacity-30 rounded-2xl blur-xl transition-all duration-700`}></div>
                      
                      <div className="relative">
                        <div className={`bg-white/5 backdrop-blur-2xl border border-white/20 rounded-2xl overflow-hidden transition-all duration-700 group-hover:border-white/40 group-hover:bg-white/10 ${
                          isPopular ? 'shadow-2xl shadow-purple-500/25' : ''
                        }`}>
                          
                          {isPopular && (
                            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-20">
                              <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-full font-black text-xs shadow-2xl flex items-center">
                                <Award className="w-3 h-3 mr-1" />
                                CHAMPION CHOICE
                              </div>
                            </div>
                          )}
                          
                          <div className="relative p-6 pb-3">
                            <div className="text-center">
                              <div className={`inline-flex p-4 rounded-2xl mb-4 bg-gradient-to-br ${gradients[index]}/20 border border-white/20`}>
                                <plan.icon className="w-8 h-8 text-white" />
                              </div>
                              
                              <h3 className="text-2xl font-black text-white mb-2">{plan.name}</h3>
                              <p className="text-white/70 text-sm font-medium">{plan.description}</p>
                            </div>
                          </div>

                          <div className="px-6 py-4 text-center">
                            <div className="relative inline-block">
                              <div className={`absolute inset-0 bg-gradient-to-r ${gradients[index]} opacity-10 rounded-xl blur-xl`}></div>
                              <div className="relative bg-black/30 backdrop-blur-xl rounded-xl p-4 border border-white/10">
                                <div className="flex items-baseline justify-center">
                                  <span className="text-4xl sm:text-5xl font-black text-white">
                                    ${billingPeriod === 'monthly' ? plan.monthlyPrice : Math.floor(plan.annualPrice / 12)}
                                  </span>
                                  <span className="text-white/60 ml-2 text-lg font-semibold">/month</span>
                                </div>
                                {billingPeriod === 'annually' && (
                                  <p className="text-green-400 font-bold text-sm mt-1">${plan.annualPrice} per year</p>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="px-6 py-4">
                            <div className="space-y-3">
                              {plan.features.slice(0, 4).map((feature, featureIndex) => (
                                <div key={featureIndex} className="flex items-start group-hover:translate-x-1 transition-transform duration-300" style={{ transitionDelay: `${featureIndex * 50}ms` }}>
                                  <div className={`flex-shrink-0 w-5 h-5 bg-gradient-to-br ${gradients[index]} rounded-full flex items-center justify-center mr-3 mt-0.5 shadow-lg`}>
                                    <Check className="w-3 h-3 text-white font-bold" />
                                  </div>
                                  <span className="text-white/90 text-sm font-medium">{feature}</span>
                                </div>
                              ))}
                              
                              {plan.features.length > 4 && (
                                <div className="pt-2 border-t border-white/10">
                                  <span className={`text-transparent bg-clip-text bg-gradient-to-r ${gradients[index]} font-bold text-sm`}>
                                    Plus {plan.features.length - 4} more premium features
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="p-6 pt-3">
                            <button className={`w-full py-4 px-6 rounded-xl font-black text-sm transition-all duration-500 transform hover:scale-105 hover:-translate-y-1 relative overflow-hidden group/btn bg-gradient-to-r ${gradients[index]} text-white shadow-2xl`}>
                              <span className="relative z-10 flex items-center justify-center">
                                Launch Free Trial
                                <Rocket className="w-4 h-4 ml-2 group-hover/btn:animate-bounce" />
                              </span>
                              <div className="absolute inset-0 bg-white/20 transform scale-x-0 group-hover/btn:scale-x-100 transition-transform duration-300 origin-left"></div>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="text-center">
                <div className="bg-black/20 backdrop-blur-2xl rounded-2xl p-8 border border-white/10">
                  <div className="max-w-3xl mx-auto">
                    <h3 className="text-2xl sm:text-3xl font-black text-white mb-6">
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">Zero Risk</span> 14-Day Trial
                    </h3>
                    
                    <div className="grid md:grid-cols-3 gap-4 sm:gap-6 mb-6">
                      <div className="text-center">
                        <div className="bg-gradient-to-br from-green-400/20 to-emerald-400/20 rounded-xl p-4 border border-green-400/30">
                          <Shield className="w-8 h-8 text-green-400 mx-auto mb-2" />
                          <h4 className="text-white font-bold text-lg mb-1">Protected</h4>
                          <p className="text-white/70 text-sm">Enterprise-grade security</p>
                        </div>
                      </div>
                      
                      <div className="text-center">
                        <div className="bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-xl p-4 border border-blue-400/30">
                          <Target className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                          <h4 className="text-white font-bold text-lg mb-1">Proven</h4>
                          <p className="text-white/70 text-sm">10,000+ successful users</p>
                        </div>
                      </div>
                      
                      <div className="text-center">
                        <div className="bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-xl p-4 border border-purple-400/30">
                          <Sparkles className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                          <h4 className="text-white font-bold text-lg mb-1">Premium</h4>
                          <p className="text-white/70 text-sm">Award-winning platform</p>
                        </div>
                      </div>
                    </div>
                    
                    <p className="text-lg text-white/80 font-light">No commitments. No hidden fees. Just pure growth potential.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Plans;
