import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface Args {
  markets: string[] | null;
  topMarkets: number;
  outputPath: string | null;
  inputTickersPath: string | null;
  inputOrderbooksPath: string | null;
  notionalKrw: number;
  maxSpreadBps: number;
  minTurnover24hKrw: number;
  liveAllowedMarkets: Set<string>;
}

interface MarketSummary {
  market: string;
  koreanName: string | null;
  englishName: string | null;
  accTradePrice24h: number;
}

interface OrderbookUnit {
  ask_price?: number | string;
  bid_price?: number | string;
  ask_size?: number | string;
  bid_size?: number | string;
}

interface MarketExecutionRow {
  market: string;
  koreanName: string | null;
  englishName: string | null;
  accTradePrice24h: number;
  bestAsk: number;
  bestBid: number;
  midPrice: number;
  spreadBps: number;
  buyDepth: DepthSummary;
  sellDepth: DepthSummary;
  executionCandidate: boolean;
  liveInfrastructureReady: boolean;
  reasons: string[];
}

interface DepthSummary {
  levels: number;
  notionalKrw: number;
  coversRequestedNotional: boolean;
  averagePrice: number | null;
  worstPrice: number | null;
  impactBps: number | null;
}

const REST_BASE_URL = "https://api.bithumb.com/v1";

function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    markets: null,
    topMarkets: 50,
    outputPath: null,
    inputTickersPath: null,
    inputOrderbooksPath: null,
    notionalKrw: 500_000,
    maxSpreadBps: 20,
    minTurnover24hKrw: 30_000_000_000,
    liveAllowedMarkets: new Set(["KRW-BTC"]),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];

    if (arg === "--markets") {
      if (!value) throw new Error("--markets requires a comma-separated value");
      args.markets = value
        .split(",")
        .map((market) => market.trim())
        .filter((market) => market.length > 0);
      if (args.markets.length === 0) {
        throw new Error("--markets requires at least one market");
      }
      index += 1;
      continue;
    }

    if (arg === "--top-markets") {
      if (!value) throw new Error("--top-markets requires a value");
      args.topMarkets = positiveInteger(value, "--top-markets");
      index += 1;
      continue;
    }

    if (arg === "--output") {
      if (!value) throw new Error("--output requires a value");
      args.outputPath = resolve(cwd, value);
      index += 1;
      continue;
    }

    if (arg === "--input-tickers") {
      if (!value) throw new Error("--input-tickers requires a value");
      args.inputTickersPath = resolve(cwd, value);
      index += 1;
      continue;
    }

    if (arg === "--input-orderbooks") {
      if (!value) throw new Error("--input-orderbooks requires a value");
      args.inputOrderbooksPath = resolve(cwd, value);
      index += 1;
      continue;
    }

    if (arg === "--notional-krw") {
      if (!value) throw new Error("--notional-krw requires a value");
      args.notionalKrw = positiveNumber(value, "--notional-krw");
      index += 1;
      continue;
    }

    if (arg === "--max-spread-bps") {
      if (!value) throw new Error("--max-spread-bps requires a value");
      args.maxSpreadBps = positiveNumber(value, "--max-spread-bps");
      index += 1;
      continue;
    }

    if (arg === "--min-turnover-24h-krw") {
      if (!value) throw new Error("--min-turnover-24h-krw requires a value");
      args.minTurnover24hKrw = positiveNumber(value, "--min-turnover-24h-krw");
      index += 1;
      continue;
    }

    if (arg === "--live-allowed-markets") {
      if (!value) throw new Error("--live-allowed-markets requires a value");
      const markets = value
        .split(",")
        .map((market) => market.trim())
        .filter((market) => market.length > 0);
      if (markets.length === 0) {
        throw new Error("--live-allowed-markets requires at least one market");
      }
      args.liveAllowedMarkets = new Set(markets);
      index += 1;
      continue;
    }

    throw new Error(`unsupported argument: ${arg}`);
  }

  if ((args.inputTickersPath === null) !== (args.inputOrderbooksPath === null)) {
    throw new Error("--input-tickers and --input-orderbooks must be provided together");
  }

  return args;
}

function positiveNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
  return parsed;
}

