# ai-tam MCP server

把 market-scan 的 `/api/v1`（含新的**專欄端點**）包成 MCP tools，讓其他機器上的 Claude Code
不用背端點、也不用 curl，直接用工具呼叫拿 ai-tam 的專欄資料。

- **單檔、零相依**：只需要 Node 18+（用內建 fetch）。整支就是 `server.js`，scp 過去就能跑。
- **唯讀**：只發 GET，沒有任何寫入路徑。
- **自動截斷**：回應超過 `max_bytes`（預設 60000）會截斷並提示改用 `path` / `fields` / `limit` 下鑽，
  避免把幾 MB 的 `latest.json` 灌進 context。

## 前提：必須在 tailnet 上

API 只接受 Tailscale 網段（`100.64.0.0/10`）直連，判斷用 TCP 對端位址，偽造標頭無效。
走公網 `https://www.ai-tam.org/...` 一律 403 —— 這是刻意的，不要改用公網 base URL。

```bash
tailscale status            # 先確認本機在 tailnet
curl -s http://100.70.225.18:8504/market-scan/api/v1/health
```

目前在 tailnet 的機器：`ggmac-studio`(100.70.225.18，API 主機)、`spark-9fd5`(100.69.76.67)、`spark2`(100.125.21.71)。

## 安裝

### 本機（API 主機上）

```bash
claude mcp add ai-tam -- node ~/.claude/skills/ai-tam/mcp/server.js
```

### 其他機器（SSH / spark）

```bash
# 1) 把單檔複製過去
scp ~/.claude/skills/ai-tam/mcp/server.js <user>@<tailnet-ip>:~/ai-tam-mcp-server.js

# 2) 在那台機器上註冊
ssh <user>@<tailnet-ip>
claude mcp add ai-tam -- node ~/ai-tam-mcp-server.js
```

### 專案設定檔（team 共用）

`.mcp.json`：

```json
{
  "mcpServers": {
    "ai-tam": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/ai-tam/server.js"],
      "env": { "AI_TAM_BASE": "http://100.70.225.18:8504/market-scan/api/v1" }
    }
  }
}
```

## 環境變數

| 變數 | 預設 | 說明 |
|---|---|---|
| `AI_TAM_BASE` | `http://100.70.225.18:8504/market-scan/api/v1` | API base URL |
| `AI_TAM_MAX_BYTES` | `60000` | 單次回應截斷上限 |
| `AI_TAM_TIMEOUT_MS` | `15000` | 單次請求逾時 |

## 工具

| 工具 | 用途 |
|---|---|
| `ai_tam_scanner_overview` | 市場掃描器總覽：4 universe／692 檔／可篩欄位白名單與運算子 |
| `ai_tam_scan` | 條件篩股（可跨 universe）· `markets` `filter` `sort` `fields` `limit` |
| `ai_tam_ticker` | 單一標的 32 個指標（NVDA / NASDAQ:NVDA / 2330） |
| `ai_tam_list_columns` | 列出 40 個專欄：id、標題、tab、用哪些資料檔、資料多新。可 `q` 搜尋、`tab` 反查、`file` 反查 |
| `ai_tam_get_column` | 單一專欄詳情（資料檔大小／更新時間／頂層欄位）。id 可填專欄 id、資料夾名或 tab id |
| `ai_tam_get_column_data` | 取某專欄實際使用的資料檔，支援 `shape` / `path` / `fields` / `limit` |
| `ai_tam_list_datasets` | 列出 200+ 原始資料集 |
| `ai_tam_get_dataset` | 取任一資料集，同樣支援漸進下鑽 |
| `ai_tam_api_get` | 直接打任一 `/api/v1` 端點（`/themes`、`/movers`、`/etf/00981A`、`/tw/big-shareholders`…），`path="/"` 可拿端點目錄 |
| `ai_tam_health` | 存活與資料新鮮度 |

## 建議用法

**選股／篩股**

1. `ai_tam_scanner_overview` 拿到可篩欄位白名單（不要猜欄位名）
2. `ai_tam_scan`，例如 `markets="taiwan,america"`、`filter="revenue_yoy>30,peg>0,peg<1"`、`fields="name,label,peg,revenue_yoy"`
3. 看回應的 `notes`——負值陷阱（虧損股 PE/PEG 為負）會在這裡提醒
4. 要細節再 `ai_tam_ticker`

**找專欄資料**

1. `ai_tam_list_columns`（或帶 `q`）找到專欄
2. `ai_tam_get_column` 看它有哪些資料檔、更新到什麼時候
3. `ai_tam_get_column_data` 先 `shape=true`，再用 `path` / `fields` / `limit` 取需要的片段

## 手動測試

```bash
printf '%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{}}}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
 '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"ai_tam_health","arguments":{}}}' \
 | node server.js
```

## 疑難排解

| 症狀 | 原因與處置 |
|---|---|
| 所有工具回 `HTTP 403` | 這台機器不在 tailnet，或 base URL 用了 ai-tam.org。`tailscale status` 後改用 `100.x` 位址 |
| `request_failed ... fetch failed` | 8504 服務沒跑，或 tailnet 斷線。到 API 主機看 screen session `ai-tam-market-scan` |
| 回應被截斷 | 正常保護。用 `path` / `fields` / `limit` 縮小，或提高 `max_bytes` |
| `column_registry_missing` | API 主機上跑 `node scripts/generate_column_registry.js` |

## 相關

- REST API 文件：API 主機 repo 的 `market_scan_nextjs/docs/api/v1-public-rest-api.md`
- 專欄索引產生器：`market_scan_nextjs/scripts/generate_column_registry.js`（每日隨 `update_sidebar_columns.sh` 更新）
- skill 版（不裝 MCP、直接 curl）：`.claude/skills/ai-tam/`，另有 plugin marketplace `musicjazz5/ai-tam-skill`
