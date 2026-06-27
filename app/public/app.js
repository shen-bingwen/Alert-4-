const state = {
  config: null,
  runtime: null,
};

const refs = {
  runCheckBtn: document.getElementById("runCheckBtn"),
  saveConfigBtn: document.getElementById("saveConfigBtn"),
  addTargetBtn: document.getElementById("addTargetBtn"),
  watchCount: document.getElementById("watchCount"),
  lastCheckAt: document.getElementById("lastCheckAt"),
  lastTriggerCount: document.getElementById("lastTriggerCount"),
  tradingTimeFlag: document.getElementById("tradingTimeFlag"),
  triggerDropPct: document.getElementById("triggerDropPct"),
  intervalSeconds: document.getElementById("intervalSeconds"),
  scheduleEnabled: document.getElementById("scheduleEnabled"),
  onlyTradingHours: document.getElementById("onlyTradingHours"),
  webhook: document.getElementById("webhook"),
  watchlist: document.getElementById("watchlist"),
  alertList: document.getElementById("alertList"),
  checkRecords: document.getElementById("checkRecords"),
  toast: document.getElementById("toast"),
};

function defaultTarget() {
  return {
    symbol: "",
    name: "",
    enabled: true,
    thresholdPct: "",
    notes: "",
  };
}

function showToast(message, tone = "default") {
  refs.toast.textContent = message;
  refs.toast.className = `toast ${tone}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    refs.toast.className = "toast hidden";
  }, 2400);
}

function formatDateTime(value) {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatPct(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "--";
}

function formatPrice(value) {
  return Number.isFinite(value) ? value.toFixed(3) : "--";
}

async function api(path, options = {}) {
  const response = await fetch(buildApiUrl(path), {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || "请求失败");
  }
  return payload;
}

function buildApiUrl(path) {
  const url = new URL(path, window.location.origin);
  const pageUrl = new URL(window.location.href);
  const token = pageUrl.searchParams.get("token");
  if (token) {
    url.searchParams.set("token", token);
  }
  return url.toString();
}

function readConfigFromForm() {
  const targets = Array.from(refs.watchlist.querySelectorAll("[data-target-row]")).map((row) => {
    return {
      symbol: row.querySelector("[data-key='symbol']").value.trim(),
      name: row.querySelector("[data-key='name']").value.trim(),
      enabled: row.querySelector("[data-key='enabled']").value === "true",
      thresholdPct: row.querySelector("[data-key='thresholdPct']").value.trim(),
      notes: row.querySelector("[data-key='notes']").value.trim(),
    };
  });

  return {
    ...state.config,
    schedule: {
      ...state.config.schedule,
      enabled: refs.scheduleEnabled.value === "true",
      intervalSeconds: Number(refs.intervalSeconds.value || "180"),
      onlyTradingHours: refs.onlyTradingHours.value === "true",
    },
    rules: {
      ...state.config.rules,
      triggerDropPct: Number(refs.triggerDropPct.value || "4"),
    },
    notification: {
      ...state.config.notification,
      webhook: refs.webhook.value.trim(),
    },
    watchlist: targets,
  };
}

function fillForm(config) {
  refs.triggerDropPct.value = config.rules.triggerDropPct;
  refs.intervalSeconds.value = config.schedule.intervalSeconds;
  refs.scheduleEnabled.value = String(config.schedule.enabled);
  refs.onlyTradingHours.value = String(config.schedule.onlyTradingHours);
  refs.webhook.value = config.notification.webhook || "";
}

function renderStats() {
  const summary = state.runtime?.state?.lastCheckSummary;
  refs.watchCount.textContent = String(state.config.watchlist.length);
  refs.lastCheckAt.textContent = summary ? formatDateTime(summary.checkedAt) : "--";
  refs.lastTriggerCount.textContent = summary ? String(summary.triggeredCount) : "0";
  refs.tradingTimeFlag.textContent = state.runtime?.meta?.tradingTime ? "是" : "否";
}

function renderWatchlist() {
  const quotes = state.runtime?.state?.latestQuotes || {};
  const today = state.runtime?.meta?.today;
  const dailyAlerts = state.runtime?.state?.dailyAlerts?.[today] || {};

  if (!state.config.watchlist.length) {
    refs.watchlist.innerHTML = `<div class="empty-card">还没有监控标的，先点“新增一行”。</div>`;
    return;
  }

  refs.watchlist.innerHTML = state.config.watchlist
    .map((target, index) => {
      const quote = quotes[target.symbol] || null;
      const threshold = target.thresholdPct === undefined || target.thresholdPct === "" ? state.config.rules.triggerDropPct : target.thresholdPct;
      return `
        <article class="target-card" data-target-row data-index="${index}">
          <div class="target-grid">
            <label class="field compact">
              <span>启用</span>
              <select data-key="enabled">
                <option value="true" ${target.enabled !== false ? "selected" : ""}>开</option>
                <option value="false" ${target.enabled === false ? "selected" : ""}>关</option>
              </select>
            </label>
            <label class="field compact">
              <span>代码</span>
              <input data-key="symbol" type="text" value="${escapeHtml(target.symbol || "")}" placeholder="510300">
            </label>
            <label class="field compact">
              <span>名称</span>
              <input data-key="name" type="text" value="${escapeHtml(target.name || "")}" placeholder="沪深300ETF">
            </label>
            <label class="field compact">
              <span>阈值 %</span>
              <input data-key="thresholdPct" type="number" step="0.1" min="0.1" value="${escapeHtml(target.thresholdPct ?? "")}" placeholder="${state.config.rules.triggerDropPct}">
            </label>
            <label class="field compact notes">
              <span>备注</span>
              <input data-key="notes" type="text" value="${escapeHtml(target.notes || "")}" placeholder="可选">
            </label>
          </div>
          <div class="target-meta">
            <span>现价 ${formatPrice(quote?.currentPrice)}</span>
            <span>昨收 ${formatPrice(quote?.prevClose)}</span>
            <span class="${quote?.dropPct >= Number(threshold || 0) ? "danger" : ""}">跌幅 ${formatPct(quote?.dropPct)}</span>
            <span>涨跌幅 ${formatPct(quote?.rawChangePct)}</span>
            <span>${dailyAlerts[target.symbol] ? "今天已提醒" : "今天未提醒"}</span>
            <button class="link-danger" data-remove-index="${index}">删除</button>
          </div>
        </article>
      `;
    })
    .join("");

  refs.watchlist.querySelectorAll("[data-remove-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.removeIndex);
      state.config.watchlist.splice(index, 1);
      renderWatchlist();
      renderStats();
    });
  });
}

function renderAlerts() {
  const alerts = state.runtime?.state?.alerts || [];
  if (!alerts.length) {
    refs.alertList.className = "history-list empty";
    refs.alertList.textContent = "还没有提醒记录。";
    return;
  }

  refs.alertList.className = "history-list";
  refs.alertList.innerHTML = alerts
    .map((alert) => {
      return `
        <article class="history-card">
          <div class="history-top">
            <strong>${escapeHtml(alert.symbol)} ${escapeHtml(alert.name || "")}</strong>
            <span>${formatDateTime(alert.checkedAt)}</span>
          </div>
          <div class="history-meta">
            <span>现价 ${formatPrice(alert.currentPrice)}</span>
            <span>跌幅 ${formatPct(alert.dropPct)}</span>
            <span>阈值 ${formatPct(alert.thresholdPct)}</span>
            <span class="${alert.notifyOk ? "success" : alert.notifySkipped ? "warn" : "danger"}">${escapeHtml(alert.notifyMessage || "--")}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderCheckRecords() {
  const check = state.runtime?.state?.lastChecks?.[0];
  const records = check?.records || [];
  if (!records.length) {
    refs.checkRecords.className = "history-list empty";
    refs.checkRecords.textContent = "还没有检查记录。";
    return;
  }

  refs.checkRecords.className = "history-list";
  refs.checkRecords.innerHTML = records
    .map((record) => {
      return `
        <article class="history-card">
          <div class="history-top">
            <strong>${escapeHtml(record.symbol)} ${escapeHtml(record.targetName || record.quoteName || "")}</strong>
            <span>${statusLabel(record.status)}</span>
          </div>
          <div class="history-meta">
            <span>现价 ${formatPrice(record.currentPrice)}</span>
            <span>昨收 ${formatPrice(record.prevClose)}</span>
            <span>跌幅 ${formatPct(record.dropPct)}</span>
            <span>阈值 ${formatPct(record.thresholdPct)}</span>
            <span>${escapeHtml(record.message || record.notifyMessage || "--")}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function statusLabel(status) {
  const map = {
    triggered: "已触发",
    already_alerted: "今天已提醒",
    not_triggered: "未触发",
    quote_missing: "行情缺失",
    invalid_quote: "行情异常",
    notify_failed: "推送失败",
  };
  return map[status] || status;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderAll() {
  fillForm(state.config);
  renderStats();
  renderWatchlist();
  renderAlerts();
  renderCheckRecords();
}

async function refreshDashboard() {
  const payload = await api("/api/dashboard");
  state.config = payload.config;
  state.runtime = payload;
  renderAll();
}

async function saveConfig() {
  const config = readConfigFromForm();
  const payload = await api("/api/config", {
    method: "POST",
    body: JSON.stringify(config),
  });
  state.config = payload.config;
  showToast("配置已保存", "success");
  await refreshDashboard();
}

async function runCheck() {
  refs.runCheckBtn.disabled = true;
  refs.runCheckBtn.textContent = "检查中...";
  try {
    const result = await api("/api/run-check", {
      method: "POST",
      body: JSON.stringify({}),
    });
    showToast(`检查完成，触发 ${result.triggeredCount} 个`, result.triggeredCount > 0 ? "warn" : "success");
    await refreshDashboard();
  } catch (error) {
    showToast(error.message || "检查失败", "danger");
  } finally {
    refs.runCheckBtn.disabled = false;
    refs.runCheckBtn.textContent = "立即检查一次";
  }
}

function wireEvents() {
  refs.addTargetBtn.addEventListener("click", () => {
    state.config.watchlist.push(defaultTarget());
    renderWatchlist();
    renderStats();
  });
  refs.saveConfigBtn.addEventListener("click", () => {
    saveConfig().catch((error) => showToast(error.message || "保存失败", "danger"));
  });
  refs.runCheckBtn.addEventListener("click", () => {
    runCheck().catch((error) => showToast(error.message || "检查失败", "danger"));
  });
}

async function main() {
  wireEvents();
  await refreshDashboard();
}

main().catch((error) => {
  showToast(error.message || "加载失败", "danger");
});
