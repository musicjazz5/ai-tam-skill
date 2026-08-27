---
name: ai-tam
description: 透過 market-scan REST API（Tailscale 內網 100.70.225.18:8504）取得最新市場掃描資料（8 大主題地圖、跨主題漲跌排行、個股定位、200+ 資料集），並串接後續的分析、社群貼文、YouTube 影片製作。當使用者提到 ai-tam、類股地圖 / AI 地圖 / aiGrowthMap、盤勢速查、主題題材版圖、要用 ai-tam 資料寫貼文或做影片，或在 spark-9fd5 / spark2 等 tailnet 機器上要抓 ai-tam 最新資訊時使用。
---

# ai-tam market-scan API

`aiGrowthMap`（AI 地圖）專欄與全部 `public/data` 資料集的唯讀 REST 介面。

**Base URL**：`http://100.70.225.18:8504/market-scan/api/v1`（ggmac-studio 的 tailnet 位址）

```bash
BASE=${AI_TAM_BASE:-http://100.70.225.18:8504/market-scan/api/v1}
```

⚠️ **僅限 Tailscale 網段直連**。2026-08-27 起 `/api/v1` 只接受來源 IP 在 `100.64.0.0/10`
的連線（判斷用 TCP 對端位址，偽造 `X-Forwarded-For` 無效）。
走公網 `https://www.ai-tam.org/...` 一律回 **403** —— 那條路徑經 Cloudflare → Django →
loopback，來源不是 tailnet。**不要**用 ai-tam.org 當 base URL。

目前在 tailnet 上的機器：`spark-9fd5`(100.69.76.67)、`spark2`(100.125.21.71)。
`vinson` 不在 tailnet，需先加入才能用。

連不上時先確認 `tailscale status`，再跑 `curl -s $BASE/health`。
先跑 `curl -s $BASE` 拿到即時的端點目錄，不要憑記憶猜端點。

## 端點

| 端點 | 用途 |
|------|------|
| `GET /` | 服務探索：端點目錄 + 資料更新時間 |
| `GET /health` | 存活 + `age_minutes`（資料新鮮度） |
| `GET /themes` | 8 個主題的摘要（分類數、標的數、漲跌家數） |
| `GET /themes/{id}` | 單一主題完整內容 · `?category=` `?fields=` `?limit=` |
| `GET /tickers/{symbol}` | 跨主題查一檔股票出現在哪些主題／分類、action、watch_reason、thesis_score |
| `GET /movers` | 跨主題漲跌排行 · `?theme=` `?direction=up\|down` `?limit=` `?min_abs_pct=` |
| `GET /datasets` | 200+ 資料集清單 · `?q=` 關鍵字篩選 |
| `GET /datasets/{name}` | 取資料集 · `?shape=1` `?path=` `?fields=` `?limit=` `?meta=1` |

主題 id：`aiTamWatchlist` `aiGrowth` `earlySignal` `serenity` `gooaye` `taiwanAi` `citriniKuppy` `nuclearUranium`

## 節省 context 的鐵則

部分資料集有數 MB，**絕對不要整包抓進 context**：

1. 先 `?shape=1` 看結構 → 再 `?path=` 下鑽 → 再 `?fields=` 裁欄位 → 再 `?limit=` 限筆數
2. 只要排行榜就用 `/movers`，不要自己抓 `/themes/{id}` 再排序
3. 只要一檔股票就用 `/tickers/{symbol}`，不要掃全主題
4. 大回應一律 `| jq` 或 `| head -c 2000` 之後再讀

```bash
BASE=${AI_TAM_BASE:-http://100.70.225.18:8504/market-scan/api/v1}
curl -s "$BASE/datasets/theme_stock_analysis_latest?shape=1"          # 先看結構
curl -s "$BASE/datasets/stock_metrics?path=sp500&fields=symbol,pe,revenue_yoy&limit=20"
```

倉庫內附 `scripts/ai-tam.sh` 是等價的薄包裝：`./ai-tam.sh movers limit=10`。

## 工作流程

### 1. 每日盤勢脈動
```bash
curl -s "$BASE/health"                        # 確認 age_minutes 夠新，過舊要在輸出標注
curl -s "$BASE/themes"                        # 哪些主題今天在動
curl -s "$BASE/movers?limit=15&min_abs_pct=3" # 漲跌兩端
```
輸出時務必附上 `generated_at`。資料若超過 24 小時（`age_minutes > 1440`）要明講「資料未更新」，不要當成即時報價呈現。

### 2. 個股深掘
```bash
curl -s "$BASE/tickers/NVDA"                                  # 主題定位 + 為何入選
curl -s "$BASE/datasets/stock_metrics?path=sp500" | jq '.data[] | select(.symbol=="SP:NVDA")'
```
每檔股票另有多角度 PDF：`https://www.ai-tam.org/market-scan/report_files/generated/theme-stock-<SYMBOL>-latest.pdf`（財務／技術／對手／供需）。

### 3. 社群貼文
用 `/themes/aiGrowth` 取分類骨架，套使用者偏好的 **cheat-sheet 格式**（依主題分類 + 條列代表股 + 當日漲跌）：

```
AI Compute：NVDA +7.3% / AMD -1.0% / ARM ...
Memory：MU ... / SNDK ... / INTC ...
```

```bash
curl -s "$BASE/themes/aiGrowth?fields=symbol,change_pct" | jq -r \
  '.categories[] | "\(.name)：" + ([.tickers[] | "\(.symbol) \(.change_pct)%"] | join(" / "))'
```
發文前一律先給使用者過目。**不要自行發布到任何社群平台**，除非使用者當次明確授權。

### 4. YouTube 影片製作
用上面的資料先擬腳本重點，再交棒給 spark2 GPU 影片工廠（`ai-tam-video` MCP，雙主播 安晴／若衡）：
`video_batch_requirements` → 使用者確認 → `create_video_batch` → `get_video_job` → `get_video_output_links`。
影片牽涉版權與發布，**建立任務前必須取得使用者明確確認**。

## 數字紀律

- 呈現任何財務指標前，數字要來自 API 回應本身，不得憑記憶估算。
- 無法從 API 核實的數字標注「未核實」，不要放進報告或貼文的主張裡。
- 期貨缺口只能期貨對期貨，不可拿 TXF 價格對 TAIEX 指數比較。

## 遠端機器安裝

把這個資料夾放到目標機器的 `~/.claude/skills/ai-tam/`。**該機器必須已加入 tailnet**
（`tailscale status` 看得到 ggmac-studio 100.70.225.18），否則所有端點都會 403：

```bash
scp -r .claude/skills/ai-tam grant@100.69.76.67:~/.claude/skills/
```

驗證：`curl -s http://100.70.225.18:8504/market-scan/api/v1/health`（必須在 tailnet 上）
