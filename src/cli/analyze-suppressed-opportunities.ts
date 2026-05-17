import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ONE_WAY_FEE_BPS = 4;
const HORIZONS = [
  { key: "plus5m", ms: 5 * 60 * 1000 },
  { key: "plus15m", ms: 15 * 60 * 1000 },
] as const;

interface Args {
  reportsRoot: string;
  outputPath: string | null;
}

interface SuppressedEntrySample {
  market: string;
  asOf: string;
  eventTimestampMs: number;
  suppressionReason: string;
  requestedQuoteNotionalKrw: number;
  bestAskPrice: number;
  bestBidPrice: number;
  lastTradePrice: number;
  featureSnapshot: Record<string, number | null>;
  failingGates: Array<{
    field: string;
    comparator: string;
    actual: number;
    threshold: number;
  }>;
}

interface ScenarioSnapshot {
  market?: string;
  bestBidPrice?: number;
  bestAskPrice?: number;
  lastTradePrice?: number;
}

interface ScenarioEvent {
  type?: string;
  snapshot?: ScenarioSnapshot & { asOf?: string };
}

interface ShadowOutcome {
  sample: SuppressedEntrySample;
  marks: Record<string, number | null>;
  pnl: Record<string, number | null>;
  benchmarkPnl: Record<string, number | null>;
  btcExcessPnl: Record<string, number | null>;
}

type OutcomeSummary = ReturnType<typeof summarizeOutcomes>;

interface ReportInput {
  scenarioPath?: string;
  scenarioMetadata?: {
    summary?: {
      suppressedEntrySamples?: SuppressedEntrySample[];
    };
  };
}

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = { reportsRoot: "", outputPath: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (!value) {
      throw new Error(`${arg} requires a value`);
    }
    if (arg === "--reports-root") {
      args.reportsRoot = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--output") {
      args.outputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }
  if (!args.reportsRoot) {
    throw new Error("--reports-root is required");
  }
  return args;
}

async function collectReportPaths(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name === "report.json")
    .map((entry) => resolve(root, entry.parentPath, entry.name))
    .sort();
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(6))
    : null;
}

function pnlKrw(
  quoteNotionalKrw: number,
  entryAskPrice: number,
  exitBidPrice: number,
): number {
  const feeRate = ONE_WAY_FEE_BPS / 10_000;
  const entryCostKrw = quoteNotionalKrw;
  const quantity = entryCostKrw / entryAskPrice;
  const entryFeeKrw = entryCostKrw * feeRate;
  const exitNotionalKrw = quantity * exitBidPrice;
  const exitFeeKrw = exitNotionalKrw * feeRate;
  return exitNotionalKrw - exitFeeKrw - entryCostKrw - entryFeeKrw;
}

function shadowPnlKrw(sample: SuppressedEntrySample, exitBidPrice: number): number {
  return pnlKrw(sample.requestedQuoteNotionalKrw, sample.bestAskPrice, exitBidPrice);
}

function markAtOrAfter(
  snapshots: Array<{ timestampMs: number; bidPrice: number; askPrice: number }>,
  targetTimestampMs: number,
): number | null {
  return (
    snapshots.find((snapshot) => snapshot.timestampMs >= targetTimestampMs)?.bidPrice ??
    null
  );
}

function latestMark(
  snapshots: Array<{ timestampMs: number; bidPrice: number; askPrice: number }>,
): number | null {
  return snapshots.at(-1)?.bidPrice ?? null;
}

function askAtOrAfter(
  snapshots: Array<{ timestampMs: number; bidPrice: number; askPrice: number }>,
  targetTimestampMs: number,
): number | null {
  return (
    snapshots.find((snapshot) => snapshot.timestampMs >= targetTimestampMs)?.askPrice ??
    null
  );
}

function appendSnapshots(
  snapshotsByMarket: Map<
    string,
    Array<{ timestampMs: number; bidPrice: number; askPrice: number }>
  >,
  events: ScenarioEvent[],
) {
  for (const event of events) {
    if (event.type !== "snapshot" || typeof event.snapshot?.market !== "string") {
      continue;
    }
    const timestampMs =
      typeof event.snapshot.asOf === "string"
        ? Date.parse(event.snapshot.asOf)
        : Number.NaN;
    const bidPrice = finiteNumber(event.snapshot.bestBidPrice);
    const askPrice = finiteNumber(event.snapshot.bestAskPrice);
    if (!Number.isFinite(timestampMs) || bidPrice === null || askPrice === null) {
      continue;
    }
    const snapshots = snapshotsByMarket.get(event.snapshot.market) ?? [];
    snapshots.push({ timestampMs, bidPrice, askPrice });
    snapshotsByMarket.set(event.snapshot.market, snapshots);
  }
}

