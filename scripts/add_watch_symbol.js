const fs = require("fs");
const https = require("https");
const path = require("path");
const { URL } = require("url");

const ROOT_DIR = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT_DIR, "config", "watchlist.github.json");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().replace(/^sh/i, "").replace(/^sz/i, "").toUpperCase();
}

function sanitizeString(value) {
  return String(value || "").trim();
}

function looksLikeNumber(value) {
  if (value === undefined || value === null || value === "") {
    return false;
  }
  return Number.isFinite(Number(value));
}

function marketPrefix(symbol) {
  return /^[56]/.test(symbol) ? "sh" : "sz";
}

function httpRequestBuffer(url, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = https.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        method: options.method || "GET",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: options.accept || "*/*",
          Referer: options.referer || "https://finance.sina.com.cn/",
          ...options.headers,
        },
        timeout: options.timeoutMs || 8000,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const statusCode = response.statusCode || 0;
          if (statusCode >= 400) {
            reject(new Error(`HTTP ${statusCode}`));
            return;
          }
          resolve(Buffer.concat(chunks));
        });
      }
    );

    request.on("timeout", () => request.destroy(new Error("Request timeout")));
    request.on("error", reject);
    request.end();
  });
}

function decodeBuffer(buffer) {
  try {
    return new TextDecoder("gbk").decode(buffer);
  } catch (error) {
    return buffer.toString("utf8");
  }
}

function parseSinaName(text) {
  const match = String(text || "").match(/^var hq_str_(sh|sz)\d{6}="([^,"]+)/m);
  return sanitizeString(match?.[2]);
}

function parseTencentName(text) {
  const match = String(text || "").match(/^v_(sh|sz)\d{6}="[^~]*~([^~]+)/m);
  return sanitizeString(match?.[2]);
}

async function fetchSymbolName(symbol) {
  const fullSymbol = `${marketPrefix(symbol)}${symbol}`;

  try {
    const sinaBuffer = await httpRequestBuffer(
      `https://hq.sinajs.cn/list=${encodeURIComponent(fullSymbol)}`,
      { referer: "https://finance.sina.com.cn/" }
    );
    const sinaName = parseSinaName(decodeBuffer(sinaBuffer));
    if (sinaName) {
      return sinaName;
    }
  } catch (error) {
    // continue to Tencent
  }

  const tencentBuffer = await httpRequestBuffer(
    `https://qt.gtimg.cn/q=${encodeURIComponent(fullSymbol)}`,
    { referer: "https://gu.qq.com/" }
  );
  return parseTencentName(decodeBuffer(tencentBuffer));
}

function usage() {
  console.log("用法:");
  console.log("  node scripts/add_watch_symbol.js 512480");
  console.log('  node scripts/add_watch_symbol.js 512480 "半导体ETF"');
  console.log('  node scripts/add_watch_symbol.js 512480 "半导体ETF" 4 "核心仓"');
  console.log('  node scripts/add_watch_symbol.js 512480 4 "核心仓"');
}

function parseArgs(argv) {
  const [rawSymbol, secondArg, thirdArg, ...restArgs] = argv;
  let rawName;
  let rawThreshold;
  let rawNotes = "";

  if (secondArg !== undefined) {
    if (looksLikeNumber(secondArg)) {
      rawThreshold = secondArg;
      rawNotes = [thirdArg, ...restArgs].filter((item) => item !== undefined).join(" ");
    } else {
      rawName = secondArg;
      if (thirdArg !== undefined && looksLikeNumber(thirdArg)) {
        rawThreshold = thirdArg;
        rawNotes = restArgs.join(" ");
      } else {
        rawNotes = [thirdArg, ...restArgs].filter((item) => item !== undefined).join(" ");
      }
    }
  }

  return {
    rawSymbol,
    rawName,
    rawThreshold,
    rawNotes: rawNotes || undefined,
  };
}

async function main() {
  const { rawSymbol, rawName, rawThreshold, rawNotes } = parseArgs(process.argv.slice(2));
  if (!rawSymbol) {
    usage();
    process.exitCode = 1;
    return;
  }

  const symbol = normalizeSymbol(rawSymbol);
  if (!/^\d{6}$/.test(symbol)) {
    console.error("symbol 必须是 6 位代码。");
    process.exitCode = 1;
    return;
  }

  const thresholdPct = rawThreshold !== undefined && rawThreshold !== "" ? Number(rawThreshold) : undefined;

  if (thresholdPct !== undefined && !Number.isFinite(thresholdPct)) {
    console.error("thresholdPct 必须是数字。");
    process.exitCode = 1;
    return;
  }

  const config = readJson(CONFIG_PATH, { watchlist: [] });
  if (!Array.isArray(config.watchlist)) {
    config.watchlist = [];
  }

  const existing = config.watchlist.find((item) => normalizeSymbol(item.symbol) === symbol);
  let fetchedName = "";

  if (!rawName) {
    try {
      fetchedName = await fetchSymbolName(symbol);
    } catch (error) {
      fetchedName = "";
      console.warn(`[warn] 自动获取名称失败，将使用现有名称或代码: ${error.message}`);
    }
  }

  const finalName = sanitizeString(rawName) || sanitizeString(existing?.name) || fetchedName || symbol;

  if (existing) {
    existing.name = finalName;
    existing.enabled = true;
    if (thresholdPct !== undefined) {
      existing.thresholdPct = thresholdPct;
    }
    if (rawNotes !== undefined) {
      existing.notes = rawNotes;
    }
    writeJson(CONFIG_PATH, config);
    console.log(`已更新 ${symbol} ${finalName}`);
    return;
  }

  const item = {
    symbol,
    name: finalName,
    enabled: true,
  };
  if (thresholdPct !== undefined) {
    item.thresholdPct = thresholdPct;
  }
  if (rawNotes !== undefined) {
    item.notes = rawNotes;
  }
  config.watchlist.push(item);
  writeJson(CONFIG_PATH, config);
  console.log(`已添加 ${symbol} ${finalName}`);
}

main().catch((error) => {
  console.error(`[fatal] ${error.stack || error.message}`);
  process.exitCode = 1;
});
