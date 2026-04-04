import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";

const args = new Set(process.argv.slice(2));

if (args.has("--help")) {
  console.log(`Usage: node scripts/clean-generated.mjs [--paper-sessions] [--dry-run]

Safely removes generated local artifacts:
- dist/
- var/log/pm2/
- var/log/dry-run-service/

Optional:
- --paper-sessions  also removes generated var/paper-sessions/ output
- --dry-run         prints the cleanup plan without deleting files
`);
  process.exit(0);
}

const dryRun = args.has("--dry-run");

const targets = [
  {
    path: "dist",
    label: "TypeScript build output",
    recreate: false,
  },
  {
    path: "var/log/pm2",
    label: "PM2 logs",
    recreate: true,
  },
  {
    path: "var/log/dry-run-service",
    label: "dry-run service logs",
    recreate: true,
  },
];

if (args.has("--paper-sessions")) {
  targets.push({
    path: "var/paper-sessions",
    label: "paper-session artifacts",
    recreate: true,
  });
}

const actions = targets.filter((target) => existsSync(target.path));

if (actions.length === 0) {
  console.log("No generated artifacts found.");
  process.exit(0);
}

for (const action of actions) {
  console.log(`${dryRun ? "Would remove" : "Removing"} ${action.label}: ${action.path}`);

  if (dryRun) {
    continue;
  }

  rmSync(action.path, { recursive: true, force: true });

  if (action.recreate) {
    mkdirSync(action.path, { recursive: true });
  }
}

if (dryRun) {
  process.exit(0);
}

for (const directory of ["var/log/pm2", "var/log/dry-run-service", "var/paper-sessions"]) {
  if (!existsSync(directory)) {
    continue;
  }

  if (readdirSync(directory).length === 0) {
    console.log(`Prepared empty runtime directory: ${directory}`);
  }
}
