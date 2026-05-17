import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("binance derivatives regime report blocks overheated long-only spot entries", () => {
  const directory = mkdtempSync(join(tmpdir(), "org-coin-binance-derivatives-"));
  try {
    const inputPath = join(directory, "input.json");
    const outputPath = join(directory, "output.json");
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      inputPath,
      JSON.stringify({
        symbols: {
          BTCUSDT: {
            fundingRate: [
              { symbol: "BTCUSDT", fundingRate: "0.0001", fundingTime: 1_000 },
              { symbol: "BTCUSDT", fundingRate: "0.00015", fundingTime: 2_000 },
            ],
            openInterestHist: [
              { symbol: "BTCUSDT", sumOpenInterestValue: "1000000", timestamp: 1_000 },
              { symbol: "BTCUSDT", sumOpenInterestValue: "1100000", timestamp: 2_000 },
            ],
            globalLongShortAccountRatio: [
              { symbol: "BTCUSDT", longShortRatio: "1.1", timestamp: 2_000 },
            ],
            takerLongShortRatio: [
              { buySellRatio: "1.2", buyVol: "120", sellVol: "100", timestamp: 2_000 },
            ],
          },
          ETHUSDT: {
            fundingRate: [
              { symbol: "ETHUSDT", fundingRate: "0.0005", fundingTime: 2_000 },
            ],
            openInterestHist: [
              { symbol: "ETHUSDT", sumOpenInterestValue: "1000000", timestamp: 1_000 },
              { symbol: "ETHUSDT", sumOpenInterestValue: "900000", timestamp: 2_000 },
            ],
            globalLongShortAccountRatio: [
              { symbol: "ETHUSDT", longShortRatio: "1.8", timestamp: 2_000 },
            ],
            takerLongShortRatio: [
              { buySellRatio: "0.8", buyVol: "80", sellVol: "100", timestamp: 2_000 },
            ],
          },
        },
      }),
      "utf8",
    );

    const output = execFileSync(
      process.execPath,
      [
        "dist/src/cli/analyze-binance-derivatives-regime.js",
        "--symbols",
        "BTCUSDT,ETHUSDT",
        "--input",
        inputPath,
        "--output",
        outputPath,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(readFileSync(outputPath, "utf8"), output);

    const report = JSON.parse(output) as {
      source: string;
      favorableSymbolCount: number;
      blockedSymbolCount: number;
      symbols: Array<{
        symbol: string;
        favorableForLongSpotFilter: boolean;
        latest: {
          fundingBps: number;
          openInterestChangePct: number;
          globalLongShortRatio: number;
          takerBuySellRatio: number;
        };
        checks: Record<string, boolean>;
      }>;
    };

    assert.equal(report.source, "input_snapshot");
    assert.equal(report.favorableSymbolCount, 1);
    assert.equal(report.blockedSymbolCount, 1);
    const btc = report.symbols.find((symbol) => symbol.symbol === "BTCUSDT");
    const eth = report.symbols.find((symbol) => symbol.symbol === "ETHUSDT");
    assert.equal(btc?.favorableForLongSpotFilter, true);
    assert.equal(btc?.latest.fundingBps, 1.5);
    assert.equal(btc?.latest.openInterestChangePct, 10);
    assert.equal(eth?.favorableForLongSpotFilter, false);
    assert.equal(eth?.checks.fundingNotOverheatedForLong, false);
    assert.equal(eth?.checks.crowdingNotOverheatedForLong, false);
    assert.equal(eth?.checks.takerFlowSupportsLong, false);
    assert.equal(eth?.checks.openInterestExpanding, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
