---
name: ai-tam
description: 透過 market-scan REST API（Tailscale 內網 100.70.225.18:8504）取得最新市場掃描資料（8 大主題地圖、跨主題漲跌排行、個股定位、台股主動式 ETF 持股/加減碼/估計成本、S&P500 市值 Top10 與多週期漲跌、台股大戶持股/籌碼集中度/三大法人/期貨情緒、國際總經風險狀態/資金流動性/量價廣度、200+ 資料集），並串接後續的分析、社群貼文、YouTube 影片製作。當使用者提到 ai-tam、類股地圖 / AI 地圖 / aiGrowthMap、盤勢速查、主題題材版圖、主動式 ETF / 00981A / 00881A 持股與加減碼、市值排行 / Top10 / 市值集中度、台股大戶 / 千張大戶 / 籌碼集中度 / 三大法人 / 外資期貨、總經 / 國際總經 / 流動性 / Fed / 套利交易 / 量價廣度、要用 ai-tam 資料寫貼文或做影片，或在 spark-9fd5 / spark2 等 tailnet 機器上要抓 ai-tam 最新資訊時使用。
---

# ai-tam market-scan API

`aiGrowthMap`（AI 地圖）、`etf`（台股主動式 ETF）、`top10`（S&P500 市值排行）、`twBigShareholder`（台股大戶籌碼）、`globalMacro`（國際總經）專欄與全部 `public/data` 資料集的唯讀 REST 介面。

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

### 台股主動式 ETF（tab=etf）

| 端點 | 用途 |
|------|------|
| `GET /etf` | 5 檔基金總覽 + 各自最新增減碼摘要 |
| `GET /etf/{fund}` | 單一基金最新持股（依權重排序）· `?limit=` `?fields=` |
| `GET /etf/{fund}/changes` | 最新一日增減碼（依金額變動排序）· `?type=加碼\|減碼\|剔除` `?limit=` |
| `GET /etf/{fund}/cost-basis` | 估計持有成本與距離現價 %· `?below=1`（只留套牢部位）`?limit=` |
| `GET /etf/{fund}/momentum` | 持股排名動能（週／月排名與權重變化）|
| `GET /etf/holders/{code}` | 反查某檔台股被哪些 ETF 持有 |
| `GET /etf/signals` | 跨基金同步買進／出貨機會 · `?fund=` `?trend=accumulating\|distributing` `?code=` `?min_score=` `?limit=` |

基金代號：`00403A` `00881A` `00981A` `00982A` `00991A`
（**`00403A` 沒有 cost-basis**，只有 4 檔主動 ETF 有）

`type` 的值是**加碼／減碼／剔除**，不是「增碼」。打錯會回 404 並附上該基金當日實際有的值。
`/etf/signals` 列表預設省略 `combined_series` / `per_fund` 逐日明細；要明細用 `?code=` 或 `?detail=1`。

### S&P500 市值 Top 10（tab=top10）

| 端點 | 用途 |
|------|------|
| `GET /top10` | 市值 Top10 排行 + 集中度（top10 / top5 佔比）· `?limit=` `?fields=` |
| `GET /top10/periods` | 3d/7d/14d/1m 四週期統計摘要，一眼比較短中期強弱 |
| `GET /top10/movers` | 單一週期漲跌榜 · `?period=3d\|7d\|14d\|1m`（預設 7d）`?list=gainers\|losers\|contributors\|detractors` `?limit=` |
| `GET /top10/growth` | 長期（730 天）市值成長榜 · `?list=risers\|droppers\|growth` `?limit=` |
| `GET /top10/global` | 全球市值 Top20（不限 S&P500）· `?sp500=0` 只留非成分股 |

`/top10/movers` 不帶 `?list=` 會一次回四張榜 + `sectors`，要省 context 就指定 `list`。
`/top10/global` 是**人工快照**，回應帶 `age_days` 與 `stale` 旗標；`stale:true`（>7 天）時
**必須在輸出標注資料日期**，不可當即時報價用。它的價值是補 S&P500 universe 看不到的
台積電 ADR、沙烏地阿美、三星、SK海力士等。

### 台股籌碼／大戶持股（tab=twBigShareholder）

| 端點 | 用途 |
|------|------|
| `GET /tw` | 四份資料各自的日期、筆數與方法論（**先看這支確認新鮮度**）|
| `GET /tw/big-shareholders` | 千張大戶比例排行 · `?sort=delta\|pct\|chg`（預設 delta）`?direction=asc` `?min_delta=` `?theme=` `?limit=` |
| `GET /tw/chip-concentration` | 籌碼集中度 · `?sort=delta\|chip\|foreign\|big` `?direction=` `?min_delta=` `?theme=` |
| `GET /tw/three-majors` | 三大法人買賣超 · `?list=foreign_buy\|foreign_sell\|trust_buy\|trust_sell\|total_buy\|total_sell` |
| `GET /tw/futures-sentiment` | 台指期籌碼 + Put/Call（大盤層級）· `?history=1` `?limit=` |
| `GET /tw/stocks/{code}` | 單一台股籌碼全貌（大戶＋集中度＋法人一次查）|

⚠️ **更新頻率不同,不可混用日期**：大戶比例與籌碼集中度是**週更**（大戶每週三公布），
三大法人與期貨是**日更**。`/tw/stocks/{code}` 三個區塊各自帶日期，引用時要標對。

