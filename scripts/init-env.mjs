import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = process.cwd();
const templatePath = resolve(rootDir, ".env.example");
const envPath = resolve(rootDir, ".env");

if (!existsSync(templatePath)) {
  console.error(`Missing .env template: ${templatePath}`);
  process.exit(1);
}

if (existsSync(envPath)) {
  console.log(`Using existing ${envPath}`);
  process.exit(0);
}

copyFileSync(templatePath, envPath);
console.log(`Created ${envPath} from ${templatePath}`);
