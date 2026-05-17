import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

interface Args {
  reportsRoot: string;
}

interface Snapshot {
  market: string;
  asOf: string;
  bestBidPrice: number;
  bestAskPrice?: number;
  lastTradePrice?: number;
}

interface Fill {
  signalId?: string;
  market: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  quoteNotional: number;
  feesPaid: number;
  occurredAt: string;
}

interface SignalMetadata {
  featureSnapshot: Record<string, number | null>;
  confidenceTier?: string;
  side?: string;
  reasonCodes: string[];
}

interface ScenarioEvent {
  type?: string;
  snapshot?: Snapshot;
  signal?: {
            signalId?: string;
            side?: string;
            reasonCodes?: string[];
            metadata?: {
              featureSnapshot?: Record<string, number | null>;
              confidenceTier?: string;
    };
  };
}

interface OpenTrade {
  entryAt: string;
  market: string;
  quantity: number;
  costKrw: number;
  entryQuoteNotionalKrw: number;
  entryFeeKrw: number;
  entrySignalId?: string;
  entryFeatureSnapshot: Record<string, number | null>;
  confidenceTier?: string;
  maxUnrealizedPnlKrw: number;
  minUnrealizedPnlKrw: number;
  maxUnrealizedReturnBps: number;
  minUnrealizedReturnBps: number;
  snapshotCount: number;
}

interface ClosedTradePath {
  entryAt: string;
  exitAt: string;
  market: string;
  entrySignalId?: string;
  realizedPnlKrw: number;
  entryQuoteNotionalKrw: number;
  maxUnrealizedPnlKrw: number;
  minUnrealizedPnlKrw: number;
  maxUnrealizedReturnBps: number;
  minUnrealizedReturnBps: number;
  snapshotCount: number;
  gaveBackPositiveMfe: boolean;
  exitReasonCodes: string[];
  entryFeatureSnapshot: Record<string, number | null>;
  confidenceTier?: string;
}

interface TradeCohortSummary {
  count: number;
  totalPnlKrw: number;
  averagePnlKrw: number | null;
  medianPnlKrw: number | null;
  winners: number;
  losers: number;
  averageMfeKrw: number | null;
  averageMaeKrw: number | null;
  averageMfeBps: number | null;
  averageMaeBps: number | null;
  gaveBackPositiveMfeCount: number;
  immediateAdverseCount: number;
}

interface FeatureThresholdCandidate {
  feature: string;
  direction: ">=" | "<=";
  threshold: number;
  selected: TradeCohortSummary;
  skipped: TradeCohortSummary;
  selectedAveragePnlLiftKrw: number | null;
}

interface ThresholdExperimentReadiness {
  classification:
    | "candidate_ready_for_explicit_replay"
    | "loss_reduction_only"
    | "no_positive_threshold_candidate"
    | "insufficient_closed_trade_sample";
  eligibleForReplayExperiment: boolean;
  positiveThresholdCandidateCount: number;
  reasons: string[];
  bestPositiveThresholdCandidate: FeatureThresholdCandidate | null;
}

interface ExitReasonPathDiagnostic {
  count: number;
  totalPnlKrw: number;
  winners: number;
  losers: number;
  losingImmediateAdverseCount: number;
  losingImmediateAdversePnlKrw: number;
  losingGaveBackPositiveMfeCount: number;
  losingGaveBackPositiveMfePnlKrw: number;
  losingOtherCount: number;
  losingOtherPnlKrw: number;
  dominantLosingPath:
    | "immediate_adverse"
    | "gave_back_positive_mfe"
    | "other_losing_path"
    | null;
}

interface PathAvoidanceThresholdCandidate extends FeatureThresholdCandidate {
  selectedTargetCount: number;
  skippedTargetCount: number;
  selectedTargetPnlKrw: number;
  skippedTargetPnlKrw: number;
  targetSkipRate: number | null;
}

function parseArgs(argv: string[], cwd: string): Args {
  let reportsRoot = resolve(cwd, "var/paper-sessions");
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--reports-root") {
      const value = argv[++index];
      if (!value) {
        throw new Error("--reports-root requires a value");
      }
      reportsRoot = resolve(cwd, value);
    }
  }
  return { reportsRoot };
}

