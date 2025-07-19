'use client';

import React, { useState } from 'react';
import { 
  Rocket, 
  Crown, 
  Mail, 
  Edit,
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import { addDocument } from '../lib/firebase/firebaseUtils';

interface QuestionnaireData {
  stockxLevel: string;
  monthlyVolume: number;
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
  
  const [formData, setFormData] = useState<QuestionnaireData>({
    stockxLevel: '',
    monthlyVolume: 25,
    primaryGoal: [],
    techComfort: '',
    timeCommitment: ''
  });

  const totalSteps = 5;

  const stockxLevels = [
    { id: 'level-1', icon: '🌱', label: 'Level 1', description: 'Just getting started' },
    { id: 'level-2', icon: '📈', label: 'Level 2', description: 'Building momentum' },
    { id: 'level-3', icon: '⭐', label: 'Level 3', description: 'Experienced seller' },
    { id: 'level-4', icon: '👑', label: 'Level 4', description: 'Power seller' },
    { id: 'level-5', icon: '🏆', label: 'Level 5', description: 'Elite seller' },
    { id: 'not-sure', icon: '❓', label: 'Not sure', description: "I'll check later" }
  ];

  const primaryGoals = [
    { id: 'repricing', icon: '💰', label: 'Smart Repricing', description: 'Optimize prices automatically' },
    { id: 'tracking', icon: '📊', label: 'Sales Tracking', description: 'Monitor performance' },
    { id: 'automation', icon: '⚡', label: 'Automation', description: 'Save time on tasks' },
    { id: 'analytics', icon: '🔍', label: 'Analytics', description: 'Data-driven insights' }
  ];

  const techComfortLevels = [
    { id: 'beginner', icon: '🌱', label: 'Beginner', description: 'Keep it simple please' },
    { id: 'intermediate', icon: '⚙️', label: 'Intermediate', description: 'Some setup is fine' },
    { id: 'advanced', icon: '🚀', label: 'Advanced', description: 'I love technical features' }
  ];

  const timeCommitments = [
    { id: '5-min', icon: '⚡', label: '5 minutes', description: 'Quick start preferred' },
    { id: '15-min', icon: '🕐', label: '15 minutes', description: 'Some setup is okay' },
    { id: '30-min', icon: '🛠️', label: '30+ minutes', description: 'I want full features' }
  ];

  const plans = {
    enterprise: {
      name: 'Enterprise',
      price: '$99/month',
      icon: Crown,
      features: [
        'Full API Integration',
        'Real-time Repricing',
        'Advanced Analytics',
        'Bulk Operations',
        'Priority Support',
        'Multi-account Management'
      ],
      setupTime: '15-30 minutes',
      description: 'Perfect for elite sellers who want maximum automation and enterprise-level features.'
    },
    professional: {
      name: 'Professional',
      price: '$49/month',
      icon: Mail,
      features: [
        'Email Integration',
        'Sales Tracking',
        'Basic Analytics',
        'Manual Entry',
        'StockX API Integration'
      ],
      setupTime: '5-15 minutes',
      description: 'Great balance of automation and advanced features for experienced sellers.'
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
      description: 'Perfect for getting started quickly with essential features.'
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
      case 3: return formData.primaryGoal.length > 0;
      case 4: return formData.techComfort !== '';
      case 5: return formData.timeCommitment !== '';
      default: return false;
    }
  };

  const calculateRecommendation = () => {
    // Enterprise triggers
    if (
      (formData.stockxLevel === 'level-4' || formData.stockxLevel === 'level-5') &&
      (formData.techComfort === 'advanced' || formData.timeCommitment === '30-min') &&
      (formData.monthlyVolume >= 300 || formData.primaryGoal.includes('automation') || formData.primaryGoal.includes('analytics'))
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

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else {
      // Calculate and show recommendation
      const recommendation = calculateRecommendation();
      setRecommendedPlan(recommendation);
      setShowRecommendation(true);
      
      // Save questionnaire data if user is authenticated
      if (user) {
        saveQuestionnaireData();
      }
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
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
    setFormData({
      stockxLevel: '',
      monthlyVolume: 25,
      primaryGoal: [],
      techComfort: '',
      timeCommitment: ''
    });
  };

  if (showRecommendation && recommendedPlan) {
    const plan = plans[recommendedPlan];
    const PlanIcon = plan.icon;

    return (
      <div className={`min-h-screen ${currentTheme.colors.background} flex items-center justify-center p-6`}>
        <div className={`max-w-4xl w-full ${currentTheme.colors.cardBackground} backdrop-blur-sm rounded-2xl p-8 border ${currentTheme.colors.border}`}>
          {/* Header */}
          <div className="text-center mb-8">
            <div className={`inline-flex items-center justify-center w-20 h-20 ${currentTheme.colors.primary} rounded-full mb-4`}>
              <PlanIcon className="w-10 h-10 text-white" />
            </div>
            <h2 className={`text-3xl font-bold ${currentTheme.colors.textPrimary} mb-2`}>Perfect Match!</h2>
            <p className={`${currentTheme.colors.textSecondary}`}>
              Based on your answers, we recommend starting your 14-day free trial with the {recommendedPlan === 'enterprise' ? 'Enterprise' : recommendedPlan === 'professional' ? 'Professional' : 'Starter'} Plan. You can always switch plans during or after your trial!
            </p>
          </div>

          {/* Plan Details */}
          <div className="grid md:grid-cols-2 gap-8 mb-8">
            {/* Left Column - Plan Info */}
            <div>
              <h3 className={`text-2xl font-bold ${currentTheme.colors.textPrimary} mb-2`}>{plan.name}</h3>
              <p className={`text-3xl font-bold ${currentTheme.colors.accent} mb-4`}>{plan.price}</p>
              <p className={`${currentTheme.colors.textSecondary} mb-4`}>{plan.description}</p>
              <div className={`flex items-center gap-2 ${currentTheme.colors.textSecondary}`}>
                <span className="text-sm">Setup time:</span>
                <span className="text-sm font-medium">{plan.setupTime}</span>
              </div>
            </div>

            {/* Right Column - Features */}
            <div>
              <h4 className={`font-semibold ${currentTheme.colors.textPrimary} mb-4`}>Features included:</h4>
              <ul className="space-y-2">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Check className={`w-5 h-5 ${currentTheme.colors.accent} flex-shrink-0 mt-0.5`} />
                    <span className={`${currentTheme.colors.textSecondary}`}>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => onComplete?.()}
              className={`px-6 py-3 ${currentTheme.colors.primary} ${currentTheme.colors.primaryHover} text-white rounded-lg font-medium transition-all flex items-center justify-center gap-2`}
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
              className={`${currentTheme.colors.primary} h-2 rounded-full transition-all duration-300`}
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {/* Question Content */}
        <div className="mb-8">
          {/* Step 1: StockX Level */}
          {currentStep === 1 && (
            <>
              <h2 className={`text-xl font-semibold ${currentTheme.colors.textPrimary} mb-2`}>
                What's your current StockX seller level?
              </h2>
              <p className={`${currentTheme.colors.textSecondary} mb-6`}>
                This helps us recommend the best integration for you
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
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{level.icon}</span>
                      <div className="text-left">
                        <h3 className={`font-medium ${currentTheme.colors.textPrimary}`}>{level.label}</h3>
                        <p className={`text-sm ${currentTheme.colors.textSecondary}`}>{level.description}</p>
                      </div>
                      {formData.stockxLevel === level.id && (
                        <Check className={`w-5 h-5 ${currentTheme.colors.accent} ml-auto`} />
                      )}
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

          {/* Step 3: Primary Goals */}
          {currentStep === 3 && (
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

          {/* Step 4: Technical Comfort */}
          {currentStep === 4 && (
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
                      {formData.techComfort === level.id && (
                        <Check className={`w-5 h-5 ${currentTheme.colors.accent} ml-auto`} />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step 5: Time Investment */}
          {currentStep === 5 && (
            <>
              <h2 className={`text-xl font-semibold ${currentTheme.colors.textPrimary} mb-2`}>
                How much time can you invest in initial setup?
              </h2>
              <p className={`${currentTheme.colors.textSecondary} mb-6`}>
                We'll balance features with setup complexity
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
                      {formData.timeCommitment === time.id && (
                        <Check className={`w-5 h-5 ${currentTheme.colors.accent} ml-auto`} />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between">
          <button
            onClick={handlePrevious}
            disabled={currentStep === 1}
            className={`flex items-center gap-2 px-4 py-2 ${
              currentStep === 1
                ? 'text-gray-500 cursor-not-allowed'
                : `${currentTheme.colors.textSecondary} hover:${currentTheme.colors.textPrimary}`
            } transition-colors`}
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          
          <button
            onClick={handleNext}
            disabled={!canProceed()}
            className={`flex items-center gap-2 px-6 py-3 ${currentTheme.colors.primary} ${currentTheme.colors.primaryHover} text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {currentStep === totalSteps ? 'Get Recommendation' : 'Next'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingQuestionnaire;