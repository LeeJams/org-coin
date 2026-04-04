import { spawnSync } from "node:child_process";

function run(command, args, allowFailure = false) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0 && !allowFailure) {
    process.exit(result.status ?? 1);
  }
}

run("pm2", ["delete", "dry-run-manager"], true);
run("pm2", ["start", "ecosystem.config.cjs", "--only", "dry-run-manager"]);