async function collectReportPaths(root: string): Promise<string[]> {
  const paths: string[] = [];
  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile() && entry.name === "report.json") {
        paths.push(path);
      }
    }
  }
  await walk(root);
  paths.sort();
  return paths;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function updateMark(trade: OpenTrade, snapshot: Snapshot): void {
  if (snapshot.market !== trade.market || trade.quantity <= 0) {
    return;
  }
  const valueKrw = trade.quantity * finiteNumber(snapshot.bestBidPrice);
  const unrealizedPnlKrw = valueKrw - trade.costKrw;
  const unrealizedReturnBps =
    trade.costKrw > 0 ? (unrealizedPnlKrw / trade.costKrw) * 10_000 : 0;
  trade.maxUnrealizedPnlKrw = Math.max(trade.maxUnrealizedPnlKrw, unrealizedPnlKrw);
  trade.minUnrealizedPnlKrw = Math.min(trade.minUnrealizedPnlKrw, unrealizedPnlKrw);
  trade.maxUnrealizedReturnBps = Math.max(
    trade.maxUnrealizedReturnBps,
    unrealizedReturnBps,
  );
  trade.minUnrealizedReturnBps = Math.min(
    trade.minUnrealizedReturnBps,
    unrealizedReturnBps,
  );
  trade.snapshotCount += 1;
}

function average(values: number[]): number | null {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function quantile(values: number[], percentile: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * percentile)),
  );
  return sorted[index] ?? null;
}

function summarizeTrades(trades: ClosedTradePath[]): TradeCohortSummary {
  const pnl = trades.map((trade) => trade.realizedPnlKrw);
  return {
    count: trades.length,
    totalPnlKrw: pnl.reduce((sum, value) => sum + value, 0),
    averagePnlKrw: average(pnl),
    medianPnlKrw: quantile(pnl, 0.5),
    winners: trades.filter((trade) => trade.realizedPnlKrw > 0).length,
    losers: trades.filter((trade) => trade.realizedPnlKrw < 0).length,
    averageMfeKrw: average(trades.map((trade) => trade.maxUnrealizedPnlKrw)),
    averageMaeKrw: average(trades.map((trade) => trade.minUnrealizedPnlKrw)),
    averageMfeBps: average(trades.map((trade) => trade.maxUnrealizedReturnBps)),
    averageMaeBps: average(trades.map((trade) => trade.minUnrealizedReturnBps)),
    gaveBackPositiveMfeCount: trades.filter((trade) => trade.gaveBackPositiveMfe)
      .length,
    immediateAdverseCount: trades.filter((trade) => trade.maxUnrealizedPnlKrw <= 0)
      .length,
  };
}

function getNumericEntryFeature(trade: ClosedTradePath, feature: string): number | null {
  const value = trade.entryFeatureSnapshot[feature];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function collectEntryFeatureNames(trades: ClosedTradePath[]): string[] {
  const names = new Set<string>();
  for (const trade of trades) {
    for (const [name, value] of Object.entries(trade.entryFeatureSnapshot)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        names.add(name);
      }
    }
  }
  return [...names].sort();
}

function averageFeatureValue(trades: ClosedTradePath[], feature: string): number | null {
  const values = trades
    .map((trade) => getNumericEntryFeature(trade, feature))
    .filter((value): value is number => value !== null);
  return average(values);
}

function summarizeEntryFeatures(
  trades: ClosedTradePath[],
  winningTrades: ClosedTradePath[],
  losingTrades: ClosedTradePath[],
) {
  const featureNames = collectEntryFeatureNames(trades);
  const byFeature: Record<
    string,
    {
      observedTradeCount: number;
      allAverage: number | null;
      winningAverage: number | null;
      losingAverage: number | null;
      winnerMinusLoserAverage: number | null;
    }
  > = {};
  for (const feature of featureNames) {
    const observedTradeCount = trades.filter(
      (trade) => getNumericEntryFeature(trade, feature) !== null,
    ).length;
    const winningAverage = averageFeatureValue(winningTrades, feature);
    const losingAverage = averageFeatureValue(losingTrades, feature);
    byFeature[feature] = {
      observedTradeCount,
      allAverage: averageFeatureValue(trades, feature),
      winningAverage,
      losingAverage,
      winnerMinusLoserAverage:
        winningAverage !== null && losingAverage !== null
          ? winningAverage - losingAverage
          : null,
    };
  }
  return byFeature;
}

