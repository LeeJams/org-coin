import { rejectReason, type RejectReason } from "./reject-reason.js";

export type KillSwitchTrigger =
  | "manual"
  | "stale_market_data"
  | "reject_streak"
  | "reconciliation_mismatch"
  | "system_fault";

export interface KillSwitchEvent {
  active: boolean;
  trigger: KillSwitchTrigger;
  reason: string;
  detail?: Record<string, unknown>;
  occurredAt: string;
  actor?: string;
}

export class KillSwitch {
  private active = false;
  private history: KillSwitchEvent[] = [];

  constructor(private readonly clock: () => Date = () => new Date()) {}

  isActive(): boolean {
    return this.active;
  }

  trip(
    trigger: KillSwitchTrigger,
    reason: string,
    detail?: Record<string, unknown>,
  ): KillSwitchEvent {
    const event: KillSwitchEvent = {
      active: true,
      trigger,
      reason,
      detail,
      occurredAt: this.clock().toISOString(),
    };

    this.active = true;
    this.history.push(event);
    return event;
  }

  reset(actor: string, reason: string): KillSwitchEvent {
    const event: KillSwitchEvent = {
      active: false,
      trigger: "manual",
      reason,
      actor,
      occurredAt: this.clock().toISOString(),
    };

    this.active = false;
    this.history.push(event);
    return event;
  }

  guard(): RejectReason | undefined {
    if (!this.active) {
      return undefined;
    }

    const activeEvent = [...this.history].reverse().find((event) => event.active);
    return rejectReason(
      "kill_switch_active",
      "kill switch is active and new orders are blocked",
      activeEvent
        ? {
            trigger: activeEvent.trigger,
            reason: activeEvent.reason,
            occurredAt: activeEvent.occurredAt,
          }
        : undefined,
    );
  }

  getHistory(): KillSwitchEvent[] {
    return [...this.history];
  }
}
