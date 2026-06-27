const fs = require("fs");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const HOST = String(process.env.DCA_HOST || "0.0.0.0").trim();
const PORT = Number(String(process.env.PORT || process.env.DCA_PORT || "8788").trim());

const ROOT_DIR = path.resolve(__dirname, "..");
const STORAGE_ROOT = sanitizePath(process.env.DCA_DATA_DIR) || ROOT_DIR;
const PUBLIC_DIR = path.join(__dirname, "public");
const CONFIG_PATH = path.join(STORAGE_ROOT, "config", "watchlist.json");
const STATE_PATH = path.join(STORAGE_ROOT, "data", "runtime_state.json");
const INDEX_PATH = path.join(PUBLIC_DIR, "index.html");
const APP_JS_PATH = path.join(PUBLIC_DIR, "app.js");
const STYLES_PATH = path.join(PUBLIC_DIR, "styles.css");
const BASIC_AUTH_USER = sanitizeString(process.env.DCA_BASIC_AUTH_USER);
const BASIC_AUTH_PASSWORD = sanitizeString(process.env.DCA_BASIC_AUTH_PASSWORD);
const ACCESS_TOKEN = sanitizeString(process.env.DCA_ACCESS_TOKEN);
const AUTH_ENABLED = Boolean(ACCESS_TOKEN || (BASIC_AUTH_USER && BASIC_AUTH_PASSWORD));
const PUBLIC_HEALTH_ENABLED = String(process.env.DCA_PUBLIC_HEALTH || "true").trim() !== "false";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

let schedulerTimer = null;
let checkInFlight = false;

function sanitizePath(value) {
  const text = String(value || "").trim();
  return text ? path.resolve(text) : "";
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
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
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function nowIso() {
  return new Date().toISOString();
}

function getTodayShanghai() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function getShanghaiParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const map = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }
  return {
    weekday: map.weekday,
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
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

function normalizeTarget(target) {
  const symbol = normalizeSymbol(target.symbol);
  const thresholdPct = toNumber(target.thresholdPct, null);
  return {
    symbol,
    name: sanitizeString(target.name),
    enabled: target.enabled !== false,
    thresholdPct: thresholdPct !== null ? thresholdPct : undefined,
    notes: sanitizeString(target.notes),
  };
}

function defaultConfig() {
  return {
    appName: "4%定投提醒工具",
    schedule: {
      enabled: true,
      intervalSeconds: 180,
      onlyTradingHours: true,
    },
    rules: {
      triggerDropPct: 4,
      oncePerDay: true,
    },
    notification: {
      channel: "wecom_robot",
      webhook: "",
      mentionedMobileList: [],
    },
    watchlist: [
      {
        symbol: "510300",
        name: "沪深300ETF",
        enabled: true,
        notes: "示例标的",
      },
    ],
    runtime: {
      quoteTimeoutMs: 15000,
      maxHistory: 120,
      maxChecks: 60,
    },
  };
}

function normalizeConfig(rawConfig) {
  const base = defaultConfig();
  const config = rawConfig && typeof rawConfig === "object" ? rawConfig : {};
  const schedule = config.schedule && typeof config.schedule === "object" ? config.schedule : {};
  const rules = config.rules && typeof config.rules === "object" ? config.rules : {};
  const notification = config.notification && typeof config.notification === "object" ? config.notification : {};
  const runtime = config.runtime && typeof config.runtime === "object" ? config.runtime : {};
  const watchlist = Array.isArray(config.watchlist) ? config.watchlist : [];

  return {
    appName: sanitizeString(config.appName) || base.appName,
    schedule: {
      enabled: schedule.enabled !== false,
      intervalSeconds: Math.max(30, toNumber(schedule.intervalSeconds, base.schedule.intervalSeconds)),
      onlyTradingHours: schedule.onlyTradingHours !== false,
    },
    rules: {
      triggerDropPct: Math.max(0.1, toNumber(rules.triggerDropPct, base.rules.triggerDropPct)),
      oncePerDay: rules.oncePerDay !== false,
    },
    notification: {
      channel: "wecom_robot",
      webhook: sanitizeString(notification.webhook),
      mentionedMobileList: Array.isArray(notification.mentionedMobileList)
        ? notification.mentionedMobileList.map((item) => sanitizeString(item)).filter(Boolean)
        : [],
    },
    watchlist: watchlist.map(normalizeTarget).filter((item) => /^\d{6}$/.test(item.symbol)),
    runtime: {
      quoteTimeoutMs: Math.max(5000, toNumber(runtime.quoteTimeoutMs, base.runtime.quoteTimeoutMs)),
      maxHistory: Math.max(20, toNumber(runtime.maxHistory, base.runtime.maxHistory)),
      maxChecks: Math.max(10, toNumber(runtime.maxChecks, base.runtime.maxChecks)),
    },
  };
}

function loadConfig() {
  return normalizeConfig(readJson(CONFIG_PATH, defaultConfig()));
}

function saveConfig(config) {
  const normalized = normalizeConfig(config);
  writeJson(CONFIG_PATH, normalized);
  return normalized;
}

function defaultState() {
  return {
    version: 1,
    updatedAt: nowIso(),
    lastCheckSummary: null,
    lastChecks: [],
    alerts: [],
    dailyAlerts: {},
    latestQuotes: {},
  };
}

function normalizeState(rawState) {
  const state = rawState && typeof rawState === "object" ? rawState : {};
  return {
    version: 1,
    updatedAt: sanitizeString(state.updatedAt) || nowIso(),
    lastCheckSummary: state.lastCheckSummary && typeof state.lastCheckSummary === "object" ? state.lastCheckSummary : null,
    lastChecks: Array.isArray(state.lastChecks) ? state.lastChecks : [],
    alerts: Array.isArray(state.alerts) ? state.alerts : [],
    dailyAlerts: state.dailyAlerts && typeof state.dailyAlerts === "object" ? state.dailyAlerts : {},
    latestQuotes: state.latestQuotes && typeof state.latestQuotes === "object" ? state.latestQuotes : {},
  };
}

function loadState() {
  return normalizeState(readJson(STATE_PATH, defaultState()));
}

function saveState(state) {
  const normalized = normalizeState(state);
  normalized.updatedAt = nowIso();
  writeJson(STATE_PATH, normalized);
  return normalized;
}

function pruneState(state, config) {
  const maxHistory = config.runtime.maxHistory;
  const maxChecks = config.runtime.maxChecks;
  state.alerts = state.alerts.slice(0, maxHistory);
  state.lastChecks = state.lastChecks.slice(0, maxChecks);

  const today = getTodayShanghai();
  const nextDailyAlerts = {};
  for (const [dateKey, dateValue] of Object.entries(state.dailyAlerts || {})) {
    if (dateKey >= today) {
      nextDailyAlerts[dateKey] = dateValue;
    }
  }
  state.dailyAlerts = nextDailyAlerts;
  return state;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
  });
  res.end(body);
}