function summarizeExitReasonCohorts(trades: ClosedTradePath[]) {
  return Object.fromEntries(
    [...collectExitReasonCohorts(trades).entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([reasonCode, cohort]) => [reasonCode, summarizeTrades(cohort)]),
  );
}

function collectExitReasonCohorts(
  trades: ClosedTradePath[],
): Map<string, ClosedTradePath[]> {
  const cohorts = new Map<string, ClosedTradePath[]>();
  for (const trade of trades) {
    const reasonCodes =
      trade.exitReasonCodes.length > 0
        ? trade.exitReasonCodes
        : ["UNKNOWN_EXIT_REASON"];
    for (const reasonCode of reasonCodes) {
      const cohort = cohorts.get(reasonCode) ?? [];
      cohort.push(trade);
      cohorts.set(reasonCode, cohort);
    }
  }
  return cohorts;
}

function sumPnl(trades: ClosedTradePath[]): number {
  return trades.reduce((sum, trade) => sum + trade.realizedPnlKrw, 0);
}

function summarizeExitReasonPathDiagnostics(
  trades: ClosedTradePath[],
): Record<string, ExitReasonPathDiagnostic> {
  return Object.fromEntries(
    [...collectExitReasonCohorts(trades).entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([reasonCode, cohort]) => {
        const losingTrades = cohort.filter((trade) => trade.realizedPnlKrw < 0);
        const immediateAdverse = losingTrades.filter(
          (trade) => trade.maxUnrealizedPnlKrw <= 0,
        );
        const gaveBackPositiveMfe = losingTrades.filter(
          (trade) => trade.gaveBackPositiveMfe,
        );
        const otherLosingTrades = losingTrades.filter(
          (trade) =>
            trade.maxUnrealizedPnlKrw > 0 && !trade.gaveBackPositiveMfe,
        );
        const dominantLosingPath =
          losingTrades.length === 0
            ? null
            : immediateAdverse.length >= gaveBackPositiveMfe.length &&
                immediateAdverse.length >= otherLosingTrades.length
              ? "immediate_adverse"
              : gaveBackPositiveMfe.length >= otherLosingTrades.length
                ? "gave_back_positive_mfe"
                : "other_losing_path";
        return [
          reasonCode,
          {
            count: cohort.length,
            totalPnlKrw: sumPnl(cohort),
            winners: cohort.filter((trade) => trade.realizedPnlKrw > 0).length,
            losers: losingTrades.length,
            losingImmediateAdverseCount: immediateAdverse.length,
            losingImmediateAdversePnlKrw: sumPnl(immediateAdverse),
            losingGaveBackPositiveMfeCount: gaveBackPositiveMfe.length,
            losingGaveBackPositiveMfePnlKrw: sumPnl(gaveBackPositiveMfe),
            losingOtherCount: otherLosingTrades.length,
            losingOtherPnlKrw: sumPnl(otherLosingTrades),
            dominantLosingPath,
          },
        ];
      }),
  );
}

function thresholdCandidate(
  trades: ClosedTradePath[],
  feature: string,
  direction: ">=" | "<=",
  threshold: number,
  minSelectedTrades: number,
): FeatureThresholdCandidate | null {
  const selected: ClosedTradePath[] = [];
  const skipped: ClosedTradePath[] = [];
  for (const trade of trades) {
    const value = getNumericEntryFeature(trade, feature);
    if (value === null) {
      skipped.push(trade);
      continue;
    }
    const passes = direction === ">=" ? value >= threshold : value <= threshold;
    if (passes) {
      selected.push(trade);
    } else {
      skipped.push(trade);
    }
  }
  if (selected.length < minSelectedTrades || skipped.length === 0) {
    return null;
  }
  const selectedSummary = summarizeTrades(selected);
  const skippedSummary = summarizeTrades(skipped);
  return {
    feature,
    direction,
    threshold,
    selected: selectedSummary,
    skipped: skippedSummary,
    selectedAveragePnlLiftKrw:
      selectedSummary.averagePnlKrw !== null && skippedSummary.averagePnlKrw !== null
        ? selectedSummary.averagePnlKrw - skippedSummary.averagePnlKrw
        : null,
  };
}