function sortSnapshotsByMarket(
  snapshotsByMarket: Map<
    string,
    Array<{ timestampMs: number; bidPrice: number; askPrice: number }>
  >,
) {
  for (const [market, snapshots] of snapshotsByMarket) {
    snapshotsByMarket.set(
      market,
      snapshots.sort((left, right) => left.timestampMs - right.timestampMs),
    );
  }
}

function summarizeOutcomes(outcomes: ShadowOutcome[], markKey: string) {
  const markedOutcomes = outcomes.filter(
    (outcome) =>
      typeof outcome.pnl[markKey] === "number" &&
      Number.isFinite(outcome.pnl[markKey]),
  );
  const values = markedOutcomes.map((outcome) => outcome.pnl[markKey] as number);
  const benchmarkValues = markedOutcomes
    .map((outcome) => outcome.benchmarkPnl[markKey])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const excessValues = markedOutcomes
    .map((outcome) => outcome.btcExcessPnl[markKey])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const returnPctValues = markedOutcomes.map(
    (outcome) =>
      ((outcome.pnl[markKey] as number) / outcome.sample.requestedQuoteNotionalKrw) *
      100,
  );
  const sorted = [...values].sort((left, right) => left - right);
  const sortedExcess = [...excessValues].sort((left, right) => left - right);
  const sortedReturnPct = [...returnPctValues].sort((left, right) => left - right);
  const totalPnlKrw = values.reduce((sum, value) => sum + value, 0);
  const totalBenchmarkPnlKrw = benchmarkValues.reduce((sum, value) => sum + value, 0);
  const totalBtcExcessPnlKrw = excessValues.reduce((sum, value) => sum + value, 0);
  const totalNotionalKrw = markedOutcomes.reduce(
    (sum, outcome) => sum + outcome.sample.requestedQuoteNotionalKrw,
    0,
  );
  return {
    sampleCount: outcomes.length,
    markedSampleCount: values.length,
    unmarkedSampleCount: outcomes.length - values.length,
    markCoverageRate:
      outcomes.length > 0 ? round(values.length / outcomes.length) : null,
    totalNotionalKrw: round(totalNotionalKrw),
    totalPnlKrw: round(totalPnlKrw),
    totalBtcBenchmarkPnlKrw: round(totalBenchmarkPnlKrw),
    totalBtcExcessPnlKrw: round(totalBtcExcessPnlKrw),
    averagePnlKrw: values.length > 0 ? round(totalPnlKrw / values.length) : null,
    medianPnlKrw:
      sorted.length === 0 ? null : round(sorted[Math.floor((sorted.length - 1) / 2)]),
    averageBtcExcessPnlKrw:
      excessValues.length > 0 ? round(totalBtcExcessPnlKrw / excessValues.length) : null,
    medianBtcExcessPnlKrw:
      sortedExcess.length === 0
        ? null
        : round(sortedExcess[Math.floor((sortedExcess.length - 1) / 2)]),
    totalReturnPct:
      totalNotionalKrw > 0 ? round((totalPnlKrw / totalNotionalKrw) * 100) : null,
    averageReturnPct:
      returnPctValues.length > 0
        ? round(
            returnPctValues.reduce((sum, value) => sum + value, 0) /
              returnPctValues.length,
          )
        : null,
    medianReturnPct:
      sortedReturnPct.length === 0
        ? null
        : round(sortedReturnPct[Math.floor((sortedReturnPct.length - 1) / 2)]),
    winners: values.filter((value) => value > 0).length,
    losers: values.filter((value) => value < 0).length,
  };
}