function sendFile(res, filePath, contentType) {
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
  });
  res.end(body);
}

function unauthorized(res, message = "Unauthorized") {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
  };
  if (BASIC_AUTH_USER && BASIC_AUTH_PASSWORD) {
    headers["WWW-Authenticate"] = 'Basic realm="DCA Admin", charset="UTF-8"';
  }
  res.writeHead(401, headers);
  res.end(JSON.stringify({ ok: false, message }));
}

function safeEquals(left, right) {
  const leftText = String(left || "");
  const rightText = String(right || "");
  if (leftText.length !== rightText.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(leftText), Buffer.from(rightText));
}

function decodeBasicAuth(authHeader) {
  const match = String(authHeader || "").match(/^Basic\s+(.+)$/i);
  if (!match) {
    return null;
  }
  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 0) {
      return null;
    }
    return {
      user: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch (error) {
    return null;
  }
}

function isAuthorized(req, requestUrl) {
  if (!AUTH_ENABLED) {
    return true;
  }

  if (ACCESS_TOKEN) {
    const headerToken = sanitizeString(req.headers["x-dca-token"]);
    const bearerToken = sanitizeString(req.headers.authorization).replace(/^Bearer\s+/i, "");
    const queryToken = sanitizeString(requestUrl.searchParams.get("token"));
    const providedToken = headerToken || bearerToken || queryToken;
    if (providedToken && safeEquals(providedToken, ACCESS_TOKEN)) {
      return true;
    }
  }

  if (BASIC_AUTH_USER && BASIC_AUTH_PASSWORD) {
    const decoded = decodeBasicAuth(req.headers.authorization);
    if (
      decoded &&
      safeEquals(decoded.user, BASIC_AUTH_USER) &&
      safeEquals(decoded.password, BASIC_AUTH_PASSWORD)
    ) {
      return true;
    }
  }

  return false;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function httpRequestText(url, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const requestFn = target.protocol === "http:" ? http.request : https.request;
    const request = requestFn(
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
          const buffer = Buffer.concat(chunks);
          resolve({ buffer, headers: response.headers, statusCode });
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

function marketPrefix(symbol) {
  if (/^[56]/.test(symbol)) {
    return "sh";
  }
  return "sz";
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
    const open = toNumber(parts[1], null);
    const prevClose = toNumber(parts[2], null);
    const currentPrice = toNumber(parts[3], null);
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
  const uniqueSymbols = Array.from(new Set(symbols.map((item) => normalizeSymbol(item)).filter((item) => /^\d{6}$/.test(item))));
  if (!uniqueSymbols.length) {
    return {};
  }

  const sinaList = uniqueSymbols.map((item) => `${marketPrefix(item)}${item}`).join(",");
  try {
    const response = await httpRequestText(`https://hq.sinajs.cn/list=${encodeURIComponent(sinaList)}`, {
      timeoutMs,
      referer: "https://finance.sina.com.cn/",
    });
    const parsed = parseSinaRows(decodeBuffer(response.buffer));
    if (Object.keys(parsed).length) {
      return parsed;
    }
  } catch (error) {
    // Fall through to the Tencent quote endpoint.
  }

  const tencentList = uniqueSymbols.map((item) => `${marketPrefix(item)}${item}`).join(",");
  const fallbackResponse = await httpRequestText(`https://qt.gtimg.cn/q=${encodeURIComponent(tencentList)}`, {
    timeoutMs,
    referer: "https://gu.qq.com/",
  });
  return parseTencentRows(decodeBuffer(fallbackResponse.buffer));
}

function makeAlertKey(dateKey, symbol) {
  return `${dateKey}:${symbol}`;
}

function alreadyAlertedToday(state, dateKey, symbol) {
  return Boolean(state.dailyAlerts?.[dateKey]?.[symbol]);
}

function markAlertedToday(state, dateKey, symbol) {
  if (!state.dailyAlerts[dateKey]) {
    state.dailyAlerts[dateKey] = {};
  }
  state.dailyAlerts[dateKey][symbol] = true;
}

function formatMoney(value) {
  return Number.isFinite(value) ? value.toFixed(3) : "--";
}

function formatPct(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "--";
}

function buildRobotMessage(alert, thresholdPct) {
  return [
    "## 定投提醒",
    `- 标的: ${alert.symbol} ${alert.name || ""}`.trim(),
    `- 当前价: ${formatMoney(alert.currentPrice)}`,
    `- 昨收价: ${formatMoney(alert.prevClose)}`,
    `- 当前涨跌幅: ${formatPct(alert.rawChangePct)}`,
    `- 当前跌幅: ${formatPct(alert.dropPct)}`,
    `- 触发线: ${formatPct(thresholdPct)}`,
    `- 时间: ${alert.checkedAt}`,
    "",
    "已达到你的定投提醒线，可以看看是否该执行一笔。",
  ].join("\n");
}

async function sendWeComRobot(config, alert) {
  const webhook = sanitizeString(config.notification.webhook);
  if (!webhook) {
    return {
      ok: false,
      skipped: true,
      message: "未配置企业微信机器人 webhook，已记录但未推送。",
    };
  }

  const payload = {
    msgtype: "markdown",
    markdown: {
      content: buildRobotMessage(alert, alert.thresholdPct),
    },
  };

  const response = await httpRequestText(webhook, {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: config.runtime.quoteTimeoutMs,
    referer: "https://work.weixin.qq.com/",
  });

  const text = decodeBuffer(response.buffer);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`企业微信返回了不可解析的结果: ${text.slice(0, 160)}`);
  }
  if (parsed.errcode !== 0) {
    throw new Error(parsed.errmsg || `企业微信返回错误: ${parsed.errcode}`);
  }

  return {
    ok: true,
    skipped: false,
    message: "企业微信推送成功。",
  };
}

function buildCheckRecord(target, quote, thresholdPct, checkedAt, status, extra = {}) {
  return {
    symbol: target.symbol,
    targetName: target.name || "",
    quoteName: quote?.name || "",
    currentPrice: quote?.currentPrice ?? null,
    prevClose: quote?.prevClose ?? null,
    rawChangePct: quote?.rawChangePct ?? null,
    dropPct: quote?.dropPct ?? null,
    thresholdPct,
    checkedAt,
    status,
    ...extra,
  };
}

async function runCheck(triggerSource = "manual") {
  if (checkInFlight) {
    return {
      ok: false,
      busy: true,
      message: "上一轮检查还没结束。",
    };
  }

  checkInFlight = true;
  try {
    const config = loadConfig();
    const state = loadState();
    pruneState(state, config);

    const enabledTargets = config.watchlist.filter((item) => item.enabled);
    const checkedAt = nowIso();
    const dateKey = getTodayShanghai();

    if (!enabledTargets.length) {
      state.lastCheckSummary = {
        checkedAt,
        triggerSource,
        checkedCount: 0,
        triggeredCount: 0,
        message: "监控列表为空。",
      };
      state.lastChecks.unshift({
        checkedAt,
        triggerSource,
        checkedCount: 0,
        triggeredCount: 0,
        records: [],
      });
      saveState(state);
      return {
        ok: true,
        checkedAt,
        checkedCount: 0,
        triggeredCount: 0,
        records: [],
        message: "监控列表为空。",
      };
    }

    const quotes = await fetchQuotes(enabledTargets.map((item) => item.symbol), config.runtime.quoteTimeoutMs);
    state.latestQuotes = {
      ...state.latestQuotes,
      ...quotes,
    };

    const records = [];
    const alerts = [];

    for (const target of enabledTargets) {
      const quote = quotes[target.symbol];
      const thresholdPct = Number(
        toNumber(target.thresholdPct, config.rules.triggerDropPct).toFixed(2)
      );

      if (!quote) {
        records.push(
          buildCheckRecord(target, null, thresholdPct, checkedAt, "quote_missing", {
            message: "未取到行情数据。",
          })
        );
        continue;
      }

      if (!Number.isFinite(quote.dropPct)) {
        records.push(
          buildCheckRecord(target, quote, thresholdPct, checkedAt, "invalid_quote", {
            message: "行情数据不完整。",
          })
        );
        continue;
      }

      if (quote.dropPct < thresholdPct) {
        records.push(
          buildCheckRecord(target, quote, thresholdPct, checkedAt, "not_triggered", {
            message: "未达到提醒线。",
          })
        );
        continue;
      }

      if (config.rules.oncePerDay && alreadyAlertedToday(state, dateKey, target.symbol)) {
        records.push(
          buildCheckRecord(target, quote, thresholdPct, checkedAt, "already_alerted", {
            message: "今天已经提醒过。",
          })
        );
        continue;
      }

      const alert = {
        id: makeAlertKey(dateKey, target.symbol),
        symbol: target.symbol,
        name: target.name || quote.name || "",
        currentPrice: quote.currentPrice,
        prevClose: quote.prevClose,
        rawChangePct: quote.rawChangePct,
        dropPct: quote.dropPct,
        thresholdPct,
        checkedAt,
        triggerSource,
      };

      let notifyResult;
      try {
        notifyResult = await sendWeComRobot(config, alert);
      } catch (error) {
        notifyResult = {
          ok: false,
          skipped: false,
          message: error.message || "企业微信推送失败。",
        };
      }

      if (notifyResult.ok || notifyResult.skipped) {
        markAlertedToday(state, dateKey, target.symbol);
      }

      const alertRecord = {
        ...alert,
        notifyOk: notifyResult.ok,
        notifySkipped: notifyResult.skipped,
        notifyMessage: notifyResult.message,
      };
      alerts.push(alertRecord);
      records.push(
        buildCheckRecord(target, quote, thresholdPct, checkedAt, notifyResult.ok || notifyResult.skipped ? "triggered" : "notify_failed", {
          notifyMessage: notifyResult.message,
        })
      );
    }

    if (alerts.length) {
      state.alerts = [...alerts.reverse(), ...state.alerts];
    }
    state.lastCheckSummary = {
      checkedAt,
      triggerSource,
      checkedCount: enabledTargets.length,
      triggeredCount: records.filter((item) => item.status === "triggered").length,
      notifyFailedCount: records.filter((item) => item.status === "notify_failed").length,
      skippedCount: records.filter((item) => item.status === "already_alerted").length,
      tradingTime: isTradingTime(),
    };
    state.lastChecks.unshift({
      checkedAt,
      triggerSource,
      checkedCount: enabledTargets.length,
      triggeredCount: records.filter((item) => item.status === "triggered").length,
      records,
    });
    pruneState(state, config);
    saveState(state);

    return {
      ok: true,
      checkedAt,
      checkedCount: enabledTargets.length,
      triggeredCount: records.filter((item) => item.status === "triggered").length,
      records,
      alerts,
    };
  } finally {
    checkInFlight = false;
  }
}

function shouldAutoRun(config) {
  if (!config.schedule.enabled) {
    return false;
  }
  if (!config.schedule.onlyTradingHours) {
    return true;
  }
  return isTradingTime();
}

function refreshScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }

  const config = loadConfig();
  if (!config.schedule.enabled) {
    return;
  }

  schedulerTimer = setInterval(async () => {
    const latestConfig = loadConfig();
    if (!shouldAutoRun(latestConfig)) {
      return;
    }
    try {
      const result = await runCheck("auto");
      if (result.ok && result.triggeredCount > 0) {
        console.log(`[auto-check] ${result.checkedAt} triggered=${result.triggeredCount}`);
      }
    } catch (error) {
      console.error(`[auto-check] ${error.message}`);
    }
  }, config.schedule.intervalSeconds * 1000);
}