function scanEntryFeatureThresholds(
  trades: ClosedTradePath[],
): FeatureThresholdCandidate[] {
  const minSelectedTrades = trades.length >= 30 ? 10 : Math.max(2, Math.floor(trades.length / 4));
  const candidates: FeatureThresholdCandidate[] = [];
  for (const feature of collectEntryFeatureNames(trades)) {
    const uniqueValues = [
      ...new Set(
        trades
          .map((trade) => getNumericEntryFeature(trade, feature))
          .filter((value): value is number => value !== null),
      ),
    ].sort((left, right) => left - right);
    for (const threshold of uniqueValues) {
      for (const direction of [">=", "<="] as const) {
        const candidate = thresholdCandidate(
          trades,
          feature,
          direction,
          threshold,
          minSelectedTrades,
        );
        if (candidate) {
          candidates.push(candidate);
        }
      }
    }
  }
  return candidates
    .sort((left, right) => {
      const leftLift = left.selectedAveragePnlLiftKrw ?? Number.NEGATIVE_INFINITY;
      const rightLift = right.selectedAveragePnlLiftKrw ?? Number.NEGATIVE_INFINITY;
      if (rightLift !== leftLift) {
        return rightLift - leftLift;
      }
      return right.selected.totalPnlKrw - left.selected.totalPnlKrw;
    })
    .slice(0, 15);
}

function scanPathAvoidanceThresholds(
  trades: ClosedTradePath[],
  targetTrades: ClosedTradePath[],
): PathAvoidanceThresholdCandidate[] {
  const targetTradeIds = new Set(
    targetTrades.map((trade) =>
      [
        trade.entryAt,
        trade.exitAt,
        trade.market,
        trade.entrySignalId ?? "",
        trade.realizedPnlKrw,
      ].join("|"),
    ),
  );
  const minSelectedTrades =
    trades.length >= 30 ? 10 : Math.max(1, Math.floor(trades.length / 4));
  const candidates: PathAvoidanceThresholdCandidate[] = [];
  for (const feature of collectEntryFeatureNames(trades)) {
    const uniqueValues = [
      ...new Set(
        trades
          .map((trade) => getNumericEntryFeature(trade, feature))
          .filter((value): value is number => value !== null),
      ),
    ].sort((left, right) => left - right);
    for (const threshold of uniqueValues) {
      for (const direction of [">=", "<="] as const) {
        const candidate = thresholdCandidate(
          trades,
          feature,
          direction,
          threshold,
          minSelectedTrades,
        );
        if (!candidate) {
          continue;
        }
        const selectedTrades = trades.filter((trade) => {
          const value = getNumericEntryFeature(trade, feature);
          if (value === null) {
            return false;
          }
          return direction === ">=" ? value >= threshold : value <= threshold;
        });
        const skippedTrades = trades.filter((trade) => !selectedTrades.includes(trade));
        const selectedTarget = selectedTrades.filter((trade) =>
          targetTradeIds.has(
            [
              trade.entryAt,
              trade.exitAt,
              trade.market,
              trade.entrySignalId ?? "",
              trade.realizedPnlKrw,
            ].join("|"),
          ),
        );
        const skippedTarget = skippedTrades.filter((trade) =>
          targetTradeIds.has(
            [
              trade.entryAt,
              trade.exitAt,
              trade.market,
              trade.entrySignalId ?? "",
              trade.realizedPnlKrw,
            ].join("|"),
          ),
        );
        if (skippedTarget.length === 0) {
          continue;
        }
        candidates.push({
          ...candidate,
          selectedTargetCount: selectedTarget.length,
          skippedTargetCount: skippedTarget.length,
          selectedTargetPnlKrw: sumPnl(selectedTarget),
          skippedTargetPnlKrw: sumPnl(skippedTarget),
          targetSkipRate:
            targetTrades.length > 0 ? skippedTarget.length / targetTrades.length : null,
        });
      }
    }
  }
  return candidates
    .sort((left, right) => {
      if (right.skippedTargetCount !== left.skippedTargetCount) {
        return right.skippedTargetCount - left.skippedTargetCount;
      }
      if (right.selected.totalPnlKrw !== left.selected.totalPnlKrw) {
        return right.selected.totalPnlKrw - left.selected.totalPnlKrw;
      }
      const leftLift = left.selectedAveragePnlLiftKrw ?? Number.NEGATIVE_INFINITY;
      const rightLift = right.selectedAveragePnlLiftKrw ?? Number.NEGATIVE_INFINITY;
      return rightLift - leftLift;
    })
    .slice(0, 10);
}

