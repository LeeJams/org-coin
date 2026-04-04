import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = join(repoRoot, "scripts", "init-env.mjs");

test("init-env creates .env from the checked-in template when missing", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-init-env-"));

  try {
    writeFileSync(join(directory, ".env.example"), "TRADING_MODE=paper\n", "utf8");

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: directory,
      encoding: "utf8",
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Created .*\.env from .*\.env\.example/);
    assert.equal(readFileSync(join(directory, ".env"), "utf8"), "TRADING_MODE=paper\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("init-env preserves an existing .env file", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-init-env-"));

  try {
    writeFileSync(join(directory, ".env.example"), "TRADING_MODE=paper\n", "utf8");
    writeFileSync(join(directory, ".env"), "TRADING_MODE=dry_run\n", "utf8");

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: directory,
      encoding: "utf8",
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Using existing .*\.env/);
    assert.equal(readFileSync(join(directory, ".env"), "utf8"), "TRADING_MODE=dry_run\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
