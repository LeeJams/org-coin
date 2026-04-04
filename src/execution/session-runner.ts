import type {
  PaperSessionCancelEvent,
  PaperSessionEvent,
  PaperSessionScenario,
  PaperSessionScenarioMetadata,
  PaperSessionSignalEvent,
  PaperSessionSnapshotEvent,
} from "../contracts/paper-session.js";
import {
  createOrderManagerFromRuntimeConfig,
  type ExecutionRuntimeConfig,
} from "../runtime/config.js";
import type {
  ExecutionMode,
  PaperSessionArtifactPaths,
  OrderManager,
  OrderManagerDecision,
  OrderRecord,
  PortfolioState,
  ReconciliationReport,
  RejectLedgerSummary,
} from "./types.js";
import type { CreateOrderManagerOptions } from "./order-manager.js";
import { buildRejectLedgerSummary } from "./ledger.js";

export type SessionRunnerMode = Exclude<ExecutionMode, "live">;

export interface PaperSessionSnapshotOutcome {
  type: "snapshot";
  market: string;
  asOf: string;
}

export interface PaperSessionSignalOutcome {
  type: "signal";
  market?: string;
  signalId?: string;
  decision: OrderManagerDecision;
}

export interface PaperSessionCancelOutcome {
  type: "cancel";
  orderId: string;
  order: OrderRecord | null;
}

export type PaperSessionOutcome =
  | PaperSessionSnapshotOutcome
  | PaperSessionSignalOutcome
  | PaperSessionCancelOutcome;

export interface PaperSessionReport {
  schemaVersion: "1.0.0";
  sessionId?: string;
  scenarioPath?: string;
  generatedAt: string;
  mode: SessionRunnerMode;
  processedEvents: number;
  outcomes: PaperSessionOutcome[];
  latestSnapshots: Record<string, PaperSessionSnapshotEvent["snapshot"]>;
  scenarioMetadata?: PaperSessionScenarioMetadata;
  suppressionSummary: Record<string, number>;
  portfolio: PortfolioState;
  ledger: ReturnType<OrderManager["getLedgerSnapshot"]>;
  rejectLedger: RejectLedgerSummary;
  reconciliation: ReconciliationReport;
  artifacts?: PaperSessionArtifactPaths;
}

function cloneSnapshot(snapshot: PaperSessionSnapshotEvent["snapshot"]) {
  return { ...snapshot };
}

function extractSignalMetadata(
  signal: unknown,
): { market?: string; signalId?: string } {
  if (typeof signal !== "object" || signal === null || Array.isArray(signal)) {
    return {};
  }

  const record = signal as Record<string, unknown>;
  return {
    market: typeof record.market === "string" ? record.market : undefined,
    signalId: typeof record.signalId === "string" ? record.signalId : undefined,
  };
}

function cloneScenarioMetadata(
  metadata: PaperSessionScenarioMetadata | undefined,
): PaperSessionScenarioMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  return {
    ...metadata,
    summary: metadata.summary
      ? {
          ...metadata.summary,
          marketsTraded: [...metadata.summary.marketsTraded],
          suppressedByReason: { ...metadata.summary.suppressedByReason },
        }
      : undefined,
  };
}

function extractSuppressionSummary(
  metadata: PaperSessionScenarioMetadata | undefined,
): Record<string, number> {
  return metadata?.summary ? { ...metadata.summary.suppressedByReason } : {};
}

export class PaperSessionRunner {
  private readonly latestSnapshots = new Map<string, PaperSessionSnapshotEvent["snapshot"]>();
  private readonly outcomes: PaperSessionOutcome[] = [];

  constructor(
    private readonly mode: SessionRunnerMode,
    private readonly manager: OrderManager,
  ) {}