function summarizePathCohortFeatureDiagnostics(trades: ClosedTradePath[]) {
  return Object.fromEntries(
    [...collectExitReasonCohorts(trades).entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([reasonCode, cohort]) => {
        const losingTrades = cohort.filter((trade) => trade.realizedPnlKrw < 0);
        const immediateAdverse = losingTrades.filter(
          (trade) => trade.maxUnrealizedPnlKrw <= 0,
        );
        const gaveBackPositiveMfe = losingTrades.filter(
          (trade) => trade.gaveBackPositiveMfe,
        );
        const otherLosingTrades = losingTrades.filter(
          (trade) =>
            trade.maxUnrealizedPnlKrw > 0 && !trade.gaveBackPositiveMfe,
        );
        const comparisonTrades = trades.filter(
          (trade) =>
            !immediateAdverse.includes(trade) &&
            !gaveBackPositiveMfe.includes(trade) &&
            !otherLosingTrades.includes(trade),
        );
        return [
          reasonCode,
          {
            experimentType:
              "retrospective_losing_path_entry_feature_diagnostic_not_strategy_pnl",
            note:
              "Compares losing-path entry features against all other closed trades; threshold candidates are only for choosing explicit replay experiments.",
            immediateAdverse: {
              target: summarizeTrades(immediateAdverse),
              comparison: summarizeTrades(comparisonTrades),
              featureAverages: summarizeEntryFeatures(
                [...immediateAdverse, ...comparisonTrades],
                comparisonTrades,
                immediateAdverse,
              ),
              avoidanceThresholdCandidates: scanPathAvoidanceThresholds(
                trades,
                immediateAdverse,
              ),
            },
            gaveBackPositiveMfe: {
              target: summarizeTrades(gaveBackPositiveMfe),
              comparison: summarizeTrades(comparisonTrades),
              featureAverages: summarizeEntryFeatures(
                [...gaveBackPositiveMfe, ...comparisonTrades],
                comparisonTrades,
                gaveBackPositiveMfe,
              ),
              avoidanceThresholdCandidates: scanPathAvoidanceThresholds(
                trades,
                gaveBackPositiveMfe,
              ),
            },
            otherLosingPath: {
              target: summarizeTrades(otherLosingTrades),
              comparison: summarizeTrades(comparisonTrades),
              featureAverages: summarizeEntryFeatures(
                [...otherLosingTrades, ...comparisonTrades],
                comparisonTrades,
                otherLosingTrades,
              ),
              avoidanceThresholdCandidates: scanPathAvoidanceThresholds(
                trades,
                otherLosingTrades,
              ),
            },
          },
        ];
      }),
  );
}

function hasPositiveSelectedExpectancy(candidate: FeatureThresholdCandidate): boolean {
  return (
    candidate.selected.totalPnlKrw > 0 &&
    (candidate.selected.averagePnlKrw ?? Number.NEGATIVE_INFINITY) > 0 &&
    candidate.selected.winners > candidate.selected.losers
  );
}

