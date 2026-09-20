#!/usr/bin/env node
/**
 * ⚠ 這是複本(供 plugin 發佈用)。真相來源:
 *   market_scan_nextjs/mcp/ai-tam/server.js — 改那邊之後要重新複製過來。
 *
 * ai-tam MCP server — 把 market-scan 的 /api/v1 專欄 REST API 包成 MCP tools。
 *
 * 設計取捨:
 *   - 零相依:只用 Node 18+ 內建的 fetch 與 stdio,單檔即可 scp 到任何 tailnet 機器,
 *     不需要 npm install、不需要整個 repo。
 *   - 唯讀:只發 GET。這支伺服器沒有任何寫入路徑。
 *   - 預設截斷:回應超過 max_bytes 會截斷並標注,避免一次把幾 MB 的 latest.json
 *     灌進模型 context(要細節就用 path / fields / limit 逐層下鑽)。
 *
 * 連線前提:API 僅接受 Tailscale 網段直連(100.64.0.0/10)。
 * 走公網 ai-tam.org 會拿到 403,那是刻意的,不要改用公網 base URL。
 *
 * 用法:
 *   claude mcp add ai-tam -- node /path/to/server.js
 *   AI_TAM_BASE=http://100.70.225.18:8504/market-scan/api/v1 可覆寫 base URL
 */

const BASE = (process.env.AI_TAM_BASE || "http://100.70.225.18:8504/market-scan/api/v1").replace(/\/+$/, "");
const DEFAULT_MAX_BYTES = Number.parseInt(process.env.AI_TAM_MAX_BYTES || "60000", 10);
const TIMEOUT_MS = Number.parseInt(process.env.AI_TAM_TIMEOUT_MS || "15000", 10);
const SERVER_VERSION = "1.1.0";
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

