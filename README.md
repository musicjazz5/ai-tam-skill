# ai-tam-skill

Claude Code plugin marketplace for **AI-TAM market-scan**.

讓 tailnet 上的機器（spark-9fd5 / spark2 …）取得
[market-scan](https://www.ai-tam.org/market-scan?tab=aiGrowthMap) 的最新資料，
並接續做分析、社群貼文與影片腳本。

> **這是私有 marketplace。** API 只在 Tailscale 網段內可達，
> 裝在 tailnet 之外的機器上不會有作用。

API 為**唯讀**，且**僅限 Tailscale 網段直連**（`100.64.0.0/10`）。從公網 `ai-tam.org` 存取一律回 403。

---

## 安裝

```
/plugin marketplace add musicjazz5/ai-tam-skill
/plugin install ai-tam@ai-tam
```

安裝後即可用 `/ai-tam` 叫用。

驗證 API 可達：

```bash
curl -s http://100.70.225.18:8504/market-scan/api/v1/health
```

---

## 提供什麼

`/ai-tam` skill 編排以下端點，基底路徑 `http://100.70.225.18:8504/market-scan/api/v1`：

| 端點 | 用途 |
|------|------|
| `GET /` | 服務探索：端點目錄 |
| `GET /health` | 存活 + `age_minutes` 資料新鮮度 |
| `GET /themes` | 8 大主題地圖摘要 |
| `GET /themes/{id}` | 單一主題 · `category` `fields` `limit` |
| `GET /tickers/{symbol}` | 跨主題個股定位 |
| `GET /movers` | 跨主題漲跌排行 · `theme` `direction` `limit` `min_abs_pct` |
| `GET /datasets` | 200+ 資料集清單 · `q` |
| `GET /datasets/{name}` | 資料集下鑽 · `shape` `path` `fields` `limit` `meta` |

主題 id：`aiTamWatchlist` · `aiGrowth` · `earlySignal` · `serenity` · `gooaye` · `taiwanAi` · `citriniKuppy` · `nuclearUranium`

---

## 為什麼用 skill 而不是直接 curl

部分資料集有數 MB，整包讀進 context 會爆掉。skill 內建漸進式下鑽的紀律：

```
?shape=1  →  ?path=  →  ?fields=  →  ?limit=
```

以及三條工作流程（每日盤勢脈動、個股深掘、社群貼文），
和數字紀律（指標必須來自 API 回應，不得憑記憶估算；資料過舊要標注）。

範例 —— 產出依主題分類的 cheat-sheet 貼文骨架：

```bash
BASE=http://100.70.225.18:8504/market-scan/api/v1
curl -s "$BASE/themes/aiGrowth?fields=symbol,change_pct" | jq -r \
  '.categories[] | "\(.name)：" + ([.tickers[] | "\(.symbol) \(.change_pct)%"] | join(" / "))'
```

```
AI Compute：NVDA 7.42% / AMD -0.9% / ARM 5.02%
Memory：MU -1.04% / SNDK -1.31% / INTC 2.05% / WDC -3.6%
Networking：AVGO 2.86% / MRVL -0.86% / ANET -0.33% / ALAB 3.25%
```

---

## 結構

```
.claude-plugin/marketplace.json      ← marketplace 清單
plugins/ai-tam/
├── .claude-plugin/plugin.json       ← plugin 資訊
└── skills/ai-tam/
    ├── SKILL.md                     ← /ai-tam
    └── scripts/ai-tam.sh            ← 薄包裝：./ai-tam.sh movers limit=10
```

---

## 注意

- 資料僅供研究參考，**非投資建議**。
- skill 不會自行發布任何社群內容；貼文一律先給使用者過目。
- 影片製作需另接 `ai-tam-video` MCP，且建立任務前需明確確認。

## License

MIT