function summarizeThresholdExperimentReadiness(
  closedTradeCount: number,
  candidates: FeatureThresholdCandidate[],
): ThresholdExperimentReadiness {
  const positiveCandidates = candidates.filter(hasPositiveSelectedExpectancy);
  const bestPositiveThresholdCandidate = positiveCandidates[0] ?? null;
  const reasons: string[] = [];
  if (closedTradeCount < 30) {
    reasons.push("closed trade sample is below the 30-trade live-readiness floor");
  }
  if (positiveCandidates.length === 0) {
    reasons.push(
      "no threshold candidate has positive selected total PnL, positive average PnL, and more winners than losers",
    );
  }
  if (
    positiveCandidates.length === 0 &&
    candidates.some(
      (candidate) =>
        (candidate.selectedAveragePnlLiftKrw ?? Number.NEGATIVE_INFINITY) > 0 &&
        candidate.selected.totalPnlKrw <= 0,
    )
  ) {
    reasons.push(
      "best threshold candidates reduce losses but remain net negative",
    );
  }

  const eligibleForReplayExperiment =
    closedTradeCount >= 30 && bestPositiveThresholdCandidate !== null;
  const classification = eligibleForReplayExperiment
    ? "candidate_ready_for_explicit_replay"
    : closedTradeCount < 30
      ? "insufficient_closed_trade_sample"
      : positiveCandidates.length === 0 &&
          candidates.some(
            (candidate) =>
              (candidate.selectedAveragePnlLiftKrw ?? Number.NEGATIVE_INFINITY) >
                0 && candidate.selected.totalPnlKrw <= 0,
          )
        ? "loss_reduction_only"
        : "no_positive_threshold_candidate";

  return {
    classification,
    eligibleForReplayExperiment,
    positiveThresholdCandidateCount: positiveCandidates.length,
    reasons,
    bestPositiveThresholdCandidate,
  };
}

async function readScenario(
  scenarioPath: string | undefined,
): Promise<{ events: ScenarioEvent[]; metadataBySignalId: Map<string, SignalMetadata> }> {
  const metadataBySignalId = new Map<string, SignalMetadata>();
  if (!scenarioPath) {
    return { events: [], metadataBySignalId };
  }
  try {
    const scenario = JSON.parse(await readFile(scenarioPath, "utf8")) as {
      events?: ScenarioEvent[];
    };
    for (const event of scenario.events ?? []) {
      if (event.type !== "signal" || !event.signal?.signalId) {
        continue;
      }
      metadataBySignalId.set(event.signal.signalId, {
        featureSnapshot: event.signal.metadata?.featureSnapshot ?? {},
        confidenceTier: event.signal.metadata?.confidenceTier,
        side: event.signal.side,
        reasonCodes: event.signal.reasonCodes ?? [],
      });
    }
    return { events: scenario.events ?? [], metadataBySignalId };
  } catch {
    return { events: [], metadataBySignalId };
  }
}

function collectFillsBySignalId(
  outcomes: Array<Record<string, unknown>>,
): Map<string, Fill[]> {
  const fillsBySignalId = new Map<string, Fill[]>();
  for (const outcome of outcomes) {
    if (outcome.type !== "signal") {
      continue;
    }
    const outcomeSignalId =
      typeof outcome.signalId === "string" ? outcome.signalId : undefined;
    const decision = outcome.decision as
      | {
          fills?: Fill[];
        }
      | undefined;
    for (const fill of decision?.fills ?? []) {
      const signalId = fill.signalId ?? outcomeSignalId;
      if (!signalId) {
        continue;
      }
      const fills = fillsBySignalId.get(signalId) ?? [];
      fills.push(fill);
      fillsBySignalId.set(signalId, fills);
    }
  }
  return fillsBySignalId;
}

function mergeOutcomeSignalMetadata(
  outcomes: Array<Record<string, unknown>>,
  signalMetadata: Map<string, SignalMetadata>,
): void {
  for (const outcome of outcomes) {
    if (outcome.type !== "signal") {
      continue;
    }
    const signalId =
      typeof outcome.signalId === "string" ? outcome.signalId : undefined;
    if (!signalId || signalMetadata.has(signalId)) {
      continue;
    }
    const signal = outcome.signal as
      | {
          side?: string;
          reasonCodes?: string[];
          metadata?: {
            featureSnapshot?: Record<string, number | null>;
            confidenceTier?: string;
          };
        }
      | undefined;
    signalMetadata.set(signalId, {
      featureSnapshot: signal?.metadata?.featureSnapshot ?? {},
      confidenceTier: signal?.metadata?.confidenceTier,
      side: signal?.side,
      reasonCodes: signal?.reasonCodes ?? [],
    });
  }
}

