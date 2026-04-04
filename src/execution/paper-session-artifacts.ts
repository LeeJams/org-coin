import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildOrderLedgerEvents } from "./ledger.js";
import type { PaperSessionReport } from "./session-runner.js";

export interface PersistPaperSessionReportOptions {
  report: PaperSessionReport;
  baseDir: string;
  sessionId?: string;
  scenarioPath?: string;
}

function buildSessionId(
  report: PaperSessionReport,
  sessionId: string | undefined,
): string {
  if (sessionId && sessionId.trim().length > 0) {
    return sessionId.trim();
  }

  const stamp = report.generatedAt
    .replace(/[-:]/gu, "")
    .replace(/\.\d{3}Z$/u, "Z")
    .replace("T", "-");
  return `paper-${stamp}-${randomUUID().slice(0, 8)}`;
}

function renderMarkdown(report: PaperSessionReport): string {
  const suppressionEntries = Object.entries(report.suppressionSummary);
  const totalSuppressed = suppressionEntries.reduce(
    (sum, [, count]) => sum + count,
    0,
  );
  const lines = [
    "# Paper Session Report",
    "",
    `- Session: \`${report.sessionId ?? "pending"}\``,
    `- Generated At: \`${report.generatedAt}\``,
    `- Mode: \`${report.mode}\``,
    `- Scenario: \`${report.scenarioPath ?? "inline"}\``,
    `- Processed Events: ${report.processedEvents}`,
    `- Reconciliation: ${report.reconciliation.ok ? "pass" : "fail"}`,
    `- Reject Decisions: ${report.rejectLedger.totalRejectedDecisions}`,
    `- Suppressed Candidates: ${totalSuppressed}`,
    "",
    "## Reconciliation",
    "",
  ];

  if (report.reconciliation.reasons.length === 0) {
    lines.push("- No reconciliation mismatches detected.");
  } else {
    for (const reason of report.reconciliation.reasons) {
      lines.push(`- \`${reason.code}\`: ${reason.message}`);
    }
  }

  lines.push("", "## Reject Ledger By Market", "");

  const markets = Object.entries(report.rejectLedger.byMarket);
  if (markets.length === 0) {
    lines.push("- No rejected decisions were recorded.");
  } else {
    for (const [market, summary] of markets) {
      const reasons = Object.entries(summary.reasons)
        .map(([code, count]) => `${code}:${count}`)
        .join(", ");
      lines.push(`- \`${market}\`: ${summary.total} rejects${reasons ? ` (${reasons})` : ""}`);
    }
  }

  lines.push("", "## Scenario Suppressions", "");

  if (suppressionEntries.length === 0) {
    lines.push("- No suppressions were recorded in scenario metadata.");
  } else {
    for (const [reason, count] of suppressionEntries) {
      lines.push(`- \`${reason}\`: ${count}`);
    }
  }

  lines.push("", "## Artifacts", "");

  if (report.artifacts) {
    lines.push(`- Report JSON: \`${report.artifacts.reportPath}\``);
    lines.push(`- Report Markdown: \`${report.artifacts.reportMarkdownPath}\``);
    lines.push(`- Ledger NDJSON: \`${report.artifacts.ledgerPath}\``);
    lines.push(`- Reject Ledger JSON: \`${report.artifacts.rejectLedgerPath}\``);
  } else {
    lines.push("- Artifact paths were not attached to the report.");
  }

  lines.push("");
  return lines.join("\n");
}

export async function persistPaperSessionReport(
  options: PersistPaperSessionReportOptions,
): Promise<PaperSessionReport> {
  const sessionId = buildSessionId(options.report, options.sessionId);
  const datePartition = options.report.generatedAt.slice(0, 10);
  const sessionDir = resolve(
    options.baseDir,
    `date=${datePartition}`,
    `session=${sessionId}`,
  );
  const reportPath = resolve(sessionDir, "report.json");
  const reportMarkdownPath = resolve(sessionDir, "report.md");
  const ledgerPath = resolve(sessionDir, "ledger.ndjson");
  const rejectLedgerPath = resolve(sessionDir, "reject-ledger.json");

  const persistedReport: PaperSessionReport = {
    ...options.report,
    sessionId,
    scenarioPath: options.scenarioPath ?? options.report.scenarioPath,
    artifacts: {
      sessionDir,
      reportPath,
      reportMarkdownPath,
      ledgerPath,
      rejectLedgerPath,
    },
  };

  const ledgerEvents = buildOrderLedgerEvents(persistedReport.ledger);
  const ledgerBody = ledgerEvents.map((event) => JSON.stringify(event)).join("\n");

  await mkdir(sessionDir, { recursive: true });
  await Promise.all([
    writeFile(reportPath, `${JSON.stringify(persistedReport, null, 2)}\n`, "utf8"),
    writeFile(
      reportMarkdownPath,
      renderMarkdown(persistedReport),
      "utf8",
    ),
    writeFile(
      rejectLedgerPath,
      `${JSON.stringify(persistedReport.rejectLedger, null, 2)}\n`,
      "utf8",
    ),
    writeFile(ledgerPath, ledgerBody ? `${ledgerBody}\n` : "", "utf8"),
  ]);

  return persistedReport;
}