  recordSnapshot(event: PaperSessionSnapshotEvent): PaperSessionSnapshotOutcome {
    this.latestSnapshots.set(event.snapshot.market, cloneSnapshot(event.snapshot));
    const outcome: PaperSessionSnapshotOutcome = {
      type: "snapshot",
      market: event.snapshot.market,
      asOf: event.snapshot.asOf,
    };

    this.outcomes.push(outcome);
    return outcome;
  }

  async submitSignal(event: PaperSessionSignalEvent): Promise<PaperSessionSignalOutcome> {
    const { market, signalId } = extractSignalMetadata(event.signal);
    const decision = await this.manager.submitSignal(event.signal, {
      marketSnapshot: market ? this.latestSnapshots.get(market) : undefined,
      receivedAt: event.receivedAt ?? event.signal.generatedAt,
    });
    const outcome: PaperSessionSignalOutcome = {
      type: "signal",
      market,
      signalId,
      decision,
    };

    this.outcomes.push(outcome);
    return outcome;
  }

  async cancelOrder(event: PaperSessionCancelEvent): Promise<PaperSessionCancelOutcome> {
    const order = await this.manager.cancelOrder(
      event.orderId,
      event.reason,
      event.cancelledAt,
    );
    const outcome: PaperSessionCancelOutcome = {
      type: "cancel",
      orderId: event.orderId,
      order,
    };

    this.outcomes.push(outcome);
    return outcome;
  }

  async run(
    events: Iterable<PaperSessionEvent>,
    reconcileAt?: string,
    scenarioMetadata?: PaperSessionScenarioMetadata,
  ): Promise<PaperSessionReport> {
    for (const event of events) {
      switch (event.type) {
        case "snapshot":
          this.recordSnapshot(event);
          break;
        case "signal":
          await this.submitSignal(event);
          break;
        case "cancel":
          await this.cancelOrder(event);
          break;
      }
    }

    return this.finalize(reconcileAt, scenarioMetadata);
  }

  async runScenario(scenario: PaperSessionScenario): Promise<PaperSessionReport> {
    return this.run(scenario.events, scenario.reconcileAt, scenario.metadata);
  }

  finalize(
    reconcileAt?: string,
    scenarioMetadata?: PaperSessionScenarioMetadata,
  ): PaperSessionReport {
    const ledger = this.manager.getLedgerSnapshot();
    const reconciliation = this.manager.reconcileSession(reconcileAt);

    return {
      schemaVersion: "1.0.0",
      generatedAt: reconciliation.generatedAt,
      mode: this.mode,
      processedEvents: this.outcomes.length,
      outcomes: this.outcomes.map((outcome) => {
        if (outcome.type === "snapshot") {
          return { ...outcome };
        }

        if (outcome.type === "cancel") {
          return {
            ...outcome,
            order: outcome.order ? { ...outcome.order } : null,
          };
        }

        return {
          ...outcome,
          decision: outcome.decision.accepted
            ? {
                ...outcome.decision,
                order: { ...outcome.decision.order },
                fills: outcome.decision.fills.map((fill) => ({ ...fill })),
                warnings: [...outcome.decision.warnings],
              }
            : {
                ...outcome.decision,
                reasons: outcome.decision.reasons.map((reason) => ({ ...reason })),
              },
        };
      }),
      latestSnapshots: Object.fromEntries(
        [...this.latestSnapshots.entries()].map(([market, snapshot]) => [
          market,
          cloneSnapshot(snapshot),
        ]),
      ),
      scenarioMetadata: cloneScenarioMetadata(scenarioMetadata),
      suppressionSummary: extractSuppressionSummary(scenarioMetadata),
      portfolio: this.manager.getPortfolioState(),
      ledger,
      rejectLedger: buildRejectLedgerSummary(ledger.decisions),
      reconciliation,
    };
  }
}

export function createPaperSessionRunner(
  config: ExecutionRuntimeConfig,
  options: Omit<CreateOrderManagerOptions, "policy"> = {},
): PaperSessionRunner {
  return new PaperSessionRunner(
    config.tradingMode,
    createOrderManagerFromRuntimeConfig(config, options),
  );
}