function processFill(
  fill: Fill,
  signalMetadata: Map<string, SignalMetadata>,
  openTrades: OpenTrade[],
  closedTrades: ClosedTradePath[],
): void {
  if (fill.side === "buy") {
    const metadata = fill.signalId ? signalMetadata.get(fill.signalId) : undefined;
    const costKrw = finiteNumber(fill.quoteNotional) + finiteNumber(fill.feesPaid);
    openTrades.push({
      entryAt: fill.occurredAt,
      market: fill.market,
      quantity: fill.quantity,
      costKrw,
      entryQuoteNotionalKrw: finiteNumber(fill.quoteNotional),
      entryFeeKrw: finiteNumber(fill.feesPaid),
      entrySignalId: fill.signalId,
      entryFeatureSnapshot: metadata?.featureSnapshot ?? {},
      confidenceTier: metadata?.confidenceTier,
      maxUnrealizedPnlKrw: -finiteNumber(fill.feesPaid),
      minUnrealizedPnlKrw: -finiteNumber(fill.feesPaid),
      maxUnrealizedReturnBps:
        costKrw > 0 ? (-finiteNumber(fill.feesPaid) / costKrw) * 10_000 : 0,
      minUnrealizedReturnBps:
        costKrw > 0 ? (-finiteNumber(fill.feesPaid) / costKrw) * 10_000 : 0,
      snapshotCount: 0,
    });
    return;
  }

  if (fill.side !== "sell") {
    return;
  }

  const exitReasonCodes = fill.signalId
    ? signalMetadata.get(fill.signalId)?.reasonCodes ?? []
    : [];
  let remainingSellQuantity = fill.quantity;
  while (remainingSellQuantity > 1e-12 && openTrades.length > 0) {
    const trade = openTrades[0];
    if (!trade || trade.market !== fill.market) {
      break;
    }
    const originalTradeQuantity = trade.quantity;
    const closedQuantity = Math.min(originalTradeQuantity, remainingSellQuantity);
    const tradeFraction =
      originalTradeQuantity > 0 ? closedQuantity / originalTradeQuantity : 0;
    const fillFraction = fill.quantity > 0 ? closedQuantity / fill.quantity : 0;
    const allocatedCostKrw = trade.costKrw * tradeFraction;
    const allocatedEntryQuoteKrw = trade.entryQuoteNotionalKrw * tradeFraction;
    const allocatedSellQuoteKrw = finiteNumber(fill.quoteNotional) * fillFraction;
    const allocatedSellFeeKrw = finiteNumber(fill.feesPaid) * fillFraction;
    const realizedPnlKrw =
      allocatedSellQuoteKrw - allocatedSellFeeKrw - allocatedCostKrw;
    const maxUnrealizedPnlKrw = trade.maxUnrealizedPnlKrw * tradeFraction;
    const minUnrealizedPnlKrw = trade.minUnrealizedPnlKrw * tradeFraction;

    closedTrades.push({
      entryAt: trade.entryAt,
      exitAt: fill.occurredAt,
      market: trade.market,
      entrySignalId: trade.entrySignalId,
      realizedPnlKrw,
      entryQuoteNotionalKrw: allocatedEntryQuoteKrw,
      maxUnrealizedPnlKrw,
      minUnrealizedPnlKrw,
      maxUnrealizedReturnBps: trade.maxUnrealizedReturnBps,
      minUnrealizedReturnBps: trade.minUnrealizedReturnBps,
      snapshotCount: trade.snapshotCount,
      gaveBackPositiveMfe: realizedPnlKrw < 0 && maxUnrealizedPnlKrw > 0,
      exitReasonCodes,
      entryFeatureSnapshot: trade.entryFeatureSnapshot,
      confidenceTier: trade.confidenceTier,
    });

    trade.quantity -= closedQuantity;
    trade.costKrw -= allocatedCostKrw;
    trade.entryQuoteNotionalKrw -= allocatedEntryQuoteKrw;
    trade.maxUnrealizedPnlKrw -= maxUnrealizedPnlKrw;
    trade.minUnrealizedPnlKrw -= minUnrealizedPnlKrw;
    remainingSellQuantity -= closedQuantity;
    if (trade.quantity <= 1e-12) {
      openTrades.shift();
    }
  }
}

