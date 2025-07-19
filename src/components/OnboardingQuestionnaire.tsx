'use client';

import React, { useState, useEffect } from 'react';
import { 
  Rocket, 
  Crown, 
  Mail, 
  Edit,
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Package,
  DollarSign,
  BarChart3,
  MessageSquare,
  Search,
  Clock,
  Shield
} from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import { addDocument } from '../lib/firebase/firebaseUtils';

interface QuestionnaireData {
  stockxLevel: string;
  monthlyVolume: number;
  biggestChallenge: string;
  primaryGoal: string[];
  techComfort: string;
  timeCommitment: string;
}

interface OnboardingQuestionnaireProps {
  onComplete?: () => void;
}

const OnboardingQuestionnaire: React.FC<OnboardingQuestionnaireProps> = ({ onComplete }) => {
  const { currentTheme } = useTheme();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [showRecommendation, setShowRecommendation] = useState(false);
  const [recommendedPlan, setRecommendedPlan] = useState<'enterprise' | 'professional' | 'starter' | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<'forward' | 'backward'>('forward');
  const [boxAnimationStage, setBoxAnimationStage] = useState<'closed' | 'loading' | 'opening' | 'revealing' | 'complete'>('closed');
  
  const [formData, setFormData] = useState<QuestionnaireData>({
    stockxLevel: '',
    monthlyVolume: 25,
    biggestChallenge: '',
    primaryGoal: [],
    techComfort: '',
    timeCommitment: ''
  });

  const totalSteps = 6;

  const stockxLevels = [
    { id: 'level-1', icon: '🌱', label: 'Level 1', description: 'Just getting started' },
    { id: 'level-2', icon: '📈', label: 'Level 2', description: 'Building momentum' },
    { id: 'level-3', icon: '⭐', label: 'Level 3', description: 'Experienced seller' },
    { id: 'level-4', icon: '💎', label: 'Level 4', description: 'Power seller' },
    { id: 'level-5', icon: '👑', label: 'Level 5', description: 'Elite status' }
  ];

  const biggestChallenges = [
    { id: 'pricing', icon: <DollarSign className="w-6 h-6" />, label: 'Pricing competitively', description: 'Getting the right price' },
    { id: 'inventory', icon: <BarChart3 className="w-6 h-6" />, label: 'Inventory tracking', description: 'Managing items across platforms' },
    { id: 'customers', icon: <MessageSquare className="w-6 h-6" />, label: 'Customer management', description: 'Handling messages and inquiries' },
    { id: 'sourcing', icon: <Search className="w-6 h-6" />, label: 'Sourcing items', description: 'Finding profitable products' },
    { id: 'time', icon: <Clock className="w-6 h-6" />, label: 'Time management', description: 'Keeping up with everything' },
    { id: 'authentication', icon: <Shield className="w-6 h-6" />, label: 'Authentication concerns', description: 'Ensuring item authenticity' }
  ];

  const primaryGoals = [
    { id: 'repricing', icon: '🎯', label: 'Automate repricing', description: 'Stay competitive 24/7' },
    { id: 'analytics', icon: '📊', label: 'Track profit margins', description: 'Know your true earnings' },
    { id: 'crosslist', icon: '🔄', label: 'Cross-list faster', description: 'Sell on multiple platforms' },
    { id: 'inventory', icon: '📦', label: 'Manage inventory', description: 'Never lose track' },
    { id: 'source', icon: '🔍', label: 'Find profitable items', description: 'Data-driven sourcing' },
    { id: 'scale', icon: '🚀', label: 'Scale operations', description: 'Grow beyond limits' }
  ];

  const techComfortLevels = [
    { id: 'basic', icon: '🌟', label: 'Keep it simple', description: 'I prefer straightforward tools' },
    { id: 'intermediate', icon: '⚡', label: 'Some tech is fine', description: 'I can handle moderate complexity' },
    { id: 'advanced', icon: '🔧', label: 'Bring on the features', description: 'I love powerful tools' }
  ];

  const timeCommitments = [
    { id: '5-min', icon: '⚡', label: '5 minutes', description: 'Just the essentials' },
    { id: '15-min', icon: '📱', label: '15 minutes', description: 'Quick setup with basics' },
    { id: '30-min', icon: '💻', label: '30+ minutes', description: 'Full optimization' }
  ];

  const plans = {
    enterprise: {
      name: 'Enterprise',
      price: '$99/month',
      icon: Crown,
      features: [
        'Full Gmail Integration',
        'Advanced Analytics Dashboard',
        'StockX API Pro Features',
        'Automated Repricing AI',
        'Priority Support',
        'Custom Integrations'
      ],
      setupTime: '30-45 minutes',
      description: 'Complete automation suite for serious sellers ready to scale.',
      boxStyle: 'bg-gradient-to-br from-gray-900 to-black border-2 border-yellow-500/30',
      accentColor: 'from-yellow-400 to-yellow-600'
    },
    professional: {
      name: 'Professional',
      price: '$49/month',
      icon: Rocket,
      features: [
        'Gmail Email Parsing',
        'Analytics Dashboard',
        'Basic Repricing Tools',
        'Inventory Management',
        'StockX API Integration'
      ],
      setupTime: '5-15 minutes',
      description: 'Great balance of automation and advanced features for experienced sellers.',
      boxStyle: 'bg-gradient-to-br from-orange-900 to-black border-2 border-orange-500/30',
      accentColor: 'from-orange-400 to-orange-600'
    },
    starter: {
      name: 'Starter',
      price: '$19/month',
      icon: Edit,
      features: [
        'Manual Data Entry',
        'Basic Tracking',
        'Simple Dashboard',
        'Email Support'
      ],
      setupTime: '2-5 minutes',
      description: 'Perfect for getting started quickly with essential features.',
      boxStyle: 'bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-gray-600/30',
      accentColor: 'from-gray-400 to-gray-600'
    }
  };

  const getVolumeBenchmark = (volume: number) => {
    if (volume <= 25) return 'Casual selling';
    if (volume <= 100) return 'Regular seller';
    if (volume <= 300) return 'High volume';
    return 'Business scale';
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1: return formData.stockxLevel !== '';
      case 2: return true; // Slider always has a value
      case 3: return formData.biggestChallenge !== '';
      case 4: return formData.primaryGoal.length > 0;
      case 5: return formData.techComfort !== '';
      case 6: return formData.timeCommitment !== '';
      default: return false;
    }
  };

  const calculateRecommendation = () => {
    // Pain point driven recommendations
    if (formData.biggestChallenge === 'pricing' || formData.biggestChallenge === 'time') {
      if (formData.monthlyVolume >= 100 || formData.stockxLevel === 'level-4' || formData.stockxLevel === 'level-5') {
        return 'enterprise';
      }
      return 'professional';
    }

    if (formData.biggestChallenge === 'inventory' && formData.monthlyVolume >= 50) {
      return 'professional';
    }

    // Enterprise triggers
    if (
      (formData.stockxLevel === 'level-4' || formData.stockxLevel === 'level-5') &&
      formData.monthlyVolume >= 100 &&
      (formData.primaryGoal.includes('scale') || formData.primaryGoal.includes('analytics') || formData.primaryGoal.includes('repricing'))
    ) {
      return 'enterprise';
    }

    // Professional triggers
    if (
      (formData.stockxLevel === 'level-2' || formData.stockxLevel === 'level-3') &&
      (formData.techComfort === 'intermediate' || formData.techComfort === 'advanced' || formData.timeCommitment !== '5-min') &&
      formData.monthlyVolume >= 26
    ) {
      return 'professional';
    }

    // Starter (default)
    return 'starter';
  };

  const handleNext = async () => {
    if (!canProceed() || isTransitioning) return;

    if (currentStep < totalSteps) {
      setIsTransitioning(true);
      setTransitionDirection('forward');
      
      setTimeout(() => {
        setCurrentStep(currentStep + 1);
        setTimeout(() => {
          setIsTransitioning(false);
        }, 225);
      }, 175);
    } else {
      // Calculate and show recommendation
      const recommendation = calculateRecommendation();
      setRecommendedPlan(recommendation);
      setShowRecommendation(true);
      
      // Start box animation sequence
      setBoxAnimationStage('loading');
      
      setTimeout(() => {
        setBoxAnimationStage('opening');
      }, 2000);
      
      setTimeout(() => {
        setBoxAnimationStage('revealing');
      }, 2800);
      
      setTimeout(() => {
        setBoxAnimationStage('complete');
      }, 3400);
      
      // Save questionnaire data if user is authenticated
      if (user) {
        saveQuestionnaireData();
      }
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1 && !isTransitioning) {
      setIsTransitioning(true);
      setTransitionDirection('backward');
      
      setTimeout(() => {
        setCurrentStep(currentStep - 1);
        setTimeout(() => {
          setIsTransitioning(false);
        }, 225);
      }, 175);
    }
  };

  const handleGoalToggle = (goalId: string) => {
    setFormData(prev => ({
      ...prev,
      primaryGoal: prev.primaryGoal.includes(goalId)
        ? prev.primaryGoal.filter(id => id !== goalId)
        : [...prev.primaryGoal, goalId]
    }));
  };

  const saveQuestionnaireData = async () => {
    if (!user) return;
    
    try {
      await addDocument('onboardingResponses', {
        userId: user.uid,
        ...formData,
        recommendedPlan,
        completedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error saving questionnaire data:', error);
    }
  };

  const restartQuestionnaire = () => {
    setCurrentStep(1);
    setShowRecommendation(false);
    setRecommendedPlan(null);
    setBoxAnimationStage('closed');
    setFormData({
      stockxLevel: '',
      monthlyVolume: 25,
      biggestChallenge: '',
      primaryGoal: [],
      techComfort: '',
      timeCommitment: ''
    });
  };

  // Shoe box unboxing animation
  if (showRecommendation && recommendedPlan) {
    const plan = plans[recommendedPlan];
    const PlanIcon = plan.icon;

    return (
      <div className={`min-h-screen ${currentTheme.colors.background} flex items-center justify-center p-6 overflow-hidden`}>
        <div className="relative w-full max-w-4xl">
          {/* Confetti particles */}
          {boxAnimationStage === 'complete' && (
            <div className="absolute inset-0 pointer-events-none">
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className="absolute animate-float-particle"
                  style={{
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                    animationDelay: `${Math.random() * 2}s`,
                    animationDuration: `${3 + Math.random() * 2}s`
                  }}
                >
                  <div className={`w-2 h-2 ${i % 3 === 0 ? 'bg-cyan-400' : i % 3 === 1 ? 'bg-emerald-400' : 'bg-yellow-400'} rounded-full opacity-60`} />
                </div>
              ))}
            </div>
          )}

          {/* Main content */}
          <div className="relative z-10">
            {/* Loading text */}
            {boxAnimationStage === 'loading' && (
              <div className="text-center mb-8 animate-fade-in">
                <p className={`text-2xl font-medium ${currentTheme.colors.textPrimary} mb-2`}>
                  Curating your perfect plan
                </p>
                <div className="flex justify-center gap-2">
                  <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            {/* Shoe box */}
            <div className="relative mx-auto w-80 h-96 perspective-1000">
              {/* Box bottom */}
              <div className={`absolute inset-0 ${plan.boxStyle} rounded-xl shadow-2xl transform-gpu transition-all duration-1000 ${
                boxAnimationStage !== 'closed' ? 'shadow-cyan-500/20' : ''
              }`}>
                {/* Inner glow effect */}
                {(boxAnimationStage === 'opening' || boxAnimationStage === 'revealing' || boxAnimationStage === 'complete') && (
                  <div className="absolute inset-0 bg-gradient-to-t from-transparent via-cyan-400/10 to-cyan-400/20 rounded-xl animate-pulse" />
                )}
              </div>

              {/* Box lid */}
              <div className={`absolute inset-x-0 top-0 h-24 ${plan.boxStyle} rounded-t-xl shadow-xl transform-gpu transition-all duration-800 origin-top ${
                boxAnimationStage === 'opening' || boxAnimationStage === 'revealing' || boxAnimationStage === 'complete' 
                  ? '-rotate-x-90 -translate-y-4' 
                  : ''
              }`} style={{ transformStyle: 'preserve-3d' }}>
                <div className="absolute inset-0 rounded-t-xl bg-gradient-to-b from-white/10 to-transparent" />
              </div>

              {/* Plan reveal */}
              {(boxAnimationStage === 'revealing' || boxAnimationStage === 'complete') && (
                <div className={`absolute inset-x-8 bottom-12 transform transition-all duration-600 ${
                  boxAnimationStage === 'complete' ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
                }`}>
                  <div className={`${currentTheme.colors.cardBackground} backdrop-blur-sm rounded-2xl p-6 border ${currentTheme.colors.border} shadow-2xl`}>
                    <div className="text-center">
                      <div className={`inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r ${plan.accentColor} rounded-full mb-4`}>
                        <PlanIcon className="w-8 h-8 text-white" />
                      </div>
                      <h3 className={`text-2xl font-bold ${currentTheme.colors.textPrimary} mb-1`}>{plan.name}</h3>
                      <p className={`text-3xl font-bold bg-gradient-to-r ${plan.accentColor} bg-clip-text text-transparent mb-3`}>
                        {plan.price}
                      </p>
                      <p className={`text-sm ${currentTheme.colors.textSecondary}`}>{plan.description}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Features and actions */}
            {boxAnimationStage === 'complete' && (
              <div className="mt-12 animate-fade-in-up">
                {/* Features */}
                <div className="grid md:grid-cols-2 gap-4 mb-8 max-w-2xl mx-auto">
                  {plan.features.map((feature, index) => (
                    <div key={index} className="flex items-center gap-2 animate-fade-in-up" style={{ animationDelay: `${index * 50}ms` }}>
                      <Check className={`w-5 h-5 text-cyan-400 flex-shrink-0`} />
                      <span className={`${currentTheme.colors.textSecondary}`}>{feature}</span>
                    </div>
                  ))}
                </div>

                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button
                    onClick={() => onComplete?.()}
                    className={`px-6 py-3 bg-gradient-to-r ${plan.accentColor} hover:opacity-90 text-white rounded-lg font-medium transition-all flex items-center justify-center gap-2 transform hover:scale-105`}
                  >
                    Start 14-Day Free Trial of {plan.name}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={restartQuestionnaire}
                    className={`px-6 py-3 ${currentTheme.colors.cardBackground} ${currentTheme.colors.textSecondary} hover:${currentTheme.colors.textPrimary} border ${currentTheme.colors.border} rounded-lg font-medium transition-all flex items-center justify-center gap-2`}
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retake Quiz
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <style jsx>{`
          @keyframes float-particle {
            0% {
              transform: translateY(0) translateX(0) scale(0);
              opacity: 0;
            }
            10% {
              opacity: 0.6;
              transform: scale(1);
            }
            100% {
              transform: translateY(-100px) translateX(${Math.random() > 0.5 ? '' : '-'}${Math.random() * 50}px) scale(0.5);
              opacity: 0;
            }
          }
          
          @keyframes fade-in {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
          
          @keyframes fade-in-up {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          
          .animate-float-particle {
            animation: float-particle 3s ease-out infinite;
          }
          
          .animate-fade-in {
            animation: fade-in 0.5s ease-out;
          }
          
          .animate-fade-in-up {
            animation: fade-in-up 0.5s ease-out;
          }
          
          .perspective-1000 {
            perspective: 1000px;
          }
          
          .-rotate-x-90 {
            transform: rotateX(-90deg);
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${currentTheme.colors.background} flex items-center justify-center p-6`}>
      <div className={`max-w-2xl w-full ${currentTheme.colors.cardBackground} backdrop-blur-sm rounded-2xl p-8 border ${currentTheme.colors.border}`}>
        {/* Header */}
        <div className="text-center mb-8">
          <div className={`inline-flex items-center justify-center w-16 h-16 ${currentTheme.colors.primary} rounded-full mb-4`}>
            <Rocket className="w-8 h-8 text-white" />
          </div>
          <h1 className={`text-3xl font-bold ${currentTheme.colors.textPrimary} mb-2`}>Welcome to ResellDashboard</h1>
          <p className={`${currentTheme.colors.textSecondary}`}>Let's find the perfect setup for your selling needs</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm ${currentTheme.colors.textSecondary}`}>Step {currentStep} of {totalSteps}</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className={`${currentTheme.colors.primary} h-2 rounded-full transition-all duration-400`}
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {/* Question Content with transitions */}
        <div className="mb-8 relative overflow-hidden" style={{ minHeight: '400px' }}>
          <div className={`transition-all duration-400 ${
            isTransitioning 
              ? 'opacity-0' 
              : 'opacity-100'
          } ${
            isTransitioning && transitionDirection === 'forward'
              ? 'transform translate-x-8'
              : isTransitioning && transitionDirection === 'backward'
              ? 'transform -translate-x-8'
              : 'transform translate-x-0'
          }`}>
            {/* Step 1: StockX Level */}
            {currentStep === 1 && (
              <>
                <h2 className={`text-xl font-semibold ${currentTheme.colors.textPrimary} mb-2`}>
                  What's your current StockX seller level?
                </h2>
                <p className={`${currentTheme.colors.textSecondary} mb-6`}>
                  This helps us understand your experience and selling volume
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  {stockxLevels.map((level) => (
                    <button
                      key={level.id}
                      onClick={() => setFormData({ ...formData, stockxLevel: level.id })}
                      className={`p-4 rounded-lg border transition-all ${
                        formData.stockxLevel === level.id
                          ? `${currentTheme.colors.border} ${currentTheme.colors.primaryLight}`
                          : `border-gray-600 hover:border-gray-500`
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{level.icon}</span>
                        <div className="text-left">
                          <h3 className={`font-medium ${currentTheme.colors.textPrimary}`}>{level.label}</h3>
                          <p className={`text-sm ${currentTheme.colors.textSecondary}`}>{level.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Step 2: Monthly Volume */}
            {currentStep === 2 && (
              <>
                <h2 className={`text-xl font-semibold ${currentTheme.colors.textPrimary} mb-2`}>
                  How many items do you sell per month across all sales channels?
                </h2>
                <p className={`${currentTheme.colors.textSecondary} mb-6`}>
                  Include StockX, Alias, GOAT, eBay, etc. - we want your total selling volume
                </p>
                <div className="space-y-6">
                  <div className="text-center">
                    <span className={`text-4xl font-bold ${currentTheme.colors.accent}`}>
                      {formData.monthlyVolume >= 500 ? '500+' : formData.monthlyVolume}
                    </span>
                    <span className={`text-lg ${currentTheme.colors.textSecondary} ml-2`}>items</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="500"
                    step="25"
                    value={formData.monthlyVolume}
                    onChange={(e) => setFormData({ ...formData, monthlyVolume: parseInt(e.target.value) })}
                    className={`w-full h-2 rounded-lg appearance-none cursor-pointer slider-neon`}
                    style={{
                      background: `linear-gradient(to right, rgb(16 185 129) 0%, rgb(16 185 129) ${(formData.monthlyVolume / 500) * 100}%, rgb(55 65 81) ${(formData.monthlyVolume / 500) * 100}%, rgb(55 65 81) 100%)`
                    }}
                  />
                  <div className="flex justify-between text-sm">
                    <span className={currentTheme.colors.textSecondary}>0</span>
                    <span className={currentTheme.colors.textSecondary}>500+</span>
                  </div>
                  <div className={`text-center text-lg ${currentTheme.colors.textSecondary}`}>
                    <span className="font-semibold">{getVolumeBenchmark(formData.monthlyVolume)}</span>
                  </div>
                </div>
              </>
            )}

            {/* Step 3: Biggest Challenge */}
            {currentStep === 3 && (
              <>
                <h2 className={`text-xl font-semibold ${currentTheme.colors.textPrimary} mb-2`}>
                  What's your biggest challenge with reselling right now?
                </h2>
                <p className={`${currentTheme.colors.textSecondary} mb-6`}>
                  We'll prioritize features that solve your most pressing problems
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  {biggestChallenges.map((challenge) => (
                    <button
                      key={challenge.id}
                      onClick={() => setFormData({ ...formData, biggestChallenge: challenge.id })}
                      className={`p-4 rounded-lg border transition-all ${
                        formData.biggestChallenge === challenge.id
                          ? `${currentTheme.colors.border} ${currentTheme.colors.primaryLight}`
                          : `border-gray-600 hover:border-gray-500`
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`${formData.biggestChallenge === challenge.id ? 'text-cyan-400' : 'text-gray-400'}`}>
                          {challenge.icon}
                        </div>
                        <div className="text-left flex-1">
                          <h3 className={`font-medium ${currentTheme.colors.textPrimary}`}>{challenge.label}</h3>
                          <p className={`text-sm ${currentTheme.colors.textSecondary}`}>{challenge.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Step 4: Primary Goals */}
            {currentStep === 4 && (
              <>
                <h2 className={`text-xl font-semibold ${currentTheme.colors.textPrimary} mb-2`}>
                  What's your primary goal with our platform?
                </h2>
                <p className={`${currentTheme.colors.textSecondary} mb-6`}>
                  Select all that apply - we'll prioritize features that matter most to you
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  {primaryGoals.map((goal) => (
                    <button
                      key={goal.id}
                      onClick={() => handleGoalToggle(goal.id)}
                      className={`p-4 rounded-lg border transition-all ${
                        formData.primaryGoal.includes(goal.id)
                          ? `${currentTheme.colors.border} ${currentTheme.colors.primaryLight}`
                          : `border-gray-600 hover:border-gray-500`
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{goal.icon}</span>
                        <div className="text-left">
                          <h3 className={`font-medium ${currentTheme.colors.textPrimary}`}>{goal.label}</h3>
                          <p className={`text-sm ${currentTheme.colors.textSecondary}`}>{goal.description}</p>
                        </div>
                        <div className={`ml-auto w-5 h-5 rounded border ${
                          formData.primaryGoal.includes(goal.id)
                            ? `${currentTheme.colors.accent} border-transparent`
                            : 'border-gray-500'
                        } flex items-center justify-center`}>
                          {formData.primaryGoal.includes(goal.id) && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Step 5: Technical Comfort */}
            {currentStep === 5 && (
              <>
                <h2 className={`text-xl font-semibold ${currentTheme.colors.textPrimary} mb-2`}>
                  How comfortable are you with technical setup?
                </h2>
                <p className={`${currentTheme.colors.textSecondary} mb-6`}>
                  We'll recommend the right complexity level
                </p>
                <div className="space-y-4">
                  {techComfortLevels.map((level) => (
                    <button
                      key={level.id}
                      onClick={() => setFormData({ ...formData, techComfort: level.id })}
                      className={`w-full p-4 rounded-lg border transition-all ${
                        formData.techComfort === level.id
                          ? `${currentTheme.colors.border} ${currentTheme.colors.primaryLight}`
                          : `border-gray-600 hover:border-gray-500`
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{level.icon}</span>
                        <div className="text-left">
                          <h3 className={`font-medium ${currentTheme.colors.textPrimary}`}>{level.label}</h3>
                          <p className={`text-sm ${currentTheme.colors.textSecondary}`}>{level.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Step 6: Time Investment */}
            {currentStep === 6 && (
              <>
                <h2 className={`text-xl font-semibold ${currentTheme.colors.textPrimary} mb-2`}>
                  How much time can you invest in setup?
                </h2>
                <p className={`${currentTheme.colors.textSecondary} mb-6`}>
                  We'll match features to your available time
                </p>
                <div className="space-y-4">
                  {timeCommitments.map((time) => (
                    <button
                      key={time.id}
                      onClick={() => setFormData({ ...formData, timeCommitment: time.id })}
                      className={`w-full p-4 rounded-lg border transition-all ${
                        formData.timeCommitment === time.id
                          ? `${currentTheme.colors.border} ${currentTheme.colors.primaryLight}`
                          : `border-gray-600 hover:border-gray-500`
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{time.icon}</span>
                        <div className="text-left">
                          <h3 className={`font-medium ${currentTheme.colors.textPrimary}`}>{time.label}</h3>
                          <p className={`text-sm ${currentTheme.colors.textSecondary}`}>{time.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between">
          <button
            onClick={handlePrevious}
            disabled={currentStep === 1 || isTransitioning}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              currentStep === 1 || isTransitioning
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : `${currentTheme.colors.cardBackground} ${currentTheme.colors.textSecondary} hover:${currentTheme.colors.textPrimary} border ${currentTheme.colors.border}`
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          
          <button
            onClick={handleNext}
            disabled={!canProceed() || isTransitioning}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all ${
              !canProceed() || isTransitioning
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : `${currentTheme.colors.primary} ${currentTheme.colors.primaryHover} text-white`
            }`}
          >
            {currentStep === totalSteps ? 'See My Recommendation' : 'Next'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <style jsx global>{`
        /* Slider styling */
        .slider-neon::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          background: linear-gradient(135deg, #06b6d4 0%, #10b981 100%);
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
        }
        
        .slider-neon::-moz-range-thumb {
          width: 20px;
          height: 20px;
          background: linear-gradient(135deg, #06b6d4 0%, #10b981 100%);
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
          border: none;
        }
      `}</style>
    </div>
  );
};

export default OnboardingQuestionnaire;