import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface Args {
  summaryPath: string | null;
  outputPath: string | null;
  maxSummaryAgeMinutes: number | null;
  nowMs: number | null;
  quiet: boolean;
}

interface LiveGoalProgressSummary {
  generatedAt?: string;
  source?: {
    liveGoalStatusPath?: string | null;
    liveGoalGeneratedAt?: string | null;
    processAlignmentPath?: string | null;
    processAlignmentGeneratedAt?: string | null;
  };
  achieved?: boolean;
  missingRequirementCount?: number;
  missingRequirementClassification?: Record<string, string[]>;
  missingRequirementClassificationCounts?: Record<string, number>;
  outstandingWorkCounts?: Record<string, number>;
  completionAuditSummary?: {
    achieved?: boolean;
    failedCompletionCriteria?: string[];
    missingRequirements?: string[];
    missingRequirementCount?: number;
    missingRequirementClassification?: Record<string, string[]>;
    missingRequirementClassificationCounts?: Record<string, number>;
    outstandingWorkCounts?: Record<string, number>;
  };
  sourceCompletionAuditSummary?: {
    achieved?: boolean;
    failedCompletionCriteria?: string[];
    missingRequirements?: string[];
    missingRequirementCount?: number | null;
    criteria?: Array<{
      id?: string | null;
      passed?: boolean;
    }>;
    failedCriteriaIds?: string[];
    failedCriteriaIdsMatch?: boolean | null;
    missingRequirementCountMatches?: boolean | null;
  };
  completionAuditScopeComparison?: {
    sourceMissingRequirementCount?: number;
    derivedMissingRequirementCount?: number;
    countsMatch?: boolean;
    addedBySummary?: string[];
    missingFromSummary?: string[];
    scopeInterpretation?: string;
  };
  goalCompletionAuditView?: {
    successCriteria?: Array<{
      id?: string;
      passed?: boolean;
      evidence?: {
        missingRequirements?: string[];
        missingRequirementClassification?: Record<string, string[]>;
      };
    }>;
    promptToArtifactChecklist?: Array<Record<string, unknown>>;
  };
  checkpointPlan?: {
    status?: string | null;
    shouldStartLive?: boolean;
    shouldRunHeavyRefreshNow?: boolean;
    nextReviewAt?: string | null;
    nextReviewAtKst?: string | null;
    nextReviewDelayMinutes?: number | null;
    nextReviewOverdue?: boolean | null;
    nextReviewTrigger?: string | null;
    nextCompletedFundingWindowAt?: string | null;
    recompareSampleBufferRequired?: boolean | null;
    recompareSampleBufferMinutes?: number | null;
    recommendedAutonomousAction?: string | null;
    reviewCommand?: string | null;
    outstandingAutonomousEvidence?: string[];
    outstandingOperatorWork?: string[];
    outstandingMarketConditionWork?: string[];
    targetedMarketConditionMonitoring?: Record<string, unknown> | null;
    autonomousEvidenceSufficiency?: Record<string, unknown> | null;
    reason?: string | null;
  };
  autonomousEvidenceHandoff?: Record<string, unknown>;
  operatorLiveReadinessHandoff?: Record<string, unknown>;
  marketConditionHandoff?: Record<string, unknown>;
  nextAutonomousWork?: string[];
  nextOperatorWork?: string[];
  nextMarketConditionWork?: string[];
  nextRequiredOperatorWork?: string[];
  nextWorkClassification?: Record<string, unknown>;
  strategyResearchHandoff?: Record<string, unknown>;
  strategyDecisionView?: {
    reducedActivityGuardrail?: Record<string, unknown>;
    currentEntrySanityView?: Record<string, unknown>;
  };
  researchSourceFreshness?: Record<string, unknown>;
  operationalReadiness?: Record<string, unknown>;
  processAlignment?: Record<string, unknown> | null;
	  live?: {
	    reportStatus?: string | null;
	    liveReady?: boolean;
	    liveStartupAllowed?: boolean;
	    selectedLiveCandidate?: unknown;
	    startupPlan?: {
	      blockedCommands?: Record<string, unknown>;
	      hardStops?: unknown;
	      currentFocusLiveStartupCaution?: unknown;
	    };
	  };
	}

const CHECKPOINT_DELAY_TOLERANCE_MINUTES = 0.01;

function classificationCounts(value: Record<string, string[]> | null): Record<string, number> | null {
  if (value === null) return null;
  return Object.fromEntries(
    Object.entries(value).map(([key, bucket]) => [key, Array.isArray(bucket) ? bucket.length : 0]),
  );
}

function stringArrayRecordOrNull(value: unknown): Record<string, string[]> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!Object.values(record).every((bucket) => stringArrayOrNull(bucket) !== null)) return null;
  return record as Record<string, string[]>;
}

function hasAnyClassifiedRequirement(value: Record<string, string[]>): boolean {
  return Object.values(value).some((bucket) => Array.isArray(bucket) && bucket.length > 0);
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function sameNumberRecord(left: Record<string, number>, right: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => left[key] === right[key]);
}

function sameStringArrayRecord(left: Record<string, string[]>, right: Record<string, string[]>): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => {
    const leftBucket = left[key];
    const rightBucket = right[key];
    return Array.isArray(leftBucket) && Array.isArray(rightBucket) && sameStringSet(leftBucket, rightBucket);
  });
}

function numberRecordOrNull(value: unknown): Record<string, number> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    !Object.values(record).every(
      (item) => typeof item === "number" && Number.isFinite(item),
    )
  ) {
    return null;
  }
  return record as Record<string, number>;
}

function nonNegativeIntegerRecordOrNull(value: unknown): Record<string, number> | null {
  const record = numberRecordOrNull(value);
  if (record === null) return null;
  if (!Object.values(record).every((item) => Number.isInteger(item) && item >= 0)) return null;
  return record;
}

function stringArrayOrNull(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return null;
  return value;
}

function optionalUniqueStringArray(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  const parsed = stringArrayOrNull(value);
  if (parsed === null) {
    throw new Error(`${label} must be a string array when present`);
  }
  if (new Set(parsed).size !== parsed.length) {
    throw new Error(`${label} entries must be unique`);
  }
  return parsed;
}

function requireUniqueStringArray(value: string[], label: string): void {
  if (new Set(value).size !== value.length) {
    throw new Error(`${label} entries must be unique`);
  }
}

function requireOptionalNonEmptyString(value: unknown, label: string): void {
  if (value === undefined || value === null) return;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string when present`);
  }
}

function commandTokens(command: string): string[] {
  return command.trim().split(/\s+/).filter((token) => token.length > 0);
}

function commandHasFlag(command: string, flag: string): boolean {
  return commandTokens(command).includes(flag);
}

function commandHasFlagValue(command: string, flag: string): boolean {
  const tokens = commandTokens(command);
  const index = tokens.indexOf(flag);
  return index >= 0 && typeof tokens[index + 1] === "string" && !tokens[index + 1].startsWith("--");
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalTimestampAgeMinutes(value: unknown, label: string, nowMs: number): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty timestamp when present`);
  }
  const timestampMs = Date.parse(value);
  if (!Number.isFinite(timestampMs)) {
    throw new Error(`${label} must be a valid timestamp when present`);
  }
  const ageMinutes = (nowMs - timestampMs) / 60_000;
  if (ageMinutes < -1) {
    throw new Error(
      `${label} is in the future (${Math.abs(ageMinutes).toFixed(3)} minutes ahead); check clock synchronization before due-check`,
    );
  }
  return ageMinutes;
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function requireCurrentEntryCarryGate(
  value: unknown,
  label: string,
  expectedPassed: boolean,
): void {
  const gate = recordOrNull(value);
  if (gate === null) {
    throw new Error(`${label} is required when current-entry carry is evaluated against the live threshold`);
  }
  const minNetCarryBps = finiteNumber(gate.minNetCarryBps);
  const selectedNetCarryBps = finiteNumber(gate.selectedNetCarryBps);
  const deltaToThresholdBps = finiteNumber(gate.deltaToThresholdBps);
  if (gate.passed !== expectedPassed) {
    throw new Error(`${label}.passed must be ${expectedPassed} when current-entry carry threshold state is asserted`);
  }
  if (minNetCarryBps === null || selectedNetCarryBps === null) {
    throw new Error(`${label} must include numeric selected and minimum carry bps`);
  }
  if (expectedPassed && selectedNetCarryBps < minNetCarryBps) {
    throw new Error(`${label} must show selected carry at or above the live threshold`);
  }
  if (!expectedPassed && selectedNetCarryBps >= minNetCarryBps) {
    throw new Error(`${label} must show selected carry below the live threshold`);
  }
  if (
    deltaToThresholdBps === null ||
    Math.abs(deltaToThresholdBps - (selectedNetCarryBps - minNetCarryBps)) > 0.000001
  ) {
    throw new Error(`${label}.deltaToThresholdBps disagrees with selected and minimum carry`);
  }
}

function sameCurrentEntryCarryGate(left: unknown, right: unknown): boolean {
  const leftGate = recordOrNull(left);
  const rightGate = recordOrNull(right);
  if (leftGate === null || rightGate === null) return false;
  return (
    finiteNumber(leftGate.minNetCarryBps) === finiteNumber(rightGate.minNetCarryBps) &&
    finiteNumber(leftGate.selectedNetCarryBps) === finiteNumber(rightGate.selectedNetCarryBps) &&
    finiteNumber(leftGate.deltaToThresholdBps) === finiteNumber(rightGate.deltaToThresholdBps) &&
    leftGate.passed === rightGate.passed
  );
}

function requireSpreadBlockerEvidence(value: unknown, label: string): void {
  const evidence = recordOrNull(value);
  if (evidence === null) {
    throw new Error(`${label} is required while wideDisplayedSpread remains`);
  }
  if (evidence.blockerActive !== true) {
    throw new Error(`${label}.blockerActive must be true while wideDisplayedSpread remains`);
  }
  const breaches = evidence.breaches;
  if (!Array.isArray(breaches) || breaches.length === 0) {
    throw new Error(`${label}.breaches must list at least one concrete spread threshold breach`);
  }
  for (const breach of breaches) {
    const breachRecord = recordOrNull(breach);
    if (
      breachRecord === null ||
      typeof breachRecord.source !== "string" ||
      breachRecord.source.length === 0 ||
      typeof breachRecord.metric !== "string" ||
      breachRecord.metric.length === 0 ||
      typeof breachRecord.direction !== "string" ||
      breachRecord.direction.length === 0 ||
      finiteNumber(breachRecord.observed) === null ||
      finiteNumber(breachRecord.threshold) === null
    ) {
      throw new Error(`${label}.breaches entries must include source, metric, direction, observed, and threshold`);
    }
  }
  const breachCount = finiteNumber(evidence.breachCount);
  if (breachCount === null || breachCount !== breaches.length) {
    throw new Error(`${label}.breachCount must match breaches.length`);
  }
  const clearanceProgress = evidence.clearanceProgress;
  if (clearanceProgress !== undefined) {
    if (!Array.isArray(clearanceProgress) || clearanceProgress.length === 0) {
      throw new Error(`${label}.clearanceProgress must list spread-control clearance state when present`);
    }
    for (const item of clearanceProgress) {
      const progress = recordOrNull(item);
      if (
        progress === null ||
        typeof progress.source !== "string" ||
        progress.source.length === 0 ||
        typeof progress.aggregatePassed !== "boolean"
      ) {
        throw new Error(`${label}.clearanceProgress entries must include source and aggregatePassed`);
      }
      if (
        progress.latestWindowPassed !== null &&
        progress.latestWindowPassed !== undefined &&
        typeof progress.latestWindowPassed !== "boolean"
      ) {
        throw new Error(`${label}.clearanceProgress.latestWindowPassed must be boolean or null`);
      }
      for (const key of [
        "spreadRejectedRateExcess",
        "executionEligibleRateShortfall",
        "maxSpreadBpsExcess",
      ]) {
        const value = progress[key];
        if (value !== null && value !== undefined && finiteNumber(value) === null) {
          throw new Error(`${label}.clearanceProgress.${key} must be numeric or null`);
        }
      }
    }
  }
}

function requireTargetedMarketConditionMonitoring(
  value: unknown,
  expectedBlockers: string[],
  label: string,
): void {
  if (value === undefined || value === null) return;
  const monitoring = recordOrNull(value);
  if (monitoring === null) {
    throw new Error(`${label} must be an object when present`);
  }
  if (monitoring.status !== "active") {
    throw new Error(`${label}.status must be active while market-condition work remains`);
  }
  const blockers = optionalUniqueStringArray(monitoring.blockers, `${label}.blockers`);
  if (!sameStringSet(blockers, expectedBlockers)) {
    throw new Error(`${label}.blockers must match checkpointPlan outstanding market condition work`);
  }
  if (monitoring.canAuthorizeLiveStartup !== false) {
    throw new Error(`${label}.canAuthorizeLiveStartup must be false`);
  }
  if (
    typeof monitoring.interpretation !== "string" ||
    !/cannot authorize live startup/.test(monitoring.interpretation)
  ) {
    throw new Error(`${label}.interpretation must state it cannot authorize live startup`);
  }
  const commands = optionalUniqueStringArray(monitoring.commands, `${label}.commands`);
  if (commands.length === 0) {
    throw new Error(`${label}.commands must include targeted market-condition commands`);
  }
  if (!commands.some((command) => /dry-run:summarize-live-goal-progress/.test(command))) {
    throw new Error(`${label}.commands must include live-goal progress summary refresh after targeted market-condition updates`);
  }
  for (const command of commands) {
    if (targetedMarketCommandLiveCapabilityReason(command) !== null) {
      throw new Error(`${label}.commands must not include live-capable command: ${command}`);
    }
    if (targetedMarketCommandProcessControlReason(command) !== null) {
      throw new Error(`${label}.commands must not include process-control command: ${command}`);
    }
    if (!isSingleNpmDryRunCommand(command)) {
      throw new Error(`${label}.commands must only include npm dry-run commands: ${command}`);
    }
  }
  if (
    expectedBlockers.includes("selectedFocusCurrentEntryCarryBelowLiveThreshold") &&
    !commands.some((command) => /discover-spot-perp-carry-current-carry-fee-stress/.test(command))
  ) {
    throw new Error(`${label}.commands must include current-entry fee-stress discovery while current-entry carry remains below threshold`);
  }
  if (
    expectedBlockers.includes("wideDisplayedSpread") &&
    !commands.some((command) => /refresh-spot-perp-carry-spread-threshold-experiments/.test(command))
  ) {
    throw new Error(`${label}.commands must include spread threshold refresh while wideDisplayedSpread remains`);
  }
  if (
    expectedBlockers.includes("wideDisplayedSpread") &&
    !commands.some((command) => /refresh-spot-perp-carry-.*live-readiness/.test(command))
  ) {
    throw new Error(`${label}.commands must include selected-market live-readiness refresh while wideDisplayedSpread remains`);
  }
}

function targetedMarketCommandLiveCapabilityReason(command: string): string | null {
  if (/\bpm2:(?:start|restart):live(?:[-:\w]*)?\b/.test(command)) {
    return "live_pm2_script";
  }
  if (/\bpm2\s+(?:start|restart)\b[\s\S]*\s--only\s+live[-\w]*/.test(command)) {
    return "direct_live_pm2_start";
  }
  if (/\brun-spot-perp-carry-live\b/.test(command)) {
    return "spot_perp_live_runner";
  }
  if (/\brun-cross-exchange-relative-value-live\b/.test(command)) {
    return "cross_exchange_live_runner";
  }
  if (/(?:^|\s)--submit-once(?:\s|$)/.test(command)) {
    return "order_submission_flag";
  }
  if (/(?:^|[\s;&|])(?:export\s+)?ENABLE_[A-Z0-9_]*(?:LIVE_EXECUTION|ORDER_SUBMISSION)\s*=\s*['"]?true['"]?(?=$|[\s;&|])/.test(command)) {
    return "live_execution_env";
  }
  if (/(?:^|[\s;&|])(?:export\s+)?ORG_COIN_LIVE_EXECUTION_ENABLED\s*=\s*['"]?true['"]?(?=$|[\s;&|])/.test(command)) {
    return "live_execution_env";
  }
  if (/(?:^|[\s;&|])(?:export\s+)?(?:TRADING_MODE|DRY_RUN_EXECUTION_MODE|ORG_COIN_EXECUTION_MODE)\s*=\s*['"]?live['"]?(?=$|[\s;&|])/.test(command)) {
    return "live_execution_mode";
  }
  return null;
}

function targetedMarketCommandProcessControlReason(command: string): string | null {
  if (/\bpm2(?::|\s)+(?:start|restart|reload|delete|stop|kill|resurrect|save)\b/.test(command)) {
    return "pm2_process_control";
  }
  return null;
}

function isSingleNpmDryRunCommand(command: string): boolean {
  return /^npm\s+run(?:\s+--silent)?\s+dry-run:[-\w]+\s*$/.test(command);
}

function isNpmDryRunCommandChain(command: string): boolean {
  return command
    .split(/\s*&&\s*/)
    .every((part) => part.length > 0 && isSingleNpmDryRunCommand(part));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasShellControlOperator(command: string): boolean {
  return /(?:&&|\|\||[;&|<>\r\n]|`|\$\()/.test(command);
}

function requireSafeOptionalDryRunScriptCommand(
  value: unknown,
  label: string,
  scriptName: string,
): void {
  if (value === undefined) return;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string when present`);
  }
  if (targetedMarketCommandLiveCapabilityReason(value) !== null) {
    throw new Error(`${label} must not be live-capable: ${value}`);
  }
  if (targetedMarketCommandProcessControlReason(value) !== null) {
    throw new Error(`${label} must not control processes: ${value}`);
  }
  if (!isSingleNpmDryRunCommand(value)) {
    throw new Error(`${label} must be a single npm dry-run command`);
  }
  if (!new RegExp(`\\bdry-run:${escapeRegExp(scriptName)}\\b`).test(value)) {
    throw new Error(`${label} must run dry-run:${scriptName}`);
  }
}

function requireSafeOptionalVerificationGateCommand(value: unknown, label: string): void {
  if (value === undefined || value === null) return;
  requireSafeVerificationGateCommand(value, label);
}

function requireSafeOptionalReviewCommand(value: unknown, label: string): void {
  if (value === undefined || value === null) return;
  requireSafeReviewCommand(value, label);
}

function requireSafeVerificationGateCommand(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is missing`);
  }
  if (targetedMarketCommandLiveCapabilityReason(value) !== null) {
    throw new Error(`${label} must not be live-capable: ${value}`);
  }
  if (targetedMarketCommandProcessControlReason(value) !== null) {
    throw new Error(`${label} must not control processes: ${value}`);
  }
  if (!/\bdry-run:gate[-:\w]*live[-:\w]*ready\b/.test(value)) {
    throw new Error(`${label} must run a dry-run live readiness gate`);
  }
  if (!isSingleNpmDryRunCommand(value)) {
    throw new Error(`${label} must be a single npm dry-run gate command`);
  }
  return value;
}

function requireSafeReviewCommand(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is missing`);
  }
  if (targetedMarketCommandLiveCapabilityReason(value) !== null) {
    throw new Error(`${label} must not be live-capable: ${value}`);
  }
  if (targetedMarketCommandProcessControlReason(value) !== null) {
    throw new Error(`${label} must not control processes: ${value}`);
  }
  if (!/\bdry-run:/.test(value)) {
    throw new Error(`${label} must run a dry-run review or refresh command`);
  }
  if (!isNpmDryRunCommandChain(value)) {
    throw new Error(`${label} must only chain npm dry-run commands with &&`);
  }
  return value;
}

function requirePm2LiveStartCommand(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is missing`);
  }
  if (hasShellControlOperator(value)) {
    throw new Error(`${label} must be a single PM2 live start command`);
  }
  const reason = targetedMarketCommandLiveCapabilityReason(value);
  if (!["live_pm2_script", "direct_live_pm2_start"].includes(reason ?? "")) {
    throw new Error(`${label} must be a PM2 live start command`);
  }
  return value;
}

function requireOperatorBlockerEvidence(
  value: unknown,
  expectedBlockers: string[],
  label: string,
): void {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array when present`);
  }
  const blockers: string[] = [];
  for (const item of value) {
    const record = recordOrNull(item);
    if (
      record === null ||
      typeof record.blocker !== "string" ||
      record.blocker.length === 0 ||
      record.active !== true
    ) {
      throw new Error(`${label} entries must include blocker and active=true`);
    }
    const operatorAction = recordOrNull(record.operatorAction);
    if (
      operatorAction === null ||
      typeof operatorAction.action !== "string" ||
      operatorAction.action.length === 0 ||
      typeof operatorAction.reason !== "string" ||
      operatorAction.reason.length === 0
    ) {
      throw new Error(`${label} entries must include a concrete operatorAction with action and reason`);
    }
    blockers.push(record.blocker);
  }
  if (new Set(blockers).size !== blockers.length) {
    throw new Error(`${label} blocker entries must be unique`);
  }
  if (!sameStringSet(blockers, expectedBlockers)) {
    throw new Error(`${label} must cover every checkpointPlan outstanding operator work item`);
  }
}

