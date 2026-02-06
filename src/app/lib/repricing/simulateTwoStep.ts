export type NullableNumber = number | null | undefined;

export type TwoStepSimulationInput = {
  currentPrice: number;
  /** Standard lowest ask as shown in UI (whole dollars). */
  lowestAsk: NullableNumber;
  /** Flex lowest ask as shown in UI (whole dollars). */
  flexLowestAsk: NullableNumber;

  minPrice?: NullableNumber;
  maxPrice?: NullableNumber;

  /** Matches API guard. If false, Two-step is blocked. */
  allowTwoStep: boolean;
  /** Mirrors the API's `dryRun` concept: in dry run we don't model the actual $999 update sequence. */
  dryRun: boolean;
  /**
   * Mirrors the API's `forceTwoStepPeek`.
   * When true, Two-step will choose the peek/reset path whenever possible.
   */
  forceTwoStepPeek: boolean;

  /** Used for the API's spam-reduction gate ("market unchanged + already winning"). */
  lastSeenLowestAsk?: NullableNumber;
  lastSeenFlexLowestAsk?: NullableNumber;

  /**
   * Optional: if you're simulating the peek/reset path, this represents the competitor best ask
   * you'd expect to observe AFTER you temporarily reset high (step 1).
   *
   * If omitted, the simulator will say "would reset then refetch" without a final computed value.
   */
  competitorBestAskAfterReset?: NullableNumber;
};

