import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

import { REQUIRED_LIVE_GOAL_COMPLETION_CRITERIA_IDS } from "../runtime/live-goal-completion-audit.js";

const execFileAsync = promisify(execFile);

interface Args {
  liveGoalStatusPath: string | null;
  pm2JlistPath: string | null;
  pm2DumpPath: string | null;
  outputPath: string | null;
  requireAligned: boolean;
  quiet: boolean;
}

interface LiveGoalStatus {
  liveStartupAllowed?: boolean;
  selectedLiveCandidate?: unknown;
  completionAudit?: {
    achieved?: boolean;
    criteria?: Array<{
      id?: string;
      passed?: boolean;
    }>;
    failedCompletionCriteria?: string[];
    missingRequirements?: string[];
    missingRequirementCount?: number;
  };
  liveStartupPlan?: {
    pm2StartCommand?: string | null;
  };
  processControlPlan?: {
    liveExecution?: {
      allowed?: boolean;
      desiredState?: string;
      selectedLiveCandidate?: unknown;
    };
    btcMomentum?: {
      desiredState?: string;
      allowNewEntry?: boolean;
      allowedObserverProcesses?: string[];
    };
    managedPaperReentry?: {
      desiredState?: string;
      allowNewEntry?: boolean;
    };
    carryResearch?: {
      desiredState?: string;
      allowLiveStart?: boolean;
      focusMarket?: string;
      fallbackMarket?: string;
    };
  };
}

interface Pm2Process {
  name?: string;
  pm2_env?: {
    status?: string;
    args?: unknown;
    autorestart?: unknown;
    restart_delay?: unknown;
    restart_time?: unknown;
    unstable_restarts?: unknown;
    pm_uptime?: unknown;
    env?: Record<string, unknown>;
    ENABLE_LIVE_EXECUTION?: unknown;
    TRADING_MODE?: unknown;
  };
}

interface Pm2DumpProcess {
  name?: string;
  args?: unknown;
  autorestart?: unknown;
  restart_delay?: unknown;
  env?: Record<string, unknown>;
  ENABLE_LIVE_EXECUTION?: unknown;
  TRADING_MODE?: unknown;
}

interface ProcessSummary {
  name: string;
  status: string | null;
  tradingMode: string | null;
  liveExecutionFlag: string | null;
  autorestart: boolean | null;
  restartDelayMs: number | null;
  restartCount: number | null;
  unstableRestarts: number | null;
  lastStartedAt: string | null;
  expectedLoopingObserver: boolean;
  allowed: boolean;
  allowedReason: string | null;
  argumentAudit: {
    requiredSubstrings: string[];
    missingSubstrings: string[];
  } | null;
}