function operatorActionNames(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const actions: string[] = [];
  for (const item of value) {
    const record = recordOrNull(item);
    if (record === null || typeof record.action !== "string" || record.action.length === 0) {
      return null;
    }
    actions.push(record.action);
  }
  return uniqueStrings(actions);
}

function requireAutonomousBlockerEvidence(
  value: unknown,
  expectedBlockers: string[],
  label: string,
): void {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array when present`);
  }
  const blockers: string[] = [];
  for (const item of value) {
    const record = recordOrNull(item);
    if (
      record === null ||
      typeof record.blocker !== "string" ||
      record.blocker.length === 0 ||
      record.active !== true
    ) {
      throw new Error(`${label} entries must include blocker and active=true`);
    }
    blockers.push(record.blocker);
    if (record.blocker === "insufficientObservationSpan") {
      const gap = recordOrNull(record.readinessGap);
      const timeline = recordOrNull(record.readinessTimeline);
      if (
        gap === null ||
        finiteNumber(gap.current) === null ||
        finiteNumber(gap.required) === null ||
        finiteNumber(gap.remaining) === null ||
        gap.passed !== false
      ) {
        throw new Error(`${label} insufficientObservationSpan entry must include an unmet readiness gap`);
      }
      if (
        timeline === null ||
        timeline.bottleneck !== "observationSpanMinutes" ||
        typeof timeline.estimatedEarliestReviewAt !== "string" ||
        timeline.estimatedEarliestReviewAt.length === 0
      ) {
        throw new Error(`${label} insufficientObservationSpan entry must include observation-span readiness timeline`);
      }
    }
  }
  if (new Set(blockers).size !== blockers.length) {
    throw new Error(`${label} blocker entries must be unique`);
  }
  if (!sameStringSet(blockers, expectedBlockers)) {
    throw new Error(`${label} must cover every checkpointPlan outstanding autonomous evidence item`);
  }
}

function requireBlockedLiveCommands(value: unknown, label: string): Record<string, unknown> {
  const record = recordOrNull(value);
  if (
    record === null ||
    typeof record.reviewCommand !== "string" ||
    record.reviewCommand.length === 0 ||
    typeof record.pm2StartCommand !== "string" ||
    record.pm2StartCommand.length === 0 ||
    typeof record.manualValidationCommand !== "string" ||
    record.manualValidationCommand.length === 0
  ) {
    throw new Error(
      `${label} must preserve blocked review, manual validation, and PM2 live commands while current focus recompare blocks live startup`,
    );
  }
  if (
    targetedMarketCommandLiveCapabilityReason(record.reviewCommand) !== null ||
    targetedMarketCommandProcessControlReason(record.reviewCommand) !== null ||
    !isSingleNpmDryRunCommand(record.reviewCommand) ||
    !/\bdry-run:review[-:\w]*live[-:\w]*ready\b/.test(record.reviewCommand)
  ) {
    throw new Error(`${label}.reviewCommand must preserve the blocked dry-run live-ready review command`);
  }
  requirePm2LiveStartCommand(record.pm2StartCommand, `${label}.pm2StartCommand`);
  if (!/\brun-[-\w]*live\b/.test(record.manualValidationCommand)) {
    throw new Error(`${label}.manualValidationCommand must preserve the blocked live-runner validation command`);
  }
  if (targetedMarketCommandProcessControlReason(record.manualValidationCommand) !== null) {
    throw new Error(`${label}.manualValidationCommand must not control processes`);
  }
  if (hasShellControlOperator(record.manualValidationCommand)) {
    throw new Error(`${label}.manualValidationCommand must be a single blocked live-runner validation command`);
  }
  if (!commandHasFlag(record.manualValidationCommand, "--require-live-ready")) {
    throw new Error(`${label}.manualValidationCommand must require live readiness`);
  }
  if (!commandHasFlagValue(record.manualValidationCommand, "--live-goal-status")) {
    throw new Error(`${label}.manualValidationCommand must include live-goal status gating`);
  }
  if (commandHasFlag(record.manualValidationCommand, "--submit-once")) {
    throw new Error(`${label}.manualValidationCommand must not include --submit-once while live startup is blocked`);
  }
  return record;
}

function sameBlockedLiveCommands(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return (
    left.reviewCommand === right.reviewCommand &&
    left.pm2StartCommand === right.pm2StartCommand &&
    left.manualValidationCommand === right.manualValidationCommand
  );
}

function requireFiniteNumberFields(
  value: unknown,
  fields: string[],
  label: string,
): Record<string, unknown> {
  const record = recordOrNull(value);
  if (record === null) {
    throw new Error(`${label} must be an object`);
  }
  for (const field of fields) {
    if (finiteNumber(record[field]) === null) {
      throw new Error(`${label}.${field} must be a finite number`);
    }
  }
  return record;
}

function validateReducedActivityGuardrail(value: unknown): void {
  const guardrail = recordOrNull(value);
  if (guardrail === null) {
    throw new Error("strategyDecisionView.reducedActivityGuardrail is required when strategyDecisionView is present");
  }
  if (guardrail.status !== "active") {
    throw new Error("strategyDecisionView.reducedActivityGuardrail.status must be active");
  }
  if (
    typeof guardrail.rule !== "string" ||
    !/do not treat/i.test(guardrail.rule) ||
    !/profitability/i.test(guardrail.rule)
  ) {
    throw new Error("strategyDecisionView.reducedActivityGuardrail.rule must reject reduced activity as profitability proof");
  }
  if (
    typeof guardrail.interpretation !== "string" ||
    !/cannot authorize live startup/i.test(guardrail.interpretation)
  ) {
    throw new Error("strategyDecisionView.reducedActivityGuardrail.interpretation must not authorize live startup");
  }
  const minExecutionEligibleRate = finiteNumber(guardrail.livePromotionMinimumExecutionEligibleRate);
  const maxSpreadRejectionRate = finiteNumber(guardrail.livePromotionMaximumSpreadRejectionRate);
  if (minExecutionEligibleRate === null || minExecutionEligibleRate <= 0 || minExecutionEligibleRate > 1) {
    throw new Error("strategyDecisionView.reducedActivityGuardrail.livePromotionMinimumExecutionEligibleRate must be in (0, 1]");
  }
  if (maxSpreadRejectionRate === null || maxSpreadRejectionRate < 0 || maxSpreadRejectionRate >= 1) {
    throw new Error("strategyDecisionView.reducedActivityGuardrail.livePromotionMaximumSpreadRejectionRate must be in [0, 1)");
  }
  const warnings = stringArrayOrNull(guardrail.warnings);
  if (warnings === null) {
    throw new Error("strategyDecisionView.reducedActivityGuardrail.warnings must be a string array");
  }
  requireUniqueStringArray(warnings, "strategyDecisionView.reducedActivityGuardrail.warnings");

  const currentFocus = recordOrNull(guardrail.currentFocus);
  if (currentFocus === null || typeof currentFocus.market !== "string" || currentFocus.market.length === 0) {
    throw new Error("strategyDecisionView.reducedActivityGuardrail.currentFocus.market is required");
  }
  const currentFocusExecutionEligibleRate = finiteNumber(currentFocus.executionEligibleRate);
  if (currentFocusExecutionEligibleRate !== null) {
    const expected = currentFocusExecutionEligibleRate >= minExecutionEligibleRate;
    if (currentFocus.executionEligibleRateMeetsLiveGate !== expected) {
      throw new Error("strategyDecisionView.reducedActivityGuardrail.currentFocus execution eligibility gate is stale");
    }
    if (
      !expected &&
      !warnings.includes("current_focus_below_live_execution_eligible_rate")
    ) {
      throw new Error("strategyDecisionView.reducedActivityGuardrail.warnings must include current focus execution eligibility warning");
    }
  }
  const currentFocusSpreadRejectedRate = finiteNumber(currentFocus.spreadRejectedRate);
  if (currentFocusSpreadRejectedRate !== null) {
    const expected = currentFocusSpreadRejectedRate <= maxSpreadRejectionRate;
    if (currentFocus.spreadRejectionMeetsLiveGate !== expected) {
      throw new Error("strategyDecisionView.reducedActivityGuardrail.currentFocus spread rejection gate is stale");
    }
    if (
      !expected &&
      !warnings.includes("current_focus_spread_rejection_above_live_limit")
    ) {
      throw new Error("strategyDecisionView.reducedActivityGuardrail.warnings must include current focus spread rejection warning");
    }
  }

  const bestChallenger = recordOrNull(guardrail.bestChallenger);
  if (bestChallenger === null) {
    throw new Error("strategyDecisionView.reducedActivityGuardrail.bestChallenger is required");
  }
  const bestChallengerMarket = bestChallenger.market;
  if (bestChallengerMarket !== null && bestChallengerMarket !== undefined && typeof bestChallengerMarket !== "string") {
    throw new Error("strategyDecisionView.reducedActivityGuardrail.bestChallenger.market must be a string when present");
  }
  const bestChallengerExecutionEligibleRate = finiteNumber(bestChallenger.executionEligibleRate);
  if (bestChallengerExecutionEligibleRate !== null) {
    const expected = bestChallengerExecutionEligibleRate >= minExecutionEligibleRate;
    if (bestChallenger.executionEligibleRateMeetsLiveGate !== expected) {
      throw new Error("strategyDecisionView.reducedActivityGuardrail.bestChallenger execution eligibility gate is stale");
    }
    if (
      !expected &&
      !warnings.includes("best_challenger_below_live_execution_eligible_rate")
    ) {
      throw new Error("strategyDecisionView.reducedActivityGuardrail.warnings must include best challenger execution eligibility warning");
    }
  }

  const rawBestChallenger = recordOrNull(guardrail.rawBestChallenger);
  if (rawBestChallenger !== null) {
    const rawBestChallengerQualityFailures = stringArrayOrNull(
      rawBestChallenger.knownQualityFailureReasons,
    );
    if (rawBestChallengerQualityFailures !== null) {
      requireUniqueStringArray(
        rawBestChallengerQualityFailures,
        "strategyDecisionView.reducedActivityGuardrail.rawBestChallenger.knownQualityFailureReasons",
      );
      if (
        rawBestChallengerQualityFailures.includes("executionEligibleRateBelowSwitchThreshold") &&
        !warnings.includes("raw_best_challenger_activity_too_low_for_switch")
      ) {
        throw new Error("strategyDecisionView.reducedActivityGuardrail.warnings must include raw best challenger reduced activity warning");
      }
    }
  }
}

function flattenMissingRequirementClassification(value: Record<string, string[]>): string[] {
  const flattened: string[] = [];
  for (const bucket of Object.values(value)) {
    if (!Array.isArray(bucket) || !bucket.every((item) => typeof item === "string")) {
      throw new Error("missingRequirementClassification buckets must be string arrays");
    }
    flattened.push(...bucket);
  }
  requireUniqueStringArray(flattened, "missingRequirementClassification");
  return flattened;
}

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    summaryPath: null,
    outputPath: null,
    maxSummaryAgeMinutes: null,
    nowMs: null,
    quiet: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--summary") {
      if (!value) throw new Error("--summary requires a value");
      args.summaryPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--output") {
      if (!value) throw new Error("--output requires a value");
      args.outputPath = resolve(cwd, value);
      index += 1;
      continue;
    }
    if (arg === "--max-summary-age-minutes") {
      if (!value) throw new Error("--max-summary-age-minutes requires a value");
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("--max-summary-age-minutes must be a positive number");
      }
      args.maxSummaryAgeMinutes = parsed;
      index += 1;
      continue;
    }
    if (arg === "--now") {
      if (!value) throw new Error("--now requires a value");
      const parsed = Date.parse(value);
      if (!Number.isFinite(parsed)) throw new Error("--now must be an ISO timestamp");
      args.nowMs = parsed;
      index += 1;
      continue;
    }
    if (arg === "--quiet") {
      args.quiet = true;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  if (args.summaryPath === null) throw new Error("--summary is required");
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const nowMs = args.nowMs ?? Date.now();
  const summary = JSON.parse(await readFile(args.summaryPath!, "utf8")) as LiveGoalProgressSummary;
  const summaryGeneratedAtMs = summary.generatedAt === undefined ? NaN : Date.parse(summary.generatedAt);
  const summaryAgeMinutes = Number.isFinite(summaryGeneratedAtMs)
    ? (nowMs - summaryGeneratedAtMs) / 60_000
    : null;
  if (!Number.isFinite(summaryGeneratedAtMs)) {
    throw new Error("summary generatedAt is missing or invalid; refresh the live-goal checkpoint before due-check");
  }
  if (summaryAgeMinutes !== null && summaryAgeMinutes < -1) {
    throw new Error(
      `summary generatedAt is in the future (${Math.abs(summaryAgeMinutes).toFixed(3)} minutes ahead); check clock synchronization before due-check`,
    );
  }
  if (args.maxSummaryAgeMinutes !== null) {
    if (summaryAgeMinutes !== null && summaryAgeMinutes > args.maxSummaryAgeMinutes) {
      throw new Error(
        `summary is stale (${summaryAgeMinutes.toFixed(3)} minutes old); refresh the live-goal checkpoint before due-check`,
      );
    }
  }
  const sourceLiveGoalAgeMinutes = optionalTimestampAgeMinutes(
    summary.source?.liveGoalGeneratedAt,
    "summary.source.liveGoalGeneratedAt",
    nowMs,
  );
  const sourceProcessAlignmentAgeMinutes = optionalTimestampAgeMinutes(
    summary.source?.processAlignmentGeneratedAt,
    "summary.source.processAlignmentGeneratedAt",
    nowMs,
  );
  const researchSourceFreshness = recordOrNull(summary.researchSourceFreshness);
  const researchSourceGeneratedAt = researchSourceFreshness?.generatedAt;
  const sourceResearchReportAgeMinutes = optionalTimestampAgeMinutes(
    researchSourceGeneratedAt,
    "summary.researchSourceFreshness.generatedAt",
    nowMs,
  );
  const currentEntrySanityView = recordOrNull(summary.strategyDecisionView?.currentEntrySanityView);
  const currentEntryEvidenceTimestamp = currentEntrySanityView?.currentEntryEvidenceTimestamp;
  const sourceCurrentEntryAgeMinutes = optionalTimestampAgeMinutes(
    currentEntryEvidenceTimestamp,
    "summary.strategyDecisionView.currentEntrySanityView.currentEntryEvidenceTimestamp",
    nowMs,
  );
  const operationalReadiness = recordOrNull(summary.operationalReadiness);
  const operationalReadinessGeneratedAt = operationalReadiness?.generatedAt;
  const sourceLiveReadinessAgeMinutes = optionalTimestampAgeMinutes(
    operationalReadinessGeneratedAt,
    "summary.operationalReadiness.generatedAt",
    nowMs,
  );
  const operationalProof = recordOrNull(operationalReadiness?.operationalProof);
  const operationalProofGeneratedAt = operationalProof?.generatedAt;
  const sourceOperationalProofAgeMinutes = optionalTimestampAgeMinutes(
    operationalProofGeneratedAt,
    "summary.operationalReadiness.operationalProof.generatedAt",
    nowMs,
  );
  const sourceEvidenceStaleSources = [
    args.maxSummaryAgeMinutes !== null &&
    sourceLiveGoalAgeMinutes !== null &&
    sourceLiveGoalAgeMinutes > args.maxSummaryAgeMinutes
      ? "liveGoalStatus"
      : null,
    args.maxSummaryAgeMinutes !== null &&
    sourceProcessAlignmentAgeMinutes !== null &&
    sourceProcessAlignmentAgeMinutes > args.maxSummaryAgeMinutes
      ? "processAlignment"
      : null,
    args.maxSummaryAgeMinutes !== null &&
    sourceResearchReportAgeMinutes !== null &&
    sourceResearchReportAgeMinutes > args.maxSummaryAgeMinutes
      ? "researchSource"
      : null,
    args.maxSummaryAgeMinutes !== null &&
    sourceCurrentEntryAgeMinutes !== null &&
    sourceCurrentEntryAgeMinutes > args.maxSummaryAgeMinutes
      ? "currentEntryEvidence"
      : null,
    args.maxSummaryAgeMinutes !== null &&
    sourceLiveReadinessAgeMinutes !== null &&
    sourceLiveReadinessAgeMinutes > args.maxSummaryAgeMinutes
      ? "liveReadiness"
      : null,
    args.maxSummaryAgeMinutes !== null &&
    sourceOperationalProofAgeMinutes !== null &&
    sourceOperationalProofAgeMinutes > args.maxSummaryAgeMinutes
      ? "operationalProof"
    : null,
  ].filter((source): source is string => source !== null);
  const researchSourceObservationCountDelta = finiteNumber(
    researchSourceFreshness?.observationCountDelta,
  );
  const liveGoalMayLagResearchSource =
    researchSourceFreshness?.liveGoalMayLagResearchSource === true &&
    (researchSourceObservationCountDelta === null || researchSourceObservationCountDelta > 0);
  const sourceEvidenceAlignment = {
    liveGoalMayLagResearchSource,
    sourceNewerThanLiveGoal:
      typeof researchSourceFreshness?.sourceNewerThanLiveGoal === "boolean"
        ? researchSourceFreshness.sourceNewerThanLiveGoal
        : null,
    observationCountDelta: researchSourceObservationCountDelta,
    requiredBeforeLiveStartupReview: liveGoalMayLagResearchSource
      ? ["refresh_live_goal_status_after_newer_research_source"]
      : [],
    refreshCommand: liveGoalMayLagResearchSource
      ? "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress"
      : null,
    interpretation: liveGoalMayLagResearchSource
      ? "The research source is newer than the embedded live-goal status; refresh live-goal status before using this artifact for live startup review."
      : "Embedded live-goal status is aligned with the research source for this due-check.",
  };
  const sourceEvidenceReviewUsable =
    sourceEvidenceStaleSources.length === 0 && !liveGoalMayLagResearchSource;
  const sourceEvidenceRefreshCommand =
    "npm run --silent dry-run:refresh-live-goal-status && npm run --silent dry-run:summarize-live-goal-progress";
  const sourceEvidenceStaleness = {
    maxSourceAgeMinutes: args.maxSummaryAgeMinutes,
    liveGoalStatusStale: sourceEvidenceStaleSources.includes("liveGoalStatus"),
    processAlignmentStale: sourceEvidenceStaleSources.includes("processAlignment"),
    researchSourceStale: sourceEvidenceStaleSources.includes("researchSource"),
    currentEntryEvidenceStale: sourceEvidenceStaleSources.includes("currentEntryEvidence"),
    liveReadinessStale: sourceEvidenceStaleSources.includes("liveReadiness"),
    operationalProofStale: sourceEvidenceStaleSources.includes("operationalProof"),
    staleSources: sourceEvidenceStaleSources,
    canUseForLiveStartupReview: sourceEvidenceReviewUsable,
    requiredBeforeLiveStartupReview: [
      ...(sourceEvidenceStaleSources.length === 0
        ? []
        : ["refresh_stale_live_goal_source_evidence"]),
      ...sourceEvidenceAlignment.requiredBeforeLiveStartupReview,
    ],
    refreshCommand: sourceEvidenceReviewUsable
      ? null
      : sourceEvidenceRefreshCommand,
    interpretation: sourceEvidenceStaleSources.length > 0
      ? "Source evidence is stale; refresh live-goal sources before using this artifact for live startup review."
      : liveGoalMayLagResearchSource
        ? "Source evidence is fresh but not aligned; refresh live-goal status after newer research evidence before live startup review."
        : "Source evidence is within the configured freshness window.",
  };
  const checkpointPlan = summary.checkpointPlan;
  if (checkpointPlan === undefined) {
    throw new Error("summary checkpointPlan is missing; refresh the live-goal checkpoint before due-check");
  }
  if (typeof checkpointPlan.shouldRunHeavyRefreshNow !== "boolean") {
    throw new Error("summary checkpointPlan.shouldRunHeavyRefreshNow must be boolean");
  }
  requireOptionalNonEmptyString(checkpointPlan.status, "summary checkpointPlan.status");
  requireOptionalNonEmptyString(checkpointPlan.nextReviewAtKst, "summary checkpointPlan.nextReviewAtKst");
  requireOptionalNonEmptyString(checkpointPlan.nextReviewTrigger, "summary checkpointPlan.nextReviewTrigger");
  requireOptionalNonEmptyString(
    checkpointPlan.recommendedAutonomousAction,
    "summary checkpointPlan.recommendedAutonomousAction",
  );
  if (checkpointPlan.reviewCommand !== undefined && checkpointPlan.reviewCommand !== null) {
    requireSafeReviewCommand(checkpointPlan.reviewCommand, "summary checkpointPlan.reviewCommand");
  }
  requireOptionalNonEmptyString(checkpointPlan.reason, "summary checkpointPlan.reason");
  if (
    checkpointPlan.nextReviewDelayMinutes !== undefined &&
    checkpointPlan.nextReviewDelayMinutes !== null &&
    finiteNumber(checkpointPlan.nextReviewDelayMinutes) === null
  ) {
    throw new Error("summary checkpointPlan.nextReviewDelayMinutes must be a finite number when present");
  }
  if (
    checkpointPlan.nextReviewOverdue !== undefined &&
    checkpointPlan.nextReviewOverdue !== null &&
    typeof checkpointPlan.nextReviewOverdue !== "boolean"
  ) {
    throw new Error("summary checkpointPlan.nextReviewOverdue must be boolean when present");
  }
  const nextReviewAtMs =
    checkpointPlan.nextReviewAt === undefined || checkpointPlan.nextReviewAt === null
      ? NaN
      : Date.parse(checkpointPlan.nextReviewAt);
  if (
    checkpointPlan.recompareSampleBufferRequired !== undefined &&
    checkpointPlan.recompareSampleBufferRequired !== null &&
    typeof checkpointPlan.recompareSampleBufferRequired !== "boolean"
  ) {
    throw new Error("summary checkpointPlan.recompareSampleBufferRequired must be boolean when present");
  }
  const recompareSampleBufferMinutes =
    checkpointPlan.recompareSampleBufferMinutes === undefined ||
    checkpointPlan.recompareSampleBufferMinutes === null
      ? null
      : finiteNumber(checkpointPlan.recompareSampleBufferMinutes);
  if (
    checkpointPlan.recompareSampleBufferMinutes !== undefined &&
    checkpointPlan.recompareSampleBufferMinutes !== null &&
    (recompareSampleBufferMinutes === null || recompareSampleBufferMinutes < 0)
  ) {
    throw new Error("summary checkpointPlan.recompareSampleBufferMinutes must be a non-negative finite number when present");
  }
  const nextCompletedFundingWindowAtMs =
    checkpointPlan.nextCompletedFundingWindowAt === undefined ||
    checkpointPlan.nextCompletedFundingWindowAt === null
      ? NaN
      : Date.parse(checkpointPlan.nextCompletedFundingWindowAt);
  if (
    checkpointPlan.nextCompletedFundingWindowAt !== undefined &&
    checkpointPlan.nextCompletedFundingWindowAt !== null &&
    !Number.isFinite(nextCompletedFundingWindowAtMs)
  ) {
    throw new Error("summary checkpointPlan.nextCompletedFundingWindowAt must be a valid timestamp when present");
  }
  if (checkpointPlan.recompareSampleBufferRequired === true) {
    if (!Number.isFinite(nextCompletedFundingWindowAtMs)) {
      throw new Error(
        "summary checkpointPlan.recompareSampleBufferRequired requires nextCompletedFundingWindowAt",
      );
    }
    if (recompareSampleBufferMinutes === null) {
      throw new Error(
        "summary checkpointPlan.recompareSampleBufferRequired requires recompareSampleBufferMinutes",
      );
    }
    if (!Number.isFinite(nextReviewAtMs)) {
      throw new Error("summary checkpointPlan.recompareSampleBufferRequired requires a valid nextReviewAt");
    }
    const expectedBufferedReviewAtMs =
      nextCompletedFundingWindowAtMs + recompareSampleBufferMinutes * 60_000;
    if (Math.abs(nextReviewAtMs - expectedBufferedReviewAtMs) > 1_000) {
      throw new Error(
        "summary checkpointPlan.nextReviewAt disagrees with nextCompletedFundingWindowAt and recompareSampleBufferMinutes",
      );
    }
  }
  if (checkpointPlan.shouldRunHeavyRefreshNow === false && !Number.isFinite(nextReviewAtMs)) {
    throw new Error("summary checkpointPlan.nextReviewAt is missing or invalid while refresh is not due");
  }
  if (checkpointPlan.nextReviewDelayMinutes !== undefined && checkpointPlan.nextReviewDelayMinutes !== null) {
    if (!Number.isFinite(nextReviewAtMs)) {
      throw new Error("summary checkpointPlan.nextReviewDelayMinutes requires a valid checkpointPlan.nextReviewAt");
    }
    const generatedAtDelayMinutes = Number(((nextReviewAtMs - summaryGeneratedAtMs) / 60_000).toFixed(3));
    if (
      Math.abs(checkpointPlan.nextReviewDelayMinutes - generatedAtDelayMinutes) >
      CHECKPOINT_DELAY_TOLERANCE_MINUTES
    ) {
      throw new Error("summary checkpointPlan.nextReviewDelayMinutes disagrees with generatedAt and nextReviewAt");
    }
  }
  if (checkpointPlan.nextReviewOverdue !== undefined && checkpointPlan.nextReviewOverdue !== null) {
    if (!Number.isFinite(nextReviewAtMs)) {
      throw new Error("summary checkpointPlan.nextReviewOverdue requires a valid checkpointPlan.nextReviewAt");
    }
    const overdueAtGeneration = nextReviewAtMs <= summaryGeneratedAtMs;
    if (checkpointPlan.nextReviewOverdue !== overdueAtGeneration) {
      throw new Error("summary checkpointPlan.nextReviewOverdue disagrees with generatedAt and nextReviewAt");
    }
  }
  const nextReviewDueByTime = Number.isFinite(nextReviewAtMs) && nowMs >= nextReviewAtMs;
  const computedNextReviewDelayMinutes = Number.isFinite(nextReviewAtMs)
    ? (nextReviewAtMs - nowMs) / 60_000
    : null;
  const computedNextReviewOverdue = Number.isFinite(nextReviewAtMs) ? nextReviewDueByTime : null;
  const shouldRunHeavyRefreshNow =
    checkpointPlan.shouldRunHeavyRefreshNow === true || nextReviewDueByTime;
  const sourceEvidenceRefreshDue = !sourceEvidenceReviewUsable;
  const shouldRunRefreshNow = shouldRunHeavyRefreshNow || sourceEvidenceRefreshDue;
  const refreshTrigger = checkpointPlan.shouldRunHeavyRefreshNow === true
    ? "checkpoint_flag"
    : nextReviewDueByTime
      ? "next_review_time"
      : sourceEvidenceStaleSources.length > 0
        ? "stale_source_evidence"
        : liveGoalMayLagResearchSource
          ? "source_evidence_alignment"
      : "not_due";
	  const decision = shouldRunHeavyRefreshNow
	    ? "run_full_live_goal_refresh"
	    : sourceEvidenceStaleSources.length > 0
	      ? "refresh_stale_source_evidence"
        : liveGoalMayLagResearchSource
          ? "refresh_source_evidence_alignment"
	    : "skip_full_refresh_until_next_review";
	  const exitCode = shouldRunRefreshNow ? 0 : 2;
	  const liveSummary =
	    summary.live === undefined || summary.live === null ? null : recordOrNull(summary.live);
	  if (summary.live !== undefined && summary.live !== null && liveSummary === null) {
	    throw new Error("live must be an object when present");
	  }
	  const summaryLiveReady =
	    liveSummary !== null && "liveReady" in liveSummary ? liveSummary.liveReady : null;
	  if (summaryLiveReady !== null && typeof summaryLiveReady !== "boolean") {
	    throw new Error("live.liveReady must be boolean when present");
	  }
	  const summaryLiveStartupAllowed =
	    liveSummary !== null && "liveStartupAllowed" in liveSummary
	      ? liveSummary.liveStartupAllowed
	      : null;
	  if (summaryLiveStartupAllowed !== null && typeof summaryLiveStartupAllowed !== "boolean") {
	    throw new Error("live.liveStartupAllowed must be boolean when present");
	  }
	  const detailedSuccessCriteria = summary.goalCompletionAuditView?.successCriteria;
	  if (detailedSuccessCriteria !== undefined) {
    if (!Array.isArray(detailedSuccessCriteria)) {
      throw new Error("goalCompletionAuditView.successCriteria must be an array");
    }
    if (detailedSuccessCriteria.length === 0) {
      throw new Error("goalCompletionAuditView.successCriteria must not be empty");
    }
    const detailedCriterionIds: string[] = [];
    for (const criterion of detailedSuccessCriteria) {
      if (
        criterion === null ||
        typeof criterion !== "object" ||
        Array.isArray(criterion) ||
        typeof criterion.id !== "string" ||
        criterion.id.length === 0 ||
        typeof criterion.passed !== "boolean"
      ) {
        throw new Error("goalCompletionAuditView.successCriteria entries must include id and passed");
      }
      detailedCriterionIds.push(criterion.id);
    }
    if (new Set(detailedCriterionIds).size !== detailedCriterionIds.length) {
      throw new Error("goalCompletionAuditView.successCriteria ids must be unique");
    }
    const liveStartupCriterion = detailedSuccessCriteria.find(
      (criterion) => criterion.id === "live_startup_gate_allowed",
    );
    if (liveStartupCriterion !== undefined) {
      const evidence = recordOrNull(liveStartupCriterion.evidence);
      if (
        evidence === null ||
        typeof evidence.liveReady !== "boolean" ||
        typeof evidence.liveStartupAllowed !== "boolean"
      ) {
        throw new Error("goalCompletionAuditView.live_startup_gate_allowed evidence must include liveReady and liveStartupAllowed booleans");
      }
	      const expectedPassed = evidence.liveReady === true && evidence.liveStartupAllowed === true;
	      if (liveStartupCriterion.passed !== expectedPassed) {
	        throw new Error("goalCompletionAuditView.live_startup_gate_allowed.passed disagrees with liveReady/liveStartupAllowed evidence");
	      }
	      if (typeof summaryLiveReady === "boolean" && summaryLiveReady !== evidence.liveReady) {
	        throw new Error("live.liveReady disagrees with live_startup_gate_allowed evidence");
	      }
	      if (
	        typeof summaryLiveStartupAllowed === "boolean" &&
	        summaryLiveStartupAllowed !== evidence.liveStartupAllowed
	      ) {
	        throw new Error("live.liveStartupAllowed disagrees with live_startup_gate_allowed evidence");
	      }
	    }
    const profitabilityCriterion = detailedSuccessCriteria.find(
      (criterion) => criterion.id === "profitability_evidence_satisfied",
    );
    if (profitabilityCriterion !== undefined && profitabilityCriterion.evidence !== undefined) {
      const evidence = recordOrNull(profitabilityCriterion.evidence);
      if (
        evidence === null ||
        typeof evidence.livePromotionEvidenceSatisfied !== "boolean"
      ) {
        throw new Error("goalCompletionAuditView.profitability_evidence_satisfied evidence must include livePromotionEvidenceSatisfied boolean");
      }
      if (profitabilityCriterion.passed !== evidence.livePromotionEvidenceSatisfied) {
        throw new Error("goalCompletionAuditView.profitability_evidence_satisfied.passed disagrees with livePromotionEvidenceSatisfied evidence");
      }
    }
    const operationalCriterion = detailedSuccessCriteria.find(
      (criterion) => criterion.id === "operational_readiness_complete",
    );
    if (operationalCriterion !== undefined && operationalCriterion.evidence !== undefined) {
      const evidence = recordOrNull(operationalCriterion.evidence);
      const checks = recordOrNull(evidence?.checks);
      const blockers = stringArrayOrNull(evidence?.blockers);
      if (evidence === null || typeof evidence.liveReady !== "boolean" || checks === null) {
        throw new Error("goalCompletionAuditView.operational_readiness_complete evidence must include liveReady and checks");
      }
      const requiredChecksPassed =
        checks.accountFeesConfirmed === true &&
        checks.inventoryReady === true &&
        checks.hedgeVenueReady === true &&
        checks.operationalProofPresent === true &&
        checks.operationalProofFresh === true &&
        checks.liveExecutionPathReady === true;
      const expectedPassed =
        evidence.liveReady === true &&
        requiredChecksPassed &&
        (blockers === null || blockers.length === 0);
      if (operationalCriterion.passed !== expectedPassed) {
        throw new Error("goalCompletionAuditView.operational_readiness_complete.passed disagrees with live readiness checks");
      }
    }
    const processAlignmentCriterion = detailedSuccessCriteria.find(
      (criterion) => criterion.id === "process_alignment_clean",
    );
    if (processAlignmentCriterion !== undefined && processAlignmentCriterion.evidence !== undefined) {
      const evidence = recordOrNull(processAlignmentCriterion.evidence);
      if (
        evidence === null ||
        typeof evidence.aligned !== "boolean" ||
        typeof evidence.violationCount !== "number" ||
        !Number.isFinite(evidence.violationCount)
      ) {
        throw new Error("goalCompletionAuditView.process_alignment_clean evidence must include aligned and violationCount");
      }
      const expectedPassed = evidence.aligned === true && evidence.violationCount === 0;
      if (processAlignmentCriterion.passed !== expectedPassed) {
        throw new Error("goalCompletionAuditView.process_alignment_clean.passed disagrees with process alignment evidence");
      }
    }
  }
  const failedCompletionCriteria = (detailedSuccessCriteria ?? [])
    .filter((criterion) => criterion.passed !== true)
    .map((criterion) => criterion.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const currentEntryCriterionEvidence = recordOrNull(
    detailedSuccessCriteria?.find((criterion) => criterion.id === "current_entry_sanity_clear")?.evidence,
  );
  const operationalReadinessCriterionEvidence = recordOrNull(
    detailedSuccessCriteria?.find((criterion) => criterion.id === "operational_readiness_complete")?.evidence,
  );
  const processAlignmentCriterionEvidence = recordOrNull(
    detailedSuccessCriteria?.find((criterion) => criterion.id === "process_alignment_clean")?.evidence,
  );
  const parsedMissingRequirementClassification =
    summary.goalCompletionAuditView?.successCriteria?.find(
      (criterion) => criterion.id === "no_missing_requirements",
    )?.evidence?.missingRequirementClassification ?? null;
  const parsedMissingRequirements = stringArrayOrNull(
    summary.goalCompletionAuditView?.successCriteria?.find(
      (criterion) => criterion.id === "no_missing_requirements",
    )?.evidence?.missingRequirements,
  );
  if (parsedMissingRequirements !== null) {
    requireUniqueStringArray(
      parsedMissingRequirements,
      "goalCompletionAuditView.no_missing_requirements.missingRequirements",
    );
  }
  const summaryMissingRequirements =
    summary.completionAuditSummary?.missingRequirements === undefined
      ? null
      : stringArrayOrNull(summary.completionAuditSummary.missingRequirements);
  if (
    summary.completionAuditSummary?.missingRequirements !== undefined &&
    summaryMissingRequirements === null
  ) {
    throw new Error("completionAuditSummary.missingRequirements must be a string array when present");
  }
  if (summaryMissingRequirements !== null) {
    requireUniqueStringArray(summaryMissingRequirements, "completionAuditSummary.missingRequirements");
  }
  if (
    summary.completionAuditSummary?.missingRequirements !== undefined &&
    summary.completionAuditSummary.missingRequirementCount === undefined
  ) {
    throw new Error("completionAuditSummary.missingRequirementCount is required when missingRequirements is present");
  }
  const effectiveMissingRequirements = summaryMissingRequirements ?? parsedMissingRequirements;
  const summaryMissingRequirementClassification =
    summary.missingRequirementClassification === undefined
      ? null
      : stringArrayRecordOrNull(summary.missingRequirementClassification);
  if (
    summary.missingRequirementClassification !== undefined &&
    summaryMissingRequirementClassification === null
  ) {
    throw new Error("summary.missingRequirementClassification must be a record of string arrays when present");
  }
  const missingRequirementClassification =
    summary.completionAuditSummary?.missingRequirementClassification ??
    parsedMissingRequirementClassification ??
    summaryMissingRequirementClassification;
  if (
    missingRequirementClassification !== null &&
    stringArrayRecordOrNull(missingRequirementClassification) === null
  ) {
    throw new Error("missingRequirementClassification must be a record of string arrays when present");
  }
  if (
    summaryMissingRequirementClassification !== null &&
    missingRequirementClassification !== null &&
    !sameStringArrayRecord(summaryMissingRequirementClassification, missingRequirementClassification)
  ) {
    throw new Error("summary.missingRequirementClassification disagrees with completion audit missingRequirementClassification");
  }
  const classifiedMissingRequirements =
    missingRequirementClassification === null
      ? null
      : flattenMissingRequirementClassification(missingRequirementClassification);
  const missingRequirementClassificationCounts =
    summary.completionAuditSummary?.missingRequirementClassificationCounts ??
    classificationCounts(missingRequirementClassification);
  const checkpointOutstandingAutonomousEvidence = optionalUniqueStringArray(
    checkpointPlan.outstandingAutonomousEvidence,
    "summary checkpointPlan.outstandingAutonomousEvidence",
  );
  const checkpointOutstandingOperatorWork = optionalUniqueStringArray(
    checkpointPlan.outstandingOperatorWork,
    "summary checkpointPlan.outstandingOperatorWork",
  );
  const checkpointOutstandingMarketConditionWork = optionalUniqueStringArray(
    checkpointPlan.outstandingMarketConditionWork,
    "summary checkpointPlan.outstandingMarketConditionWork",
  );
  if (summary.nextAutonomousWork !== undefined) {
    const nextAutonomousWork = optionalUniqueStringArray(summary.nextAutonomousWork, "summary.nextAutonomousWork");
    if (!sameStringSet(nextAutonomousWork, checkpointOutstandingAutonomousEvidence)) {
      throw new Error("summary.nextAutonomousWork disagrees with checkpointPlan outstanding autonomous evidence");
    }
  }
  if (summary.nextOperatorWork !== undefined) {
    const nextOperatorWork = optionalUniqueStringArray(summary.nextOperatorWork, "summary.nextOperatorWork");
    if (!sameStringSet(nextOperatorWork, checkpointOutstandingOperatorWork)) {
      throw new Error("summary.nextOperatorWork disagrees with checkpointPlan outstanding operator work");
    }
  }
  if (summary.nextMarketConditionWork !== undefined) {
    const nextMarketConditionWork = optionalUniqueStringArray(
      summary.nextMarketConditionWork,
      "summary.nextMarketConditionWork",
    );
    if (!sameStringSet(nextMarketConditionWork, checkpointOutstandingMarketConditionWork)) {
      throw new Error("summary.nextMarketConditionWork disagrees with checkpointPlan outstanding market condition work");
    }
  }
  if (summary.nextRequiredOperatorWork !== undefined) {
    const nextRequiredOperatorWork = optionalUniqueStringArray(
      summary.nextRequiredOperatorWork,
      "summary.nextRequiredOperatorWork",
    );
    if (!sameStringSet(nextRequiredOperatorWork, checkpointOutstandingOperatorWork)) {
      throw new Error("summary.nextRequiredOperatorWork disagrees with checkpointPlan outstanding operator work");
    }
  }
  const nextWorkClassification = recordOrNull(summary.nextWorkClassification);
  if (nextWorkClassification !== null) {
    const liveOperationalPrerequisites = optionalUniqueStringArray(
      nextWorkClassification.liveOperationalPrerequisites,
      "summary.nextWorkClassification.liveOperationalPrerequisites",
    );
    if (
      nextWorkClassification.liveOperationalPrerequisites !== undefined &&
      !sameStringSet(liveOperationalPrerequisites, checkpointOutstandingOperatorWork)
    ) {
      throw new Error("summary.nextWorkClassification.liveOperationalPrerequisites disagrees with checkpointPlan outstanding operator work");
    }
    const otherLiveGateBlockers = optionalUniqueStringArray(
      nextWorkClassification.otherLiveGateBlockers,
      "summary.nextWorkClassification.otherLiveGateBlockers",
    );
    if (otherLiveGateBlockers.some((blocker) => checkpointOutstandingOperatorWork.includes(blocker))) {
      throw new Error("summary.nextWorkClassification.otherLiveGateBlockers includes checkpoint operator work");
    }
  }
  const checkpointOutstandingWorkCounts = {
    autonomousEvidence: checkpointOutstandingAutonomousEvidence.length,
    operatorWork: checkpointOutstandingOperatorWork.length,
    marketConditionWork: checkpointOutstandingMarketConditionWork.length,
  };
  const outstandingWorkCounts =
    summary.completionAuditSummary?.outstandingWorkCounts ?? checkpointOutstandingWorkCounts;
  if (
    summary.completionAuditSummary?.achieved !== undefined &&
    typeof summary.completionAuditSummary.achieved !== "boolean"
  ) {
    throw new Error("completionAuditSummary.achieved must be boolean when present");
  }
  if (summary.completionAuditSummary?.failedCompletionCriteria !== undefined) {
    const compactFailedCompletionCriteria = stringArrayOrNull(
      summary.completionAuditSummary.failedCompletionCriteria,
    );
    if (compactFailedCompletionCriteria === null) {
      throw new Error("completionAuditSummary.failedCompletionCriteria must be a string array when present");
    }
    if (new Set(compactFailedCompletionCriteria).size !== compactFailedCompletionCriteria.length) {
      throw new Error("completionAuditSummary.failedCompletionCriteria ids must be unique");
    }
  }
  const effectiveFailedCompletionCriteria =
    summary.completionAuditSummary?.failedCompletionCriteria ?? failedCompletionCriteria;
  const autonomousEvidenceHandoff = summary.autonomousEvidenceHandoff ?? null;
  const operatorLiveReadinessHandoff = summary.operatorLiveReadinessHandoff ?? null;
  const marketConditionHandoff = summary.marketConditionHandoff ?? null;
  const strategyResearchHandoff = summary.strategyResearchHandoff ?? null;
	  const liveStartupPlan = recordOrNull(liveSummary?.startupPlan);
  const currentFocusLiveStartupCaution = recordOrNull(
    liveStartupPlan?.currentFocusLiveStartupCaution,
  );
  if (
    liveStartupPlan?.currentFocusLiveStartupCaution !== undefined &&
    liveStartupPlan.currentFocusLiveStartupCaution !== null &&
    currentFocusLiveStartupCaution === null
  ) {
    throw new Error("live.startupPlan.currentFocusLiveStartupCaution must be an object when present");
  }
  if (currentFocusLiveStartupCaution !== null) {
    if (
      typeof currentFocusLiveStartupCaution.action !== "string" ||
      currentFocusLiveStartupCaution.action.length === 0
    ) {
      throw new Error("live.startupPlan.currentFocusLiveStartupCaution.action must be a non-empty string");
    }
    const currentFocusMarket =
      typeof currentFocusLiveStartupCaution.currentFocusMarket === "string" &&
      currentFocusLiveStartupCaution.currentFocusMarket.length > 0
        ? currentFocusLiveStartupCaution.currentFocusMarket
        : null;
    if (currentFocusMarket === null) {
      throw new Error("live.startupPlan.currentFocusLiveStartupCaution.currentFocusMarket must be a non-empty string");
    }
    const challengerMarket =
      typeof currentFocusLiveStartupCaution.challengerMarket === "string" &&
      currentFocusLiveStartupCaution.challengerMarket.length > 0
        ? currentFocusLiveStartupCaution.challengerMarket
        : null;
    const currentFocusLatestWindow = recordOrNull(
      currentFocusLiveStartupCaution.currentFocusLatestWindow,
    );
    if (currentFocusLatestWindow === null) {
      throw new Error("live.startupPlan.currentFocusLiveStartupCaution.currentFocusLatestWindow is required");
    }
	    const currentFocusLatestWindowMedianNetCarryBps = finiteNumber(
	      currentFocusLatestWindow.medianNetCarryBps,
	    );
	    if (currentFocusLatestWindowMedianNetCarryBps === null) {
	      throw new Error("live.startupPlan.currentFocusLiveStartupCaution.currentFocusLatestWindow.medianNetCarryBps must be numeric");
	    }
	    const challengerLatestWindow = recordOrNull(
	      currentFocusLiveStartupCaution.challengerLatestWindow,
	    );
	    if (challengerLatestWindow === null) {
	      throw new Error("live.startupPlan.currentFocusLiveStartupCaution.challengerLatestWindow is required");
	    }
	    const challengerLatestWindowMedianNetCarryBps = finiteNumber(
	      challengerLatestWindow.medianNetCarryBps,
	    );
	    if (challengerLatestWindowMedianNetCarryBps === null) {
	      throw new Error("live.startupPlan.currentFocusLiveStartupCaution.challengerLatestWindow.medianNetCarryBps must be numeric");
	    }
	    const latestFeeStressWindowDeltaToCurrentFocusBps = finiteNumber(
	      currentFocusLiveStartupCaution.latestFeeStressWindowDeltaToCurrentFocusBps,
	    );
	    if (
	      currentFocusLiveStartupCaution.latestFeeStressWindowDeltaToCurrentFocusBps !== undefined &&
	      latestFeeStressWindowDeltaToCurrentFocusBps === null
	    ) {
	      throw new Error("live.startupPlan.currentFocusLiveStartupCaution.latestFeeStressWindowDeltaToCurrentFocusBps must be numeric when present");
	    }
	    if (
	      currentFocusLiveStartupCaution.action ===
	        "do_not_prepare_current_focus_live_startup_until_recompare_clears" &&
	      latestFeeStressWindowDeltaToCurrentFocusBps === null
	    ) {
	      throw new Error("live.startupPlan.currentFocusLiveStartupCaution.latestFeeStressWindowDeltaToCurrentFocusBps is required for recompare-blocked startup caution");
	    }
	    if (
	      currentFocusLiveStartupCaution.action ===
	        "do_not_prepare_current_focus_live_startup_until_recompare_clears" &&
	      challengerMarket === null
	    ) {
	      throw new Error("live.startupPlan.currentFocusLiveStartupCaution.challengerMarket must be a non-empty string for recompare-blocked startup caution");
	    }
	    if (latestFeeStressWindowDeltaToCurrentFocusBps !== null) {
	      const expectedDelta =
	        challengerLatestWindowMedianNetCarryBps - currentFocusLatestWindowMedianNetCarryBps;
	      if (Math.abs(latestFeeStressWindowDeltaToCurrentFocusBps - expectedDelta) > 0.000001) {
	        throw new Error("live.startupPlan.currentFocusLiveStartupCaution.latestFeeStressWindowDeltaToCurrentFocusBps disagrees with challenger and current latest-window medians");
	      }
	      if (
	        currentFocusLiveStartupCaution.action ===
	          "do_not_prepare_current_focus_live_startup_until_recompare_clears" &&
	        latestFeeStressWindowDeltaToCurrentFocusBps <= 0
	      ) {
	        throw new Error("live.startupPlan.currentFocusLiveStartupCaution recompare-blocked action requires a positive latestFeeStressWindowDeltaToCurrentFocusBps");
	      }
	    }
	    const latestFeeStressWindowSampleQualityPasses =
	      currentFocusLiveStartupCaution.latestFeeStressWindowSampleQualityPasses;
    if (
      latestFeeStressWindowSampleQualityPasses !== undefined &&
      typeof latestFeeStressWindowSampleQualityPasses !== "boolean"
    ) {
      throw new Error("live.startupPlan.currentFocusLiveStartupCaution.latestFeeStressWindowSampleQualityPasses must be boolean when present");
    }
    const minLatestFeeStressWindowSampleCount = finiteNumber(
      currentFocusLiveStartupCaution.minLatestFeeStressWindowSampleCount,
    );
    if (
      currentFocusLiveStartupCaution.minLatestFeeStressWindowSampleCount !== undefined &&
      minLatestFeeStressWindowSampleCount === null
    ) {
      throw new Error("live.startupPlan.currentFocusLiveStartupCaution.minLatestFeeStressWindowSampleCount must be numeric when present");
    }
    const currentFocusLatestWindowSampleCount = finiteNumber(
      currentFocusLiveStartupCaution.currentFocusLatestWindowSampleCount,
    );
    if (
      currentFocusLiveStartupCaution.currentFocusLatestWindowSampleCount !== undefined &&
      currentFocusLatestWindowSampleCount === null
    ) {
      throw new Error("live.startupPlan.currentFocusLiveStartupCaution.currentFocusLatestWindowSampleCount must be numeric when present");
    }
    const challengerLatestWindowSampleCount = finiteNumber(
      currentFocusLiveStartupCaution.challengerLatestWindowSampleCount,
    );
    if (
      currentFocusLiveStartupCaution.challengerLatestWindowSampleCount !== undefined &&
      challengerLatestWindowSampleCount === null
    ) {
      throw new Error("live.startupPlan.currentFocusLiveStartupCaution.challengerLatestWindowSampleCount must be numeric when present");
    }
    if (latestFeeStressWindowSampleQualityPasses === true) {
      if (
        minLatestFeeStressWindowSampleCount === null ||
        currentFocusLatestWindowSampleCount === null ||
        challengerLatestWindowSampleCount === null
      ) {
        throw new Error("live.startupPlan.currentFocusLiveStartupCaution sample counts are required when latestFeeStressWindowSampleQualityPasses is true");
      }
      if (
        currentFocusLatestWindowSampleCount < minLatestFeeStressWindowSampleCount ||
        challengerLatestWindowSampleCount < minLatestFeeStressWindowSampleCount
      ) {
        throw new Error("live.startupPlan.currentFocusLiveStartupCaution sample counts must meet minLatestFeeStressWindowSampleCount when latestFeeStressWindowSampleQualityPasses is true");
      }
    }
  }
  const processAlignmentSummary =
    summary.processAlignment === undefined || summary.processAlignment === null
      ? null
      : recordOrNull(summary.processAlignment);
  if (summary.processAlignment !== undefined && summary.processAlignment !== null && processAlignmentSummary === null) {
    throw new Error("processAlignment must be an object when present");
  }
  if (processAlignmentSummary !== null && processAlignmentCriterionEvidence !== null) {
    const summaryAligned =
      typeof processAlignmentSummary.aligned === "boolean" ? processAlignmentSummary.aligned : null;
    const summaryViolationCount =
      typeof processAlignmentSummary.violationCount === "number" &&
        Number.isFinite(processAlignmentSummary.violationCount)
        ? processAlignmentSummary.violationCount
        : null;
    const criterionAligned =
      typeof processAlignmentCriterionEvidence.aligned === "boolean"
        ? processAlignmentCriterionEvidence.aligned
        : null;
    const criterionViolationCount =
      typeof processAlignmentCriterionEvidence.violationCount === "number" &&
        Number.isFinite(processAlignmentCriterionEvidence.violationCount)
        ? processAlignmentCriterionEvidence.violationCount
        : null;
    if (summaryAligned !== null && criterionAligned !== null && summaryAligned !== criterionAligned) {
      throw new Error("processAlignment.aligned disagrees with process_alignment_clean evidence");
    }
    if (
      summaryViolationCount !== null &&
      criterionViolationCount !== null &&
      summaryViolationCount !== criterionViolationCount
    ) {
      throw new Error("processAlignment.violationCount disagrees with process_alignment_clean evidence");
    }
  }
  if (processAlignmentSummary !== null) {
    const processHealth = recordOrNull(processAlignmentSummary.processHealth);
    for (const field of [
      "onlineCount",
      "waitingRestartCount",
      "expectedLoopingObserverCount",
      "unstableRestartProcessCount",
      "maxRestartDelayMs",
    ]) {
      if (processAlignmentSummary[field] === undefined || processAlignmentSummary[field] === null) continue;
      const topLevelValue = finiteNumber(processAlignmentSummary[field]);
      if (topLevelValue === null || !Number.isInteger(topLevelValue) || topLevelValue < 0) {
        throw new Error(`processAlignment.${field} must be a non-negative integer when present`);
      }
      if (processHealth === null || processHealth[field] === undefined || processHealth[field] === null) continue;
      const processHealthValue = finiteNumber(processHealth[field]);
      if (processHealthValue === null || !Number.isInteger(processHealthValue) || processHealthValue < 0) {
        throw new Error(`processAlignment.processHealth.${field} must be a non-negative integer when present`);
      }
      if (topLevelValue !== processHealthValue) {
        throw new Error(`processAlignment.${field} disagrees with processAlignment.processHealth.${field}`);
      }
    }
  }
  const strategyHandoffCurrentEntrySanity = recordOrNull(strategyResearchHandoff?.currentEntrySanity);
  const currentEntrySanity = strategyHandoffCurrentEntrySanity ?? currentEntryCriterionEvidence;
  const currentEntrySanitySourceLabel =
    strategyHandoffCurrentEntrySanity !== null
      ? "strategyResearchHandoff.currentEntrySanity"
      : currentEntryCriterionEvidence !== null
        ? "goalCompletionAuditView.current_entry_sanity_clear.evidence"
        : "currentEntrySanity";
  const currentEntryBlockers =
    currentEntrySanity === null
      ? []
      : optionalUniqueStringArray(
        currentEntrySanity.currentEntryBlockers,
        `${currentEntrySanitySourceLabel}.currentEntryBlockers`,
      );
  const currentEntrySanityStatus =
    typeof currentEntrySanity?.status === "string" ? currentEntrySanity.status : null;
  const currentEntryCarryGate = recordOrNull(currentEntrySanity?.currentEntryCarryGate);
  if (currentEntryBlockers.includes("selectedFocusCurrentEntryCarryBelowLiveThreshold")) {
    requireCurrentEntryCarryGate(
      currentEntryCarryGate,
      `${currentEntrySanitySourceLabel}.currentEntryCarryGate`,
      false,
    );
  }
  if (currentEntrySanityStatus === "current_entry_clear") {
    requireCurrentEntryCarryGate(
      currentEntryCarryGate,
      `${currentEntrySanitySourceLabel}.currentEntryCarryGate`,
      true,
    );
  }
  const promptToArtifactChecklist = Array.isArray(summary.goalCompletionAuditView?.promptToArtifactChecklist)
    ? summary.goalCompletionAuditView.promptToArtifactChecklist
    : null;
  if (currentEntryCarryGate !== null && promptToArtifactChecklist !== null) {
    const currentEntryChecklist = promptToArtifactChecklist.find(
      (item) => item.id === "current_entry_sanity_checked",
    );
    if (currentEntryChecklist !== undefined) {
      const checklistEvidence = recordOrNull(currentEntryChecklist.evidence);
      if (currentEntryBlockers.length > 0 && currentEntryChecklist.status !== "blocked") {
        throw new Error("current_entry_sanity_checked checklist status must be blocked while current-entry blockers remain");
      }
      if (
        currentEntrySanityStatus === "current_entry_clear" &&
        currentEntryBlockers.length === 0 &&
        currentEntryChecklist.status !== "passed"
      ) {
        throw new Error("current_entry_sanity_checked checklist status must be passed when current entry sanity is clear");
      }
      const checklistBlockers = stringArrayOrNull(checklistEvidence?.currentEntryBlockers);
      if (
        checklistBlockers !== null &&
        !sameStringSet(checklistBlockers, currentEntryBlockers)
      ) {
        throw new Error(`current_entry_sanity_checked.currentEntryBlockers disagrees with ${currentEntrySanitySourceLabel}.currentEntryBlockers`);
      }
      if (
        checklistEvidence !== null &&
        !sameCurrentEntryCarryGate(
          checklistEvidence.currentEntryCarryGate,
          currentEntryCarryGate,
        )
      ) {
        throw new Error(
          `current_entry_sanity_checked.currentEntryCarryGate disagrees with ${currentEntrySanitySourceLabel}.currentEntryCarryGate`,
        );
      }
    }
  }
  if (promptToArtifactChecklist !== null) {
    const processControlChecklist = promptToArtifactChecklist.find(
      (item) => item.id === "process_control_clean",
    );
    if (processControlChecklist !== undefined) {
      const checklistEvidence = recordOrNull(processControlChecklist.evidence);
      const checklistAligned =
        typeof checklistEvidence?.aligned === "boolean" ? checklistEvidence.aligned : null;
      const checklistViolationCount =
        typeof checklistEvidence?.violationCount === "number" && Number.isFinite(checklistEvidence.violationCount)
          ? checklistEvidence.violationCount
          : null;
      const criterionAligned =
        typeof processAlignmentCriterionEvidence?.aligned === "boolean"
          ? processAlignmentCriterionEvidence.aligned
          : null;
      const criterionViolationCount =
        typeof processAlignmentCriterionEvidence?.violationCount === "number" &&
          Number.isFinite(processAlignmentCriterionEvidence.violationCount)
          ? processAlignmentCriterionEvidence.violationCount
          : null;
      const processAlignmentBlocked =
        effectiveFailedCompletionCriteria.includes("process_alignment_clean") ||
        criterionAligned === false ||
        (criterionViolationCount !== null && criterionViolationCount > 0);
      if (processAlignmentBlocked && processControlChecklist.status !== "blocked") {
        throw new Error("process_control_clean checklist status must be blocked while process alignment violations remain");
      }
      if (
        criterionAligned !== null &&
        checklistAligned !== null &&
        checklistAligned !== criterionAligned
      ) {
        throw new Error("process_control_clean.aligned disagrees with process_alignment_clean evidence");
      }
      if (
        criterionViolationCount !== null &&
        checklistViolationCount !== null &&
        checklistViolationCount !== criterionViolationCount
      ) {
        throw new Error("process_control_clean.violationCount disagrees with process_alignment_clean evidence");
      }
    }
    const liveReadinessChecklist = promptToArtifactChecklist.find(
      (item) => item.id === "live_readiness_verified",
    );
    if (liveReadinessChecklist !== undefined) {
      const checklistEvidence = recordOrNull(liveReadinessChecklist.evidence);
      const checklistLiveReady =
        typeof checklistEvidence?.liveReady === "boolean" ? checklistEvidence.liveReady : null;
      const checklistBlockers = stringArrayOrNull(checklistEvidence?.blockers);
      const criterionLiveReady =
        typeof operationalReadinessCriterionEvidence?.liveReady === "boolean"
          ? operationalReadinessCriterionEvidence.liveReady
          : null;
      const criterionBlockers = stringArrayOrNull(operationalReadinessCriterionEvidence?.blockers);
      const operationalReadinessFailed =
        effectiveFailedCompletionCriteria.includes("operational_readiness_complete") ||
        criterionLiveReady === false ||
        (criterionBlockers !== null && criterionBlockers.length > 0);
      if (operationalReadinessFailed && liveReadinessChecklist.status !== "blocked") {
        throw new Error("live_readiness_verified checklist status must be blocked while operational readiness blockers remain");
      }
      if (
        criterionLiveReady !== null &&
        checklistLiveReady !== null &&
        checklistLiveReady !== criterionLiveReady
      ) {
        throw new Error("live_readiness_verified.liveReady disagrees with operational_readiness_complete evidence");
      }
      if (
        criterionBlockers !== null &&
        checklistBlockers !== null &&
        !sameStringSet(checklistBlockers, criterionBlockers)
      ) {
        throw new Error("live_readiness_verified.blockers disagrees with operational_readiness_complete evidence");
      }
      if (checklistLiveReady === false && liveReadinessChecklist.status !== "blocked") {
        throw new Error("live_readiness_verified checklist status must be blocked while liveReady is false");
      }
      if (
        checklistBlockers !== null &&
        checklistBlockers.length > 0 &&
        liveReadinessChecklist.status !== "blocked"
      ) {
        throw new Error("live_readiness_verified checklist status must be blocked while readiness blockers remain");
      }
    }
  }
  const detailedSuccessCriteriaAvailable = Array.isArray(detailedSuccessCriteria);
  if (
    checkpointPlan.shouldStartLive !== undefined &&
    typeof checkpointPlan.shouldStartLive !== "boolean"
  ) {
    throw new Error("summary checkpointPlan.shouldStartLive must be boolean when present");
  }
  if (
    summary.completionAuditSummary?.failedCompletionCriteria !== undefined &&
    detailedSuccessCriteriaAvailable &&
    !sameStringSet(summary.completionAuditSummary.failedCompletionCriteria, failedCompletionCriteria)
  ) {
    throw new Error("completionAuditSummary.failedCompletionCriteria disagrees with goalCompletionAuditView");
  }
  if (
    summaryMissingRequirements !== null &&
    parsedMissingRequirements !== null &&
    !sameStringSet(summaryMissingRequirements, parsedMissingRequirements)
  ) {
    throw new Error("completionAuditSummary.missingRequirements disagrees with goalCompletionAuditView");
  }
  if (
    summary.completionAuditSummary?.missingRequirementCount !== undefined &&
    (
      typeof summary.completionAuditSummary.missingRequirementCount !== "number" ||
      !Number.isFinite(summary.completionAuditSummary.missingRequirementCount) ||
      !Number.isInteger(summary.completionAuditSummary.missingRequirementCount) ||
      summary.completionAuditSummary.missingRequirementCount < 0
    )
  ) {
    throw new Error("completionAuditSummary.missingRequirementCount must be a non-negative integer when present");
  }
  if (
    summary.completionAuditSummary?.missingRequirementCount !== undefined &&
    effectiveMissingRequirements !== null &&
    summary.completionAuditSummary.missingRequirementCount !== effectiveMissingRequirements.length
  ) {
    throw new Error("completionAuditSummary.missingRequirementCount disagrees with missingRequirements");
  }
  if (
    summary.missingRequirementCount !== undefined &&
    (
      typeof summary.missingRequirementCount !== "number" ||
      !Number.isFinite(summary.missingRequirementCount) ||
      !Number.isInteger(summary.missingRequirementCount) ||
      summary.missingRequirementCount < 0
    )
  ) {
    throw new Error("summary.missingRequirementCount must be a non-negative integer when present");
  }
  if (
    summary.missingRequirementCount !== undefined &&
    effectiveMissingRequirements !== null &&
    summary.missingRequirementCount !== effectiveMissingRequirements.length
  ) {
    throw new Error("summary.missingRequirementCount disagrees with missingRequirements");
  }
  if (
    summary.missingRequirementCount !== undefined &&
    summary.completionAuditSummary?.missingRequirementCount !== undefined &&
    summary.missingRequirementCount !== summary.completionAuditSummary.missingRequirementCount
  ) {
    throw new Error("summary.missingRequirementCount disagrees with completionAuditSummary.missingRequirementCount");
  }
  if (
    typeof summary.completionAuditSummary?.achieved === "boolean" &&
    summary.completionAuditSummary.achieved !== (summary.achieved === true)
  ) {
    throw new Error("summary achieved disagrees with completionAuditSummary.achieved");
  }
  if (summary.achieved === true && effectiveFailedCompletionCriteria.length > 0) {
    throw new Error("summary achieved is true but failed completion criteria remain");
  }
  if (
    summary.achieved === true &&
    Object.values(checkpointOutstandingWorkCounts).some((count) => count > 0)
  ) {
    throw new Error("summary achieved is true but checkpointPlan outstanding work remains");
  }
  if (
    checkpointPlan.shouldStartLive === true &&
    (
      summary.achieved !== true ||
      effectiveFailedCompletionCriteria.length > 0 ||
      Object.values(checkpointOutstandingWorkCounts).some((count) => count > 0)
    )
  ) {
    throw new Error("checkpointPlan.shouldStartLive is true but live-goal completion or outstanding work is not clear");
  }
  if (
    summary.completionAuditSummary?.achieved === false &&
    summary.completionAuditSummary.failedCompletionCriteria !== undefined &&
    effectiveFailedCompletionCriteria.length === 0
  ) {
    throw new Error("completionAuditSummary.achieved is false but failedCompletionCriteria is empty");
  }
  let sourceMissingRequirementsForScope: string[] | null = null;
  if (summary.strategyDecisionView !== undefined) {
    validateReducedActivityGuardrail(summary.strategyDecisionView.reducedActivityGuardrail);
    const reducedActivityCriterion = detailedSuccessCriteria?.find(
      (criterion) => criterion.id === "reduced_activity_guardrail_enforced",
    );
    if (reducedActivityCriterion === undefined) {
      throw new Error("goalCompletionAuditView.successCriteria must include reduced_activity_guardrail_enforced when strategyDecisionView is present");
    }
    if (reducedActivityCriterion.passed !== true) {
      throw new Error("goalCompletionAuditView.reduced_activity_guardrail_enforced must pass when reduced activity guardrail is valid");
    }
    if (promptToArtifactChecklist === null) {
      throw new Error("goalCompletionAuditView.promptToArtifactChecklist is required when strategyDecisionView is present");
    }
    const reducedActivityChecklist = promptToArtifactChecklist.find(
      (item) => item.id === "reduced_activity_guardrail_enforced",
    );
    if (reducedActivityChecklist === undefined) {
      throw new Error("goalCompletionAuditView.promptToArtifactChecklist must include reduced_activity_guardrail_enforced when strategyDecisionView is present");
    }
    if (reducedActivityChecklist.status !== "passed") {
      throw new Error("reduced_activity_guardrail_enforced checklist status must be passed when reduced activity guardrail is valid");
    }
  }
  if (summary.sourceCompletionAuditSummary !== undefined) {
    const sourceAudit = summary.sourceCompletionAuditSummary;
    if (typeof sourceAudit.achieved !== "boolean") {
      throw new Error("sourceCompletionAuditSummary.achieved must be boolean");
    }
    const sourceFailedCompletionCriteria = stringArrayOrNull(sourceAudit.failedCompletionCriteria);
    if (sourceFailedCompletionCriteria === null) {
      throw new Error("sourceCompletionAuditSummary.failedCompletionCriteria must be a string array");
    }
    requireUniqueStringArray(
      sourceFailedCompletionCriteria,
      "sourceCompletionAuditSummary.failedCompletionCriteria",
    );
    const sourceFailedCriteriaIds = stringArrayOrNull(sourceAudit.failedCriteriaIds);
    if (sourceFailedCriteriaIds === null) {
      throw new Error("sourceCompletionAuditSummary.failedCriteriaIds must be a string array");
    }
    requireUniqueStringArray(sourceFailedCriteriaIds, "sourceCompletionAuditSummary.failedCriteriaIds");
    if (!Array.isArray(sourceAudit.criteria)) {
      throw new Error("sourceCompletionAuditSummary.criteria must be an array");
    }
    const sourceCriterionIds: string[] = [];
    const sourceCriteriaFailedIds: string[] = [];
    for (const criterion of sourceAudit.criteria) {
      if (
        criterion === null ||
        typeof criterion !== "object" ||
        Array.isArray(criterion) ||
        typeof criterion.id !== "string" ||
        criterion.id.length === 0 ||
        typeof criterion.passed !== "boolean"
      ) {
        throw new Error("sourceCompletionAuditSummary.criteria entries must include id and passed");
      }
      sourceCriterionIds.push(criterion.id);
      if (criterion.passed !== true) sourceCriteriaFailedIds.push(criterion.id);
    }
    if (new Set(sourceCriterionIds).size !== sourceCriterionIds.length) {
      throw new Error("sourceCompletionAuditSummary.criteria ids must be unique");
    }
    if (sourceCriterionIds.length === 0) {
      throw new Error("sourceCompletionAuditSummary.criteria must not be empty");
    }
    if (!sameStringSet(sourceFailedCriteriaIds, sourceCriteriaFailedIds)) {
      throw new Error("sourceCompletionAuditSummary failed criteria disagree with source criteria ids");
    }
    const sourceMissingRequirements = stringArrayOrNull(sourceAudit.missingRequirements);
    if (sourceMissingRequirements === null) {
      throw new Error("sourceCompletionAuditSummary.missingRequirements must be a string array");
    }
    sourceMissingRequirementsForScope = sourceMissingRequirements;
    requireUniqueStringArray(sourceMissingRequirements, "sourceCompletionAuditSummary.missingRequirements");
    if (
      typeof sourceAudit.missingRequirementCount !== "number" ||
      !Number.isFinite(sourceAudit.missingRequirementCount) ||
      !Number.isInteger(sourceAudit.missingRequirementCount) ||
      sourceAudit.missingRequirementCount < 0
    ) {
      throw new Error("sourceCompletionAuditSummary.missingRequirementCount must be a non-negative integer");
    }
    if (sourceAudit.failedCriteriaIdsMatch !== true) {
      throw new Error("sourceCompletionAuditSummary failed criteria disagree with source criteria ids");
    }
    if (!sameStringSet(sourceFailedCompletionCriteria, sourceFailedCriteriaIds)) {
      throw new Error("sourceCompletionAuditSummary failed criteria disagree with source criteria ids");
    }
    if (sourceAudit.missingRequirementCountMatches !== true) {
      throw new Error("sourceCompletionAuditSummary missingRequirementCount disagrees with missingRequirements");
    }
    if (sourceAudit.missingRequirementCount !== sourceMissingRequirements.length) {
      throw new Error("sourceCompletionAuditSummary missingRequirementCount disagrees with missingRequirements");
    }
    if (
      sourceAudit.achieved === true &&
      (sourceFailedCompletionCriteria.length > 0 ||
        sourceAudit.missingRequirementCount > 0 ||
        sourceMissingRequirements.length > 0)
    ) {
      throw new Error("sourceCompletionAuditSummary is achieved but still lists failed or missing requirements");
    }
    if (
      sourceAudit.achieved === false &&
      sourceFailedCompletionCriteria.length === 0 &&
      sourceAudit.missingRequirementCount === 0 &&
      sourceMissingRequirements.length === 0
    ) {
      throw new Error("sourceCompletionAuditSummary is not achieved but lists no failed or missing requirements");
    }
  }
  if (summary.completionAuditScopeComparison !== undefined) {
    if (sourceMissingRequirementsForScope === null || effectiveMissingRequirements === null) {
      throw new Error("completionAuditScopeComparison requires source and derived missingRequirements");
    }
    const scopeComparison = summary.completionAuditScopeComparison;
    const addedBySummary = stringArrayOrNull(scopeComparison.addedBySummary);
    if (addedBySummary === null) {
      throw new Error("completionAuditScopeComparison.addedBySummary must be a string array");
    }
    requireUniqueStringArray(addedBySummary, "completionAuditScopeComparison.addedBySummary");
    const missingFromSummary = stringArrayOrNull(scopeComparison.missingFromSummary);
    if (missingFromSummary === null) {
      throw new Error("completionAuditScopeComparison.missingFromSummary must be a string array");
    }
    requireUniqueStringArray(missingFromSummary, "completionAuditScopeComparison.missingFromSummary");
    if (
      typeof scopeComparison.sourceMissingRequirementCount !== "number" ||
      !Number.isInteger(scopeComparison.sourceMissingRequirementCount) ||
      scopeComparison.sourceMissingRequirementCount < 0
    ) {
      throw new Error("completionAuditScopeComparison.sourceMissingRequirementCount must be a non-negative integer");
    }
    if (
      typeof scopeComparison.derivedMissingRequirementCount !== "number" ||
      !Number.isInteger(scopeComparison.derivedMissingRequirementCount) ||
      scopeComparison.derivedMissingRequirementCount < 0
    ) {
      throw new Error("completionAuditScopeComparison.derivedMissingRequirementCount must be a non-negative integer");
    }
    if (typeof scopeComparison.countsMatch !== "boolean") {
      throw new Error("completionAuditScopeComparison.countsMatch must be boolean");
    }
    if (
      typeof scopeComparison.scopeInterpretation !== "string" ||
      scopeComparison.scopeInterpretation.length === 0
    ) {
      throw new Error("completionAuditScopeComparison.scopeInterpretation must be a non-empty string");
    }
    const computedAddedBySummary = effectiveMissingRequirements.filter(
      (requirement) => !sourceMissingRequirementsForScope.includes(requirement),
    );
    const computedMissingFromSummary = sourceMissingRequirementsForScope.filter(
      (requirement) => !effectiveMissingRequirements.includes(requirement),
    );
    if (scopeComparison.sourceMissingRequirementCount !== sourceMissingRequirementsForScope.length) {
      throw new Error("completionAuditScopeComparison.sourceMissingRequirementCount disagrees with sourceCompletionAuditSummary");
    }
    if (scopeComparison.derivedMissingRequirementCount !== effectiveMissingRequirements.length) {
      throw new Error("completionAuditScopeComparison.derivedMissingRequirementCount disagrees with completionAuditSummary");
    }
    if (
      scopeComparison.countsMatch !==
      (sourceMissingRequirementsForScope.length === effectiveMissingRequirements.length)
    ) {
      throw new Error("completionAuditScopeComparison.countsMatch disagrees with source and derived counts");
    }
    if (!sameStringSet(addedBySummary, computedAddedBySummary)) {
      throw new Error("completionAuditScopeComparison.addedBySummary disagrees with source and derived missingRequirements");
    }
    if (!sameStringSet(missingFromSummary, computedMissingFromSummary)) {
      throw new Error("completionAuditScopeComparison.missingFromSummary disagrees with source and derived missingRequirements");
    }
    if (promptToArtifactChecklist === null) {
      throw new Error("goalCompletionAuditView.promptToArtifactChecklist is required when completionAuditScopeComparison is present");
    }
    const scopeChecklist = promptToArtifactChecklist.find(
      (item) => item.id === "completion_audit_scope_reconciled",
    );
    if (scopeChecklist === undefined) {
      throw new Error("goalCompletionAuditView.promptToArtifactChecklist must include completion_audit_scope_reconciled");
    }
    if (scopeChecklist.status !== "passed") {
      throw new Error("completion_audit_scope_reconciled checklist status must be passed when audit scope comparison is valid");
    }
    const scopeChecklistEvidence = recordOrNull(scopeChecklist.evidence);
    if (scopeChecklistEvidence === null) {
      throw new Error("completion_audit_scope_reconciled checklist evidence is missing");
    }
    if (scopeChecklistEvidence.sourceMissingRequirementCount !== scopeComparison.sourceMissingRequirementCount) {
      throw new Error("completion_audit_scope_reconciled checklist source count disagrees with audit scope comparison");
    }
    if (scopeChecklistEvidence.derivedMissingRequirementCount !== scopeComparison.derivedMissingRequirementCount) {
      throw new Error("completion_audit_scope_reconciled checklist derived count disagrees with audit scope comparison");
    }
    if (scopeChecklistEvidence.countsMatch !== scopeComparison.countsMatch) {
      throw new Error("completion_audit_scope_reconciled checklist countsMatch disagrees with audit scope comparison");
    }
    const scopeChecklistAddedBySummary = stringArrayOrNull(scopeChecklistEvidence.addedBySummary);
    if (scopeChecklistAddedBySummary === null) {
      throw new Error("completion_audit_scope_reconciled checklist addedBySummary must be a string array");
    }
    const scopeChecklistMissingFromSummary = stringArrayOrNull(scopeChecklistEvidence.missingFromSummary);
    if (scopeChecklistMissingFromSummary === null) {
      throw new Error("completion_audit_scope_reconciled checklist missingFromSummary must be a string array");
    }
    if (!sameStringSet(scopeChecklistAddedBySummary, addedBySummary)) {
      throw new Error("completion_audit_scope_reconciled checklist addedBySummary disagrees with audit scope comparison");
    }
    if (!sameStringSet(scopeChecklistMissingFromSummary, missingFromSummary)) {
      throw new Error("completion_audit_scope_reconciled checklist missingFromSummary disagrees with audit scope comparison");
    }
  } else if (
    sourceMissingRequirementsForScope !== null &&
    effectiveMissingRequirements !== null &&
    !sameStringSet(sourceMissingRequirementsForScope, effectiveMissingRequirements)
  ) {
    throw new Error("completionAuditScopeComparison is required when source and derived missingRequirements differ");
  }
  if (effectiveFailedCompletionCriteria.includes("no_missing_requirements")) {
    if (missingRequirementClassification === null) {
      throw new Error("no_missing_requirements failed but missingRequirementClassification is missing");
    }
    if (!hasAnyClassifiedRequirement(missingRequirementClassification)) {
      throw new Error("no_missing_requirements failed but missingRequirementClassification is empty");
    }
    if (effectiveMissingRequirements !== null && effectiveMissingRequirements.length === 0) {
      throw new Error("no_missing_requirements failed but missingRequirements is empty");
    }
  }
  const computedMissingRequirementClassificationCounts = classificationCounts(missingRequirementClassification);
  if (
    summary.completionAuditSummary?.missingRequirementClassificationCounts !== undefined &&
    missingRequirementClassification === null
  ) {
    throw new Error("completionAuditSummary.missingRequirementClassificationCounts requires missingRequirementClassification");
  }
  if (
    summary.completionAuditSummary?.missingRequirementClassificationCounts !== undefined &&
    nonNegativeIntegerRecordOrNull(summary.completionAuditSummary.missingRequirementClassificationCounts) === null
  ) {
    throw new Error("completionAuditSummary.missingRequirementClassificationCounts must be a non-negative integer record when present");
  }
  if (
    summary.completionAuditSummary?.missingRequirementClassificationCounts !== undefined &&
    computedMissingRequirementClassificationCounts !== null &&
    !sameNumberRecord(summary.completionAuditSummary.missingRequirementClassificationCounts, computedMissingRequirementClassificationCounts)
  ) {
    throw new Error("completionAuditSummary.missingRequirementClassificationCounts disagrees with missingRequirementClassification");
  }
  if (
    summary.missingRequirementClassificationCounts !== undefined &&
    missingRequirementClassification === null
  ) {
    throw new Error("summary.missingRequirementClassificationCounts requires missingRequirementClassification");
  }
  if (
    summary.missingRequirementClassificationCounts !== undefined &&
    nonNegativeIntegerRecordOrNull(summary.missingRequirementClassificationCounts) === null
  ) {
    throw new Error("summary.missingRequirementClassificationCounts must be a non-negative integer record when present");
  }
  if (
    summary.missingRequirementClassificationCounts !== undefined &&
    computedMissingRequirementClassificationCounts !== null &&
    !sameNumberRecord(summary.missingRequirementClassificationCounts, computedMissingRequirementClassificationCounts)
  ) {
    throw new Error("summary.missingRequirementClassificationCounts disagrees with missingRequirementClassification");
  }
  if (
    summary.missingRequirementClassificationCounts !== undefined &&
    summary.completionAuditSummary?.missingRequirementClassificationCounts !== undefined &&
    !sameNumberRecord(summary.missingRequirementClassificationCounts, summary.completionAuditSummary.missingRequirementClassificationCounts)
  ) {
    throw new Error("summary.missingRequirementClassificationCounts disagrees with completionAuditSummary.missingRequirementClassificationCounts");
  }
  if (effectiveMissingRequirements !== null && classifiedMissingRequirements !== null) {
    if (!sameStringSet(effectiveMissingRequirements, classifiedMissingRequirements)) {
      throw new Error("missingRequirementClassification does not cover the same requirements as missingRequirements");
    }
  }
  if (
    summary.completionAuditSummary?.outstandingWorkCounts !== undefined &&
    nonNegativeIntegerRecordOrNull(summary.completionAuditSummary.outstandingWorkCounts) === null
  ) {
    throw new Error("completionAuditSummary.outstandingWorkCounts must be a non-negative integer record when present");
  }
  if (
    summary.completionAuditSummary?.outstandingWorkCounts !== undefined &&
    !sameNumberRecord(summary.completionAuditSummary.outstandingWorkCounts, checkpointOutstandingWorkCounts)
  ) {
    throw new Error("completionAuditSummary.outstandingWorkCounts disagrees with checkpointPlan outstanding work");
  }
  if (
    summary.outstandingWorkCounts !== undefined &&
    nonNegativeIntegerRecordOrNull(summary.outstandingWorkCounts) === null
  ) {
    throw new Error("summary.outstandingWorkCounts must be a non-negative integer record when present");
  }
  if (
    summary.outstandingWorkCounts !== undefined &&
    !sameNumberRecord(summary.outstandingWorkCounts, checkpointOutstandingWorkCounts)
  ) {
    throw new Error("summary.outstandingWorkCounts disagrees with checkpointPlan outstanding work");
  }
  if (
    summary.outstandingWorkCounts !== undefined &&
    summary.completionAuditSummary?.outstandingWorkCounts !== undefined &&
    !sameNumberRecord(summary.outstandingWorkCounts, summary.completionAuditSummary.outstandingWorkCounts)
  ) {
    throw new Error("summary.outstandingWorkCounts disagrees with completionAuditSummary.outstandingWorkCounts");
  }
  requireTargetedMarketConditionMonitoring(
    checkpointPlan.targetedMarketConditionMonitoring,
    checkpointOutstandingMarketConditionWork,
    "checkpointPlan.targetedMarketConditionMonitoring",
  );
  const checkpointAutonomousEvidenceSufficiency = recordOrNull(checkpointPlan.autonomousEvidenceSufficiency);
  if (checkpointAutonomousEvidenceSufficiency !== null && promptToArtifactChecklist !== null) {
    const checkpointChecklist = promptToArtifactChecklist.find(
      (item) => item.id === "checkpoint_plan_recorded",
    );
    if (checkpointChecklist === undefined) {
      throw new Error("goalCompletionAuditView.promptToArtifactChecklist must include checkpoint_plan_recorded when autonomous sufficiency is recorded");
    }
    const checkpointChecklistEvidence = recordOrNull(checkpointChecklist.evidence);
    const checklistSufficiency = recordOrNull(
      checkpointChecklistEvidence?.autonomousEvidenceSufficiency,
    );
    if (
      checklistSufficiency === null ||
      checklistSufficiency.earliestReviewAt !== checkpointAutonomousEvidenceSufficiency.earliestReviewAt ||
      checklistSufficiency.nextReviewCanCompleteAutonomousEvidence !==
        checkpointAutonomousEvidenceSufficiency.nextReviewCanCompleteAutonomousEvidence
    ) {
      throw new Error("checkpoint_plan_recorded.autonomousEvidenceSufficiency disagrees with checkpointPlan.autonomousEvidenceSufficiency");
    }
  }
  if (
    summary.goalCompletionAuditView !== undefined &&
    (strategyResearchHandoff !== null || marketConditionHandoff !== null)
  ) {
    if (promptToArtifactChecklist === null) {
      throw new Error("goalCompletionAuditView.promptToArtifactChecklist is required when handoff summaries are present");
    }
    const analysisChecklist = promptToArtifactChecklist.find(
      (item) => item.id === "subagent_current_analysis_handoff_reflected",
    );
    if (analysisChecklist === undefined) {
      throw new Error("goalCompletionAuditView.promptToArtifactChecklist must include subagent_current_analysis_handoff_reflected");
    }
    if (analysisChecklist.status !== "passed") {
      throw new Error("subagent_current_analysis_handoff_reflected checklist status must be passed");
    }
    const evidence = analysisChecklist.evidence;
    if (evidence === null || typeof evidence !== "object" || Array.isArray(evidence)) {
      throw new Error("subagent_current_analysis_handoff_reflected checklist evidence is missing");
    }
    const evidenceRecord = evidence as Record<string, unknown>;
    if (evidenceRecord.canAuthorizeLiveStartup !== false) {
      throw new Error("subagent_current_analysis_handoff_reflected must record that analysis handoff cannot authorize live startup");
    }
    if (typeof evidenceRecord.strategyStatus !== "string" || evidenceRecord.strategyStatus.length === 0) {
      throw new Error("subagent_current_analysis_handoff_reflected.strategyStatus is missing");
    }
    const spreadSensitivity = evidenceRecord.spreadSensitivity;
    if (spreadSensitivity !== null && spreadSensitivity !== undefined) {
      if (typeof spreadSensitivity !== "object" || Array.isArray(spreadSensitivity)) {
        throw new Error("subagent_current_analysis_handoff_reflected.spreadSensitivity must be an object when present");
      }
      const spreadSensitivityRecord = spreadSensitivity as Record<string, unknown>;
      const caveat = spreadSensitivityRecord.caveat;
      if (
        typeof caveat !== "string" ||
        !/diagnostic only/i.test(caveat) ||
        !/does not relax live gates/i.test(caveat)
      ) {
        throw new Error("subagent_current_analysis_handoff_reflected.spreadSensitivity.caveat must keep sensitivity diagnostic-only");
      }
    }
    if (effectiveFailedCompletionCriteria.includes("no_current_focus_recompare_caution")) {
      const liveStartupChecklist = promptToArtifactChecklist.find(
        (item) => item.id === "live_startup_method_documented",
      );
      if (liveStartupChecklist === undefined) {
        throw new Error("goalCompletionAuditView.promptToArtifactChecklist must include live_startup_method_documented while current focus recompare blocks live startup");
      }
      if (liveStartupChecklist.status !== "blocked") {
        throw new Error("live_startup_method_documented checklist status must be blocked while current focus recompare blocks live startup");
      }
      const liveStartupEvidence = liveStartupChecklist.evidence;
      if (
        liveStartupEvidence === null ||
        typeof liveStartupEvidence !== "object" ||
        Array.isArray(liveStartupEvidence)
      ) {
        throw new Error("live_startup_method_documented checklist evidence is missing");
      }
      const checklistBlockedCommands = requireBlockedLiveCommands(
        (liveStartupEvidence as Record<string, unknown>).blockedCommands,
        "live_startup_method_documented.blockedCommands",
      );
      const liveStartupPlanBlockedCommands = recordOrNull(summary.live?.startupPlan?.blockedCommands);
      if (liveStartupPlanBlockedCommands === null) {
        throw new Error("live.startupPlan.blockedCommands is required while current focus recompare blocks live startup");
      }
      const blockedCommandSources: Array<[string, Record<string, unknown> | null]> = [
        ["live.startupPlan.blockedCommands", liveStartupPlanBlockedCommands],
        ["strategyResearchHandoff.blockedCommands", recordOrNull(strategyResearchHandoff?.blockedCommands)],
        ["operatorLiveReadinessHandoff.blockedCommands", recordOrNull(operatorLiveReadinessHandoff?.blockedCommands)],
        ["marketConditionHandoff.blockedCommands", recordOrNull(marketConditionHandoff?.blockedCommands)],
      ];
      for (const [sourceLabel, sourceBlockedCommands] of blockedCommandSources) {
        if (
          sourceBlockedCommands !== null &&
          !sameBlockedLiveCommands(checklistBlockedCommands, sourceBlockedCommands)
        ) {
          throw new Error(`live_startup_method_documented.blockedCommands disagrees with ${sourceLabel}`);
        }
      }
      const checklistHardStops = stringArrayOrNull(
        (liveStartupEvidence as Record<string, unknown>).hardStops,
      );
      const startupPlanHardStops = stringArrayOrNull(summary.live?.startupPlan?.hardStops);
      if (
        checklistHardStops === null ||
        startupPlanHardStops === null ||
        !sameStringSet(checklistHardStops, startupPlanHardStops)
      ) {
        throw new Error("live_startup_method_documented.hardStops disagrees with live.startupPlan.hardStops");
      }
      if (
        !checklistHardStops.some((item) =>
          /blocked live review.*manual validation.*PM2 start commands.*recompare clears/.test(item),
        )
      ) {
        throw new Error("live_startup_method_documented.hardStops is missing the blocked live/manual validation command recompare hard stop");
      }
    }
  }
  if (autonomousEvidenceHandoff !== null) {
    const autonomousHandoffStatus = autonomousEvidenceHandoff.status;
    const requiredBeforeLiveReview = autonomousEvidenceHandoff.requiredBeforeLiveReview;
    const canStartLiveWithoutAutonomousEvidenceWork = autonomousEvidenceHandoff.canStartLiveWithoutAutonomousEvidenceWork;
    if (
      checkpointOutstandingAutonomousEvidence.length > 0 &&
      autonomousHandoffStatus !== "autonomous_evidence_required"
    ) {
      throw new Error("autonomousEvidenceHandoff.status must be autonomous_evidence_required while autonomous evidence work remains");
    }
    if (requiredBeforeLiveReview !== undefined) {
      if (!Array.isArray(requiredBeforeLiveReview) || !requiredBeforeLiveReview.every((item) => typeof item === "string")) {
        throw new Error("autonomousEvidenceHandoff.requiredBeforeLiveReview must be a string array");
      }
      if (!sameStringSet(requiredBeforeLiveReview, checkpointOutstandingAutonomousEvidence)) {
        throw new Error("autonomousEvidenceHandoff.requiredBeforeLiveReview disagrees with checkpointPlan outstanding autonomous evidence");
      }
    }
    if (checkpointOutstandingAutonomousEvidence.length > 0 && canStartLiveWithoutAutonomousEvidenceWork === true) {
      throw new Error("autonomousEvidenceHandoff canStartLiveWithoutAutonomousEvidenceWork is true while autonomous evidence work remains");
    }
    if (
      checkpointOutstandingAutonomousEvidence.length > 0 &&
      (typeof autonomousEvidenceHandoff.reviewCommand !== "string" || autonomousEvidenceHandoff.reviewCommand.length === 0)
    ) {
      throw new Error("autonomousEvidenceHandoff.reviewCommand is missing while autonomous evidence work remains");
    }
    if (checkpointOutstandingAutonomousEvidence.length > 0) {
      requireSafeReviewCommand(
        autonomousEvidenceHandoff.reviewCommand,
        "autonomousEvidenceHandoff.reviewCommand",
      );
    }
    if (checkpointOutstandingAutonomousEvidence.includes("insufficientObservationSpan")) {
      const readinessGap = autonomousEvidenceHandoff.readinessGap;
      const observationSpanMinutes =
        readinessGap !== null &&
        typeof readinessGap === "object" &&
        !Array.isArray(readinessGap)
          ? (readinessGap as Record<string, unknown>).observationSpanMinutes
          : null;
      if (
        observationSpanMinutes === null ||
        typeof observationSpanMinutes !== "object" ||
        Array.isArray(observationSpanMinutes)
      ) {
        throw new Error(
          "autonomousEvidenceHandoff.readinessGap.observationSpanMinutes is missing while observation-span evidence work remains",
        );
      }
      const observationSpanGap = observationSpanMinutes as Record<string, unknown>;
      const current = observationSpanGap.current;
      const required = observationSpanGap.required;
      const remaining = observationSpanGap.remaining;
      if (
        typeof current !== "number" ||
        !Number.isFinite(current) ||
        typeof required !== "number" ||
        !Number.isFinite(required) ||
        typeof remaining !== "number" ||
        !Number.isFinite(remaining)
      ) {
        throw new Error(
          "autonomousEvidenceHandoff.readinessGap.observationSpanMinutes must include finite current, required, and remaining minutes",
        );
      }
	      if (observationSpanGap.passed !== false || remaining <= 0 || current >= required) {
	        throw new Error(
	          "autonomousEvidenceHandoff.readinessGap.observationSpanMinutes must show a remaining unmet span while observation-span evidence work remains",
	        );
	      }
	    }
    requireAutonomousBlockerEvidence(
      autonomousEvidenceHandoff.autonomousBlockerEvidence,
      checkpointOutstandingAutonomousEvidence,
      "autonomousEvidenceHandoff.autonomousBlockerEvidence",
    );
    if (checkpointOutstandingAutonomousEvidence.includes("insufficientObservationSpan")) {
      const readinessTimeline = recordOrNull(autonomousEvidenceHandoff.readinessTimeline);
      const estimatedEarliestReviewAt =
        readinessTimeline !== null && typeof readinessTimeline.estimatedEarliestReviewAt === "string"
          ? readinessTimeline.estimatedEarliestReviewAt
          : null;
      const nextReviewAt = checkpointPlan.nextReviewAt;
      const estimatedEarliestReviewAtMs =
        estimatedEarliestReviewAt === null ? Number.NaN : Date.parse(estimatedEarliestReviewAt);
      const nextReviewAtMs =
        typeof nextReviewAt === "string" && nextReviewAt.length > 0 ? Date.parse(nextReviewAt) : Number.NaN;
      if (
        Number.isFinite(estimatedEarliestReviewAtMs) &&
        Number.isFinite(nextReviewAtMs) &&
        nextReviewAtMs < estimatedEarliestReviewAtMs
      ) {
        const sufficiency = recordOrNull(checkpointPlan.autonomousEvidenceSufficiency);
        if (
          sufficiency === null ||
          sufficiency.blocker !== "insufficientObservationSpan" ||
          sufficiency.earliestReviewAt !== estimatedEarliestReviewAt ||
          sufficiency.nextReviewCanCompleteAutonomousEvidence !== false
        ) {
          throw new Error(
            "checkpointPlan.autonomousEvidenceSufficiency must show the later observation-span review time when nextReviewAt is earlier than autonomous evidence sufficiency",
          );
        }
      }
    }
	    if (checkpointOutstandingAutonomousEvidence.length > 0) {
      if (
        typeof checkpointPlan.reviewCommand !== "string" ||
        checkpointPlan.reviewCommand.length === 0 ||
        autonomousEvidenceHandoff.reviewCommand !== checkpointPlan.reviewCommand
      ) {
        throw new Error("autonomousEvidenceHandoff.reviewCommand disagrees with checkpointPlan.reviewCommand while autonomous evidence work remains");
      }
      if (
        typeof checkpointPlan.nextReviewAt !== "string" ||
        checkpointPlan.nextReviewAt.length === 0 ||
        autonomousEvidenceHandoff.nextReviewAt !== checkpointPlan.nextReviewAt
      ) {
        throw new Error("autonomousEvidenceHandoff.nextReviewAt disagrees with checkpointPlan.nextReviewAt while autonomous evidence work remains");
      }
      if (
        typeof checkpointPlan.nextReviewAtKst !== "string" ||
        checkpointPlan.nextReviewAtKst.length === 0 ||
        autonomousEvidenceHandoff.nextReviewAtKst !== checkpointPlan.nextReviewAtKst
      ) {
        throw new Error("autonomousEvidenceHandoff.nextReviewAtKst disagrees with checkpointPlan.nextReviewAtKst while autonomous evidence work remains");
      }
      if (
        typeof checkpointPlan.nextReviewTrigger !== "string" ||
        checkpointPlan.nextReviewTrigger.length === 0 ||
        autonomousEvidenceHandoff.nextReviewTrigger !== checkpointPlan.nextReviewTrigger
      ) {
        throw new Error("autonomousEvidenceHandoff.nextReviewTrigger disagrees with checkpointPlan.nextReviewTrigger while autonomous evidence work remains");
      }
      if (
        typeof checkpointPlan.recommendedAutonomousAction !== "string" ||
        checkpointPlan.recommendedAutonomousAction.length === 0 ||
        autonomousEvidenceHandoff.recommendedAutonomousAction !== checkpointPlan.recommendedAutonomousAction
      ) {
        throw new Error("autonomousEvidenceHandoff.recommendedAutonomousAction disagrees with checkpointPlan.recommendedAutonomousAction while autonomous evidence work remains");
      }
    }
  }
  if (checkpointOutstandingAutonomousEvidence.length > 0 && autonomousEvidenceHandoff === null) {
    throw new Error("autonomousEvidenceHandoff is missing while checkpointPlan outstanding autonomous evidence remains");
  }
  if (operatorLiveReadinessHandoff !== null) {
    const operatorHandoffStatus = operatorLiveReadinessHandoff.status;
    const requiredBeforeLiveReview = operatorLiveReadinessHandoff.requiredBeforeLiveReview;
    const canStartLiveWithoutOperatorInput = operatorLiveReadinessHandoff.canStartLiveWithoutOperatorInput;
    if (
      checkpointOutstandingOperatorWork.length > 0 &&
      operatorHandoffStatus !== "operator_prerequisites_required"
    ) {
      throw new Error("operatorLiveReadinessHandoff.status must be operator_prerequisites_required while operator work remains");
    }
    if (requiredBeforeLiveReview !== undefined) {
      if (!Array.isArray(requiredBeforeLiveReview) || !requiredBeforeLiveReview.every((item) => typeof item === "string")) {
        throw new Error("operatorLiveReadinessHandoff.requiredBeforeLiveReview must be a string array");
      }
      if (!sameStringSet(requiredBeforeLiveReview, checkpointOutstandingOperatorWork)) {
        throw new Error("operatorLiveReadinessHandoff.requiredBeforeLiveReview disagrees with checkpointPlan outstanding operator work");
      }
    }
    if (checkpointOutstandingOperatorWork.length > 0 && canStartLiveWithoutOperatorInput === true) {
      throw new Error("operatorLiveReadinessHandoff canStartLiveWithoutOperatorInput is true while operator work remains");
    }
    if (checkpointOutstandingOperatorWork.length > 0) {
      const verificationCommands = operatorLiveReadinessHandoff.verificationCommands;
      if (
        verificationCommands === null ||
        typeof verificationCommands !== "object" ||
        Array.isArray(verificationCommands)
      ) {
        throw new Error("operatorLiveReadinessHandoff.verificationCommands is missing while operator work remains");
      }
      const commandRecord = verificationCommands as Record<string, unknown>;
      const currentFocusRecompareBlocksLiveCommands =
        effectiveFailedCompletionCriteria.includes("no_current_focus_recompare_caution");
      if (
        !currentFocusRecompareBlocksLiveCommands &&
        (typeof commandRecord.reviewCommand !== "string" || commandRecord.reviewCommand.length === 0)
      ) {
        throw new Error("operatorLiveReadinessHandoff.verificationCommands.reviewCommand is missing while operator work remains");
      }
      if (currentFocusRecompareBlocksLiveCommands && commandRecord.reviewCommand !== null) {
        throw new Error("operatorLiveReadinessHandoff.verificationCommands.reviewCommand must be null while current focus recompare blocks live startup");
      }
      if (!currentFocusRecompareBlocksLiveCommands) {
        requireSafeReviewCommand(
          commandRecord.reviewCommand,
          "operatorLiveReadinessHandoff.verificationCommands.reviewCommand",
        );
      }
      requireSafeVerificationGateCommand(
        commandRecord.gateCommand,
        "operatorLiveReadinessHandoff.verificationCommands.gateCommand",
      );
	      if (checkpointOutstandingOperatorWork.includes("operationalProof:credentialsMissing")) {
	        const missingSecrets = operatorLiveReadinessHandoff.missingSecrets;
	        if (!Array.isArray(missingSecrets) || !missingSecrets.some((item) => typeof item === "string" && item.length > 0)) {
	          throw new Error("operatorLiveReadinessHandoff.missingSecrets is empty while credentials operator work remains");
	        }
	      }
      requireOperatorBlockerEvidence(
        operatorLiveReadinessHandoff.operatorBlockerEvidence,
        checkpointOutstandingOperatorWork,
        "operatorLiveReadinessHandoff.operatorBlockerEvidence",
      );
	      const deficits = operatorLiveReadinessHandoff.deficits;
      const deficitRecord =
        deficits !== null && typeof deficits === "object" && !Array.isArray(deficits)
          ? deficits as Record<string, unknown>
          : null;
      if (
        checkpointOutstandingOperatorWork.includes("operationalProof:bithumbQuoteInventoryInsufficient") &&
        (deficitRecord === null ||
          typeof deficitRecord.bithumbQuoteDeficitKrw !== "number" ||
          !Number.isFinite(deficitRecord.bithumbQuoteDeficitKrw) ||
          deficitRecord.bithumbQuoteDeficitKrw <= 0)
      ) {
        throw new Error("operatorLiveReadinessHandoff.deficits.bithumbQuoteDeficitKrw is missing while Bithumb inventory operator work remains");
      }
      if (
        checkpointOutstandingOperatorWork.includes("operationalProof:binanceUsdtMarginInsufficient") &&
        (deficitRecord === null ||
          typeof deficitRecord.binanceUsdtDeficit !== "number" ||
          !Number.isFinite(deficitRecord.binanceUsdtDeficit) ||
          deficitRecord.binanceUsdtDeficit <= 0)
      ) {
        throw new Error("operatorLiveReadinessHandoff.deficits.binanceUsdtDeficit is missing while Binance margin operator work remains");
      }
      if (checkpointOutstandingOperatorWork.includes("feeScheduleUnconfirmed")) {
        const feeBudget = operatorLiveReadinessHandoff.feeBudget;
        const feeBudgetRecord =
          feeBudget !== null && typeof feeBudget === "object" && !Array.isArray(feeBudget)
            ? feeBudget as Record<string, unknown>
            : null;
        if (
          feeBudgetRecord === null ||
          typeof feeBudgetRecord.maxBithumbFeeBps !== "number" ||
          !Number.isFinite(feeBudgetRecord.maxBithumbFeeBps) ||
          feeBudgetRecord.maxBithumbFeeBps <= 0
        ) {
          throw new Error("operatorLiveReadinessHandoff.feeBudget.maxBithumbFeeBps is missing while fee schedule operator work remains");
        }
        if (
          typeof feeBudgetRecord.maxBinanceFuturesTakerFeeBps !== "number" ||
          !Number.isFinite(feeBudgetRecord.maxBinanceFuturesTakerFeeBps) ||
          feeBudgetRecord.maxBinanceFuturesTakerFeeBps < 0
        ) {
          throw new Error("operatorLiveReadinessHandoff.feeBudget.maxBinanceFuturesTakerFeeBps is missing while fee schedule operator work remains");
        }
      }
      const operatorActions = operatorLiveReadinessHandoff.operatorActions;
      const hasOperatorAction = (action: string): boolean =>
        Array.isArray(operatorActions) &&
        operatorActions.some((item) => {
          if (item === null || typeof item !== "object" || Array.isArray(item)) return false;
          return (item as Record<string, unknown>).action === action;
        });
      if (promptToArtifactChecklist !== null) {
        const liveReadinessChecklist = promptToArtifactChecklist.find(
          (item) => item.id === "live_readiness_verified",
        );
        if (liveReadinessChecklist !== undefined) {
          const checklistEvidence = recordOrNull(liveReadinessChecklist.evidence);
          const checklistOperatorActions = operatorActionNames(checklistEvidence?.operatorActions);
          const handoffOperatorActions = operatorActionNames(operatorActions);
          if (
            checklistOperatorActions === null ||
            handoffOperatorActions === null ||
            !sameStringSet(checklistOperatorActions, handoffOperatorActions)
          ) {
            throw new Error("live_readiness_verified.operatorActions disagrees with operatorLiveReadinessHandoff.operatorActions");
          }
        }
      }
      if (
        checkpointOutstandingOperatorWork.includes("feeScheduleUnconfirmed") &&
        !hasOperatorAction("confirm_account_fee_schedule")
      ) {
        throw new Error("operatorLiveReadinessHandoff.operatorActions is missing confirm_account_fee_schedule while fee schedule operator work remains");
      }
      if (
        checkpointOutstandingOperatorWork.includes("inventoryNotReady") &&
        !hasOperatorAction("fund_or_verify_spot_inventory")
      ) {
        throw new Error("operatorLiveReadinessHandoff.operatorActions is missing fund_or_verify_spot_inventory while inventory operator work remains");
      }
      if (
        checkpointOutstandingOperatorWork.includes("hedgeVenueNotReady") &&
        !hasOperatorAction("fund_or_verify_futures_hedge_venue")
      ) {
        throw new Error("operatorLiveReadinessHandoff.operatorActions is missing fund_or_verify_futures_hedge_venue while hedge venue operator work remains");
      }
      if (
        !currentFocusRecompareBlocksLiveCommands &&
        (
          typeof commandRecord.pm2StartCommandAfterAllGatesPass !== "string" ||
          commandRecord.pm2StartCommandAfterAllGatesPass.length === 0
        )
      ) {
        throw new Error("operatorLiveReadinessHandoff.verificationCommands.pm2StartCommandAfterAllGatesPass is missing while operator work remains");
      }
      if (!currentFocusRecompareBlocksLiveCommands) {
        requirePm2LiveStartCommand(
          commandRecord.pm2StartCommandAfterAllGatesPass,
          "operatorLiveReadinessHandoff.verificationCommands.pm2StartCommandAfterAllGatesPass",
        );
      }
      if (
        currentFocusRecompareBlocksLiveCommands &&
        commandRecord.pm2StartCommandAfterAllGatesPass !== null
      ) {
        throw new Error("operatorLiveReadinessHandoff.verificationCommands.pm2StartCommandAfterAllGatesPass must be null while current focus recompare blocks live startup");
      }
      if (currentFocusRecompareBlocksLiveCommands) {
        requireBlockedLiveCommands(
          operatorLiveReadinessHandoff.blockedCommands,
          "operatorLiveReadinessHandoff.blockedCommands",
        );
      }
      const hardStops = operatorLiveReadinessHandoff.hardStops;
      if (!Array.isArray(hardStops) || !hardStops.every((item) => typeof item === "string")) {
        throw new Error("operatorLiveReadinessHandoff.hardStops must be a string array while operator work remains");
      }
      if (!hardStops.some((item) => /PM2 live command.*liveReady is false/.test(item))) {
        throw new Error("operatorLiveReadinessHandoff.hardStops is missing the PM2 live command liveReady hard stop while operator work remains");
      }
      if (!hardStops.some((item) => /--submit-once.*review command.*live-goal gate pass/.test(item))) {
        throw new Error("operatorLiveReadinessHandoff.hardStops is missing the submit-once review/gate hard stop while operator work remains");
      }
      if (
        currentFocusRecompareBlocksLiveCommands &&
        !hardStops.some((item) =>
          /blocked live review.*manual validation.*PM2 start commands.*recompare clears/.test(item),
        )
      ) {
        throw new Error("operatorLiveReadinessHandoff.hardStops is missing the blocked live/manual validation command recompare hard stop");
      }
    }
  }
  if (checkpointOutstandingOperatorWork.length > 0 && operatorLiveReadinessHandoff === null) {
    throw new Error("operatorLiveReadinessHandoff is missing while checkpointPlan outstanding operator work remains");
  }
  if (
    currentEntryBlockers.length > 0 &&
    !currentEntryBlockers.every((blocker) => checkpointOutstandingMarketConditionWork.includes(blocker))
  ) {
    throw new Error("checkpointPlan.outstandingMarketConditionWork must include current-entry blockers when current entry sanity is blocked");
  }
  if (marketConditionHandoff !== null) {
    const marketHandoffStatus = marketConditionHandoff.status;
    const requiredBeforeLiveReview = marketConditionHandoff.requiredBeforeLiveReview;
    const canStartLiveWithoutMarketConditionWork = marketConditionHandoff.canStartLiveWithoutMarketConditionWork;
    if (
      checkpointOutstandingMarketConditionWork.length > 0 &&
      marketHandoffStatus !== "market_conditions_required"
    ) {
      throw new Error("marketConditionHandoff.status must be market_conditions_required while market condition work remains");
    }
    if (requiredBeforeLiveReview !== undefined) {
      if (!Array.isArray(requiredBeforeLiveReview) || !requiredBeforeLiveReview.every((item) => typeof item === "string")) {
        throw new Error("marketConditionHandoff.requiredBeforeLiveReview must be a string array");
      }
      if (!sameStringSet(requiredBeforeLiveReview, checkpointOutstandingMarketConditionWork)) {
        throw new Error("marketConditionHandoff.requiredBeforeLiveReview disagrees with checkpointPlan outstanding market condition work");
      }
      if (
        currentEntryBlockers.length > 0 &&
        !currentEntryBlockers.every((blocker) => requiredBeforeLiveReview.includes(blocker))
      ) {
        throw new Error("marketConditionHandoff.requiredBeforeLiveReview must include current-entry blockers when current entry sanity is blocked");
      }
    }
    if (currentEntryBlockers.length > 0) {
      if (
        currentEntryBlockers.includes("selectedFocusCurrentEntryCarryBelowLiveThreshold") &&
        marketConditionHandoff.currentEntryCarryGate === undefined
      ) {
        throw new Error("marketConditionHandoff.currentEntryCarryGate is required when current-entry carry is below live threshold");
      }
      if (
        currentEntryCarryGate !== null &&
        marketConditionHandoff.currentEntryCarryGate !== undefined &&
        !sameCurrentEntryCarryGate(marketConditionHandoff.currentEntryCarryGate, currentEntryCarryGate)
      ) {
        throw new Error("marketConditionHandoff.currentEntryCarryGate disagrees with strategyResearchHandoff current-entry carry gate");
      }
      if (marketConditionHandoff.currentEntryStatus === "current_entry_clear") {
        throw new Error("marketConditionHandoff.currentEntryStatus cannot be current_entry_clear while current-entry blockers remain");
      }
      if (
        currentEntrySanityStatus !== null &&
        typeof marketConditionHandoff.currentEntryStatus === "string" &&
        marketConditionHandoff.currentEntryStatus !== currentEntrySanityStatus
      ) {
        throw new Error("marketConditionHandoff.currentEntryStatus disagrees with strategyResearchHandoff current entry sanity");
      }
    }
    if (checkpointOutstandingMarketConditionWork.length > 0 && canStartLiveWithoutMarketConditionWork === true) {
      throw new Error("marketConditionHandoff canStartLiveWithoutMarketConditionWork is true while market condition work remains");
    }
    if (checkpointOutstandingMarketConditionWork.length > 0) {
      const verificationCommands = marketConditionHandoff.verificationCommands;
      if (
        verificationCommands === null ||
        typeof verificationCommands !== "object" ||
        Array.isArray(verificationCommands)
      ) {
        throw new Error("marketConditionHandoff.verificationCommands is missing while market condition work remains");
      }
      const commandRecord = verificationCommands as Record<string, unknown>;
      const currentFocusRecompareBlocksLiveCommands =
        effectiveFailedCompletionCriteria.includes("no_current_focus_recompare_caution");
      if (
        !currentFocusRecompareBlocksLiveCommands &&
        (typeof commandRecord.reviewCommand !== "string" || commandRecord.reviewCommand.length === 0)
      ) {
        throw new Error("marketConditionHandoff.verificationCommands.reviewCommand is missing while market condition work remains");
      }
      if (currentFocusRecompareBlocksLiveCommands && commandRecord.reviewCommand !== null) {
        throw new Error("marketConditionHandoff.verificationCommands.reviewCommand must be null while current focus recompare blocks live startup");
      }
      if (!currentFocusRecompareBlocksLiveCommands) {
        requireSafeReviewCommand(
          commandRecord.reviewCommand,
          "marketConditionHandoff.verificationCommands.reviewCommand",
        );
      }
      if (currentFocusRecompareBlocksLiveCommands) {
        requireBlockedLiveCommands(
          marketConditionHandoff.blockedCommands,
          "marketConditionHandoff.blockedCommands",
        );
      }
      requireSafeVerificationGateCommand(
        commandRecord.gateCommand,
        "marketConditionHandoff.verificationCommands.gateCommand",
      );
      const researchFocusSpreadControl = recordOrNull(marketConditionHandoff.researchFocusSpreadControl);
      if (
        marketConditionHandoff.researchFocusSpreadControl !== undefined &&
        marketConditionHandoff.researchFocusSpreadControl !== null &&
        researchFocusSpreadControl === null
      ) {
        throw new Error("marketConditionHandoff.researchFocusSpreadControl must be an object when present");
      }
      if (researchFocusSpreadControl !== null) {
        const requiredBeforeFocusSwitch = optionalUniqueStringArray(
          researchFocusSpreadControl.requiredBeforeFocusSwitch,
          "marketConditionHandoff.researchFocusSpreadControl.requiredBeforeFocusSwitch",
        );
        if (requiredBeforeFocusSwitch.includes("spreadControl")) {
          const action =
            typeof researchFocusSpreadControl.action === "string" &&
            researchFocusSpreadControl.action.length > 0
              ? researchFocusSpreadControl.action
              : null;
          if (action === null) {
            throw new Error("marketConditionHandoff.researchFocusSpreadControl.action must be a non-empty string");
          }
          const bestChallengerSpreadControl =
            researchFocusSpreadControl.bestChallengerSpreadControl === undefined ||
            researchFocusSpreadControl.bestChallengerSpreadControl === null
              ? null
              : recordOrNull(researchFocusSpreadControl.bestChallengerSpreadControl);
          if (
            researchFocusSpreadControl.bestChallengerSpreadControl !== undefined &&
            researchFocusSpreadControl.bestChallengerSpreadControl !== null &&
            bestChallengerSpreadControl === null
          ) {
            throw new Error("marketConditionHandoff.researchFocusSpreadControl.bestChallengerSpreadControl must be an object when present");
          }
          if (
            bestChallengerSpreadControl === null &&
            action !== "collect_challenger_spread_control_evidence_before_recompare"
          ) {
            throw new Error("marketConditionHandoff.researchFocusSpreadControl.action must collect challenger spread-control evidence when bestChallengerSpreadControl is missing");
          }
          if (
            bestChallengerSpreadControl !== null &&
            action === "keep_research_focus_recompare_blocked_until_challenger_spread_control_clears"
          ) {
            const blockerEvidence = researchFocusSpreadControl.blockerEvidence;
            if (!Array.isArray(blockerEvidence) || blockerEvidence.length === 0) {
              throw new Error("marketConditionHandoff.researchFocusSpreadControl.blockerEvidence must describe challenger spread-control breaches");
            }
          }
        }
      }
      if (checkpointOutstandingMarketConditionWork.includes("wideDisplayedSpread")) {
        const spreadControl = marketConditionHandoff.spreadControl;
        if (spreadControl === null || typeof spreadControl !== "object" || Array.isArray(spreadControl)) {
          throw new Error("marketConditionHandoff.spreadControl is missing while wide spread market condition work remains");
        }
        const spreadControlRecord = spreadControl as Record<string, unknown>;
        if (spreadControlRecord.passed === true) {
          throw new Error("marketConditionHandoff.spreadControl.passed is true while wideDisplayedSpread remains");
        }
	        if (spreadControlRecord.blockerActive === false) {
	          throw new Error("marketConditionHandoff.spreadControl.blockerActive is false while wideDisplayedSpread remains");
	        }
        requireSpreadBlockerEvidence(
          marketConditionHandoff.spreadBlockerEvidence,
          "marketConditionHandoff.spreadBlockerEvidence",
        );
	        if (spreadControlRecord.rawPassed === true) {
          const maxSpreadRejectionRate = spreadControlRecord.maxSpreadRejectionRate;
          const latestWindow = spreadControlRecord.latestWindow;
          const latestWindowRecord =
            latestWindow !== null && typeof latestWindow === "object" && !Array.isArray(latestWindow)
              ? latestWindow as Record<string, unknown>
              : null;
          const latestSpreadRejectedRate = latestWindowRecord?.spreadRejectedRate;
          const liveReadinessSpreadControl = marketConditionHandoff.liveReadinessSpreadControl;
          const liveReadinessSpreadControlRecord =
            liveReadinessSpreadControl !== null &&
            typeof liveReadinessSpreadControl === "object" &&
            !Array.isArray(liveReadinessSpreadControl)
              ? liveReadinessSpreadControl as Record<string, unknown>
              : null;
          const liveReadinessSpreadRejectedRate =
            liveReadinessSpreadControlRecord?.spreadRejectedRate;
          const liveReadinessMaxSpreadRejectionRate =
            liveReadinessSpreadControlRecord?.maxSpreadRejectionRate;
          const latestWindowShowsThresholdBreach =
            typeof maxSpreadRejectionRate === "number" &&
            Number.isFinite(maxSpreadRejectionRate) &&
            typeof latestSpreadRejectedRate === "number" &&
            Number.isFinite(latestSpreadRejectedRate) &&
            latestSpreadRejectedRate > maxSpreadRejectionRate;
          const liveReadinessShowsThresholdBreach =
            liveReadinessSpreadControlRecord?.passed === false &&
            typeof liveReadinessMaxSpreadRejectionRate === "number" &&
            Number.isFinite(liveReadinessMaxSpreadRejectionRate) &&
            typeof liveReadinessSpreadRejectedRate === "number" &&
            Number.isFinite(liveReadinessSpreadRejectedRate) &&
            liveReadinessSpreadRejectedRate > liveReadinessMaxSpreadRejectionRate;
          if (
            !latestWindowShowsThresholdBreach &&
            !liveReadinessShowsThresholdBreach
          ) {
            throw new Error(
              "marketConditionHandoff spread evidence must show a threshold breach while raw current-entry spread control passed but wideDisplayedSpread remains",
            );
          }
        }
        const spreadSensitivity = marketConditionHandoff.spreadSensitivity;
        if (spreadSensitivity !== null && spreadSensitivity !== undefined) {
          if (
            typeof spreadSensitivity !== "object" ||
            Array.isArray(spreadSensitivity)
          ) {
            throw new Error("marketConditionHandoff.spreadSensitivity must be an object when present");
          }
          const spreadSensitivityRecord = spreadSensitivity as Record<string, unknown>;
          const caveat = spreadSensitivityRecord.caveat;
          if (
            typeof caveat !== "string" ||
            !/diagnostic only/i.test(caveat) ||
            !/does not relax live gates/i.test(caveat)
          ) {
            throw new Error("marketConditionHandoff.spreadSensitivity.caveat must state sensitivity is diagnostic only and does not relax live gates");
          }
          if (
            spreadSensitivityRecord.livePermission === true ||
            spreadSensitivityRecord.canStartLive === true ||
            spreadSensitivityRecord.canRelaxLiveGate === true
          ) {
            throw new Error("marketConditionHandoff.spreadSensitivity must not grant live permission or relax live gates");
          }
        }
        const explicitSpreadThresholdExperiments =
          marketConditionHandoff.explicitSpreadThresholdExperiments;
        const spreadSensitivityRequestsExplicitExperiment =
          spreadSensitivity !== null &&
          spreadSensitivity !== undefined &&
          typeof spreadSensitivity === "object" &&
          !Array.isArray(spreadSensitivity) &&
          (spreadSensitivity as Record<string, unknown>).action ===
            "run_explicit_spread_threshold_experiment_before_any_policy_change";
        if (
          spreadSensitivityRequestsExplicitExperiment &&
          (
            !Array.isArray(explicitSpreadThresholdExperiments) ||
            explicitSpreadThresholdExperiments.length === 0
          )
        ) {
          throw new Error("marketConditionHandoff.explicitSpreadThresholdExperiments is required when spread sensitivity asks for an explicit experiment");
        }
        if (
          explicitSpreadThresholdExperiments !== null &&
          explicitSpreadThresholdExperiments !== undefined
        ) {
          if (!Array.isArray(explicitSpreadThresholdExperiments)) {
            throw new Error("marketConditionHandoff.explicitSpreadThresholdExperiments must be an array when present");
          }
          for (const experiment of explicitSpreadThresholdExperiments) {
            if (
              experiment === null ||
              typeof experiment !== "object" ||
              Array.isArray(experiment)
            ) {
              throw new Error("marketConditionHandoff.explicitSpreadThresholdExperiments entries must be objects");
            }
            const experimentRecord = experiment as Record<string, unknown>;
            if (
              typeof experimentRecord.sourcePath !== "string" ||
              experimentRecord.sourcePath.length === 0
            ) {
              throw new Error("marketConditionHandoff.explicitSpreadThresholdExperiments.sourcePath is required");
            }
            if (
              typeof experimentRecord.market !== "string" ||
              experimentRecord.market.length === 0
            ) {
              throw new Error("marketConditionHandoff.explicitSpreadThresholdExperiments.market is required");
            }
            const caveat = experimentRecord.caveat;
            if (
              typeof caveat !== "string" ||
              !/diagnostic only/i.test(caveat) ||
              !/do not relax live gates/i.test(caveat)
            ) {
              throw new Error("marketConditionHandoff.explicitSpreadThresholdExperiments.caveat must keep experiments diagnostic-only");
            }
            if (
              experimentRecord.liveGateImpact !== "none_diagnostic_only" ||
              experimentRecord.livePermission === true ||
              experimentRecord.canStartLive === true ||
              experimentRecord.canRelaxLiveGate === true ||
              experimentRecord.policyDecision === "relax_spread_gate" ||
              experimentRecord.policyDecision === "authorize_live_startup"
            ) {
              throw new Error("marketConditionHandoff.explicitSpreadThresholdExperiments must not grant live permission or relax live gates");
            }
            if (typeof experimentRecord.expectancyImproved !== "boolean") {
              throw new Error("marketConditionHandoff.explicitSpreadThresholdExperiments.expectancyImproved must be boolean");
            }
            if (finiteNumber(experimentRecord.baselineMaxSpotSpreadBps) === null) {
              throw new Error("marketConditionHandoff.explicitSpreadThresholdExperiments.baselineMaxSpotSpreadBps must be a finite number");
            }
            if (finiteNumber(experimentRecord.candidateMaxSpotSpreadBps) === null) {
              throw new Error("marketConditionHandoff.explicitSpreadThresholdExperiments.candidateMaxSpotSpreadBps must be a finite number");
            }
            requireFiniteNumberFields(
              experimentRecord.baselineScenario,
              [
                "maxSpotSpreadBps",
                "executionEligibleRate",
                "spreadRejectedRate",
                "medianWindowNetCarryBps",
                "estimatedNetPnlKrwAcrossFundingWindows",
              ],
              "marketConditionHandoff.explicitSpreadThresholdExperiments.baselineScenario",
            );
            requireFiniteNumberFields(
              experimentRecord.candidateScenario,
              [
                "maxSpotSpreadBps",
                "executionEligibleRate",
                "spreadRejectedRate",
                "medianWindowNetCarryBps",
                "estimatedNetPnlKrwAcrossFundingWindows",
              ],
              "marketConditionHandoff.explicitSpreadThresholdExperiments.candidateScenario",
            );
            requireFiniteNumberFields(
              experimentRecord.deltaCandidateMinusBaseline,
              [
                "executionEligibleRate",
                "spreadRejectedRate",
                "medianWindowNetCarryBps",
                "estimatedNetPnlKrwAcrossFundingWindows",
              ],
              "marketConditionHandoff.explicitSpreadThresholdExperiments.deltaCandidateMinusBaseline",
            );
            if (
              experimentRecord.expectancyImproved === false &&
              experimentRecord.policyDecision !== "do_not_relax_spread_gate_no_expectancy_improvement"
            ) {
              throw new Error("marketConditionHandoff.explicitSpreadThresholdExperiments policyDecision disagrees with expectancyImproved=false");
            }
            if (
              experimentRecord.expectancyImproved === true &&
              experimentRecord.policyDecision !== "do_not_relax_live_gate_without_fill_quality_validation"
            ) {
              throw new Error("marketConditionHandoff.explicitSpreadThresholdExperiments policyDecision disagrees with expectancyImproved=true");
            }
          }
          const selectedMarket = marketConditionHandoff.selectedMarket;
          if (
            spreadSensitivityRequestsExplicitExperiment &&
            typeof selectedMarket === "string" &&
            selectedMarket.length > 0 &&
            !explicitSpreadThresholdExperiments.some((experiment) => {
              const experimentRecord = recordOrNull(experiment);
              return experimentRecord?.market === selectedMarket;
            })
          ) {
            throw new Error("marketConditionHandoff.explicitSpreadThresholdExperiments must include the selected market when spread sensitivity asks for an explicit experiment");
          }
        }
      }
    }
  }
  if (checkpointOutstandingMarketConditionWork.length > 0 && marketConditionHandoff === null) {
    throw new Error("marketConditionHandoff is missing while checkpointPlan outstanding market condition work remains");
  }
  if (decision === "skip_full_refresh_until_next_review" && strategyResearchHandoff === null) {
    throw new Error("strategyResearchHandoff is missing while full live-goal refresh is skipped");
  }
  if (strategyResearchHandoff !== null) {
    if (strategyResearchHandoff.canAuthorizeLiveStartup !== false) {
      throw new Error("strategyResearchHandoff cannot authorize live startup");
    }
    if (typeof strategyResearchHandoff.status !== "string" || strategyResearchHandoff.status.length === 0) {
      throw new Error("strategyResearchHandoff.status is missing");
    }
    if (
      strategyResearchHandoff.status === "research_focus_recompare_required" &&
      !effectiveFailedCompletionCriteria.includes("no_current_focus_recompare_caution")
    ) {
      throw new Error("strategyResearchHandoff requires recompare but completion audit does not fail no_current_focus_recompare_caution");
    }
    if (strategyResearchHandoff.status === "research_focus_recompare_required") {
      const bestChallengerLiveReadiness = strategyResearchHandoff.bestChallengerLiveReadiness;
      if (
        bestChallengerLiveReadiness === null ||
        bestChallengerLiveReadiness === undefined ||
        typeof bestChallengerLiveReadiness !== "object" ||
        Array.isArray(bestChallengerLiveReadiness)
      ) {
        throw new Error("strategyResearchHandoff.bestChallengerLiveReadiness is required while research focus recompare is required");
      }
      const readinessRecord = bestChallengerLiveReadiness as Record<string, unknown>;
      if (typeof readinessRecord.market !== "string" || readinessRecord.market.length === 0) {
        throw new Error("strategyResearchHandoff.bestChallengerLiveReadiness.market is missing");
      }
      if (typeof readinessRecord.liveReady !== "boolean") {
        throw new Error("strategyResearchHandoff.bestChallengerLiveReadiness.liveReady must be boolean");
      }
      if (
        typeof readinessRecord.interpretation !== "string" ||
        !/cannot authorize live startup/.test(readinessRecord.interpretation)
      ) {
        throw new Error("strategyResearchHandoff.bestChallengerLiveReadiness must state it cannot authorize live startup");
      }
      const requiredBeforeChallengerLiveStartup =
        strategyResearchHandoff.requiredBeforeChallengerLiveStartup;
      if (requiredBeforeChallengerLiveStartup !== undefined) {
        if (
          !Array.isArray(requiredBeforeChallengerLiveStartup) ||
          !requiredBeforeChallengerLiveStartup.every((item) => typeof item === "string")
        ) {
          throw new Error("strategyResearchHandoff.requiredBeforeChallengerLiveStartup must be a string array when present");
        }
        const challengerStartupRequirements = requiredBeforeChallengerLiveStartup as string[];
        requireUniqueStringArray(
          challengerStartupRequirements,
          "strategyResearchHandoff.requiredBeforeChallengerLiveStartup",
        );
        const readinessBlockers = optionalUniqueStringArray(
          readinessRecord.blockers,
          "strategyResearchHandoff.bestChallengerLiveReadiness.blockers",
        );
        if (readinessRecord.liveReady === false && readinessBlockers.length === 0) {
          throw new Error("strategyResearchHandoff.bestChallengerLiveReadiness.blockers must explain blocked challenger readiness");
        }
        if (
          readinessRecord.liveReady === false &&
          !challengerStartupRequirements.includes("challengerLiveReadiness")
        ) {
          throw new Error("strategyResearchHandoff.requiredBeforeChallengerLiveStartup must include challengerLiveReadiness while challenger is blocked");
        }
        if (
          !readinessBlockers.every((blocker) => challengerStartupRequirements.includes(blocker))
        ) {
          throw new Error("strategyResearchHandoff.requiredBeforeChallengerLiveStartup must include challenger readiness blockers");
        }
      }
    }
    if (strategyResearchHandoff.requiredBeforeFocusSwitch !== undefined) {
      const requiredBeforeFocusSwitch = optionalUniqueStringArray(
        strategyResearchHandoff.requiredBeforeFocusSwitch,
        "strategyResearchHandoff.requiredBeforeFocusSwitch",
      );
      const autonomousFocusSwitchWork = requiredBeforeFocusSwitch.filter((work) =>
        [
          "latestWindowSampleQuality",
          "latestWindowFundingAlignment",
          "opportunityObservationSample",
          "opportunityObserverCoverage",
        ].includes(work),
      );
      if (
        !autonomousFocusSwitchWork.every((work) =>
          checkpointOutstandingAutonomousEvidence.includes(work),
        )
      ) {
        throw new Error("checkpointPlan.outstandingAutonomousEvidence must include autonomous research-focus recompare work");
      }
      const focusSwitchMissingRequirements = requiredBeforeFocusSwitch.map(
        (work) => `spotPerpCarryResearchFocus:${work}`,
      );
      if (
        effectiveMissingRequirements !== null &&
        !focusSwitchMissingRequirements.every((requirement) =>
          effectiveMissingRequirements.includes(requirement),
        )
      ) {
        throw new Error("missingRequirements must include strategy research-focus recompare work");
      }
      if (missingRequirementClassification !== null) {
        const classificationRecord = stringArrayRecordOrNull(missingRequirementClassification);
        const missingAutonomousClassifications = autonomousFocusSwitchWork
          .map((work) => `spotPerpCarryResearchFocus:${work}`)
          .filter((requirement) => !classificationRecord?.autonomousEvidence?.includes(requirement));
        if (missingAutonomousClassifications.length > 0) {
          throw new Error("missingRequirementClassification.autonomousEvidence must include autonomous research-focus recompare work");
        }
        if (
          requiredBeforeFocusSwitch.includes("spreadControl") &&
          !classificationRecord?.marketConditions?.includes("spotPerpCarryResearchFocus:spreadControl")
        ) {
          throw new Error("missingRequirementClassification.marketConditions must include spread-control research-focus recompare work");
        }
      }
      if (
        requiredBeforeFocusSwitch.includes("spreadControl") &&
        !checkpointOutstandingMarketConditionWork.some((work) =>
          ["spreadControl", "wideDisplayedSpread"].includes(work),
        )
      ) {
        throw new Error("checkpointPlan.outstandingMarketConditionWork must include spread-control research-focus recompare work");
      }
    }
    const verificationCommands = strategyResearchHandoff.verificationCommands;
    if (
      verificationCommands !== undefined &&
      (
        verificationCommands === null ||
        typeof verificationCommands !== "object" ||
        Array.isArray(verificationCommands)
      )
    ) {
      throw new Error("strategyResearchHandoff.verificationCommands must be an object when present");
    }
    const strategyVerificationCommandRecord =
      verificationCommands !== undefined
        ? verificationCommands as Record<string, unknown>
        : null;
    if (strategyVerificationCommandRecord !== null) {
      requireSafeOptionalReviewCommand(
        strategyVerificationCommandRecord.reviewCommand,
        "strategyResearchHandoff.verificationCommands.reviewCommand",
      );
      requireSafeOptionalVerificationGateCommand(
        strategyVerificationCommandRecord.gateCommand,
        "strategyResearchHandoff.verificationCommands.gateCommand",
      );
      requireSafeOptionalDryRunScriptCommand(
        strategyVerificationCommandRecord.refreshGoalStatusCommand,
        "strategyResearchHandoff.verificationCommands.refreshGoalStatusCommand",
        "refresh-live-goal-status",
      );
      requireSafeOptionalDryRunScriptCommand(
        strategyVerificationCommandRecord.observeOpportunityCommand,
        "strategyResearchHandoff.verificationCommands.observeOpportunityCommand",
        "observe-spot-perp-carry-opportunity-72h",
      );
      requireSafeOptionalDryRunScriptCommand(
        strategyVerificationCommandRecord.refreshOpportunityFeeStressCommand,
        "strategyResearchHandoff.verificationCommands.refreshOpportunityFeeStressCommand",
        "refresh-spot-perp-carry-opportunity-fee-stress",
      );
    }
    if (
      strategyResearchHandoff.status === "research_focus_recompare_required" &&
      strategyVerificationCommandRecord !== null
    ) {
      if (strategyVerificationCommandRecord.reviewCommand !== null) {
        throw new Error("strategyResearchHandoff.verificationCommands.reviewCommand must be null while research focus recompare is required");
      }
      requireSafeVerificationGateCommand(
        strategyVerificationCommandRecord.gateCommand,
        "strategyResearchHandoff.verificationCommands.gateCommand",
      );
      const blockedCommands = strategyResearchHandoff.blockedCommands;
      requireBlockedLiveCommands(
        blockedCommands,
        "strategyResearchHandoff.blockedCommands",
      );
    }
    const emergingCleanOpportunities = strategyResearchHandoff.emergingCleanOpportunities;
    if (emergingCleanOpportunities !== undefined) {
      if (
        emergingCleanOpportunities === null ||
        typeof emergingCleanOpportunities !== "object" ||
        Array.isArray(emergingCleanOpportunities)
      ) {
        throw new Error("strategyResearchHandoff.emergingCleanOpportunities must be an object when present");
      }
      const emergingRecord = emergingCleanOpportunities as Record<string, unknown>;
      const candidateCount = emergingRecord.candidateCount;
      const candidates = emergingRecord.candidates;
      if (typeof candidateCount !== "number" || !Number.isFinite(candidateCount) || candidateCount < 0) {
        throw new Error("strategyResearchHandoff.emergingCleanOpportunities.candidateCount is invalid");
      }
      if (!Array.isArray(candidates)) {
        throw new Error("strategyResearchHandoff.emergingCleanOpportunities.candidates must be an array");
      }
      if (candidateCount < candidates.length) {
        throw new Error("strategyResearchHandoff.emergingCleanOpportunities.candidateCount is below the emitted candidate list length");
      }
      const requiredBeforePromotion = emergingRecord.requiredBeforePromotion;
      const requiredPromotionGates = [
        "six_completed_fee_stressed_funding_windows",
        "live_readiness_audit",
        "operational_proof",
        "fee_schedule_confirmation",
        "inventory_and_hedge_venue_readiness",
      ];
      if (
        !Array.isArray(requiredBeforePromotion) ||
        !requiredPromotionGates.every((gate) => requiredBeforePromotion.includes(gate))
      ) {
        throw new Error("strategyResearchHandoff.emergingCleanOpportunities.requiredBeforePromotion is missing live promotion gates");
      }
      const livePromotionCaveat = emergingRecord.livePromotionCaveat;
      if (
        typeof livePromotionCaveat !== "string" ||
        !livePromotionCaveat.includes("cannot authorize live startup")
      ) {
        throw new Error("strategyResearchHandoff.emergingCleanOpportunities.livePromotionCaveat must state it cannot authorize live startup");
      }
      for (const candidate of candidates) {
        if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
          throw new Error("strategyResearchHandoff.emergingCleanOpportunities.candidates must contain objects");
        }
        const candidateRecord = candidate as Record<string, unknown>;
        if (candidateRecord.evidenceAction !== "continue_spread_clean_opportunity_observation") {
          throw new Error("strategyResearchHandoff.emergingCleanOpportunities candidates must remain observation-only");
        }
        const completedFundingWindowCount = candidateRecord.completedFundingWindowCount;
        const remainingFundingWindowCount = candidateRecord.remainingFundingWindowCount;
        if (
          typeof completedFundingWindowCount !== "number" ||
          !Number.isFinite(completedFundingWindowCount) ||
          completedFundingWindowCount < 0 ||
          typeof remainingFundingWindowCount !== "number" ||
          !Number.isFinite(remainingFundingWindowCount) ||
          remainingFundingWindowCount <= 0
        ) {
          throw new Error("strategyResearchHandoff.emergingCleanOpportunities candidates must still lack required funding-window evidence");
        }
      }
    }
  }
  const report = {
    generatedAt: new Date(nowMs).toISOString(),
    summaryPath: args.summaryPath,
    summaryGeneratedAt: summary.generatedAt ?? null,
    summaryAgeMinutes,
    maxSummaryAgeMinutes: args.maxSummaryAgeMinutes,
    sourceEvidenceFreshness: {
      liveGoalStatusPath: summary.source?.liveGoalStatusPath ?? null,
      liveGoalGeneratedAt: summary.source?.liveGoalGeneratedAt ?? null,
      liveGoalAgeMinutes: sourceLiveGoalAgeMinutes,
      processAlignmentPath: summary.source?.processAlignmentPath ?? null,
      processAlignmentGeneratedAt: summary.source?.processAlignmentGeneratedAt ?? null,
      processAlignmentAgeMinutes: sourceProcessAlignmentAgeMinutes,
      researchSourcePath: recordOrNull(summary.researchSourceFreshness)?.sourcePath ?? null,
      researchSourceGeneratedAt:
        typeof researchSourceGeneratedAt === "string" ? researchSourceGeneratedAt : null,
      researchSourceAgeMinutes: sourceResearchReportAgeMinutes,
      currentEntrySourcePath: currentEntrySanityView?.preferredSourcePath ?? null,
      currentEntryEvidenceTimestamp:
        typeof currentEntryEvidenceTimestamp === "string" ? currentEntryEvidenceTimestamp : null,
      currentEntryEvidenceAgeMinutes: sourceCurrentEntryAgeMinutes,
      liveReadinessGeneratedAt:
        typeof operationalReadinessGeneratedAt === "string" ? operationalReadinessGeneratedAt : null,
      liveReadinessAgeMinutes: sourceLiveReadinessAgeMinutes,
      operationalProofGeneratedAt:
        typeof operationalProofGeneratedAt === "string" ? operationalProofGeneratedAt : null,
      operationalProofAgeMinutes: sourceOperationalProofAgeMinutes,
    },
    sourceEvidenceAlignment,
	    sourceEvidenceStaleness,
	    achieved: summary.achieved === true,
	    live: {
	      reportStatus:
	        typeof liveSummary?.reportStatus === "string" ? liveSummary.reportStatus : null,
	      liveReady: typeof summaryLiveReady === "boolean" ? summaryLiveReady : null,
	      liveStartupAllowed:
	        typeof summaryLiveStartupAllowed === "boolean" ? summaryLiveStartupAllowed : null,
	      selectedLiveCandidatePresent:
	        liveSummary !== null &&
	        liveSummary.selectedLiveCandidate !== undefined &&
	        liveSummary.selectedLiveCandidate !== null,
	    },
	    failedCompletionCriteria: effectiveFailedCompletionCriteria,
    sourceCompletionAuditSummary: summary.sourceCompletionAuditSummary ?? null,
    completionAuditScopeComparison: summary.completionAuditScopeComparison ?? null,
    missingRequirements: effectiveMissingRequirements,
    missingRequirementCount: effectiveMissingRequirements?.length ?? null,
    missingRequirementClassification,
    missingRequirementClassificationCounts,
    outstandingWorkCounts,
    decision,
    exitCode,
    checkpointStatus: checkpointPlan.status ?? null,
    checkpointShouldStartLive: checkpointPlan.shouldStartLive ?? null,
    checkpointShouldRunHeavyRefreshNow: checkpointPlan.shouldRunHeavyRefreshNow,
    nextReviewDueByTime,
    sourceEvidenceRefreshDue,
    refreshTrigger,
    refreshDue: shouldRunRefreshNow,
    shouldRunHeavyRefreshNow,
    nextReviewAt: checkpointPlan.nextReviewAt ?? null,
    nextReviewAtKst: checkpointPlan.nextReviewAtKst ?? null,
    nextReviewDelayMinutes: computedNextReviewDelayMinutes,
    checkpointNextReviewDelayMinutes: checkpointPlan.nextReviewDelayMinutes ?? null,
    computedNextReviewDelayMinutes,
    nextReviewOverdue: computedNextReviewOverdue,
    checkpointNextReviewOverdue: checkpointPlan.nextReviewOverdue ?? null,
    computedNextReviewOverdue,
    nextCompletedFundingWindowAt: checkpointPlan.nextCompletedFundingWindowAt ?? null,
    recompareSampleBufferRequired: checkpointPlan.recompareSampleBufferRequired ?? null,
    recompareSampleBufferMinutes: checkpointPlan.recompareSampleBufferMinutes ?? null,
    nextReviewTrigger: checkpointPlan.nextReviewTrigger ?? null,
    recommendedAutonomousAction: checkpointPlan.recommendedAutonomousAction ?? null,
    reviewCommand: checkpointPlan.reviewCommand ?? null,
    outstandingAutonomousEvidence: checkpointOutstandingAutonomousEvidence,
	    outstandingOperatorWork: checkpointOutstandingOperatorWork,
	    outstandingMarketConditionWork: checkpointOutstandingMarketConditionWork,
	    targetedMarketConditionMonitoring: checkpointPlan.targetedMarketConditionMonitoring ?? null,
	    autonomousEvidenceSufficiency: checkpointPlan.autonomousEvidenceSufficiency ?? null,
	    reducedActivityGuardrail: summary.strategyDecisionView?.reducedActivityGuardrail ?? null,
	    currentFocusLiveStartupCaution,
	    processAlignment: processAlignmentSummary,
    strategyResearchHandoff,
    currentEntrySanity,
    autonomousEvidenceHandoff,
    operatorLiveReadinessHandoff,
    marketConditionHandoff,
    reason: checkpointPlan.reason ?? null,
  };
  const reportJson = `${JSON.stringify(report, null, 2)}\n`;

  if (args.outputPath !== null) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, reportJson, "utf8");
  }
  if (!args.quiet) process.stdout.write(reportJson);
  process.exitCode = exitCode;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