function assessOpportunity(horizons: Record<string, OutcomeSummary>) {
  const sampleCount = horizons.latest.sampleCount;
  if (sampleCount === 0) {
    return {
      classification: "no_suppressed_samples",
      supportsLooseningEntry: false,
      reasons: ["no suppressed entry samples were stored"],
    };
  }

  const fixedHorizons = [
    { label: "plus5m", summary: horizons.plus5m },
    { label: "plus15m", summary: horizons.plus15m },
  ];
  const measuredHorizons = fixedHorizons.filter(
    ({ summary }) =>
      summary.markedSampleCount >= 5 &&
      (summary.markCoverageRate ?? 0) >= 0.5,
  );

  if (measuredHorizons.length === 0) {
    return {
      classification: "insufficient_horizon_coverage",
      supportsLooseningEntry: false,
      reasons: [
        "fixed-horizon shadow marks are below the minimum sample or coverage threshold",
      ],
    };
  }

  const positiveOpportunity = measuredHorizons.find(
    ({ summary }) =>
      (summary.totalPnlKrw ?? 0) > 0 &&
      (summary.totalBtcExcessPnlKrw ?? 0) > 0 &&
      (summary.medianBtcExcessPnlKrw ?? 0) > 0 &&
      (summary.medianReturnPct ?? 0) > 0 &&
      summary.winners > summary.losers,
  );
  if (positiveOpportunity) {
    return {
      classification: "blocked_positive_opportunity",
      supportsLooseningEntry: true,
      reasons: [
        `${positiveOpportunity.label} suppressed shadows are net positive with positive BTC excess and median return`,
      ],
    };
  }

  const protectiveHorizon = measuredHorizons.find(
    ({ summary }) => (summary.totalPnlKrw ?? 0) < 0 && summary.losers >= summary.winners,
  );
  if (protectiveHorizon) {
    return {
      classification:
        (protectiveHorizon.summary.markCoverageRate ?? 0) >= 0.8
          ? "protective_inactivity"
          : "protective_inactivity_partial_evidence",
      supportsLooseningEntry: false,
      reasons: [
        `${protectiveHorizon.label} suppressed shadows are net negative with losses at least as frequent as wins`,
      ],
    };
  }

  return {
    classification: "inconclusive",
    supportsLooseningEntry: false,
    reasons: ["suppressed shadow outcomes do not show durable positive expectancy"],
  };
}

function groupBy(
  outcomes: ShadowOutcome[],
  keyForOutcome: (outcome: ShadowOutcome) => string[],
): Record<
  string,
  {
    plus5m: ReturnType<typeof summarizeOutcomes>;
    plus15m: ReturnType<typeof summarizeOutcomes>;
    latest: ReturnType<typeof summarizeOutcomes>;
  }
> {
  const groups = new Map<string, ShadowOutcome[]>();
  for (const outcome of outcomes) {
    for (const key of keyForOutcome(outcome)) {
      groups.set(key, [...(groups.get(key) ?? []), outcome]);
    }
  }
  return Object.fromEntries(
    [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, group]) => [
        key,
        {
          plus5m: summarizeOutcomes(group, "plus5m"),
          plus15m: summarizeOutcomes(group, "plus15m"),
          latest: summarizeOutcomes(group, "latest"),
        },
      ]),
  );
}

