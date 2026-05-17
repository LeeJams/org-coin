export interface LiveGoalCompletionCriterion {
  id?: unknown;
  passed?: unknown;
}

export interface LiveGoalCompletionAudit {
  achieved?: unknown;
  failedCompletionCriteria?: unknown;
  missingRequirements?: unknown;
  missingRequirementCount?: unknown;
  criteria?: unknown;
}

export const REQUIRED_LIVE_GOAL_COMPLETION_CRITERIA_IDS = [
  "candidate_selected_from_current_evidence",
  "profitability_evidence_satisfied",
  "known_losing_paths_rejected",
  "current_entry_sanity_clear",
  "no_current_focus_recompare_caution",
  "live_startup_gate_allowed",
] as const;

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function auditFailureSummary(audit: LiveGoalCompletionAudit): string {
  const failedCriteria = Array.isArray(audit.failedCompletionCriteria)
    ? audit.failedCompletionCriteria.join(", ") || "none"
    : "unavailable";
  const missingRequirementCount =
    typeof audit.missingRequirementCount === "number" &&
    Number.isFinite(audit.missingRequirementCount) &&
    Number.isInteger(audit.missingRequirementCount)
      ? String(audit.missingRequirementCount)
      : "unavailable";
  const missingRequirements = Array.isArray(audit.missingRequirements)
    ? audit.missingRequirements.slice(0, 8).join(", ") || "none"
    : "unavailable";
  const truncated =
    Array.isArray(audit.missingRequirements) && audit.missingRequirements.length > 8
      ? `, ... +${audit.missingRequirements.length - 8} more`
      : "";
  return `failedCriteria=${failedCriteria}; missingRequirementCount=${missingRequirementCount}; missingRequirements=${missingRequirements}${truncated}`;
}

export function assertLiveGoalCompletionAuditAllowsStartup(
  audit: LiveGoalCompletionAudit | undefined,
  context: string,
): void {
  if (audit === undefined) {
    throw new Error(`live goal completion audit is required for ${context}`);
  }
  if (!Array.isArray(audit.failedCompletionCriteria)) {
    throw new Error(`live goal completion audit failedCompletionCriteria is required for ${context}`);
  }
  if (!audit.failedCompletionCriteria.every((criterion) => typeof criterion === "string")) {
    throw new Error(`live goal completion audit failedCompletionCriteria must be string ids for ${context}`);
  }
  if (!Array.isArray(audit.missingRequirements)) {
    throw new Error(`live goal completion audit missingRequirements is required for ${context}`);
  }
  if (!audit.missingRequirements.every((requirement) => typeof requirement === "string")) {
    throw new Error(`live goal completion audit missingRequirements must be string ids for ${context}`);
  }
  const missingRequirementCount = audit.missingRequirementCount;
  if (
    typeof missingRequirementCount !== "number" ||
    !Number.isFinite(missingRequirementCount) ||
    !Number.isInteger(missingRequirementCount) ||
    missingRequirementCount < 0
  ) {
    throw new Error("live goal completion audit missingRequirementCount must be a non-negative integer");
  }
  if (missingRequirementCount !== audit.missingRequirements.length) {
    throw new Error(
      `live goal completion audit missingRequirementCount must match missingRequirements for ${context}: expected ${audit.missingRequirements.length}`,
    );
  }
  if (!Array.isArray(audit.criteria)) {
    throw new Error(`live goal completion audit criteria is required for ${context}`);
  }

  const criterionIds: string[] = [];
  const failedCriterionIds: string[] = [];
  for (const criterion of audit.criteria as LiveGoalCompletionCriterion[]) {
    if (
      criterion === null ||
      typeof criterion !== "object" ||
      typeof criterion.id !== "string" ||
      criterion.id.trim().length === 0 ||
      typeof criterion.passed !== "boolean"
    ) {
      throw new Error(`live goal completion audit criteria must include id and passed for ${context}`);
    }
    criterionIds.push(criterion.id);
    if (criterion.passed !== true) failedCriterionIds.push(criterion.id);
  }
  if (new Set(criterionIds).size !== criterionIds.length) {
    throw new Error(`live goal completion audit criteria ids must be unique for ${context}`);
  }
  const missingRequiredCriterionIds = REQUIRED_LIVE_GOAL_COMPLETION_CRITERIA_IDS.filter(
    (id) => !criterionIds.includes(id),
  );
  if (missingRequiredCriterionIds.length > 0) {
    throw new Error(
      `live goal completion audit criteria is missing required ids for ${context}: ${missingRequiredCriterionIds.join(", ")}`,
    );
  }
  if (!sameStringSet(audit.failedCompletionCriteria, failedCriterionIds)) {
    throw new Error(
      `live goal completion audit failedCompletionCriteria must match failed criteria ids for ${context}: expected ${failedCriterionIds.join(", ") || "none"}`,
    );
  }
  if (audit.achieved !== true || audit.failedCompletionCriteria.length > 0) {
    throw new Error(
      `live goal completion audit is not achieved for ${context}: ${auditFailureSummary(audit)}`,
    );
  }
  if (audit.missingRequirements.length > 0) {
    throw new Error(
      `live goal completion audit still has missing requirements for ${context}: ${audit.missingRequirements.join(", ")}`,
    );
  }
  if (missingRequirementCount > 0) {
    throw new Error(
      `live goal completion audit still has ${missingRequirementCount} missing requirements for ${context}`,
    );
  }
}
