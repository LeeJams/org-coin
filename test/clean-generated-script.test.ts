import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = join(repoRoot, "scripts", "clean-generated.mjs");

test("clean-generated removes build output and logs but preserves paper sessions by default", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-clean-generated-"));

  try {
    mkdirSync(join(directory, "dist"), { recursive: true });
    mkdirSync(join(directory, "var/log/pm2"), { recursive: true });
    mkdirSync(join(directory, "var/log/dry-run-service"), { recursive: true });
    mkdirSync(join(directory, "var/paper-sessions/date=2026-04-04/session=session-1"), { recursive: true });

    writeFileSync(join(directory, "dist/build.txt"), "compiled", "utf8");
    writeFileSync(join(directory, "var/log/pm2/dry-run-manager.out.log"), "stdout", "utf8");
    writeFileSync(join(directory, "var/log/dry-run-service/cycles.ndjson"), "{\"ok\":true}\n", "utf8");
    writeFileSync(
      join(directory, "var/paper-sessions/date=2026-04-04/session=session-1/report.json"),
      "{\"session\":\"kept\"}\n",
      "utf8",
    );

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: directory,
      encoding: "utf8",
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Removing TypeScript build output: dist/);
    assert.equal(existsSync(join(directory, "dist")), false);
    assert.deepEqual(readdirSync(join(directory, "var/log/pm2")), []);
    assert.deepEqual(readdirSync(join(directory, "var/log/dry-run-service")), []);
    assert.equal(
      readFileSync(join(directory, "var/paper-sessions/date=2026-04-04/session=session-1/report.json"), "utf8"),
      "{\"session\":\"kept\"}\n",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("clean-generated removes paper-session artifacts when explicitly requested", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-clean-generated-"));

  try {
    mkdirSync(join(directory, "var/paper-sessions/date=2026-04-04/session=session-1"), { recursive: true });
    writeFileSync(
      join(directory, "var/paper-sessions/date=2026-04-04/session=session-1/report.json"),
      "{\"session\":\"removed\"}\n",
      "utf8",
    );

    const result = spawnSync(process.execPath, [scriptPath, "--paper-sessions"], {
      cwd: directory,
      encoding: "utf8",
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Removing paper-session artifacts: var\/paper-sessions/);
    assert.deepEqual(readdirSync(join(directory, "var/paper-sessions")), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
