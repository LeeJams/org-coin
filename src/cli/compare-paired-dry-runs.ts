import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

interface Args {
  baselineReportsRoot: string;
  candidateReportsRoot: string;
  focusExitReason: string;
}

interface Snapshot {
  market?: string;
  bestAskPrice?: number;
  bestBidPrice?: number;
  lastTradePrice?: number;
}

interface ScenarioSignal {
  side?: string;
  reasonCodes?: string[];
}

interface ScenarioEvent {
  type?: string;
  snapshot?: Snapshot;
  signal?: ScenarioSignal;
}

interface Scenario {
  events?: ScenarioEvent[];
}

interface ReportRow {
  path: string;
  sourceRunId: string;
  sessionId: string;
  generatedAt: string;
  initialEquityKrw: number;
  endingEquityKrw: number;
  markedPnlKrw: number;
  benchmarkPnlKrw: number | null;
  excessPnlKrw: number | null;
  fillCount: number;
  buyFillCount: number;
  sellFillCount: number;
  openPositionCount: number;
  syntheticClose: boolean;
  rejectDecisionCount: number;
  reconciliationOk: boolean;
  exitReasonCodes: string[];
}

interface PairedRow {
  sourceRunId: string;
  baseline: ReportRow;
  candidate: ReportRow;
}

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    baselineReportsRoot: "",
    candidateReportsRoot: "",
    focusExitReason: "EXIT_TIME_STOP_15M",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (!value) {
      throw new Error(`${arg} requires a value`);
    }

    if (arg === "--baseline-reports-root") {
      args.baselineReportsRoot = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--candidate-reports-root") {
      args.candidateReportsRoot = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--focus-exit-reason") {
      args.focusExitReason = value;
      index += 1;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  if (!args.baselineReportsRoot || !args.candidateReportsRoot) {
    throw new Error(
      "--baseline-reports-root and --candidate-reports-root are required",
    );
  }

  return args;
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

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function inferRunId(reportPath: string, parsed: Record<string, unknown>): string | null {
  const metadata = parsed.scenarioMetadata as Record<string, unknown> | undefined;
  const sourceRunId = metadata?.sourceRunId;
  if (typeof sourceRunId === "string" && sourceRunId.length > 0) {
    return sourceRunId;
  }

  const scenarioPath = parsed.scenarioPath;
  if (typeof scenarioPath === "string") {
    const match = /session-([A-Za-z0-9_-]+)-entry-/u.exec(scenarioPath);
    if (match?.[1]) {
      return match[1];
    }
  }

  const pathMatch = /session-([A-Za-z0-9_-]+)-entry-/u.exec(reportPath);
  return pathMatch?.[1] ?? null;
}

function latestSnapshotPrice(snapshot: Snapshot): number | null {
  return (
    finiteNumber(snapshot.bestBidPrice) ??
    finiteNumber(snapshot.lastTradePrice) ??
    finiteNumber(snapshot.bestAskPrice)
  );
}

function firstSnapshotPrice(snapshot: Snapshot): number | null {
  return (
    finiteNumber(snapshot.bestAskPrice) ??
    finiteNumber(snapshot.lastTradePrice) ??
    finiteNumber(snapshot.bestBidPrice)
  );
}

function benchmarkPnlFromScenario(
  scenario: Scenario | null,
  initialEquityKrw: number,
): number | null {
  const btcSnapshots =
    scenario?.events
      ?.filter((event) => event.type === "snapshot" && event.snapshot?.market === "KRW-BTC")
      .map((event) => event.snapshot)
      .filter((snapshot): snapshot is Snapshot => snapshot !== undefined) ?? [];
  const first = btcSnapshots.at(0);
  const last = btcSnapshots.at(-1);
  if (!first || !last) {
    return null;
  }

  const initialPriceKrw = firstSnapshotPrice(first);
  const endingPriceKrw = latestSnapshotPrice(last);
  if (
    initialPriceKrw === null ||
    endingPriceKrw === null ||
    initialPriceKrw <= 0 ||
    initialEquityKrw <= 0
  ) {
    return null;
  }

  return ((endingPriceKrw - initialPriceKrw) / initialPriceKrw) * initialEquityKrw;
}

function exitReasonsFromScenario(scenario: Scenario | null): string[] {
  const reasons =
    scenario?.events
      ?.filter((event) => event.type === "signal" && event.signal?.side === "sell")
      .flatMap((event) => stringArray(event.signal?.reasonCodes)) ?? [];
  return [...new Set(reasons)].sort();
}

async function readScenario(path: unknown): Promise<Scenario | null> {
  if (typeof path !== "string" || path.length === 0) {
    return null;
  }
  try {
    return JSON.parse(await readFile(path, "utf8")) as Scenario;
  } catch {
    return null;
  }
}

function positionCount(parsed: Record<string, unknown>): number {
  const portfolio = parsed.portfolio as Record<string, unknown> | undefined;
  const positions = portfolio?.positions;
  if (typeof positions !== "object" || positions === null || Array.isArray(positions)) {
    return 0;
  }
  return Object.values(positions).filter((position) => {
    if (typeof position !== "object" || position === null || Array.isArray(position)) {
      return false;
    }
    return (finiteNumber((position as Record<string, unknown>).baseQuantity) ?? 0) > 0;
  }).length;
}

function endingEquity(parsed: Record<string, unknown>): number | null {
  const portfolio = parsed.portfolio as Record<string, unknown> | undefined;
  const cashAvailable = finiteNumber(portfolio?.cashAvailable);
  if (cashAvailable === null) {
    return null;
  }
  const latestSnapshots = parsed.latestSnapshots as Record<string, Snapshot> | undefined;
  const positions = portfolio?.positions;
  if (typeof positions !== "object" || positions === null || Array.isArray(positions)) {
    return cashAvailable;
  }

  return Object.values(positions).reduce((sum, position) => {
    if (typeof position !== "object" || position === null || Array.isArray(position)) {
      return sum;
    }
    const record = position as Record<string, unknown>;
    const market = typeof record.market === "string" ? record.market : null;
    const baseQuantity = finiteNumber(record.baseQuantity) ?? 0;
    if (!market || baseQuantity <= 0) {
      return sum;
    }
    const price = latestSnapshotPrice(latestSnapshots?.[market] ?? {});
    return sum + (price === null ? 0 : baseQuantity * price);
  }, cashAvailable);
}

function fillSummary(parsed: Record<string, unknown>) {
  const ledger = parsed.ledger as Record<string, unknown> | undefined;
  const fills = Array.isArray(ledger?.fills)
    ? (ledger.fills as Record<string, unknown>[])
    : [];
  return {
    fillCount: fills.length,
    buyFillCount: fills.filter((fill) => fill.side === "buy").length,
    sellFillCount: fills.filter((fill) => fill.side === "sell").length,
  };
}

async function readReport(path: string): Promise<ReportRow | null> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  const sourceRunId = inferRunId(path, parsed);
  const metadata = parsed.scenarioMetadata as Record<string, unknown> | undefined;
  const initialEquityKrw =
    finiteNumber(metadata?.initialEquityKrw) ?? finiteNumber(metadata?.initialCashKrw);
  const currentEndingEquity = endingEquity(parsed);
  if (!sourceRunId || initialEquityKrw === null || currentEndingEquity === null) {
    return null;
  }

  const scenario = await readScenario(parsed.scenarioPath);
  const benchmarkPnlKrw = benchmarkPnlFromScenario(scenario, initialEquityKrw);
  const markedPnlKrw = currentEndingEquity - initialEquityKrw;
  const { fillCount, buyFillCount, sellFillCount } = fillSummary(parsed);
  const rejectLedger = parsed.rejectLedger as Record<string, unknown> | undefined;
  const reconciliation = parsed.reconciliation as Record<string, unknown> | undefined;
  const summary = metadata?.summary as Record<string, unknown> | undefined;

  return {
    path,
    sourceRunId,
    sessionId:
      typeof parsed.sessionId === "string" ? parsed.sessionId : sourceRunId,
    generatedAt:
      typeof parsed.generatedAt === "string" ? parsed.generatedAt : "",
    initialEquityKrw,
    endingEquityKrw: currentEndingEquity,
    markedPnlKrw,
    benchmarkPnlKrw,
    excessPnlKrw: benchmarkPnlKrw === null ? null : markedPnlKrw - benchmarkPnlKrw,
    fillCount,
    buyFillCount,
    sellFillCount,
    openPositionCount: positionCount(parsed),
    syntheticClose: (finiteNumber(summary?.syntheticCloseCount) ?? 0) > 0,
    rejectDecisionCount: finiteNumber(rejectLedger?.totalRejectedDecisions) ?? 0,
    reconciliationOk: reconciliation?.ok === true,
    exitReasonCodes: exitReasonsFromScenario(scenario),
  };
}