function positiveInteger(value: string, label: string): number {
  const parsed = positiveNumber(value, label);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer`);
  }
  return parsed;
}

function finiteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function readJsonArray(path: string): Promise<Array<Record<string, unknown>>> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`${path} must contain a JSON array`);
  }
  return parsed as Array<Record<string, unknown>>;
}

async function fetchMarketCatalog(): Promise<MarketSummary[]> {
  const response = await fetch(`${REST_BASE_URL}/market/all?isDetails=false`);
  if (!response.ok) {
    throw new Error(`bithumb market list request failed (${response.status})`);
  }
  const payload = (await response.json()) as Array<Record<string, unknown>>;
  return payload
    .map((record) => ({
      market: String(record.market ?? ""),
      koreanName: stringOrNull(record.korean_name),
      englishName: stringOrNull(record.english_name),
      accTradePrice24h: 0,
    }))
    .filter((market) => market.market.startsWith("KRW-"));
}

async function fetchTickers(markets: string[]): Promise<Array<Record<string, unknown>>> {
  const result: Array<Record<string, unknown>> = [];
  for (let index = 0; index < markets.length; index += 100) {
    const chunk = markets.slice(index, index + 100);
    const url = new URL(`${REST_BASE_URL}/ticker`);
    url.searchParams.set("markets", chunk.join(","));
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`bithumb ticker request failed (${response.status})`);
    }
    result.push(...((await response.json()) as Array<Record<string, unknown>>));
    await sleep(80);
  }
  return result;
}

async function fetchOrderbooks(markets: string[]): Promise<Array<Record<string, unknown>>> {
  const result: Array<Record<string, unknown>> = [];
  for (let index = 0; index < markets.length; index += 100) {
    const chunk = markets.slice(index, index + 100);
    const url = new URL(`${REST_BASE_URL}/orderbook`);
    url.searchParams.set("markets", chunk.join(","));
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`bithumb orderbook request failed (${response.status})`);
    }
    result.push(...((await response.json()) as Array<Record<string, unknown>>));
    await sleep(80);
  }
  return result;
}

async function loadUniverseInputs(args: Args): Promise<{
  markets: MarketSummary[];
  tickers: Array<Record<string, unknown>>;
  orderbooks: Array<Record<string, unknown>>;
}> {
  if (args.inputTickersPath && args.inputOrderbooksPath) {
    const [tickers, orderbooks] = await Promise.all([
      readJsonArray(args.inputTickersPath),
      readJsonArray(args.inputOrderbooksPath),
    ]);
    const marketNames = new Set<string>();
    for (const record of [...tickers, ...orderbooks]) {
      const market = stringOrNull(record.market);
      if (market?.startsWith("KRW-")) {
        marketNames.add(market);
      }
    }
    return {
      markets: [...marketNames].sort().map((market) => ({
        market,
        koreanName: null,
        englishName: null,
        accTradePrice24h: 0,
      })),
      tickers,
      orderbooks,
    };
  }

  const catalog = await fetchMarketCatalog();
  const selectedMarketNames = args.markets ?? catalog.map((market) => market.market);
  const tickers = await fetchTickers(selectedMarketNames);
  const tickerTurnover = new Map<string, number>();
  for (const ticker of tickers) {
    const market = stringOrNull(ticker.market);
    if (market) {
      tickerTurnover.set(market, finiteNumber(ticker.acc_trade_price_24h));
    }
  }
  const markets = catalog
    .filter((market) => selectedMarketNames.includes(market.market))
    .map((market) => ({
      ...market,
      accTradePrice24h: tickerTurnover.get(market.market) ?? 0,
    }))
    .filter((market) => market.accTradePrice24h > 0)
    .sort((left, right) => right.accTradePrice24h - left.accTradePrice24h)
    .slice(0, args.markets ? undefined : args.topMarkets);
  const orderbooks = await fetchOrderbooks(markets.map((market) => market.market));
  return { markets, tickers, orderbooks };
}

function depthSummary(
  units: OrderbookUnit[],
  side: "ask" | "bid",
  notionalKrw: number,
  referencePrice: number,
): DepthSummary {
  let cumulativeNotional = 0;
  let cumulativeSize = 0;
  let levels = 0;
  let worstPrice: number | null = null;

  for (const unit of units) {
    const price = side === "ask" ? finiteNumber(unit.ask_price) : finiteNumber(unit.bid_price);
    const size = side === "ask" ? finiteNumber(unit.ask_size) : finiteNumber(unit.bid_size);
    if (price <= 0 || size <= 0) {
      continue;
    }
    const remaining = notionalKrw - cumulativeNotional;
    const levelNotional = price * size;
    const usedNotional = Math.min(remaining, levelNotional);
    cumulativeNotional += usedNotional;
    cumulativeSize += usedNotional / price;
    levels += 1;
    worstPrice = price;
    if (cumulativeNotional >= notionalKrw) {
      break;
    }
  }

  const averagePrice = cumulativeSize > 0 ? cumulativeNotional / cumulativeSize : null;
  const signedImpact =
    averagePrice !== null && referencePrice > 0
      ? side === "ask"
        ? bps(averagePrice, referencePrice)
        : bps(referencePrice, averagePrice)
      : null;

  return {
    levels,
    notionalKrw: round(cumulativeNotional),
    coversRequestedNotional: cumulativeNotional >= notionalKrw,
    averagePrice: averagePrice === null ? null : round(averagePrice),
    worstPrice: worstPrice === null ? null : round(worstPrice),
    impactBps: signedImpact === null ? null : round(signedImpact),
  };
}

function buildRows(
  markets: MarketSummary[],
  tickers: Array<Record<string, unknown>>,
  orderbooks: Array<Record<string, unknown>>,
  args: Args,
): MarketExecutionRow[] {
  const tickerByMarket = new Map<string, Record<string, unknown>>();
  for (const ticker of tickers) {
    const market = stringOrNull(ticker.market);
    if (market) {
      tickerByMarket.set(market, ticker);
    }
  }
  const orderbookByMarket = new Map<string, Record<string, unknown>>();
  for (const orderbook of orderbooks) {
    const market = stringOrNull(orderbook.market);
    if (market) {
      orderbookByMarket.set(market, orderbook);
    }
  }

  const rows: MarketExecutionRow[] = [];
  for (const market of markets) {
    const ticker = tickerByMarket.get(market.market);
    const orderbook = orderbookByMarket.get(market.market);
    const units = Array.isArray(orderbook?.orderbook_units)
      ? (orderbook.orderbook_units as OrderbookUnit[])
      : [];
    const best = units[0];
    const bestAsk = finiteNumber(best?.ask_price);
    const bestBid = finiteNumber(best?.bid_price);
    if (!ticker || !orderbook || bestAsk <= 0 || bestBid <= 0 || bestAsk <= bestBid) {
      continue;
    }

    const turnover = finiteNumber(ticker.acc_trade_price_24h) || market.accTradePrice24h;
    const midPrice = (bestAsk + bestBid) / 2;
    const spreadBps = bps(bestAsk, bestBid);
    const buyDepth = depthSummary(units, "ask", args.notionalKrw, bestAsk);
    const sellDepth = depthSummary(units, "bid", args.notionalKrw, bestBid);
    const reasons: string[] = [];
    if (spreadBps > args.maxSpreadBps) reasons.push("spread_above_threshold");
    if (turnover < args.minTurnover24hKrw) reasons.push("turnover_below_threshold");
    if (!buyDepth.coversRequestedNotional) reasons.push("insufficient_buy_depth");
    if (!sellDepth.coversRequestedNotional) reasons.push("insufficient_sell_depth");

    rows.push({
      market: market.market,
      koreanName: market.koreanName,
      englishName: market.englishName,
      accTradePrice24h: round(turnover),
      bestAsk: round(bestAsk),
      bestBid: round(bestBid),
      midPrice: round(midPrice),
      spreadBps: round(spreadBps),
      buyDepth,
      sellDepth,
      executionCandidate: reasons.length === 0,
      liveInfrastructureReady: args.liveAllowedMarkets.has(market.market),
      reasons,
    });
  }

  return rows.sort((left, right) => {
    if (left.executionCandidate !== right.executionCandidate) {
      return left.executionCandidate ? -1 : 1;
    }
    if (left.spreadBps !== right.spreadBps) {
      return left.spreadBps - right.spreadBps;
    }
    return right.accTradePrice24h - left.accTradePrice24h;
  });
}

function bps(current: number, previous: number): number {
  return previous > 0 ? (current / previous - 1) * 10_000 : 0;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  const { markets, tickers, orderbooks } = await loadUniverseInputs(args);
  const rows = buildRows(markets, tickers, orderbooks, args);
  const executionCandidates = rows.filter((row) => row.executionCandidate);
  const liveCompatibleExecutionCandidates = executionCandidates.filter(
    (row) => row.liveInfrastructureReady,
  );
  const report = {
    generatedAt: new Date().toISOString(),
    note:
      "Current public Bithumb execution-universe screen. This ranks markets by observed spread, depth, and turnover only; it does not claim profitability or replace strategy validation.",
    thresholds: {
      notionalKrw: args.notionalKrw,
      maxSpreadBps: args.maxSpreadBps,
      minTurnover24hKrw: args.minTurnover24hKrw,
      liveAllowedMarkets: [...args.liveAllowedMarkets].sort(),
    },
    source: {
      mode: args.inputTickersPath ? "input_files" : "public_bithumb_rest",
      requestedMarkets: args.markets,
      topMarkets: args.markets ? null : args.topMarkets,
      observedMarketCount: rows.length,
    },
    summary: {
      executionCandidateCount: executionCandidates.length,
      liveCompatibleExecutionCandidateCount: liveCompatibleExecutionCandidates.length,
      nonLiveExecutionCandidateCount:
        executionCandidates.length - liveCompatibleExecutionCandidates.length,
      bestExecutionCandidates: executionCandidates.slice(0, 10).map((row) => row.market),
      liveCompatibleExecutionCandidates: liveCompatibleExecutionCandidates.map(
        (row) => row.market,
      ),
    },
    markets: rows,
  };

  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.outputPath) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, output, "utf8");
  }
  process.stdout.write(output);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
