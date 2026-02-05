'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, X, Star, ArrowRight, Shield, Clock, Sparkles, CheckCircle, ArrowLeft } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { PLANS, type PlanId } from '../lib/billing/plans';
import { readMockBillingState, writeMockBillingState, type BillingInterval } from '../lib/billing/mockBillingState';

const Plans = () => {
  const { currentTheme } = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [billingPeriod, setBillingPeriod] = useState<BillingInterval>(() => readMockBillingState().interval);
  const [currentPlanId, setCurrentPlanId] = useState<PlanId>(() => readMockBillingState().planId);
  
  // Dynamic theme detection for consistent neon styling
  const isNeon = currentTheme.name === 'Neon';

  const fromBilling = useMemo(() => searchParams.get('from') === 'billing', [searchParams]);

  // Keep local state in sync with persisted mock state (for refreshes / multi-tab).
  useEffect(() => {
    const state = readMockBillingState();
    setBillingPeriod(state.interval);
    setCurrentPlanId(state.planId);
  }, []);

  useEffect(() => {
    // Persist interval changes even if user doesn't switch plan.
    writeMockBillingState({ planId: currentPlanId, interval: billingPeriod });
  }, [billingPeriod, currentPlanId]);

  const handleSelectPlan = (planId: PlanId) => {
    setCurrentPlanId(planId);
    writeMockBillingState({ planId, interval: billingPeriod });
    if (fromBilling) {
      router.push('/dashboard?section=billing');
    } else {
      alert(`Mock: switched to ${PLANS.find((p) => p.id === planId)?.name ?? planId}`);
    }
  };

  return (
    <div className={`relative overflow-hidden min-h-screen py-8 sm:py-12 px-4 flex flex-col ${currentTheme.colors.background}`}>
        {/* Neon theme background effects */}
        {isNeon && (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/20 via-slate-900/50 to-emerald-900/20"></div>
            <div className="absolute inset-0">
              <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
            </div>
          </>
        )}
        
        <div className="relative z-10 max-w-7xl mx-auto flex-1 flex flex-col">
          {/* Header Section */}
          <div className="text-center mb-3 sm:mb-4">
            {fromBilling && (
              <div className="flex justify-center mb-3">
                <button
                  onClick={() => router.push('/dashboard?section=billing')}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    isNeon
                      ? 'bg-white/5 border-cyan-500/20 text-white hover:bg-white/10'
                      : 'bg-white border-gray-200 text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Billing
                </button>
              </div>
            )}
            {isNeon && (
              <div className="inline-flex items-center px-3 py-1 bg-gradient-to-r from-cyan-600/20 to-emerald-600/20 rounded-full border border-cyan-500/30 mb-2 backdrop-blur-xl">
                <Sparkles className="w-3 h-3 text-cyan-400 mr-1" />
                <span className="text-cyan-300 text-xs font-medium">Premium Pricing Plans</span>
              </div>
            )}
            
            <h1 className={`text-xl sm:text-2xl lg:text-3xl font-bold mb-1 sm:mb-2 leading-tight ${
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
            
            <p className={`text-sm sm:text-base mb-1 max-w-4xl mx-auto leading-tight ${
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
              <p className="text-sm mb-2 max-w-4xl mx-auto leading-tight text-center">
                <span className="text-cyan-400 font-semibold">Start your 14-day free trial today.</span>
              </p>
            )}
            
            {/* Billing Toggle */}
            <div className="flex items-center justify-center space-x-3 mb-2 pt-2">
              {isNeon ? (
                <div className="relative">
                  {/* 17% OFF Badge positioned above the Annually button */}
                  <div className="absolute -top-8 right-4 z-20">
                    <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 text-slate-900 text-xs font-bold px-2 py-1 rounded-full shadow-lg border border-emerald-300/50">
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
          <div className="relative flex-1 flex items-center py-8 sm:py-12">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 w-full">
              {PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className={`relative group transition-all duration-300 ${
                    plan.popular ? 'lg:scale-105' : ''
                  } ${isNeon ? 'hover:transform hover:scale-105' : ''}`}
                >
                  {/* Most Popular Badge - Outside the card to prevent clipping */}
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-[100]">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center shadow-2xl whitespace-nowrap ${
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
                  
                  <div className="p-3 sm:p-4">
                    {/* Plan Header */}
                    <div className="flex items-center mb-2">
                      <div className={`p-1.5 rounded-lg mr-2 flex-shrink-0 ${
                        isNeon 
                          ? `${plan.popular ? 'bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30' : 'bg-slate-800/50 border border-slate-700/50'}` 
                          : `${plan.color} bg-opacity-10`
                      }`}>
                        <plan.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${
                          isNeon 
                            ? `${plan.popular ? 'text-cyan-400' : 'text-emerald-400'}` 
                            : plan.color.replace('bg-', 'text-')
                        }`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className={`text-base sm:text-lg font-bold truncate ${
                          isNeon ? 'text-white' : 'text-gray-900'
                        }`}>{plan.name}</h3>
                        <p className={`text-xs leading-tight ${
                          isNeon ? 'text-slate-400' : 'text-gray-600'
                        }`}>{plan.description}</p>
                      </div>
                    </div>

                    {/* Pricing */}
                    <div className="mb-3">
                      <div className="flex items-baseline">
                        <span className={`text-xl sm:text-2xl font-bold ${
                          isNeon ? 'text-white' : 'text-gray-900'
                        }`}>
                          ${billingPeriod === 'monthly' ? plan.monthlyPrice : Math.floor(plan.annualPrice / 12)}
                        </span>
                        <span className={`ml-1 text-xs ${
                          isNeon ? 'text-slate-400' : 'text-gray-600'
                        }`}>/month</span>
                      </div>
                      {billingPeriod === 'annually' && (
                        <p className={`text-xs mt-0.5 font-semibold ${
                          isNeon ? 'text-emerald-400' : 'text-green-600'
                        }`}>
                          {isNeon ? `$${plan.annualPrice} billed annually` : `Billed annually ($${plan.annualPrice}/year)`}
                        </p>
                      )}
                    </div>

                    {/* Features */}
                    <ul className="space-y-1.5 mb-4">
                      {plan.features.slice(0, 3).map((feature, index) => (
                        <li key={index} className="flex items-start">
                          {isNeon ? (
                            <div className="flex-shrink-0 w-3.5 h-3.5 bg-gradient-to-br from-emerald-400 to-cyan-400 rounded-full flex items-center justify-center mr-2 mt-0.5">
                              <Check className="w-2 h-2 text-slate-900" />
                            </div>
                          ) : (
                            <Check className="w-3.5 h-3.5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                          )}
                          <span className={`text-xs leading-tight ${
                            isNeon ? 'text-slate-300' : 'text-gray-700'
                          }`}>{feature}</span>
                        </li>
                      ))}
                      {plan.features.length > 3 && (
                        <li className={`text-xs font-medium ${
                          isNeon ? 'text-center' : ''
                        }`}>
                          <span className={isNeon ? 'text-cyan-400' : 'text-purple-600'}>
                            +{plan.features.length - 3} more features
                          </span>
                        </li>
                      )}
                    </ul>

                    {/* CTA Button */}
                    {plan.id === currentPlanId ? (
                      <button
                        disabled
                        className={`w-full py-2 sm:py-2.5 px-3 rounded-lg font-semibold text-xs border transition-all duration-300 cursor-not-allowed ${
                          isNeon
                            ? 'bg-white/5 text-slate-200 border-cyan-500/20'
                            : 'bg-gray-50 text-gray-700 border-gray-200'
                        }`}
                      >
                        Current Plan
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSelectPlan(plan.id)}
                        className={`w-full py-2 sm:py-2.5 px-3 rounded-lg font-semibold text-xs transition-all duration-300 ${
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
                        }`}
                      >
                        Switch to {plan.name}
                        <ArrowRight className="w-3 h-3 inline ml-1" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            </div>
          </div>

          {/* Trust Indicators */}
          <div className="text-center mt-auto pb-8 sm:pb-12">
            {isNeon ? (
              <div className="grid md:grid-cols-3 gap-4 sm:gap-6 max-w-4xl mx-auto">
                <div className="text-center">
                  <div className="dark-neon-card p-6 sm:p-8 border border-slate-700/50 hover:border-cyan-500/30 transition-all duration-300">
                    <TrendingUp className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                    <h4 className="text-white font-semibold text-base mb-2">Real-Time Tracking</h4>
                    <p className="text-slate-400 text-sm">Live profit analytics</p>
                  </div>
                </div>
                <div className="text-center">
                  <div className="dark-neon-card p-6 sm:p-8 border border-slate-700/50 hover:border-cyan-500/30 transition-all duration-300">
                    <CheckCircle className="w-8 h-8 text-cyan-400 mx-auto mb-3" />
                    <h4 className="text-white font-semibold text-base mb-2">30-Day Guarantee</h4>
                    <p className="text-slate-400 text-sm">Risk-free trial</p>
                  </div>
                </div>
                <div className="text-center">
                  <div className="dark-neon-card p-6 sm:p-8 border border-slate-700/50 hover:border-cyan-500/30 transition-all duration-300">
                    <Shield className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                    <h4 className="text-white font-semibold text-base mb-2">Enterprise Security</h4>
                    <p className="text-slate-400 text-sm">Bank-level encryption</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row justify-center items-center space-y-1 sm:space-y-0 sm:space-x-4 text-xs text-gray-600">
                <div className="flex items-center space-x-1">
                  <Shield className="w-3 h-3 text-green-500" />
                  <span>14-day free trial</span>
                </div>
                <div className="flex items-center space-x-1">
                  <X className="w-3 h-3 text-green-500" />
                  <span>No credit card required</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Clock className="w-3 h-3 text-green-500" />
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