async function loadReports(root: string): Promise<{
  rows: ReportRow[];
  duplicateRunIds: string[];
}> {
  const byRunId = new Map<string, ReportRow>();
  const duplicateRunIds = new Set<string>();
  for (const path of await collectReportPaths(root)) {
    const row = await readReport(path);
    if (!row) {
      continue;
    }
    const existing = byRunId.get(row.sourceRunId);
    if (existing) {
      duplicateRunIds.add(row.sourceRunId);
      if (row.generatedAt <= existing.generatedAt) {
        continue;
      }
    }
    byRunId.set(row.sourceRunId, row);
  }
  return {
    rows: [...byRunId.values()].sort((left, right) =>
      left.sourceRunId.localeCompare(right.sourceRunId),
    ),
    duplicateRunIds: [...duplicateRunIds].sort(),
  };
}

function sum(rows: ReportRow[], select: (row: ReportRow) => number): number {
  return rows.reduce((total, row) => total + select(row), 0);
}

function sumNullable(rows: ReportRow[], select: (row: ReportRow) => number | null): number | null {
  let total = 0;
  let count = 0;
  for (const row of rows) {
    const value = select(row);
    if (value === null) {
      continue;
    }
    total += value;
    count += 1;
  }
  return count > 0 ? total : null;
}