interface Violation {
  processName: string;
  reason: string;
  detail?: unknown;
}

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    liveGoalStatusPath: null,
    pm2JlistPath: null,
    pm2DumpPath: null,
    outputPath: null,
    requireAligned: false,
    quiet: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--live-goal-status") {
      if (!value) throw new Error("--live-goal-status requires a value");
      args.liveGoalStatusPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--pm2-jlist") {
      if (!value) throw new Error("--pm2-jlist requires a value");
      args.pm2JlistPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--pm2-dump") {
      if (!value) throw new Error("--pm2-dump requires a value");
      args.pm2DumpPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--output") {
      if (!value) throw new Error("--output requires a value");
      args.outputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--require-aligned") {
      args.requireAligned = true;
      continue;
    }
    if (arg === "--quiet") {
      args.quiet = true;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  if (args.liveGoalStatusPath === null) {
    throw new Error("--live-goal-status is required");
  }

  return args;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readPm2Processes(pm2JlistPath: string | null): Promise<Pm2Process[]> {
  if (pm2JlistPath !== null) {
    return readJson<Pm2Process[]>(pm2JlistPath);
  }
  const { stdout } = await execFileAsync("pm2", ["jlist"], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(stdout) as Pm2Process[];
}

function envValue(process: Pm2Process, key: string): string | null {
  const value = process.pm2_env?.env?.[key] ?? process.pm2_env?.[key as keyof Pm2Process["pm2_env"]];
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
}

function dumpEnvValue(process: Pm2DumpProcess, key: string): string | null {
  const value = process.env?.[key] ?? process[key as keyof Pm2DumpProcess];
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return null;
}

function timestampValue(value: unknown): string | null {
  const timestamp = numericValue(value);
  if (timestamp === null || timestamp <= 0) return null;
  return new Date(timestamp).toISOString();
}

function isPresentStatus(status: string | undefined): boolean {
  return status !== undefined && status !== "stopped" && status !== "errored";
}

function classifyAllowedProcess(name: string, liveGoal: LiveGoalStatus): string | null {
  if (name === "dry-run-live-goal-status-observer") return "live_goal_status_refresh";

  const allowedBtcObservers = new Set(
    liveGoal.processControlPlan?.btcMomentum?.allowedObserverProcesses ?? [],
  );
  if (allowedBtcObservers.has(name)) return "btc_exit_reconciliation_only";

  const carryResearch = liveGoal.processControlPlan?.carryResearch;
  if (
    (
      carryResearch?.desiredState === "continue_observation_only" ||
      carryResearch?.desiredState === "recompare_challenger_before_live_review"
    ) &&
    name.startsWith("dry-run-spot-perp-carry-")
  ) {
    return "spot_perp_carry_observation_only";
  }

  if (liveGoalAllowsLiveProcess(liveGoal)) {
    const allowedLiveProcessName = liveProcessNameFromPm2StartCommand(
      liveGoal.liveStartupPlan?.pm2StartCommand,
    );
    if (allowedLiveProcessName !== null && name === allowedLiveProcessName) {
      return "live_startup_allowed_by_goal_gate";
    }
  }

  return null;
}

function completionAuditAllowsLive(liveGoal: LiveGoalStatus): boolean {
  const audit = liveGoal.completionAudit;
  if (audit === undefined) return false;
  if (audit.achieved !== true) return false;
  if (!Array.isArray(audit.failedCompletionCriteria) || audit.failedCompletionCriteria.length > 0) {
    return false;
  }
  if (!Array.isArray(audit.missingRequirements) || audit.missingRequirements.length > 0) {
    return false;
  }
  return (
    typeof audit.missingRequirementCount === "number" &&
    Number.isFinite(audit.missingRequirementCount) &&
    Number.isInteger(audit.missingRequirementCount) &&
    audit.missingRequirementCount === 0
  );
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function completionAuditSchemaViolation(liveGoal: LiveGoalStatus): Violation | null {
  const audit = liveGoal.completionAudit;
  if (audit === undefined) {
    return {
      processName: "live-goal-status",
      reason: "liveGoalCompletionAuditMissing",
      detail: { completionAudit: null },
    };
  }
  if (!Array.isArray(audit.criteria)) {
    return {
      processName: "live-goal-status",
      reason: "liveGoalCompletionAuditMalformed",
      detail: { field: "criteria", completionAudit: audit },
    };
  }
  const criterionIds: string[] = [];
  for (const criterion of audit.criteria) {
    if (
      criterion === null ||
      typeof criterion !== "object" ||
      Array.isArray(criterion) ||
      typeof criterion.id !== "string" ||
      criterion.id.length === 0 ||
      typeof criterion.passed !== "boolean"
    ) {
      return {
        processName: "live-goal-status",
        reason: "liveGoalCompletionAuditMalformed",
        detail: { field: "criteria", completionAudit: audit },
      };
    }
    criterionIds.push(criterion.id);
  }
  if (new Set(criterionIds).size !== criterionIds.length) {
    return {
      processName: "live-goal-status",
      reason: "liveGoalCompletionAuditMalformed",
      detail: { field: "criteria.id", completionAudit: audit },
    };
  }
  const missingRequiredCriterionIds = REQUIRED_LIVE_GOAL_COMPLETION_CRITERIA_IDS.filter(
    (id) => !criterionIds.includes(id),
  );
  if (missingRequiredCriterionIds.length > 0) {
    return {
      processName: "live-goal-status",
      reason: "liveGoalCompletionAuditMalformed",
      detail: {
        field: "criteria.requiredIds",
        missingRequiredCriterionIds,
        completionAudit: audit,
      },
    };
  }
  if (!Array.isArray(audit.failedCompletionCriteria)) {
    return {
      processName: "live-goal-status",
      reason: "liveGoalCompletionAuditMalformed",
      detail: { field: "failedCompletionCriteria", completionAudit: audit },
    };
  }
  const failedCriterionIds = audit.criteria
    .filter((criterion) => criterion.passed !== true)
    .map((criterion) => criterion.id as string);
  if (!sameStringSet(audit.failedCompletionCriteria, failedCriterionIds)) {
    return {
      processName: "live-goal-status",
      reason: "liveGoalCompletionAuditMalformed",
      detail: {
        field: "failedCompletionCriteria",
        failedCompletionCriteria: audit.failedCompletionCriteria,
        expectedFailedCompletionCriteria: failedCriterionIds,
      },
    };
  }
  if (!Array.isArray(audit.missingRequirements)) {
    return {
      processName: "live-goal-status",
      reason: "liveGoalCompletionAuditMalformed",
      detail: { field: "missingRequirements", completionAudit: audit },
    };
  }
  if (
    typeof audit.missingRequirementCount !== "number" ||
    !Number.isFinite(audit.missingRequirementCount) ||
    !Number.isInteger(audit.missingRequirementCount) ||
    audit.missingRequirementCount < 0
  ) {
    return {
      processName: "live-goal-status",
      reason: "liveGoalCompletionAuditMalformed",
      detail: { field: "missingRequirementCount", completionAudit: audit },
    };
  }
  if (audit.missingRequirementCount !== audit.missingRequirements.length) {
    return {
      processName: "live-goal-status",
      reason: "liveGoalCompletionAuditMalformed",
      detail: {
        field: "missingRequirementCount",
        missingRequirementCount: audit.missingRequirementCount,
        missingRequirementsLength: audit.missingRequirements.length,
      },
    };
  }
  if (
    audit.achieved === true &&
    (audit.failedCompletionCriteria.length > 0 || audit.missingRequirementCount > 0)
  ) {
    return {
      processName: "live-goal-status",
      reason: "liveGoalCompletionAuditContradiction",
      detail: { completionAudit: audit },
    };
  }
  if (
    audit.achieved === false &&
    audit.failedCompletionCriteria.length === 0 &&
    audit.missingRequirementCount === 0
  ) {
    return {
      processName: "live-goal-status",
      reason: "liveGoalCompletionAuditContradiction",
      detail: { completionAudit: audit },
    };
  }
  return null;
}

function liveGoalAllowsLiveProcess(liveGoal: LiveGoalStatus): boolean {
  return (
    liveGoal.liveStartupAllowed === true &&
    liveGoal.processControlPlan?.liveExecution?.allowed === true &&
    completionAuditAllowsLive(liveGoal)
  );
}

function liveProcessNameFromPm2StartCommand(command: unknown): string | null {
  if (typeof command !== "string") return null;
  const directPm2Match = command.match(/(?:^|\s)--only\s+([^\s]+)/);
  if (directPm2Match?.[1]) return directPm2Match[1];
  const npmScriptMatch = command.match(/(?:^|\s)pm2:start:([^\s]+)/);
  return npmScriptMatch?.[1] ?? null;
}

function isExpectedLoopingObserver(allowedReason: string | null): boolean {
  return allowedReason === "spot_perp_carry_observation_only" || allowedReason === "live_goal_status_refresh";
}

function processArgs(process: Pm2Process): string[] {
  const args = process.pm2_env?.args;
  if (Array.isArray(args)) {
    return args.flatMap((value) => (typeof value === "string" ? [value] : []));
  }
  return typeof args === "string" ? [args] : [];
}

function dumpProcessArgs(process: Pm2DumpProcess): string[] {
  const args = process.args;
  if (Array.isArray(args)) {
    return args.flatMap((value) => (typeof value === "string" ? [value] : []));
  }
  return typeof args === "string" ? [args] : [];
}

function requiredProcessArgSubstrings(name: string): string[] {
  if (name === "dry-run-live-goal-status-observer") {
    return ["dry-run:refresh-live-goal-status-if-due"];
  }
  if (name === "dry-run-spot-perp-carry-opportunity-72h-observer") {
    return [
      "KRW-PIEVERSE:PIEVERSEUSDT",
      "KRW-DEEP:DEEPUSDT",
      "KRW-PARTI:PARTIUSDT",
      "KRW-KITE:KITEUSDT",
      "KRW-METIS:METISUSDT",
      "KRW-MOVE:MOVEUSDT",
      "KRW-NIL:NILUSDT",
      "KRW-BSV:BSVUSDT",
      "KRW-BABY:BABYUSDT",
      "KRW-EDEN:EDENUSDT",
      "KRW-SXT:SXTUSDT",
      "KRW-LIT:LITUSDT",
      "KRW-MON:MONUSDT",
      "KRW-MOCA:MOCAUSDT",
      "KRW-MERL:MERLUSDT",
      "KRW-ILV:ILVUSDT",
      "KRW-AZTEC:AZTECUSDT",
      "KRW-TIA:TIAUSDT",
      "KRW-PRL:PRLUSDT",
      "KRW-FRAX:FRAXUSDT",
      "KRW-ZK:ZKUSDT",
      "KRW-D:DUSDT",
      "KRW-H:HUSDT",
      "KRW-HEMI:HEMIUSDT",
      "KRW-SAHARA:SAHARAUSDT",
      "KRW-IN:INUSDT",
      "KRW-XAN:XANUSDT",
      "KRW-ICP:ICPUSDT",
      "KRW-ORCA:ORCAUSDT",
      "KRW-RECALL:RECALLUSDT",
      "KRW-CYS:CYSUSDT",
      "KRW-PROMPT:PROMPTUSDT",
      "KRW-SONIC:SONICUSDT",
      "KRW-VVV:VVVUSDT",
      "KRW-EDU:EDUUSDT",
      "KRW-API3:API3USDT",
      "KRW-AKT:AKTUSDT",
      "KRW-ACX:ACXUSDT",
      "KRW-ARPA:ARPAUSDT",
      "KRW-POLYX:POLYXUSDT",
      "KRW-ETHFI:ETHFIUSDT",
      "KRW-TOSHI:TOSHIUSDT",
      "KRW-STABLE:STABLEUSDT",
      "KRW-SCR:SCRUSDT",
      "KRW-CVC:CVCUSDT",
      "KRW-BTR:BTRUSDT",
      "KRW-EUL:EULUSDT",
      "KRW-XVS:XVSUSDT",
      "KRW-G:GUSDT",
      "KRW-ELSA:ELSAUSDT",
      "KRW-GPS:GPSUSDT",
      "KRW-RPL:RPLUSDT",
      "var/reports/spot-perp-carry-opportunity-72h-latest.json",
    ];
  }
  return [];
}

function auditProcesses(liveGoal: LiveGoalStatus, processes: Pm2Process[]): {
  summaries: ProcessSummary[];
  violations: Violation[];
} {
  const liveStartupAllowed = liveGoalAllowsLiveProcess(liveGoal);
  const summaries: ProcessSummary[] = [];
  const violations: Violation[] = [];
  const completionAuditViolation = completionAuditSchemaViolation(liveGoal);

  if (completionAuditViolation !== null) {
    violations.push(completionAuditViolation);
  }

  if (
    liveGoal.liveStartupAllowed === true &&
    liveGoal.processControlPlan?.liveExecution?.allowed === true &&
    !completionAuditAllowsLive(liveGoal)
  ) {
    violations.push({
      processName: "live-goal-status",
      reason: "liveStartupAllowedWithoutCompletedAudit",
      detail: {
        completionAudit: liveGoal.completionAudit ?? null,
      },
    });
  }

  for (const process of processes) {
    const name = process.name ?? "";
    if (name.length === 0 || !isPresentStatus(process.pm2_env?.status)) continue;

    const status = process.pm2_env?.status ?? null;
    const tradingMode = envValue(process, "TRADING_MODE");
    const liveExecutionFlag = envValue(process, "ENABLE_LIVE_EXECUTION");
    const allowedReason = classifyAllowedProcess(name, liveGoal);
    const allowed = allowedReason !== null;
    const autorestart = booleanValue(process.pm2_env?.autorestart);
    const restartDelayMs = numericValue(process.pm2_env?.restart_delay);
    const restartCount = numericValue(process.pm2_env?.restart_time);
    const unstableRestarts = numericValue(process.pm2_env?.unstable_restarts);
    const expectedLoopingObserver = isExpectedLoopingObserver(allowedReason);
    const requiredArgSubstrings = requiredProcessArgSubstrings(name);
    const args = processArgs(process);
    const missingArgSubstrings = requiredArgSubstrings.filter(
      (required) => !args.some((arg) => arg.includes(required)),
    );
    const argumentAudit =
      requiredArgSubstrings.length > 0
        ? {
            requiredSubstrings: requiredArgSubstrings,
            missingSubstrings: missingArgSubstrings,
          }
        : null;

    summaries.push({
      name,
      status,
      tradingMode,
      liveExecutionFlag,
      autorestart,
      restartDelayMs,
      restartCount,
      unstableRestarts,
      lastStartedAt: timestampValue(process.pm2_env?.pm_uptime),
      expectedLoopingObserver,
      allowed,
      allowedReason,
      argumentAudit,
    });

    if (!liveStartupAllowed && name.startsWith("live-")) {
      violations.push({
        processName: name,
        reason: "liveProcessPresentWhileLiveStartupBlocked",
      });
    }
    if (!liveStartupAllowed && liveExecutionFlag === "true") {
      violations.push({
        processName: name,
        reason: "liveExecutionFlagTrueWhileLiveStartupBlocked",
      });
    }
    if (!allowed) {
      violations.push({
        processName: name,
        reason: "processNotAllowedByLiveGoalProcessControlPlan",
        detail: {
          status,
          tradingMode,
          liveExecutionFlag,
        },
      });
    }
    if (allowed && missingArgSubstrings.length > 0) {
      violations.push({
        processName: name,
        reason: "processArgumentsMissingRequiredValues",
        detail: {
          requiredSubstrings: requiredArgSubstrings,
          missingSubstrings: missingArgSubstrings,
          args,
        },
      });
    }
    if (allowed && expectedLoopingObserver && (unstableRestarts ?? 0) > 0) {
      violations.push({
        processName: name,
        reason: "expectedLoopingObserverHasUnstableRestarts",
        detail: {
          unstableRestarts,
          restartCount,
        },
      });
    }
  }

  summaries.sort((a, b) => a.name.localeCompare(b.name));
  violations.sort((a, b) => a.processName.localeCompare(b.processName) || a.reason.localeCompare(b.reason));

  return { summaries, violations };
}

async function auditSavedLiveGoalObserver(pm2DumpPath: string | null): Promise<{
  savedProcessControl: Record<string, unknown> | null;
  violations: Violation[];
}> {
  if (pm2DumpPath === null) {
    return {
      savedProcessControl: null,
      violations: [],
    };
  }

  const dumpProcesses = await readJson<Pm2DumpProcess[]>(pm2DumpPath);
  const observer = dumpProcesses.find((process) => process.name === "dry-run-live-goal-status-observer");
  const violations: Violation[] = [];
  if (observer === undefined) {
    violations.push({
      processName: "dump:dry-run-live-goal-status-observer",
      reason: "savedLiveGoalObserverMissingFromPm2Dump",
      detail: { pm2DumpPath },
    });
    return {
      savedProcessControl: {
        pm2DumpPath,
        liveGoalObserverPresent: false,
      },
      violations,
    };
  }

  const args = dumpProcessArgs(observer);
  const requiredArgSubstrings = requiredProcessArgSubstrings("dry-run-live-goal-status-observer");
  const missingArgSubstrings = requiredArgSubstrings.filter(
    (required) => !args.some((arg) => arg.includes(required)),
  );
  const autorestart = booleanValue(observer.autorestart);
  const restartDelayMs = numericValue(observer.restart_delay);
  const tradingMode = dumpEnvValue(observer, "TRADING_MODE");
  const liveExecutionFlag = dumpEnvValue(observer, "ENABLE_LIVE_EXECUTION");

  if (missingArgSubstrings.length > 0) {
    violations.push({
      processName: "dump:dry-run-live-goal-status-observer",
      reason: "savedLiveGoalObserverArgumentsMissingRequiredValues",
      detail: {
        requiredSubstrings: requiredArgSubstrings,
        missingSubstrings: missingArgSubstrings,
        args,
      },
    });
  }
  if (autorestart !== true) {
    violations.push({
      processName: "dump:dry-run-live-goal-status-observer",
      reason: "savedLiveGoalObserverAutorestartDisabled",
      detail: { autorestart },
    });
  }
  if (restartDelayMs !== 600000) {
    violations.push({
      processName: "dump:dry-run-live-goal-status-observer",
      reason: "savedLiveGoalObserverRestartDelayMismatch",
      detail: { restartDelayMs, expectedRestartDelayMs: 600000 },
    });
  }
  if (tradingMode !== "paper") {
    violations.push({
      processName: "dump:dry-run-live-goal-status-observer",
      reason: "savedLiveGoalObserverTradingModeNotPaper",
      detail: { tradingMode },
    });
  }
  if (liveExecutionFlag !== "false") {
    violations.push({
      processName: "dump:dry-run-live-goal-status-observer",
      reason: "savedLiveGoalObserverLiveExecutionFlagNotFalse",
      detail: { liveExecutionFlag },
    });
  }

  return {
    savedProcessControl: {
      pm2DumpPath,
      liveGoalObserverPresent: true,
      args,
      requiredSubstrings: requiredArgSubstrings,
      missingSubstrings: missingArgSubstrings,
      autorestart,
      restartDelayMs,
      expectedRestartDelayMs: 600000,
      tradingMode,
      liveExecutionFlag,
      aligned: violations.length === 0,
    },
    violations,
  };
}

async function auditSavedExpectedLoopingObservers(
  pm2DumpPath: string | null,
  summaries: ProcessSummary[],
): Promise<{
  savedLoopingObserverControl: Record<string, unknown> | null;
  violations: Violation[];
}> {
  if (pm2DumpPath === null) {
    return {
      savedLoopingObserverControl: null,
      violations: [],
    };
  }

  const dumpProcesses = await readJson<Pm2DumpProcess[]>(pm2DumpPath);
  const expectedObservers = summaries.filter(
    (summary) =>
      summary.expectedLoopingObserver &&
      summary.name !== "dry-run-live-goal-status-observer",
  );
  const violations: Violation[] = [];
  const observerReports: Array<Record<string, unknown>> = [];
  const missingObserverNames: string[] = [];

  for (const expectedObserver of expectedObservers) {
    const savedObserver = dumpProcesses.find((process) => process.name === expectedObserver.name);
    if (savedObserver === undefined) {
      missingObserverNames.push(expectedObserver.name);
      violations.push({
        processName: `dump:${expectedObserver.name}`,
        reason: "expectedLoopingObserverMissingFromPm2Dump",
        detail: { pm2DumpPath },
      });
      continue;
    }

    const args = dumpProcessArgs(savedObserver);
    const requiredArgSubstrings = requiredProcessArgSubstrings(expectedObserver.name);
    const missingArgSubstrings = requiredArgSubstrings.filter(
      (required) => !args.some((arg) => arg.includes(required)),
    );
    const autorestart = booleanValue(savedObserver.autorestart);
    const restartDelayMs = numericValue(savedObserver.restart_delay);
    const tradingMode = dumpEnvValue(savedObserver, "TRADING_MODE");
    const liveExecutionFlag = dumpEnvValue(savedObserver, "ENABLE_LIVE_EXECUTION");

    if (missingArgSubstrings.length > 0) {
      violations.push({
        processName: `dump:${expectedObserver.name}`,
        reason: "savedExpectedLoopingObserverArgumentsMissingRequiredValues",
        detail: {
          requiredSubstrings: requiredArgSubstrings,
          missingSubstrings: missingArgSubstrings,
          args,
        },
      });
    }
    if (autorestart !== true) {
      violations.push({
        processName: `dump:${expectedObserver.name}`,
        reason: "savedExpectedLoopingObserverAutorestartDisabled",
        detail: { autorestart },
      });
    }
    if (
      expectedObserver.restartDelayMs !== null &&
      restartDelayMs !== expectedObserver.restartDelayMs
    ) {
      violations.push({
        processName: `dump:${expectedObserver.name}`,
        reason: "savedExpectedLoopingObserverRestartDelayMismatch",
        detail: {
          restartDelayMs,
          expectedRestartDelayMs: expectedObserver.restartDelayMs,
        },
      });
    }
    if (tradingMode !== "paper") {
      violations.push({
        processName: `dump:${expectedObserver.name}`,
        reason: "savedExpectedLoopingObserverTradingModeNotPaper",
        detail: { tradingMode },
      });
    }
    if (liveExecutionFlag !== "false") {
      violations.push({
        processName: `dump:${expectedObserver.name}`,
        reason: "savedExpectedLoopingObserverLiveExecutionFlagNotFalse",
        detail: { liveExecutionFlag },
      });
    }

    observerReports.push({
      name: expectedObserver.name,
      args,
      requiredSubstrings: requiredArgSubstrings,
      missingSubstrings: missingArgSubstrings,
      autorestart,
      restartDelayMs,
      expectedRestartDelayMs: expectedObserver.restartDelayMs,
      tradingMode,
      liveExecutionFlag,
      aligned:
        missingArgSubstrings.length === 0 &&
        autorestart === true &&
        (
          expectedObserver.restartDelayMs === null ||
          restartDelayMs === expectedObserver.restartDelayMs
        ) &&
        tradingMode === "paper" &&
        liveExecutionFlag === "false",
    });
  }

  return {
    savedLoopingObserverControl: {
      pm2DumpPath,
      expectedObserverNames: expectedObservers.map((observer) => observer.name),
      missingObserverNames,
      observers: observerReports,
      aligned: violations.length === 0,
    },
    violations,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const liveGoal = await readJson<LiveGoalStatus>(args.liveGoalStatusPath!);
  const processes = await readPm2Processes(args.pm2JlistPath);
  const processAudit = auditProcesses(liveGoal, processes);
  const savedProcessAudit = await auditSavedLiveGoalObserver(args.pm2DumpPath);
  const summaries = processAudit.summaries;
  const savedLoopingObserverAudit = await auditSavedExpectedLoopingObservers(
    args.pm2DumpPath,
    summaries,
  );
  const violations = [
    ...processAudit.violations,
    ...savedProcessAudit.violations,
    ...savedLoopingObserverAudit.violations,
  ];
  const aligned = violations.length === 0;
  const expectedLoopingObservers = summaries.filter((summary) => summary.expectedLoopingObserver);
  const processHealth = {
    onlineCount: summaries.filter((summary) => summary.status === "online").length,
    waitingRestartCount: summaries.filter((summary) => summary.status === "waiting restart").length,
    expectedLoopingObserverCount: expectedLoopingObservers.length,
    expectedLoopingObserversWithoutAutorestart: expectedLoopingObservers
      .filter((summary) => summary.autorestart !== true)
      .map((summary) => summary.name),
    unstableRestartProcessCount: summaries.filter((summary) => (summary.unstableRestarts ?? 0) > 0).length,
    maxRestartDelayMs: summaries.reduce(
      (max, summary) => Math.max(max, summary.restartDelayMs ?? 0),
      0,
    ),
  };
  const report = {
    generatedAt: new Date().toISOString(),
    status: aligned ? "aligned" : "blocked",
    aligned,
    liveStartupAllowed: liveGoal.liveStartupAllowed === true,
    selectedLiveCandidate: liveGoal.selectedLiveCandidate ?? null,
    processPolicy: {
      liveExecutionAllowed: liveGoal.processControlPlan?.liveExecution?.allowed === true,
      btcMomentumAllowedObserverProcesses:
        liveGoal.processControlPlan?.btcMomentum?.allowedObserverProcesses ?? [],
      carryResearchDesiredState: liveGoal.processControlPlan?.carryResearch?.desiredState ?? null,
      managedPaperReentryAllowed: liveGoal.processControlPlan?.managedPaperReentry?.allowNewEntry === true,
    },
    processCount: summaries.length,
    processHealth,
    savedProcessControl: savedProcessAudit.savedProcessControl,
    savedLoopingObserverControl: savedLoopingObserverAudit.savedLoopingObserverControl,
    violationCount: violations.length,
    violations,
    processes: summaries,
    interpretation: aligned
      ? "PM2 process list matches the live-goal process control plan."
      : "PM2 process list contains live, reentry, or research processes that are not allowed by the current live-goal process control plan.",
  };

  if (args.outputPath !== null) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  if (!args.quiet || args.outputPath === null) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }

  if (args.requireAligned && !aligned) process.exitCode = 2;
}

main().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 1;
});
