'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
import Image from 'next/image';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { TrendingUp, BarChart3, DollarSign, Target, CheckCircle, Mail } from 'lucide-react';

const LoadingPage = () => {
  const { currentTheme } = useTheme();
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [gmailSyncStatus, setGmailSyncStatus] = useState<'checking' | 'syncing' | 'completed' | 'skipped'>('checking');

  const getGmailStepText = () => {
    switch (gmailSyncStatus) {
      case 'checking': return "Checking Gmail connection...";
      case 'syncing': return "Syncing latest purchase emails...";
      case 'completed': return "Gmail sync completed!";
      case 'skipped': return "Gmail sync skipped (not connected)";
      default: return "Checking email sync...";
    }
  };

  const loadingSteps = [
    { 
      icon: TrendingUp, 
      text: "Initializing analytics engine...", 
      color: currentTheme.name === 'Neon' ? 'text-emerald-400' : 'text-purple-400' 
    },
    { 
      icon: Mail, 
      text: getGmailStepText(), 
      color: currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-400' 
    },
    { 
      icon: BarChart3, 
      text: "Loading market data...", 
      color: currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-pink-400' 
    },
    { 
      icon: DollarSign, 
      text: "Calculating profit metrics...", 
      color: currentTheme.name === 'Neon' ? 'text-blue-400' : 'text-indigo-400' 
    },
    { 
      icon: Target, 
      text: "Setting up your dashboard...", 
      color: currentTheme.name === 'Neon' ? 'text-purple-400' : 'text-pink-400' 
    },
    { 
      icon: CheckCircle, 
      text: "Ready to launch!", 
      color: currentTheme.name === 'Neon' ? 'text-emerald-400' : 'text-green-400' 
    }
  ];

  useEffect(() => {
    // Trigger fade-in animation after component mounts
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const handleNavigation = (path: string) => {
    setIsTransitioning(true);
    setIsVisible(false);
    setTimeout(() => {
      router.push(path);
    }, 300);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            handleNavigation('/dashboard');
          }, 500);
          return 100;
        }
        return prev + 2;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [router]);

  // Gmail sync logic when we reach step 1 (Gmail step)
  useEffect(() => {
    if (currentStep === 1) {
      performGmailSync();
    }
  }, [currentStep]);

  const performGmailSync = async () => {
    try {
      setGmailSyncStatus('checking');
      
      // First check if Gmail is connected
      const statusResponse = await fetch('/api/gmail/status');
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        
        if (statusData.connected && !statusData.needsReconnect) {
          setGmailSyncStatus('syncing');
          console.log('🔄 LOADING: Starting Gmail sync during startup...');
          
          // Trigger Gmail sync
          const syncResponse = await fetch('/api/gmail/purchases?limit=50', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          });
          
          if (syncResponse.ok) {
            const syncData = await syncResponse.json();
            console.log(`✅ LOADING: Gmail sync completed - found ${syncData.purchases?.length || 0} purchases`);
            setGmailSyncStatus('completed');
          } else {
            console.log('⚠️ LOADING: Gmail sync failed, but continuing...');
            setGmailSyncStatus('skipped');
          }
        } else {
          console.log('📭 LOADING: Gmail not connected, skipping sync');
          setGmailSyncStatus('skipped');
        }
      } else {
        console.log('📭 LOADING: Gmail status check failed, skipping sync');
        setGmailSyncStatus('skipped');
      }
    } catch (error) {
      console.error('❌ LOADING: Gmail sync error:', error);
      setGmailSyncStatus('skipped');
    }
  };

  useEffect(() => {
    const stepInterval = setInterval(() => {
      setCurrentStep(prev => {
        // Special handling for Gmail step - wait for sync to complete
        if (prev === 1 && gmailSyncStatus === 'syncing') {
          return prev; // Stay on Gmail step while syncing
        }
        
        if (prev >= loadingSteps.length - 1) {
          clearInterval(stepInterval);
          return prev;
        }
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(stepInterval);
  }, [loadingSteps.length, gmailSyncStatus]);

  return (
    <div className={`min-h-screen ${currentTheme.colors.background} ${currentTheme.colors.bodyClass} flex items-center justify-center p-4 transition-all duration-500 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className={`absolute top-1/3 left-1/3 w-72 h-72 rounded-full blur-3xl opacity-30 animate-pulse ${
          currentTheme.name === 'Neon' 
            ? 'bg-gradient-to-r from-emerald-500 to-cyan-500' 
            : 'bg-gradient-to-r from-purple-500 to-pink-500'
        }`}></div>
        <div className={`absolute bottom-1/3 right-1/3 w-72 h-72 rounded-full blur-3xl opacity-30 animate-pulse ${
          currentTheme.name === 'Neon' 
            ? 'bg-gradient-to-r from-cyan-500 to-blue-500' 
            : 'bg-gradient-to-r from-pink-500 to-purple-500'
        }`} style={{ animationDelay: '1s' }}></div>
        
        {/* Floating particles */}
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className={`absolute w-2 h-2 rounded-full opacity-60 animate-bounce ${
              currentTheme.name === 'Neon' ? 'bg-cyan-400' : 'bg-purple-400'
            }`}
            style={{
              top: `${20 + (i * 15)}%`,
              left: `${10 + (i * 15)}%`,
              animationDelay: `${i * 0.5}s`,
              animationDuration: '2s'
            }}
          ></div>
        ))}
      </div>

      <div className="relative max-w-md w-full text-center">
        {/* Logo */}
        <div className="flex justify-center mb-8">
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

        {/* Title */}
        <h1 className={`text-3xl font-bold ${currentTheme.colors.textPrimary} mb-2`}>
          Flip Flow
        </h1>
        <p className={`text-lg ${currentTheme.colors.textSecondary} mb-12`}>
          Revolutionary Analytics Suite
        </p>

        {/* Loading Steps */}
        <div className="space-y-6 mb-12">
          {loadingSteps.map((step, index) => {
            const IconComponent = step.icon;
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;
            
            return (
              <div 
                key={index}
                className={`flex items-center space-x-4 transition-all duration-500 ${
                  isActive || isCompleted ? 'opacity-100 scale-100' : 'opacity-30 scale-95'
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-500 ${
                  isCompleted 
                    ? currentTheme.name === 'Neon'
                      ? 'bg-gradient-to-r from-emerald-500 to-cyan-500'
                      : 'bg-gradient-to-r from-green-500 to-emerald-500'
                    : isActive
                      ? currentTheme.name === 'Neon'
                        ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border border-cyan-500/50'
                        : 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/50'
                      : 'bg-gray-500/10 border border-gray-500/20'
                } backdrop-blur-sm`}>
                  {isCompleted ? (
                    <CheckCircle className="w-6 h-6 text-white" />
                  ) : (
                    <IconComponent className={`w-6 h-6 ${
                      isActive ? step.color : 'text-gray-400'
                    } ${isActive ? 'animate-pulse' : ''}`} />
                  )}
                </div>
                
                <div className="flex-1 text-left">
                  <p className={`font-medium ${
                    isActive || isCompleted 
                      ? currentTheme.colors.textPrimary 
                      : currentTheme.colors.textSecondary
                  } transition-colors duration-500`}>
                    {step.text}
                  </p>
                </div>
                
                {isActive && (
                  <div className="flex space-x-1">
                    {[...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className={`w-2 h-2 rounded-full ${
                          currentTheme.name === 'Neon' ? 'bg-cyan-400' : 'bg-purple-400'
                        } animate-bounce`}
                        style={{ animationDelay: `${i * 0.2}s` }}
                      ></div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Progress Bar */}
        <div className="space-y-4">
          <div className={`w-full h-2 rounded-full overflow-hidden ${
            currentTheme.name === 'Neon' ? 'bg-white/10' : 'bg-gray-200'
          }`}>
            <div 
              className={`h-full rounded-full transition-all duration-300 ease-out ${
                currentTheme.name === 'Neon'
                  ? 'bg-gradient-to-r from-emerald-500 to-cyan-500'
                  : 'bg-gradient-to-r from-purple-500 to-pink-500'
              }`}
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          
          <div className="flex justify-between items-center">
            <span className={`text-sm ${currentTheme.colors.textSecondary}`}>
              Loading...
            </span>
            <span className={`text-sm font-medium ${
              currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-purple-400'
            }`}>
              {progress}%
            </span>
          </div>
        </div>

        {/* Completion Message */}
        {progress >= 100 && (
          <div className={`mt-8 p-4 rounded-xl ${
            currentTheme.name === 'Neon'
              ? 'bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-cyan-500/30'
              : 'bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30'
          } backdrop-blur-sm animate-fade-in`}>
            <div className="flex items-center justify-center space-x-2">
              <CheckCircle className={`w-5 h-5 ${
                currentTheme.name === 'Neon' ? 'text-emerald-400' : 'text-green-400'
              }`} />
              <span className={`font-medium ${currentTheme.colors.textPrimary}`}>
                Dashboard ready! Redirecting...
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoadingPage; 