function summarizeRows(rows: ReportRow[]) {
  return {
    sessionCount: rows.length,
    totalPnlKrw: sum(rows, (row) => row.markedPnlKrw),
    totalBenchmarkPnlKrw: sumNullable(rows, (row) => row.benchmarkPnlKrw),
    totalExcessPnlKrw: sumNullable(rows, (row) => row.excessPnlKrw),
    tradedSessionCount: rows.filter((row) => row.fillCount > 0).length,
    closedSessionCount: rows.filter((row) => row.sellFillCount > 0).length,
    openPositionSessions: rows.filter((row) => row.openPositionCount > 0).length,
    syntheticCloseSessions: rows.filter((row) => row.syntheticClose).length,
    rejectedDecisionSessions: rows.filter((row) => row.rejectDecisionCount > 0).length,
    reconciliationFailureSessions: rows.filter((row) => !row.reconciliationOk).length,
  };
}

function summarizePairDeltas(pairs: PairedRow[]) {
  const baselineRows = pairs.map((pair) => pair.baseline);
  const candidateRows = pairs.map((pair) => pair.candidate);
  const baseline = summarizeRows(baselineRows);
  const candidate = summarizeRows(candidateRows);
  return {
    baseline,
    candidate,
    delta: {
      totalPnlKrw: candidate.totalPnlKrw - baseline.totalPnlKrw,
      totalBenchmarkPnlKrw:
        baseline.totalBenchmarkPnlKrw === null || candidate.totalBenchmarkPnlKrw === null
          ? null
          : candidate.totalBenchmarkPnlKrw - baseline.totalBenchmarkPnlKrw,
      totalExcessPnlKrw:
        baseline.totalExcessPnlKrw === null || candidate.totalExcessPnlKrw === null
          ? null
          : candidate.totalExcessPnlKrw - baseline.totalExcessPnlKrw,
      tradedSessionCount: candidate.tradedSessionCount - baseline.tradedSessionCount,
      closedSessionCount: candidate.closedSessionCount - baseline.closedSessionCount,
      openPositionSessions: candidate.openPositionSessions - baseline.openPositionSessions,
    },
  };
}

function summarizeFocusCohort(pairs: PairedRow[], focusExitReason: string) {
  const focusPairs = pairs.filter((pair) =>
    pair.baseline.exitReasonCodes.includes(focusExitReason),
  );
  const baselineRows = focusPairs.map((pair) => pair.baseline);
  const candidateRows = focusPairs.map((pair) => pair.candidate);
  const candidateOpenRows = candidateRows.filter((row) => row.openPositionCount > 0);
  const candidateClosedRows = candidateRows.filter((row) => row.sellFillCount > 0);
  const improvedPnlCount = focusPairs.filter(
    (pair) => pair.candidate.markedPnlKrw > pair.baseline.markedPnlKrw,
  ).length;
  const worsePnlCount = focusPairs.filter(
    (pair) => pair.candidate.markedPnlKrw < pair.baseline.markedPnlKrw,
  ).length;
  const baseline = summarizeRows(baselineRows);
  const candidate = summarizeRows(candidateRows);
  const totalPnlDeltaKrw = candidate.totalPnlKrw - baseline.totalPnlKrw;
  const totalExcessDeltaKrw =
    baseline.totalExcessPnlKrw === null || candidate.totalExcessPnlKrw === null
      ? null
      : candidate.totalExcessPnlKrw - baseline.totalExcessPnlKrw;

  return {
    focusExitReason,
    pairedSessionCount: focusPairs.length,
    baseline,
    candidate,
    delta: {
      totalPnlKrw: totalPnlDeltaKrw,
      totalExcessPnlKrw: totalExcessDeltaKrw,
      improvedPnlSessions: improvedPnlCount,
      worsePnlSessions: worsePnlCount,
    },
    openRiskMigration: {
      candidateOpenPositionSessions: candidateOpenRows.length,
      candidateOpenMarkedPnlKrw: sum(candidateOpenRows, (row) => row.markedPnlKrw),
      candidateClosedSessionCount: candidateClosedRows.length,
      candidateDeferredSessionIds: candidateOpenRows.map((row) => row.sessionId),
    },
    supportsExitChange:
      focusPairs.length > 0 &&
      totalPnlDeltaKrw > 0 &&
      (totalExcessDeltaKrw ?? Number.NEGATIVE_INFINITY) > 0 &&
      candidateOpenRows.length === 0,
  };
}