function getMaskedConfig(config) {
  return {
    ...config,
    notification: {
      ...config.notification,
      webhook: config.notification.webhook,
    },
  };
}

function getDashboardPayload() {
  const config = loadConfig();
  const state = loadState();
  pruneState(state, config);
  saveState(state);
  return {
    ok: true,
    config: getMaskedConfig(config),
    state,
    meta: {
      host: HOST,
      port: PORT,
      tradingTime: isTradingTime(),
      today: getTodayShanghai(),
      localIps: getLocalAddresses(),
      authEnabled: AUTH_ENABLED,
      storageRoot: STORAGE_ROOT,
    },
  };
}

function getLocalAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const rows of Object.values(interfaces)) {
    for (const row of rows || []) {
      if (row.family === "IPv4" && !row.internal) {
        addresses.push(row.address);
      }
    }
  }
  return Array.from(new Set(addresses));
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      host: HOST,
      port: PORT,
      tradingTime: isTradingTime(),
      timestamp: nowIso(),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/dashboard") {
    sendJson(res, 200, getDashboardPayload());
    return;
  }

  if (req.method === "POST" && pathname === "/api/config") {
    try {
      const body = await readRequestBody(req);
      const payload = body ? JSON.parse(body) : {};
      const saved = saveConfig(payload);
      refreshScheduler();
      sendJson(res, 200, { ok: true, config: saved });
    } catch (error) {
      sendJson(res, 400, { ok: false, message: error.message || "保存配置失败。" });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/run-check") {
    try {
      const result = await runCheck("manual");
      sendJson(res, result.ok ? 200 : 409, result);
    } catch (error) {
      sendJson(res, 500, { ok: false, message: error.message || "执行检查失败。" });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/clear-history") {
    const config = loadConfig();
    const nextState = defaultState();
    saveState(pruneState(nextState, config));
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { ok: false, message: "Not found" });
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
    const pathname = requestUrl.pathname;

    if (pathname === "/api/health" && req.method === "GET" && PUBLIC_HEALTH_ENABLED) {
      sendJson(res, 200, {
        ok: true,
        host: HOST,
        port: PORT,
        tradingTime: isTradingTime(),
        timestamp: nowIso(),
      });
      return;
    }

    if (!isAuthorized(req, requestUrl)) {
      unauthorized(res);
      return;
    }

    if (pathname.startsWith("/api/")) {
      await handleApi(req, res, pathname);
      return;
    }

    if (req.method !== "GET") {
      sendJson(res, 405, { ok: false, message: "Method not allowed" });
      return;
    }

    if (pathname === "/" || pathname === "/index.html") {
      sendFile(res, INDEX_PATH, "text/html; charset=utf-8");
      return;
    }
    if (pathname === "/app.js") {
      sendFile(res, APP_JS_PATH, "application/javascript; charset=utf-8");
      return;
    }
    if (pathname === "/styles.css") {
      sendFile(res, STYLES_PATH, "text/css; charset=utf-8");
      return;
    }

    sendJson(res, 404, { ok: false, message: "Not found" });
  } catch (error) {
    sendJson(res, 500, { ok: false, message: error.message || "服务器异常。" });
  }
});

function boot() {
  ensureParentDir(CONFIG_PATH);
  ensureParentDir(STATE_PATH);
  if (!fs.existsSync(CONFIG_PATH)) {
    saveConfig(defaultConfig());
  }
  if (!fs.existsSync(STATE_PATH)) {
    saveState(defaultState());
  }
  refreshScheduler();
  server.listen(PORT, HOST, () => {
    const urls = [`http://127.0.0.1:${PORT}`];
    for (const address of getLocalAddresses()) {
      urls.push(`http://${address}:${PORT}`);
    }
    console.log(`storageRoot=${STORAGE_ROOT}`);
    console.log(`authEnabled=${AUTH_ENABLED}`);
    console.log("4%定投提醒工具已启动");
    console.log(`监听地址: ${HOST}:${PORT}`);
    console.log("可访问地址:");
    for (const url of urls) {
      console.log(`  ${url}`);
    }
    console.log("说明: 跌幅达到或超过 4% 时会触发提醒。");
  });
}

boot();