`sort=delta` 是**本週變動**（`pct_gt1k_delta`），不是絕對比例；`direction=asc` 看的是減碼最多。
`min_delta` 比的是絕對值，所以 `min_delta=5` 會同時留下 +9.7 與 -7.7。

### 國際總經（tab=globalMacro）

| 端點 | 用途 |
|------|------|
| `GET /macro` | 風險狀態（score / regime）+ **五份資料各自的新鮮度**（先看這支）|
| `GET /macro/markets` | 全球市場表現 · `?list=markets\|global\|proxies\|regions` `?sort=1w\|1m\|3m\|6m` |
| `GET /macro/fred` | FRED 總經指標（利率／利差／OAS／VIX）· `?id=DGS10` |
| `GET /macro/flow` | 資金流動性 proxy（Fed 資產負債表／RRP／M2）· `?series=1` 附完整數列 |
| `GET /macro/timeline` | 跨資產轉折／異常／極值事件 · `?group=` `?type=` `?series=` `?limit=`（預設 30）|
| `GET /macro/carry-trade` | 日圓套利交易狀態 + 黃金/日圓矩陣 · `?detail=1` |
| `GET /macro/breadth` | 美股／台股量價廣度 · `?market=us\|taiwan` |
| `GET /macro/leverage` | 台日韓融資槓桿全景（**低頻,帶 `stale` 旗標**）|

⚠️ **這個專欄的五份資料更新頻率差距最大**：`macro` / `flow` / `breadth` 幾乎日更，
`timeline` 日更，但 `leverage` 是人工專題（曾落後 46 天）。`/macro` 會一次回全部
`age_days`，**引用前先看那支**。`stale:true` 一定要標注資料日期。

`/macro/fred` 每筆有 `risk_direction`（`higher_bad` / `higher_good`）——
解讀指標方向要照這個欄位，不要自己臆測「利率升＝好或壞」。
`/macro/timeline` 的 `failed` 欄位列出抓取失敗的序列（目前 `^JPN10Y`），
**不可把抓不到當成「這段期間沒事件」**。

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

### 4. 台股主動式 ETF 追蹤
```bash
curl -s "$BASE/etf"                                    # 5 檔基金今天各動了什麼
curl -s "$BASE/etf/00981A/changes?limit=10"            # 單一基金加減碼,依金額排序
curl -s "$BASE/etf/signals?trend=accumulating&limit=10" # 多檔 ETF 同步買進的標的
curl -s "$BASE/etf/holders/2330"                       # 台積電被哪幾檔 ETF 持有
```
`cost-basis` 是**回溯資料快照推估**（增持日收盤價中位數），**不是基金真實建倉成本** ——
引用時要照 `methodology` 欄位說明，不可直接講成「這檔 ETF 的成本是 X」。

### 5. 大型股／市值集中度
```bash
curl -s "$BASE/top10" | jq '.summary'                          # top10 佔全體市值幾成
curl -s "$BASE/top10/periods"                                  # 短中期哪個週期在轉強
curl -s "$BASE/top10/movers?period=7d&list=gainers&limit=10"   # 7D 漲幅榜
curl -s "$BASE/top10/growth?list=risers&limit=10"              # 兩年市值成長冠軍
curl -s "$BASE/top10/global?sp500=0"                           # 非 S&P500 的全球巨頭
```
`period_analyses` 的報酬率欄位是 `week_return_pct` / `one_month_return_pct` /
`three_day_return_pct` / `two_week_return_pct` —— 取哪個週期就讀對應欄位，不要混用。

### 6. 台股籌碼追蹤
```bash
curl -s "$BASE/tw"                                        # 先確認四份資料的日期
curl -s "$BASE/tw/big-shareholders?limit=10"              # 大戶加碼榜
curl -s "$BASE/tw/big-shareholders?direction=asc&limit=10" # 大戶減碼榜
curl -s "$BASE/tw/three-majors?list=foreign_buy&limit=10"  # 外資買超
curl -s "$BASE/tw/futures-sentiment" | jq '.insights'      # 期貨情緒判讀
curl -s "$BASE/tw/stocks/2330"                             # 單一個股籌碼全貌
```
大戶比例是**集保週統計**（每週三公布），與日更的法人資料日期會差幾天 ——
同一篇貼文若同時引用，必須分別標注日期，不可寫成同一天的事。

### 7. 總經環境判讀
```bash
curl -s "$BASE/macro" | jq '{risk_score, datasets}'        # 風險狀態 + 各資料新鮮度
curl -s "$BASE/macro/flow" | jq '.liquidity_proxy'         # 流動性是收緊還是寬鬆
curl -s "$BASE/macro/markets?list=regions"                 # 哪個區域在領漲
curl -s "$BASE/macro/breadth" | jq '.summary'              # 量價是否確認
curl -s "$BASE/macro/timeline?type=new_low&limit=10"       # 誰在創新低
curl -s "$BASE/macro/carry-trade" | jq '.carry_trade.regime'
```
寫總經段落的順序：**風險狀態 → 流動性 → 區域強弱 → 量價確認 → 個別事件**。
先講結論（`risk_score.regime`、`liquidity_proxy.interpretation`）再補證據，
不要把 12 個 FRED 指標全列出來。

### 8. YouTube 影片製作
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