function buildPairedRows(
  baselineRows: ReportRow[],
  candidateRows: ReportRow[],
): {
  pairs: PairedRow[];
  missingCandidateRunIds: string[];
  missingBaselineRunIds: string[];
} {
  const baselineByRunId = new Map(baselineRows.map((row) => [row.sourceRunId, row]));
  const candidateByRunId = new Map(candidateRows.map((row) => [row.sourceRunId, row]));
  const pairs: PairedRow[] = [];
  const missingCandidateRunIds: string[] = [];

  for (const baseline of baselineRows) {
    const candidate = candidateByRunId.get(baseline.sourceRunId);
    if (!candidate) {
      missingCandidateRunIds.push(baseline.sourceRunId);
      continue;
    }
    pairs.push({ sourceRunId: baseline.sourceRunId, baseline, candidate });
  }

  const missingBaselineRunIds = candidateRows
    .filter((row) => !baselineByRunId.has(row.sourceRunId))
    .map((row) => row.sourceRunId);

  return {
    pairs,
    missingCandidateRunIds,
    missingBaselineRunIds,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const baseline = await loadReports(args.baselineReportsRoot);
  const candidate = await loadReports(args.candidateReportsRoot);
  const paired = buildPairedRows(baseline.rows, candidate.rows);
  const focusCohort = summarizeFocusCohort(paired.pairs, args.focusExitReason);
  const allPairs = summarizePairDeltas(paired.pairs);
  const liveEvidenceReasons = [
    ...(paired.pairs.length === 0 ? ["no paired sessions"] : []),
    ...(focusCohort.pairedSessionCount === 0
      ? [`no paired baseline ${args.focusExitReason} cohort`]
      : []),
    ...(focusCohort.delta.totalPnlKrw > 0
      ? []
      : [`${args.focusExitReason} candidate PnL delta is not positive`]),
    ...((focusCohort.delta.totalExcessPnlKrw ?? Number.NEGATIVE_INFINITY) > 0
      ? []
      : [`${args.focusExitReason} candidate BTC excess delta is not positive`]),
    ...(focusCohort.openRiskMigration.candidateOpenPositionSessions === 0
      ? []
      : [
          `${args.focusExitReason} candidate has ${focusCohort.openRiskMigration.candidateOpenPositionSessions} open-position sessions`,
        ]),
    ...(allPairs.delta.totalPnlKrw > 0
      ? []
      : ["overall paired PnL delta is not positive"]),
    ...((allPairs.delta.totalExcessPnlKrw ?? Number.NEGATIVE_INFINITY) > 0
      ? []
      : ["overall paired BTC excess delta is not positive"]),
  ];

  console.log(
    JSON.stringify(
      {
        source: {
          baselineReportsRoot: args.baselineReportsRoot,
          candidateReportsRoot: args.candidateReportsRoot,
        },
        pairing: {
          baselineSessionCount: baseline.rows.length,
          candidateSessionCount: candidate.rows.length,
          pairedSessionCount: paired.pairs.length,
          missingCandidateRunIds: paired.missingCandidateRunIds,
          missingBaselineRunIds: paired.missingBaselineRunIds,
          baselineDuplicateRunIds: baseline.duplicateRunIds,
          candidateDuplicateRunIds: candidate.duplicateRunIds,
        },
        allPairs,
        focusCohort,
        liveEvidence: {
          supportsLivePromotion: liveEvidenceReasons.length === 0,
          reasons: liveEvidenceReasons,
          note:
            "Paired deltas are evidence for choosing the next paper experiment only; live promotion still requires the full dry-run liveReadiness gate.",
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