async function main(): Promise<void> {
  const { reportsRoot } = parseArgs(process.argv.slice(2), process.cwd());
  const reportPaths = await collectReportPaths(reportsRoot);
  const reports: Array<{ path: string; report: Record<string, unknown> }> = [];
  for (const path of reportPaths) {
    const report = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    reports.push({ path, report });
  }
  reports.sort(
    (left, right) =>
      Date.parse(String(left.report.generatedAt ?? "")) -
      Date.parse(String(right.report.generatedAt ?? "")),
  );

  const openTrades: OpenTrade[] = [];
  const closedTrades: ClosedTradePath[] = [];

  for (const { report } of reports) {
    const scenarioPath =
      typeof report.scenarioPath === "string" ? report.scenarioPath : undefined;
    const { events, metadataBySignalId } = await readScenario(scenarioPath);
    const outcomes = Array.isArray(report.outcomes)
      ? (report.outcomes as Array<Record<string, unknown>>)
      : [];
    mergeOutcomeSignalMetadata(outcomes, metadataBySignalId);
    const fillsBySignalId = collectFillsBySignalId(outcomes);

    if (events.length > 0) {
      for (const event of events) {
        if (event.type === "snapshot" && event.snapshot) {
          for (const trade of openTrades) {
            updateMark(trade, event.snapshot);
          }
          continue;
        }
        if (event.type !== "signal" || !event.signal?.signalId) {
          continue;
        }
        for (const fill of fillsBySignalId.get(event.signal.signalId) ?? []) {
          processFill(fill, metadataBySignalId, openTrades, closedTrades);
        }
      }
      continue;
    }

    for (const outcome of outcomes) {
      if (outcome.type === "snapshot" && "bestBidPrice" in outcome) {
        const snapshot = outcome as unknown as Snapshot;
        for (const trade of openTrades) {
          updateMark(trade, snapshot);
        }
        continue;
      }
      if (outcome.type !== "signal") {
        continue;
      }
      const decision = outcome.decision as
        | {
            fills?: Fill[];
          }
        | undefined;
      for (const fill of decision?.fills ?? []) {
        processFill(fill, metadataBySignalId, openTrades, closedTrades);
      }
    }
  }

  const losingTrades = closedTrades.filter((trade) => trade.realizedPnlKrw < 0);
  const winningTrades = closedTrades.filter((trade) => trade.realizedPnlKrw > 0);
  const topThresholdCandidates = scanEntryFeatureThresholds(closedTrades);
  const output = {
    source: {
      reportsRoot,
      reportCount: reports.length,
    },
    allClosedTrades: summarizeTrades(closedTrades),
    winningClosedTrades: summarizeTrades(winningTrades),
    losingClosedTrades: summarizeTrades(losingTrades),
    exitReasonCohorts: summarizeExitReasonCohorts(closedTrades),
    exitReasonPathDiagnostics: summarizeExitReasonPathDiagnostics(closedTrades),
    pathCohortEntryFeatureDiagnostics:
      summarizePathCohortFeatureDiagnostics(closedTrades),
    openTradeCount: openTrades.length,
    entryFeatureDiagnostics: {
      experimentType: "retrospective_closed_trade_diagnostic_not_strategy_pnl",
      note:
        "Threshold candidates are measured on already-closed trades only; use them to choose explicit replay experiments, not as live-readiness evidence.",
      closedTradeCount: closedTrades.length,
      minimumLiveReadinessClosedTrades: 30,
      sampleTooSmallForLiveReadiness: closedTrades.length < 30,
      byFeature: summarizeEntryFeatures(closedTrades, winningTrades, losingTrades),
      topThresholdCandidates,
      thresholdExperimentReadiness: summarizeThresholdExperimentReadiness(
        closedTrades.length,
        topThresholdCandidates,
      ),
    },
    worstClosedTrades: [...closedTrades]
      .sort((left, right) => left.realizedPnlKrw - right.realizedPnlKrw)
      .slice(0, 10),
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        error: "trade_path_analysis_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
});
