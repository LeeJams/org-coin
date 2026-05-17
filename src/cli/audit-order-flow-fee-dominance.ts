import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface Args {
  sourceReportPath: string | null;
  targetFeeRoundTripBps: number | null;
  outputPath: string | null;
}

interface OrderFlowReport {
  generatedAt?: string;
  assumptions?: {
    markets?: string[];
    signalMode?: string;
    horizonSecondsList?: number[];
    notionalKrw?: number;
    feeRoundTripBps?: number;
    feeRoundTripRate?: number;
  };
  candidateCount?: number;
  promotionCandidateCount?: number;
  promotionCandidates?: unknown[];
  topByTest?: unknown[];
}

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    sourceReportPath: null,
    targetFeeRoundTripBps: null,
    outputPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--source-report") {
      if (!value) throw new Error("--source-report requires a value");
      args.sourceReportPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--target-fee-round-trip-bps") {
      if (!value) throw new Error("--target-fee-round-trip-bps requires a value");
      args.targetFeeRoundTripBps = positiveNumber(value, "--target-fee-round-trip-bps");
      index += 1;
      continue;
    }
    if (arg === "--output") {
      if (!value) throw new Error("--output requires a value");
      args.outputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  if (args.sourceReportPath === null) throw new Error("--source-report is required");
  if (args.targetFeeRoundTripBps === null) throw new Error("--target-fee-round-trip-bps is required");
  return args;
}

function positiveNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be positive`);
  return parsed;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const source = await readJson<OrderFlowReport>(args.sourceReportPath!);
  const sourceFeeRoundTripBps = finiteNumber(source.assumptions?.feeRoundTripBps);
  if (sourceFeeRoundTripBps === null) {
    throw new Error("source report must include assumptions.feeRoundTripBps");
  }
  if (args.targetFeeRoundTripBps! < sourceFeeRoundTripBps) {
    throw new Error("--target-fee-round-trip-bps must be greater than or equal to the source fee");
  }
  const sourcePromotionCandidateCount = finiteNumber(source.promotionCandidateCount);
  if (sourcePromotionCandidateCount === null) {
    throw new Error("source report must include promotionCandidateCount");
  }
  const sourceHasNoPromotionCandidates = sourcePromotionCandidateCount === 0;
  const targetNoPromotionByDominance =
    args.targetFeeRoundTripBps! >= sourceFeeRoundTripBps && sourceHasNoPromotionCandidates;

  const report = {
    generatedAt: new Date().toISOString(),
    objective:
      "Certify order-flow fee stress dominance without rerunning the full passive-snapshot simulation.",
    status: targetNoPromotionByDominance ? "blocked" : "inconclusive",
    note:
      "For this long-only taker-style order-flow scan, higher round-trip fees subtract a non-negative constant from every simulated trade PnL. A candidate that fails promotion at a lower fee cannot become promotion-eligible at a higher fee.",
    sourceReport: {
      path: args.sourceReportPath,
      generatedAt: source.generatedAt ?? null,
      feeRoundTripBps: sourceFeeRoundTripBps,
      promotionCandidateCount: sourcePromotionCandidateCount,
      candidateCount: source.candidateCount ?? null,
      signalMode: source.assumptions?.signalMode ?? null,
    },
    assumptions: {
      markets: source.assumptions?.markets ?? [],
      signalMode: source.assumptions?.signalMode ?? null,
      horizonSecondsList: source.assumptions?.horizonSecondsList ?? [],
      notionalKrw: source.assumptions?.notionalKrw ?? null,
      sourceFeeRoundTripBps,
      feeRoundTripBps: args.targetFeeRoundTripBps,
      dominanceCondition:
        "target fee is greater than or equal to source fee and source promotionCandidateCount is zero",
    },
    checks: {
      targetFeeNoLowerThanSource: args.targetFeeRoundTripBps! >= sourceFeeRoundTripBps,
      sourceHasNoPromotionCandidates,
      targetNoPromotionByDominance,
    },
    candidateCount: source.candidateCount ?? null,
    promotionCandidateCount: targetNoPromotionByDominance ? 0 : null,
    promotionCandidates: targetNoPromotionByDominance ? [] : null,
    sourceTopByTest: (source.topByTest ?? []).slice(0, 5),
  };

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, serialized, "utf8");
  }
  process.stdout.write(serialized);
  if (!targetNoPromotionByDominance) process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
