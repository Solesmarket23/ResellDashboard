import { Crown, TrendingUp, Zap } from 'lucide-react';

export type PlanId = 'starter' | 'professional' | 'enterprise';

export type Plan = {
  id: PlanId;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  // Used by the Plans UI; Billing can ignore it.
  icon: typeof Zap;
  popular: boolean;
  trial: boolean;
  features: string[];
  notIncluded: string[];
  color: string;
};

export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    icon: Zap,
    description: 'Perfect for beginners starting their resell journey',
    monthlyPrice: 15,
    annualPrice: 150,
    features: [
      'Gmail integration',
      'Up to 100 purchases/month',
      'Basic profit tracking',
      'Email support',
      'Mobile app access',
      'Basic analytics dashboard',
    ],
    notIncluded: ['Advanced analytics', 'Auto profit calculations', 'Priority support', 'Custom alerts'],
    color: 'bg-blue-500',
    popular: false,
    trial: true,
  },
  {
    id: 'professional',
    name: 'Professional',
    icon: TrendingUp,
    description: 'Most popular choice for serious resellers',
    monthlyPrice: 40,
    annualPrice: 400,
    features: [
      'Everything in Starter',
      'Up to 1,000 purchases/month',
      'Advanced profit tracking',
      'Auto profit calculations',
      'Priority email support',
      'Advanced analytics & insights',
      'Custom alerts & notifications',
      'Export data capabilities',
      'Mobile & desktop apps',
    ],
    notIncluded: ['Phone support', 'Custom integrations', 'Dedicated account manager'],
    color: 'bg-purple-500',
    popular: true,
    trial: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    icon: Crown,
    description: 'For high-volume resellers and teams',
    monthlyPrice: 82,
    annualPrice: 820,
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
      'Custom onboarding',
    ],
    notIncluded: [],
    color: 'bg-yellow-500',
    popular: false,
    trial: true,
  },
];

export function getPlanById(id: string | null | undefined) {
  return PLANS.find((p) => p.id === id) ?? PLANS.find((p) => p.id === 'professional')!;
}

