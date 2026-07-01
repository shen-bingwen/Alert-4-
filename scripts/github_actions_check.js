const fs = require("fs");
const https = require("https");
const path = require("path");
const { URL } = require("url");

const ROOT_DIR = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT_DIR, "config", "watchlist.github.json");
const STATE_PATH = path.join(ROOT_DIR, "data", "github_action_state.json");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

function nowIso() {
  return new Date().toISOString();
}

function getRunContext() {
  const eventName = sanitizeString(process.env.GITHUB_EVENT_NAME) || "unknown";
  const sha = sanitizeString(process.env.GITHUB_SHA) || "unknown";
  const ref = sanitizeString(process.env.GITHUB_REF) || "unknown";
  return { eventName, sha, ref };
}

function sanitizeString(value) {
  return String(value || "").trim();
}

function normalizeSymbol(symbol) {
  return sanitizeString(symbol).replace(/^sh/i, "").replace(/^sz/i, "").toUpperCase();
}

function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

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

function getShanghaiParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const map = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }
  return {
    weekday: map.weekday,
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function isTradingTime() {
  const parts = getShanghaiParts();
  if (parts.weekday === "Sat" || parts.weekday === "Sun") {
    return false;
  }
  const minutes = parts.hour * 60 + parts.minute;
  const morning = minutes >= 9 * 60 + 30 && minutes <= 11 * 60 + 30;
  const afternoon = minutes >= 13 * 60 && minutes <= 15 * 60;
  return morning || afternoon;
}

function defaultConfig() {
  return {
    appName: "4%定投提醒工具",
    schedule: {
      enabled: true,
      onlyTradingHours: true,
    },
    rules: {
      triggerDropPct: 4,
      progressiveDropPct: 4,
      oncePerDay: true,
    },
    watchlist: [],
    runtime: {
      quoteTimeoutMs: 15000,
      maxHistory: 80,
    },
  };
}

function normalizeTarget(target) {
  return {
    symbol: normalizeSymbol(target.symbol),
    name: sanitizeString(target.name),
    enabled: target.enabled !== false,
    thresholdPct: toNumber(target.thresholdPct, null),
    notes: sanitizeString(target.notes),
  };
}

function loadConfig() {
  const base = defaultConfig();
  const raw = readJson(CONFIG_PATH, base);
  const watchlist = Array.isArray(raw.watchlist) ? raw.watchlist : [];
  return {
    appName: sanitizeString(raw.appName) || base.appName,
    schedule: {
      enabled: raw.schedule?.enabled !== false,
      onlyTradingHours: raw.schedule?.onlyTradingHours !== false,
    },
    rules: {
      triggerDropPct: Math.max(0.1, toNumber(raw.rules?.triggerDropPct, 4)),
      progressiveDropPct: Math.max(
        0.1,
        toNumber(raw.rules?.progressiveDropPct, toNumber(raw.rules?.triggerDropPct, 4))
      ),
      oncePerDay: raw.rules?.oncePerDay !== false,
    },
    watchlist: watchlist.map(normalizeTarget).filter((item) => /^\d{6}$/.test(item.symbol)),
    runtime: {
      quoteTimeoutMs: Math.max(5000, toNumber(raw.runtime?.quoteTimeoutMs, 15000)),
      maxHistory: Math.max(20, toNumber(raw.runtime?.maxHistory, 80)),
    },
  };
}

function defaultState() {
  return {
    version: 3,
    updatedAt: nowIso(),
    lastRunSummary: null,
    alerts: [],
    latestQuotes: {},
    anchors: {},
  };
}

function normalizeAnchors(rawAnchors) {
  const anchors = rawAnchors && typeof rawAnchors === "object" ? rawAnchors : {};
  const result = {};
  for (const [symbol, value] of Object.entries(anchors)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    const initialBasePrice = toNumber(value.initialBasePrice, toNumber(value.basePrevClose, null));
    result[symbol] = {
      lastAlertPrice: toNumber(value.lastAlertPrice, null),
      lastAlertAt: sanitizeString(value.lastAlertAt),
      initialBasePrice,
      nextTriggerPrice: toNumber(value.nextTriggerPrice, null),
      progressiveDropPct: toNumber(value.progressiveDropPct, null),
      triggerCount: Math.max(0, Math.trunc(toNumber(value.triggerCount, 0) || 0)),
    };
  }
  return result;
}

function loadState() {
  const raw = readJson(STATE_PATH, defaultState());
  return {
    version: 3,
    updatedAt: sanitizeString(raw.updatedAt) || nowIso(),
    lastRunSummary: raw.lastRunSummary && typeof raw.lastRunSummary === "object" ? raw.lastRunSummary : null,
    alerts: Array.isArray(raw.alerts) ? raw.alerts : [],
    latestQuotes: raw.latestQuotes && typeof raw.latestQuotes === "object" ? raw.latestQuotes : {},
    anchors: normalizeAnchors(raw.anchors),
  };
}

function pruneState(state, config) {
  state.alerts = state.alerts.slice(0, config.runtime.maxHistory);
  return state;
}

function saveState(state) {
  state.updatedAt = nowIso();
  writeJson(STATE_PATH, state);
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
          "Content-Type": options.contentType || "application/json; charset=utf-8",
          ...options.headers,
        },
        timeout: options.timeoutMs || 15000,
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
    if (options.body) {
      request.write(options.body);
    }
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

function parseSinaRows(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const quotes = {};

  for (const line of lines) {
    const match = line.match(/^var hq_str_(sh|sz)(\d{6})="(.*)";?$/);
    if (!match) {
      continue;
    }
    const symbol = match[2];
    const parts = match[3].split(",");
    if (parts.length < 4) {
      continue;
    }
    const name = sanitizeString(parts[0]);
    const prevClose = toNumber(parts[2], null);
    const currentPrice = toNumber(parts[3], null);
    const open = toNumber(parts[1], null);
    if (!name || !Number.isFinite(prevClose) || !Number.isFinite(currentPrice) || prevClose <= 0) {
      continue;
    }
    const rawChangePct = Number((((currentPrice - prevClose) / prevClose) * 100).toFixed(4));
    const dropPct = rawChangePct < 0 ? Number(Math.abs(rawChangePct).toFixed(4)) : 0;
    quotes[symbol] = {
      symbol,
      name,
      open,
      prevClose,
      currentPrice,
      rawChangePct,
      dropPct,
      source: "sina",
      fetchedAt: nowIso(),
    };
  }

  return quotes;
}

function parseTencentRows(text) {
  const rows = String(text || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
  const quotes = {};

  for (const row of rows) {
    const match = row.match(/^v_(sh|sz)(\d{6})="(.*)"$/);
    if (!match) {
      continue;
    }
    const symbol = match[2];
    const parts = match[3].split("~");
    if (parts.length < 6) {
      continue;
    }
    const name = sanitizeString(parts[1]);
    const code = sanitizeString(parts[2]) || symbol;
    const currentPrice = toNumber(parts[3], null);
    const prevClose = toNumber(parts[4], null);
    const open = toNumber(parts[5], null);
    if (!name || !Number.isFinite(prevClose) || !Number.isFinite(currentPrice) || prevClose <= 0) {
      continue;
    }
    const rawChangePct = Number((((currentPrice - prevClose) / prevClose) * 100).toFixed(4));
    const dropPct = rawChangePct < 0 ? Number(Math.abs(rawChangePct).toFixed(4)) : 0;
    quotes[code] = {
      symbol: code,
      name,
      open,
      prevClose,
      currentPrice,
      rawChangePct,
      dropPct,
      source: "tencent",
      fetchedAt: nowIso(),
    };
  }

  return quotes;
}

async function fetchQuotes(symbols, timeoutMs) {
  const uniqueSymbols = Array.from(
    new Set(symbols.map((item) => normalizeSymbol(item)).filter((item) => /^\d{6}$/.test(item)))
  );
  if (!uniqueSymbols.length) {
    return {};
  }

  const sinaList = uniqueSymbols.map((item) => `${marketPrefix(item)}${item}`).join(",");
  try {
    const buffer = await httpRequestBuffer(`https://hq.sinajs.cn/list=${encodeURIComponent(sinaList)}`, {
      timeoutMs,
      referer: "https://finance.sina.com.cn/",
    });
    const parsed = parseSinaRows(decodeBuffer(buffer));
    if (Object.keys(parsed).length) {
      return parsed;
    }
  } catch (error) {
    console.warn(`[quote] sina failed: ${error.message}`);
  }

  const tencentList = uniqueSymbols.map((item) => `${marketPrefix(item)}${item}`).join(",");
  const buffer = await httpRequestBuffer(`https://qt.gtimg.cn/q=${encodeURIComponent(tencentList)}`, {
    timeoutMs,
    referer: "https://gu.qq.com/",
  });
  return parseTencentRows(decodeBuffer(buffer));
}

function resolveTargetDropPct(config, target) {
  if (target.thresholdPct !== null && target.thresholdPct !== undefined) {
    return Number(target.thresholdPct.toFixed(2));
  }
  return Number(config.rules.progressiveDropPct.toFixed(2));
}

function computeNextTriggerPrice(basePrice, progressiveDropPct) {
  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    return null;
  }
  return Number((basePrice * (1 - progressiveDropPct / 100)).toFixed(6));
}

function computeCumulativeDropPct(initialBasePrice, currentPrice) {
  if (!Number.isFinite(initialBasePrice) || initialBasePrice <= 0 || !Number.isFinite(currentPrice)) {
    return null;
  }
  return Number(((1 - currentPrice / initialBasePrice) * 100).toFixed(4));
}

function getAnchor(state, symbol) {
  return state.anchors?.[symbol] || null;
}

function shouldTriggerFromPrevClose(quote, triggerDropPct) {
  return Number.isFinite(quote.dropPct) && quote.dropPct >= triggerDropPct;
}

function shouldTriggerFromAnchor(quote, anchor) {
  if (!anchor || !Number.isFinite(anchor.nextTriggerPrice)) {
    return false;
  }
  if (!Number.isFinite(quote.currentPrice)) {
    return false;
  }
  return quote.currentPrice <= anchor.nextTriggerPrice;
}

function buildTriggerContext(config, target, quote, anchor) {
  const targetDropPct = resolveTargetDropPct(config, target);
  const triggerDropPct = targetDropPct;
  const progressiveDropPct = targetDropPct;

  if (!anchor || !Number.isFinite(anchor.lastAlertPrice)) {
    const hit = shouldTriggerFromPrevClose(quote, triggerDropPct);
    return {
      hit,
      kind: "from_prev_close",
      triggerDropPct,
      progressiveDropPct,
      basePrice: quote.prevClose,
      initialBasePrice: quote.prevClose,
      nextTriggerPrice: hit ? computeNextTriggerPrice(quote.currentPrice, progressiveDropPct) : null,
      nextTriggerCount: 1,
    };
  }

  const hit = shouldTriggerFromAnchor(quote, anchor);
  return {
    hit,
    kind: "from_last_alert_price",
    triggerDropPct,
    progressiveDropPct,
    basePrice: anchor.lastAlertPrice,
    initialBasePrice: anchor.initialBasePrice || anchor.lastAlertPrice,
    nextTriggerPrice: hit ? computeNextTriggerPrice(quote.currentPrice, progressiveDropPct) : anchor.nextTriggerPrice,
    nextTriggerCount: Math.max(1, (anchor.triggerCount || 0) + 1),
  };
}

// 企业微信推送内容在这里改：调整 lines 里的文字或删减字段即可。
function buildWecomContent(alert) {
  const lines = [
    "## 定投提醒",
    `- 标的: ${alert.symbol} ${alert.name}`,
  ];
  // if (alert.notes) {
  //   lines.push(`- 备注: ${alert.notes}`);
  // }
  lines.push(
    `- 第几次触发: 第 ${alert.triggerCount} 次`,
    `- 当前价: ${alert.currentPrice.toFixed(3)}`,
    `- 昨收价: ${alert.prevClose.toFixed(3)}`,
    `- 当前涨跌幅: ${alert.rawChangePct.toFixed(2)}%`,
    // `- 当前单日跌幅: ${alert.dropPct.toFixed(2)}%`,
    `- 触发方式: ${
      alert.triggerKind === "from_prev_close" ? "相对昨收首次触发" : "相对上一次触发价继续下跌"
    }`,
    `- 起点价: ${alert.initialBasePrice.toFixed(3)}`,
    `- 本次基准价: ${alert.basePrice.toFixed(3)}`,
    `- 相对起点累计跌幅: ${
      alert.cumulativeDropPct !== null ? `${alert.cumulativeDropPct.toFixed(2)}%` : "--"
    }`,
    `- 下一次触发价: ${alert.nextTriggerPrice !== null ? alert.nextTriggerPrice.toFixed(3) : "--"}`,
    `- 阶梯跌幅: ${alert.progressiveDropPct.toFixed(2)}%`,
    `- 时间: ${alert.checkedAt}`,
    "",
    "已达到你的定投提醒线，可以决定是否执行一笔。"
  );
  return lines.join("\n");
}

async function sendWecom(alert) {
  const webhook = sanitizeString(process.env.WECOM_WEBHOOK);
  if (!webhook) {
    return {
      ok: false,
      skipped: true,
      message: "未配置 WECOM_WEBHOOK，已记录但未推送。",
    };
  }

  const payload = {
    msgtype: "markdown",
    markdown: {
      content: buildWecomContent(alert),
    },
  };

  const buffer = await httpRequestBuffer(webhook, {
    method: "POST",
    body: JSON.stringify(payload),
    referer: "https://work.weixin.qq.com/",
  });
  const text = decodeBuffer(buffer);
  const parsed = JSON.parse(text);
  if (parsed.errcode !== 0) {
    throw new Error(parsed.errmsg || `企业微信返回错误: ${parsed.errcode}`);
  }
  return {
    ok: true,
    skipped: false,
    message: "企业微信推送成功。",
  };
}

function makeSummaryText(summary) {
  return [
    `[summary] checked=${summary.checkedCount}`,
    `triggered=${summary.triggeredCount}`,
    `notify_failed=${summary.notifyFailedCount}`,
    `trading_time=${summary.tradingTime}`,
  ].join(" ");
}

async function main() {
  const config = loadConfig();
  const state = pruneState(loadState(), config);
  const checkedAt = nowIso();
  const tradingTime = isTradingTime();
  const runContext = getRunContext();

  console.log(
    `[context] event=${runContext.eventName} sha=${runContext.sha.slice(0, 7)} ref=${runContext.ref} checkedAt=${checkedAt} tradingTime=${tradingTime}`
  );

  if (!config.schedule.enabled) {
    console.log("[skip] schedule disabled");
    return;
  }

  if (config.schedule.onlyTradingHours && !tradingTime) {
    console.log("[skip] not in CN trading hours");
    return;
  }

  const enabledTargets = config.watchlist.filter((item) => item.enabled);
  if (!enabledTargets.length) {
    console.log("[skip] no enabled targets");
    return;
  }

  const quotes = await fetchQuotes(enabledTargets.map((item) => item.symbol), config.runtime.quoteTimeoutMs);
  state.latestQuotes = {
    ...state.latestQuotes,
    ...quotes,
  };

  const alerts = [];
  let notifyFailedCount = 0;

  for (const target of enabledTargets) {
    const quote = quotes[target.symbol];
    if (!quote) {
      console.warn(`[quote-missing] ${target.symbol}`);
      continue;
    }

    const anchor = getAnchor(state, target.symbol);
    const trigger = buildTriggerContext(config, target, quote, anchor);

    if (!trigger.hit) {
      console.log(
        `[not-triggered] ${target.symbol} current=${quote.currentPrice?.toFixed(3) ?? "--"} drop=${
          quote.dropPct?.toFixed(2) ?? "--"
        } kind=${trigger.kind}`
      );
      continue;
    }

    const cumulativeDropPct = computeCumulativeDropPct(trigger.initialBasePrice, quote.currentPrice);
    const triggerCount = trigger.nextTriggerCount;

    const alert = {
      id: `${checkedAt}:${target.symbol}`,
      symbol: target.symbol,
      name: target.name || quote.name || "",
      notes: target.notes || "",
      currentPrice: quote.currentPrice,
      prevClose: quote.prevClose,
      rawChangePct: quote.rawChangePct,
      dropPct: quote.dropPct,
      checkedAt,
      source: quote.source,
      triggerKind: trigger.kind,
      basePrice: trigger.basePrice,
      initialBasePrice: trigger.initialBasePrice,
      cumulativeDropPct,
      triggerCount,
      nextTriggerPrice: trigger.nextTriggerPrice,
      progressiveDropPct: trigger.progressiveDropPct,
      triggerDropPct: trigger.triggerDropPct,
    };

    let notifyResult;
    try {
      notifyResult = await sendWecom(alert);
    } catch (error) {
      notifyResult = {
        ok: false,
        skipped: false,
        message: error.message || "企业微信推送失败。",
      };
    }

    if (!notifyResult.ok && !notifyResult.skipped) {
      notifyFailedCount += 1;
    }

    const alertRecord = {
      ...alert,
      notifyOk: notifyResult.ok,
      notifySkipped: notifyResult.skipped,
      notifyMessage: notifyResult.message,
    };

    alerts.push(alertRecord);
    state.anchors[target.symbol] = {
      lastAlertPrice: quote.currentPrice,
      lastAlertAt: checkedAt,
      initialBasePrice: trigger.initialBasePrice,
      nextTriggerPrice: trigger.nextTriggerPrice,
      progressiveDropPct: trigger.progressiveDropPct,
      triggerCount,
    };

    console.log(
      `[triggered] ${target.symbol} count=${triggerCount} current=${quote.currentPrice.toFixed(3)} trigger=${
        trigger.kind
      } next=${trigger.nextTriggerPrice !== null ? trigger.nextTriggerPrice.toFixed(3) : "--"} notify=${
        notifyResult.message
      }`
    );
  }

  if (alerts.length) {
    state.alerts = [...alerts.reverse(), ...state.alerts];
  }

  state.lastRunSummary = {
    checkedAt,
    checkedCount: enabledTargets.length,
    triggeredCount: alerts.length,
    notifyFailedCount,
    tradingTime,
  };
  pruneState(state, config);
  saveState(state);

  console.log(makeSummaryText(state.lastRunSummary));
}

main().catch((error) => {
  console.error(`[fatal] ${error.stack || error.message}`);
  process.exitCode = 1;
});