export type TwoStepSimulationResult = {
  /** High-level label of what the engine would do. */
  action:
    | 'blocked'
    | 'skip_market_unchanged_winning'
    | 'no_change'
    | 'direct_undercut'
    | 'peek_then_undercut'
    | 'peek_then_revert'
    | 'bounded_direct_set';
  /** Human-readable explanation. */
  reason: string;

  /** Market inputs normalized to null/number. */
  market: {
    lowestAsk: number | null;
    flexLowestAsk: number | null;
    bestAsk: number | null;
  };

  /** Whether the listing is currently "winning" per server logic (standard ties win; flex ties lose). */
  isWinning: boolean;
  /** Whether the engine would attempt the peek/reset path (step 1 → refetch → step 2). */
  wouldPeek: boolean;
  /** Computed final target before bounds. */
  computedFinal: number | null;
  /** Final after min/max clamp (if provided). */
  boundedFinal: number | null;

  /** Detailed step-style explanation for UI. */
  steps: string[];
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function asNullableFinite(v: NullableNumber): number | null {
  return isFiniteNumber(v) ? v : null;
}

function minPositive(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

function equalNullableNumber(a: NullableNumber, b: NullableNumber): boolean {
  const na = isFiniteNumber(a) ? a : null;
  const nb = isFiniteNumber(b) ? b : null;
  return na === nb;
}

export function simulateTwoStepLegacy(input: TwoStepSimulationInput): TwoStepSimulationResult {
  const steps: string[] = [];
  const lowestAsk = asNullableFinite(input.lowestAsk);
  const flexLowestAsk = asNullableFinite(input.flexLowestAsk);
  const bestAsk = minPositive(lowestAsk, flexLowestAsk);

  const hasAnyAsk = lowestAsk !== null || flexLowestAsk !== null;
  const losingToFlex = flexLowestAsk !== null && flexLowestAsk <= input.currentPrice;
  const losingToStd = lowestAsk !== null && lowestAsk < input.currentPrice;
  const isWinning = hasAnyAsk ? !losingToFlex && !losingToStd : false;

  const hasMin = isFiniteNumber(input.minPrice);
  const hasMax = isFiniteNumber(input.maxPrice);
  const violatesBounds =
    (hasMin && input.currentPrice < (input.minPrice as number)) ||
    (hasMax && input.currentPrice > (input.maxPrice as number));

  if (!input.allowTwoStep) {
    return {
      action: 'blocked',
      reason: 'Two-step strategy blocked (allowTwoStep=false)',
      market: { lowestAsk, flexLowestAsk, bestAsk },
      isWinning,
      wouldPeek: false,
      computedFinal: null,
      boundedFinal: null,
      steps: ['Blocked: allowTwoStep=false (matches /api/stockx/repricing guard).'],
    };
  }

  // Spam-reduction gate (server applies only when dryRun=false).
  if (input.dryRun === false) {
    const unchanged =
      equalNullableNumber(input.lastSeenLowestAsk, lowestAsk) &&
      equalNullableNumber(input.lastSeenFlexLowestAsk, flexLowestAsk);
    if (unchanged && isWinning && !violatesBounds) {
      return {
        action: 'skip_market_unchanged_winning',
        reason: 'Market unchanged and already winning (standard ties = win; flex ties/undercuts beat you)',
        market: { lowestAsk, flexLowestAsk, bestAsk },
        isWinning,
        wouldPeek: false,
        computedFinal: null,
        boundedFinal: null,
        steps: [
          'Skip: market unchanged vs lastSeen* AND already winning.',
          'Note: this gate is only applied in LIVE mode (dryRun=false) on the server.',
        ],
      };
    }
  }

  // Two-step undercuts by $1 (hardcoded on server).
  const beatBy = 1;
  const computedFinal = bestAsk !== null ? Math.max(1, bestAsk - beatBy) : null;

  const shouldPeekNextLowest = input.forceTwoStepPeek
    ? true
    : bestAsk !== null
      ? input.currentPrice <= bestAsk
      : true;

  if (computedFinal === null) {
    return {
      action: 'no_change',
      reason: 'Two-step: no market ask available',
      market: { lowestAsk, flexLowestAsk, bestAsk },
      isWinning,
      wouldPeek: false,
      computedFinal: null,
      boundedFinal: null,
      steps: [
        'Market best ask is null (no standard or flex lowest ask available).',
        'Two-step cannot compute an undercut target; would hold current price.',
      ],
    };
  }

  // Bounds optimization (server skips the reset step if bounds would clamp anyway, unless forced).
  const boundedTarget = (() => {
    let t = computedFinal;
    if (hasMin) t = Math.max(t, input.minPrice as number);
    if (hasMax) t = Math.min(t, input.maxPrice as number);
    return Math.max(1, Math.round(t));
  })();

  const computedFinalRounded = Math.max(1, Math.round(computedFinal));

  if (!input.forceTwoStepPeek && input.dryRun === false && boundedTarget !== computedFinalRounded) {
    const which =
      hasMin && boundedTarget === Math.round(input.minPrice as number)
        ? `Two-step skipped: market under Min ($${Math.round(input.minPrice as number)})`
        : hasMax && boundedTarget === Math.round(input.maxPrice as number)
          ? `Two-step skipped: market over Max ($${Math.round(input.maxPrice as number)})`
          : 'Two-step skipped: bounded target differs';
    return {
      action: 'bounded_direct_set',
      reason: which,
      market: { lowestAsk, flexLowestAsk, bestAsk },
      isWinning,
      wouldPeek: false,
      computedFinal: computedFinalRounded,
      boundedFinal: boundedTarget,
      steps: [
        `Compute final target: bestAsk $${bestAsk} - $1 = $${computedFinalRounded}`,
        `Apply bounds → $${boundedTarget}`,
        'LIVE optimization: since bounds clamp the final anyway, server skips the temporary $999 reset step.',
      ],
    };
  }

  // If we are not currently the lowest ask, server can undercut directly (unless forced to peek).
  if (!input.forceTwoStepPeek && !shouldPeekNextLowest) {
    const final = boundedTarget;
    const action = final === input.currentPrice ? 'no_change' : 'direct_undercut';
    return {
      action,
      reason:
        action === 'no_change'
          ? 'No change after constraints'
          : `Two-step not needed (already not lowest): undercut $${bestAsk} - $1 = $${computedFinalRounded}`,
      market: { lowestAsk, flexLowestAsk, bestAsk },
      isWinning,
      wouldPeek: false,
      computedFinal: computedFinalRounded,
      boundedFinal: final,
      steps: [
        'Not currently the lowest ask (currentPrice > bestAsk).',
        `Direct undercut: $${bestAsk} - $1 = $${computedFinalRounded}`,
        hasMin || hasMax ? `Apply bounds → $${final}` : 'No bounds applied.',
      ],
    };
  }

  // Peek/reset path (step 1 -> refetch -> step 2). In dry-run, we just describe it.
  steps.push(`Step 1 (temporary): set to reset price $999 to reveal the next ask.`);
  steps.push(`Refetch market data (after reset).`);

  const competitorBestAsk = asNullableFinite(input.competitorBestAskAfterReset);
  if (competitorBestAsk === null) {
    return {
      action: input.dryRun ? 'peek_then_undercut' : 'peek_then_revert',
      reason: input.dryRun
        ? 'Two-step (dry-run): would set $999 to reveal next-lowest ask, then undercut by $1'
        : 'Two-step failed: no lowest ask available after reset (would revert to original price)',
      market: { lowestAsk, flexLowestAsk, bestAsk },
      isWinning,
      wouldPeek: true,
      computedFinal: computedFinalRounded,
      boundedFinal: boundedTarget,
      steps: [
        ...steps,
        'No competitor best ask provided for step 2.',
        input.dryRun
          ? 'Dry-run: describe behavior only (no actual reset modeled).'
          : 'LIVE: if no ask available after reset, server attempts to revert to original price.',
      ],
    };
  }

  const competitorComputed = Math.max(1, Math.round(Math.max(1, competitorBestAsk - beatBy)));
  const competitorBounded = (() => {
    let t = competitorComputed;
    if (hasMin) t = Math.max(t, Math.round(input.minPrice as number));
    if (hasMax) t = Math.min(t, Math.round(input.maxPrice as number));
    return Math.max(1, Math.round(t));
  })();

  steps.push(`Step 2 (final): competitor best ask $${competitorBestAsk} → undercut by $1 = $${competitorComputed}.`);
  if (hasMin || hasMax) steps.push(`Apply bounds → $${competitorBounded}.`);

  const action = competitorBounded === input.currentPrice ? 'no_change' : 'peek_then_undercut';
  return {
    action,
    reason:
      action === 'no_change'
        ? 'No change after constraints'
        : 'Two-step: would reset to $999, refetch, then set final undercut price',
    market: { lowestAsk, flexLowestAsk, bestAsk },
    isWinning,
    wouldPeek: true,
    computedFinal: competitorComputed,
    boundedFinal: competitorBounded,
    steps,
  };
}