function buildUrl(pathname, params = {}) {
  const url = new URL(`${BASE}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function apiGet(pathname, params, maxBytes = DEFAULT_MAX_BYTES) {
  const url = buildUrl(pathname, params);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
    const text = await response.text();
    if (!response.ok) {
      // 403 幾乎都是「這台機器不在 tailnet」,直接把排查步驟寫進錯誤訊息
      const hint =
        response.status === 403
          ? " — 這個 API 只接受 Tailscale 直連。先跑 `tailscale status` 確認本機在 tailnet 上,且 base URL 用 100.x 位址而非 ai-tam.org。"
          : "";
      return { ok: false, text: `HTTP ${response.status} ${url}${hint}\n${text.slice(0, 2000)}` };
    }
    if (text.length > maxBytes) {
      return {
        ok: true,
        text:
          `${text.slice(0, maxBytes)}\n\n[truncated: ${text.length} bytes → ${maxBytes}. ` +
          "用 path / fields / limit 縮小範圍,或提高 max_bytes]",
      };
    }
    return { ok: true, text };
  } catch (error) {
    return { ok: false, text: `request_failed ${url}: ${error.message}` };
  } finally {
    clearTimeout(timer);
  }
}

const TOOLS = [
  {
    name: "ai_tam_scanner_overview",
    description:
      "市場掃描器總覽：4 個 universe（台股 AI 供應鏈 101 檔、美股 AI 供應鏈 78 檔、S&P 500 503 檔、加密 10 檔）、"
      + "資料新鮮度、可篩選欄位與運算子。要選股/篩股時先呼叫這支拿到欄位白名單，不要猜欄位名。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ai_tam_scan",
    description:
      "用條件篩選標的（可跨 universe）。filter 語法：pe<20,roe>15,revenue_yoy>=30（逗號 AND，運算子 >= <= != > < =）。"
      + "注意 PE/PEG 可能為負，peg<1 會撈到虧損股，要排除請一併加 peg>0；回應的 notes 會提醒。"
      + "可篩欄位：close pe forward_pe peg roe fcf market_cap eps_next_fy ttm_eps eps_surprise_fq "
      + "revenue_qoq revenue_yoy day week month year。",
    inputSchema: {
      type: "object",
      properties: {
        markets: { type: "string", description: "逗號分隔：taiwan,america,sp500,crypto（省略＝全部）" },
        filter: { type: "string", description: "條件式，如 pe<20,roe>20" },
        q: { type: "string", description: "名稱/代號關鍵字" },
        sort: { type: "string", description: "排序欄位（同可篩欄位）" },
        direction: { type: "string", description: "desc（預設）或 asc" },
        fields: { type: "string", description: "逗號分隔的欄位裁切，建議指定以節省 context" },
        limit: { type: "integer", description: "筆數上限，預設 50" },
      },
    },
  },
  {
    name: "ai_tam_ticker",
    description:
      "查單一標的在掃描器裡的 32 個指標（估值/獲利/成長/多週期報酬）。"
      + "代號可用 NVDA、NASDAQ:NVDA 或台股數字代號 2330。",
    inputSchema: {
      type: "object",
      properties: { symbol: { type: "string", description: "標的代號" } },
      required: ["symbol"],
    },
  },
  {
    name: "ai_tam_list_columns",
    description:
      "列出 ai-tam 所有專欄（40 個）:id、標題、掛在哪個 tab、用哪些 public/data 資料檔、資料多新。" +
      "不確定要用哪個專欄時先呼叫這支。可用 q 關鍵字搜尋、tab 反查、file 反查（哪些專欄在用某個資料檔）。",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "關鍵字（比對 id/label/title/subtitle）" },
        tab: { type: "string", description: "用 tab id 反查，如 commodities、etfLeaderboard" },
        file: { type: "string", description: "用資料檔名反查，如 theme_maps_latest" },
        limit: { type: "integer", description: "筆數上限" },
      },
    },
  },
  {
    name: "ai_tam_get_column",
    description:
      "取單一專欄的詳細資訊:manifest 宣告、每個資料檔的大小/更新時間/頂層欄位。" +
      "id 可以填專欄 id、資料夾名或 tab id（例如 financials 與 financialReports 都可以）。",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "專欄 id / 資料夾名 / tab id" } },
      required: ["id"],
    },
  },
  {
    name: "ai_tam_get_column_data",
    description:
      "取某專欄實際使用的資料檔內容。大檔請先用 shape=true 看結構,再用 path 下鑽、fields 裁切欄位、limit 限制筆數," +
      "避免把整份 JSON 灌進 context。",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "專欄 id / tab id" },
        file: { type: "string", description: "資料檔名（不含 .json），由 get_column 取得" },
        shape: { type: "boolean", description: "只回結構摘要" },
        path: { type: "string", description: "點號路徑下鑽，如 rows 或 columns.0" },
        fields: { type: "string", description: "逗號分隔的欄位裁切" },
        limit: { type: "integer", description: "陣列筆數上限" },
        max_bytes: { type: "integer", description: "回應截斷上限，預設 60000" },
      },
      required: ["id", "file"],
    },
  },
  {
    name: "ai_tam_list_datasets",
    description: "列出 public/data 底下所有 JSON 資料集（200+）與更新時間。專欄之外的原始資料用這支找。",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "檔名關鍵字" },
        limit: { type: "integer", description: "筆數上限" },
      },
    },
  },
  {
    name: "ai_tam_get_dataset",
    description: "取任一 public/data 資料集,支援 shape / path / fields / limit 漸進下鑽。",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "資料集名稱（不含 .json）" },
        shape: { type: "boolean", description: "只回結構摘要" },
        path: { type: "string", description: "點號路徑下鑽" },
        fields: { type: "string", description: "逗號分隔的欄位裁切" },
        limit: { type: "integer", description: "陣列筆數上限" },
        max_bytes: { type: "integer", description: "回應截斷上限，預設 60000" },
      },
      required: ["name"],
    },
  },
  {
    name: "ai_tam_api_get",
    description:
      "直接打任一個 /api/v1 端點（唯讀 GET）。專欄以外的既有端點如 /themes、/movers、/etf/00981A、" +
      "/top10/movers、/tw/big-shareholders、/macro/markets、/us/gainers 都從這裡呼叫;" +
      "先打 path='/' 可拿到完整端點目錄。",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "端點路徑，如 / 或 /movers 或 /etf/00981A/changes" },
        params: { type: "object", description: "查詢參數物件，如 {\"limit\": 10}" },
        max_bytes: { type: "integer", description: "回應截斷上限，預設 60000" },
      },
      required: ["path"],
    },
  },
  {
    name: "ai_tam_health",
    description: "檢查 API 是否可達與資料新鮮度。連不上時先跑這支,再檢查 tailscale status。",
    inputSchema: { type: "object", properties: {} },
  },
];

async function callTool(name, args = {}) {
  const maxBytes = Number.isFinite(args.max_bytes) ? args.max_bytes : DEFAULT_MAX_BYTES;
  switch (name) {
    case "ai_tam_scanner_overview":
      return apiGet("/scanner", {}, maxBytes);
    case "ai_tam_scan": {
      const params = {
        markets: args.markets, filter: args.filter, q: args.q,
        sort: args.sort, direction: args.direction, fields: args.fields, limit: args.limit,
      };
      // 單一 market 走 /scanner/{market}，多個或未指定走 /scanner/screen
      const markets = String(args.markets || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (markets.length === 1) {
        delete params.markets;
        return apiGet(`/scanner/${encodeURIComponent(markets[0])}`, params, maxBytes);
      }
      return apiGet("/scanner/screen", params, maxBytes);
    }
    case "ai_tam_ticker":
      return apiGet(`/scanner/tickers/${encodeURIComponent(args.symbol)}`, {}, maxBytes);
    case "ai_tam_list_columns":
      return apiGet("/columns", { q: args.q, tab: args.tab, file: args.file, limit: args.limit }, maxBytes);
    case "ai_tam_get_column":
      return apiGet(`/columns/${encodeURIComponent(args.id)}`, {}, maxBytes);
    case "ai_tam_get_column_data":
      return apiGet(
        `/columns/${encodeURIComponent(args.id)}/${encodeURIComponent(String(args.file).replace(/\.json$/, ""))}`,
        { shape: args.shape ? "1" : undefined, path: args.path, fields: args.fields, limit: args.limit },
        maxBytes
      );
    case "ai_tam_list_datasets":
      return apiGet("/datasets", { q: args.q, limit: args.limit }, maxBytes);
    case "ai_tam_get_dataset":
      return apiGet(
        `/datasets/${encodeURIComponent(String(args.name).replace(/\.json$/, ""))}`,
        { shape: args.shape ? "1" : undefined, path: args.path, fields: args.fields, limit: args.limit },
        maxBytes
      );
    case "ai_tam_api_get": {
      const pathname = String(args.path || "/").startsWith("/") ? String(args.path || "/") : `/${args.path}`;
      return apiGet(pathname === "/" ? "" : pathname, args.params || {}, maxBytes);
    }
    case "ai_tam_health":
      return apiGet("/health", {}, maxBytes);
    default:
      return { ok: false, text: `unknown_tool: ${name}` };
  }
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function respond(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function respondError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handleMessage(message) {
  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case "initialize": {
      const requested = params?.protocolVersion;
      respond(id, {
        protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "ai-tam", version: SERVER_VERSION },
        instructions:
          `ai-tam market-scan 唯讀資料 API（base: ${BASE}）。` +
          "選股/篩股用 ai_tam_scanner_overview → ai_tam_scan(filter=...) → ai_tam_ticker;" +
          "找專欄資料用 ai_tam_list_columns → ai_tam_get_column_data(大檔先 shape=true)。" +
          "僅限 Tailscale 直連。",
      });
      return;
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return;
    case "ping":
      if (!isNotification) respond(id, {});
      return;
    case "tools/list":
      respond(id, { tools: TOOLS });
      return;
    case "tools/call": {
      const toolName = params?.name;
      const known = TOOLS.some((tool) => tool.name === toolName);
      if (!known) {
        respondError(id, -32602, `unknown tool: ${toolName}`);
        return;
      }
      const result = await callTool(toolName, params?.arguments || {});
      respond(id, {
        content: [{ type: "text", text: result.text }],
        isError: !result.ok,
      });
      return;
    }
    case "resources/list":
      respond(id, { resources: [] });
      return;
    case "prompts/list":
      respond(id, { prompts: [] });
      return;
    default:
      if (!isNotification) respondError(id, -32601, `method not found: ${method}`);
  }
}

let buffer = "";
// stdin 關掉時可能還有 fetch 在飛(例如用管線餵訊息做測試)。
// 直接 exit 會把回應吃掉,所以等在途請求歸零再退出。
let inFlight = 0;
let stdinClosed = false;
function maybeExit() {
  if (stdinClosed && inFlight === 0) process.exit(0);
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let index;
  // 逐行處理:MCP stdio 傳輸是換行分隔的 JSON-RPC
  while ((index = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    inFlight += 1;
    handleMessage(message)
      .catch((error) => {
        if (message?.id !== undefined && message?.id !== null) {
          respondError(message.id, -32603, `internal error: ${error.message}`);
        }
      })
      .finally(() => {
        inFlight -= 1;
        maybeExit();
      });
  }
});
process.stdin.on("end", () => {
  stdinClosed = true;
  maybeExit();
});
