import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validatePaperSessionScenario } from "../contracts/paper-session.js";
import {
  loadExecutionRuntimeConfig,
  type LoadExecutionRuntimeConfigOptions,
} from "../runtime/config.js";
import { persistPaperSessionReport } from "./paper-session-artifacts.js";
import {
  createPaperSessionRunner,
  type PaperSessionReport,
} from "./session-runner.js";

export class InvalidPaperSessionScenarioError extends Error {
  constructor(readonly issues: unknown) {
    super("invalid_paper_session_scenario");
    this.name = "InvalidPaperSessionScenarioError";
  }
}

export interface ExecutePaperSessionScenarioOptions {
  scenarioPath: string;
  cwd?: string;
  runtimeConfig?: LoadExecutionRuntimeConfigOptions;
}

export async function executePaperSessionScenario(
  options: ExecutePaperSessionScenarioOptions,
): Promise<PaperSessionReport> {
  const cwd = options.cwd ?? process.cwd();
  const resolvedScenarioPath = resolve(cwd, options.scenarioPath);
  const raw = await readFile(resolvedScenarioPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const validation = validatePaperSessionScenario(parsed);

  if (!validation.ok) {
    throw new InvalidPaperSessionScenarioError(validation.issues);
  }

  const runtimeConfig = loadExecutionRuntimeConfig({
    cwd,
    ...(options.runtimeConfig ?? {}),
  });
  const runner = createPaperSessionRunner(runtimeConfig, {
    clock: validation.value.clockAt
      ? () => new Date(validation.value.clockAt!)
      : undefined,
    portfolio: validation.value.initialPortfolio,
  });
  const report = await runner.runScenario(validation.value);

  return persistPaperSessionReport({
    report,
    baseDir: runtimeConfig.paperSessionArtifactsDir,
    scenarioPath: resolvedScenarioPath,
  });
}