function summarizeMissedPositiveBtcWindows(outcomes: ShadowOutcome[], markKey: string) {
  const markedOutcomes = outcomes.filter(
    (outcome) =>
      typeof outcome.pnl[markKey] === "number" &&
      Number.isFinite(outcome.pnl[markKey]) &&
      typeof outcome.benchmarkPnl[markKey] === "number" &&
      Number.isFinite(outcome.benchmarkPnl[markKey]),
  );
  const positiveBenchmarkOutcomes = markedOutcomes.filter(
    (outcome) => (outcome.benchmarkPnl[markKey] as number) > 0,
  );
  const shadowPnlKrw = positiveBenchmarkOutcomes.reduce(
    (sum, outcome) => sum + (outcome.pnl[markKey] as number),
    0,
  );
  const btcBenchmarkPnlKrw = positiveBenchmarkOutcomes.reduce(
    (sum, outcome) => sum + (outcome.benchmarkPnl[markKey] as number),
    0,
  );
  const btcExcessPnlKrw = positiveBenchmarkOutcomes.reduce(
    (sum, outcome) => sum + (outcome.btcExcessPnl[markKey] as number),
    0,
  );
  const stalePositiveOpportunityCount = positiveBenchmarkOutcomes.filter(
    (outcome) => outcome.sample.suppressionReason === "SUPPRESS_DATA_STALE",
  ).length;

  return {
    sampleCount: outcomes.length,
    markedSampleCount: markedOutcomes.length,
    count: positiveBenchmarkOutcomes.length,
    shadowPnlKrw: round(shadowPnlKrw),
    btcBenchmarkPnlKrw: round(btcBenchmarkPnlKrw),
    btcExcessPnlKrw: round(btcExcessPnlKrw),
    shadowCaptureRatio:
      btcBenchmarkPnlKrw > 0 ? round(shadowPnlKrw / btcBenchmarkPnlKrw) : null,
    stalePositiveOpportunityCount,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const reportPaths = await collectReportPaths(args.reportsRoot);
  const reports: ReportInput[] = [];
  const snapshotsByMarket = new Map<
    string,
    Array<{ timestampMs: number; bidPrice: number; askPrice: number }>
  >();
  const outcomes: ShadowOutcome[] = [];
  let reportCountWithSamples = 0;
  const scenarioPaths = new Set<string>();

  for (const reportPath of reportPaths) {
    const report = JSON.parse(await readFile(reportPath, "utf8")) as ReportInput;
    reports.push(report);
    if (typeof report.scenarioPath === "string") {
      scenarioPaths.add(report.scenarioPath);
    }
    const samples = report.scenarioMetadata?.summary?.suppressedEntrySamples ?? [];
    if (samples.length > 0) {
      reportCountWithSamples += 1;
    }
  }

  for (const scenarioPath of scenarioPaths) {
    const scenario = JSON.parse(await readFile(scenarioPath, "utf8")) as {
      events?: ScenarioEvent[];
    };
    appendSnapshots(snapshotsByMarket, scenario.events ?? []);
  }
  sortSnapshotsByMarket(snapshotsByMarket);

  for (const report of reports) {
    const samples = report.scenarioMetadata?.summary?.suppressedEntrySamples ?? [];
    if (samples.length === 0) {
      continue;
    }
    for (const sample of samples) {
      const snapshots = snapshotsByMarket.get(sample.market) ?? [];
      const btcSnapshots = snapshotsByMarket.get("KRW-BTC") ?? [];
      const benchmarkEntryAsk =
        sample.market === "KRW-BTC"
          ? sample.bestAskPrice
          : askAtOrAfter(btcSnapshots, sample.eventTimestampMs);
      const marks: Record<string, number | null> = {};
      const pnl: Record<string, number | null> = {};
      const benchmarkPnl: Record<string, number | null> = {};
      const btcExcessPnl: Record<string, number | null> = {};
      for (const horizon of HORIZONS) {
        const mark = markAtOrAfter(snapshots, sample.eventTimestampMs + horizon.ms);
        const benchmarkMark = markAtOrAfter(
          btcSnapshots,
          sample.eventTimestampMs + horizon.ms,
        );
        marks[horizon.key] = mark;
        pnl[horizon.key] = mark === null ? null : shadowPnlKrw(sample, mark);
        benchmarkPnl[horizon.key] =
          benchmarkEntryAsk === null || benchmarkMark === null
            ? null
            : pnlKrw(
                sample.requestedQuoteNotionalKrw,
                benchmarkEntryAsk,
                benchmarkMark,
              );
        btcExcessPnl[horizon.key] =
          pnl[horizon.key] === null || benchmarkPnl[horizon.key] === null
            ? null
            : (pnl[horizon.key] as number) - (benchmarkPnl[horizon.key] as number);
      }
      const latest = latestMark(snapshots);
      const benchmarkLatest = latestMark(btcSnapshots);
      marks.latest = latest;
      pnl.latest = latest === null ? null : shadowPnlKrw(sample, latest);
      benchmarkPnl.latest =
        benchmarkEntryAsk === null || benchmarkLatest === null
          ? null
          : pnlKrw(
              sample.requestedQuoteNotionalKrw,
              benchmarkEntryAsk,
              benchmarkLatest,
            );
      btcExcessPnl.latest =
        pnl.latest === null || benchmarkPnl.latest === null
          ? null
          : (pnl.latest as number) - (benchmarkPnl.latest as number);
      outcomes.push({ sample, marks, pnl, benchmarkPnl, btcExcessPnl });
    }
  }

  const horizons = {
    plus5m: summarizeOutcomes(outcomes, "plus5m"),
    plus15m: summarizeOutcomes(outcomes, "plus15m"),
    latest: summarizeOutcomes(outcomes, "latest"),
  };

  const output = `${JSON.stringify(
    {
      source: {
        reportsRoot: args.reportsRoot,
        reportCount: reportPaths.length,
        reportCountWithSamples,
        scenarioCount: scenarioPaths.size,
        snapshotMarkets: snapshotsByMarket.size,
      },
      note:
        "Retrospective shadow pricing of suppressed entry samples; this is opportunity measurement, not live-readiness evidence.",
      sampleCount: outcomes.length,
      horizons,
      missedPositiveBtcWindows: {
        plus5m: summarizeMissedPositiveBtcWindows(outcomes, "plus5m"),
        plus15m: summarizeMissedPositiveBtcWindows(outcomes, "plus15m"),
        latest: summarizeMissedPositiveBtcWindows(outcomes, "latest"),
      },
      opportunityAssessment: assessOpportunity(horizons),
      bySuppressionReason: groupBy(outcomes, (outcome) => [
        outcome.sample.suppressionReason,
      ]),
      byFailingGate: groupBy(outcomes, (outcome) =>
        outcome.sample.failingGates.map((gate) => gate.field),
      ),
    },
    null,
    2,
  )}\n`;
  if (args.outputPath !== null) {
    await mkdir(resolve(args.outputPath, ".."), { recursive: true });
    await writeFile(args.outputPath, output, "utf8");
  }
  process.stdout.write(output);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        error: "analyze_suppressed_opportunities_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
});
