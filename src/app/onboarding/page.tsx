'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  CheckCircle, 
  ArrowRight, 
  Settings, 
  Key, 
  User,
  Zap,
  Shield
} from 'lucide-react';
import UserStockXSetup from '@/components/UserStockXSetup';

export default function OnboardingPage() {
  const [userId, setUserId] = useState<string>('');
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [stockXSetupComplete, setStockXSetupComplete] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Get user ID from cookie or localStorage
    const getUserId = () => {
      // Try localStorage first
      const storedUserId = localStorage.getItem('siteUserId');
      if (storedUserId) {
        return storedUserId;
      }

      // Try cookies
      const cookies = document.cookie;
      const siteUserIdMatch = cookies.match(/site-user-id=([^;]+)/);
      if (siteUserIdMatch) {
        return decodeURIComponent(siteUserIdMatch[1]);
      }

      // Generate a new user ID
      return 'user-' + Math.random().toString(36).substring(2, 15);
    };

    setUserId(getUserId());
  }, []);

  const handleStepComplete = (stepNumber: number) => {
    setCompletedSteps(prev => [...prev, stepNumber]);
    if (stepNumber < 3) {
      setCurrentStep(stepNumber + 1);
    }
  };

  const handleStockXSetupComplete = (isComplete: boolean) => {
    setStockXSetupComplete(isComplete);
    if (isComplete) {
      handleStepComplete(2);
    }
  };

  const handleFinishOnboarding = () => {
    // Mark onboarding as complete
    localStorage.setItem('onboardingComplete', 'true');
    
    // Redirect to dashboard
    router.push('/dashboard');
  };

  const steps = [
    {
      id: 1,
      title: 'Welcome to Flip Flow',
      description: 'Let\'s get you set up with your resale dashboard',
      icon: User,
      content: (
        <div className="space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full mb-4">
              <User className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-slate-200 mb-2">Welcome to Flip Flow</h2>
            <p className="text-slate-400">
              Your comprehensive resale dashboard for tracking purchases, sales, and market opportunities.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-slate-800/50 border border-slate-600/50 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <Zap className="w-5 h-5 text-yellow-400" />
                <h3 className="font-semibold text-slate-200">Quick Setup</h3>
              </div>
              <p className="text-sm text-slate-400">
                Get started in minutes with our guided setup process
              </p>
            </div>

            <div className="bg-slate-800/50 border border-slate-600/50 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <Shield className="w-5 h-5 text-green-400" />
                <h3 className="font-semibold text-slate-200">Secure & Private</h3>
              </div>
              <p className="text-sm text-slate-400">
                Your data is encrypted and stored securely
              </p>
            </div>
          </div>

          <div className="flex justify-center">
            <button
              onClick={() => handleStepComplete(1)}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white rounded-lg font-medium transition-all flex items-center gap-2"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )
    },
    {
      id: 2,
      title: 'StockX Integration',
      description: 'Configure your StockX API access for enhanced features',
      icon: Key,
      content: (
        <div className="space-y-6">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-green-500 to-blue-500 rounded-full mb-4">
              <Key className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-slate-200 mb-2">StockX Integration</h2>
            <p className="text-slate-400">
              Connect your StockX account for market data, inventory management, and automated features.
            </p>
          </div>

          <UserStockXSetup 
            userId={userId}
            onSetupComplete={handleStockXSetupComplete}
          />

          <div className="flex justify-between">
            <button
              onClick={() => setCurrentStep(1)}
              className="px-4 py-2 text-slate-400 hover:text-slate-200 transition-colors"
            >
              ← Back
            </button>
            
            <button
              onClick={() => handleStepComplete(2)}
              disabled={!stockXSetupComplete}
              className="px-6 py-3 bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all flex items-center gap-2"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )
    },
    {
      id: 3,
      title: 'You\'re All Set!',
      description: 'Your dashboard is ready to use',
      icon: CheckCircle,
      content: (
        <div className="space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full mb-4">
              <CheckCircle className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-slate-200 mb-2">Setup Complete!</h2>
            <p className="text-slate-400">
              Your Flip Flow dashboard is ready. Start tracking your resale business and discover opportunities.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-slate-800/50 border border-slate-600/50 rounded-lg p-4 text-center">
              <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <User className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="font-semibold text-slate-200 mb-1">Profile Ready</h3>
              <p className="text-sm text-slate-400">Your account is configured</p>
            </div>

            <div className="bg-slate-800/50 border border-slate-600/50 rounded-lg p-4 text-center">
              <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <Key className="w-6 h-6 text-green-400" />
              </div>
              <h3 className="font-semibold text-slate-200 mb-1">StockX Connected</h3>
              <p className="text-sm text-slate-400">API integration active</p>
            </div>

            <div className="bg-slate-800/50 border border-slate-600/50 rounded-lg p-4 text-center">
              <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <Settings className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="font-semibold text-slate-200 mb-1">Dashboard Ready</h3>
              <p className="text-sm text-slate-400">All features available</p>
            </div>
          </div>

          <div className="flex justify-center">
            <button
              onClick={handleFinishOnboarding}
              className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-lg font-medium transition-all flex items-center gap-2 text-lg"
            >
              Go to Dashboard
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )
    }
  ];

  const currentStepData = steps.find(step => step.id === currentStep);

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-4xl mx-auto p-6">
        {/* Progress Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-slate-100">Setup Your Account</h1>
            <div className="text-sm text-slate-400">
              Step {currentStep} of {steps.length}
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-slate-700/50 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${(currentStep / steps.length) * 100}%` }}
            />
          </div>
          
          {/* Step Indicators */}
          <div className="flex justify-between mt-4">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  completedSteps.includes(step.id) 
                    ? 'bg-green-500 text-white' 
                    : currentStep === step.id
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-600 text-slate-300'
                }`}>
                  {completedSteps.includes(step.id) ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    step.id
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div className={`w-12 h-0.5 mx-2 ${
                    completedSteps.includes(step.id) ? 'bg-green-500' : 'bg-slate-600'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-slate-800/50 border border-slate-600/50 rounded-lg p-8">
          {currentStepData && currentStepData.content}
        </div>

        {/* Skip Option */}
        {currentStep < 3 && (
          <div className="mt-6 text-center">
            <button
              onClick={handleFinishOnboarding}
              className="text-slate-400 hover:text-slate-200 text-sm transition-colors"
            >
              Skip setup and go to dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
} 