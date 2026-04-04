import { mkdirSync } from "node:fs";

mkdirSync("var/log/pm2", { recursive: true });
mkdirSync("var/log/dry-run-service", { recursive: true });
