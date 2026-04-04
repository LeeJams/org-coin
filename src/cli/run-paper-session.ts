import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { validatePaperSessionScenario } from "../contracts/paper-session.js";
import { createPaperSessionRunner } from "../execution/session-runner.js";
import { loadExecutionRuntimeConfig } from "../runtime/config.js";

export async function runPaperSessionCli(
  argv: string[] = process.argv.slice(2),
): Promise<number> {
  const [scenarioPath] = argv;

  if (!scenarioPath) {
    console.error(
      "Usage: node dist/src/cli/run-paper-session.js <scenario.json>",
    );
    return 1;
  }

  const resolvedScenarioPath = resolve(process.cwd(), scenarioPath);
  const raw = await readFile(resolvedScenarioPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const validation = validatePaperSessionScenario(parsed);

  if (!validation.ok) {
    console.error(
      JSON.stringify(
        {
          error: "invalid_paper_session_scenario",
          issues: validation.issues,
        },
        null,
        2,
      ),
    );
    return 1;
  }

  const runtimeConfig = loadExecutionRuntimeConfig();
  const runner = createPaperSessionRunner(runtimeConfig, {
    clock: validation.value.clockAt
      ? () => new Date(validation.value.clockAt!)
      : undefined,
    portfolio: validation.value.initialPortfolio,
  });
  const report = await runner.runScenario(validation.value);

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.reconciliation.ok ? 0 : 2;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  runPaperSessionCli().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(
        JSON.stringify(
          {
            error: "paper_session_runner_failed",
            message: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
    },
  );
}
