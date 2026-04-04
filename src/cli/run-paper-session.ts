import { pathToFileURL } from "node:url";

import {
  executePaperSessionScenario,
  InvalidPaperSessionScenarioError,
} from "../execution/run-paper-session.js";

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

  try {
    const persistedReport = await executePaperSessionScenario({ scenarioPath });
    process.stdout.write(`${JSON.stringify(persistedReport, null, 2)}\n`);
    return persistedReport.reconciliation.ok ? 0 : 2;
  } catch (error: unknown) {
    if (error instanceof InvalidPaperSessionScenarioError) {
      console.error(
        JSON.stringify(
          {
            error: "invalid_paper_session_scenario",
            issues: error.issues,
          },
          null,
          2,
        ),
      );
      return 1;
    }

    throw error;
  }
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
