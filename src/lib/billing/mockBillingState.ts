import type { PlanId } from './plans';

export type BillingInterval = 'monthly' | 'annually';

export type MockBillingState = {
  planId: PlanId;
  interval: BillingInterval;
};

const STORAGE_KEY = 'mockBillingState:v1';

export const DEFAULT_MOCK_BILLING_STATE: MockBillingState = {
  planId: 'professional',
  interval: 'monthly',
};

export function readMockBillingState(): MockBillingState {
  if (typeof window === 'undefined') return DEFAULT_MOCK_BILLING_STATE;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MOCK_BILLING_STATE;
    const parsed = JSON.parse(raw) as Partial<MockBillingState> | null;
    if (!parsed) return DEFAULT_MOCK_BILLING_STATE;

    const planId = (parsed.planId ?? DEFAULT_MOCK_BILLING_STATE.planId) as MockBillingState['planId'];
    const interval = (parsed.interval ?? DEFAULT_MOCK_BILLING_STATE.interval) as MockBillingState['interval'];

    if (interval !== 'monthly' && interval !== 'annually') return DEFAULT_MOCK_BILLING_STATE;
    if (planId !== 'starter' && planId !== 'professional' && planId !== 'enterprise') return DEFAULT_MOCK_BILLING_STATE;

    return { planId, interval };
  } catch {
    return DEFAULT_MOCK_BILLING_STATE;
  }
}

export function writeMockBillingState(next: MockBillingState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

