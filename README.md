# ai-tam-skill

Claude Code plugin marketplace for **AI-TAM market-scan**.

讓 tailnet 上的機器（spark-9fd5 / spark2 …）取得
[market-scan](https://www.ai-tam.org/market-scan?tab=aiGrowthMap) 的最新資料，
並接續做分析、社群貼文與影片腳本。

> ## ⚠️ 先決條件：必須在 Tailscale 網段內
>
> API 只接受來源 IP 在 `100.64.0.0/10` 的**直連**。
> **沒有加入這個 tailnet 的機器，裝了也完全用不了**（所有端點回 403）。
> repo 公開只是為了方便團隊安裝，不代表 API 對外開放。

API 為**唯讀**，且**僅限 Tailscale 網段直連**（`100.64.0.0/10`）。從公網 `ai-tam.org` 存取一律回 403。

---

## 安裝（團隊成員）

### 步驟 1：加入 tailnet

先請管理者發 Tailscale 邀請，裝好後確認看得到 API 主機：

```bash
tailscale status | grep ggmac-studio    # 應出現 100.70.225.18
```

### 步驟 2：裝 plugin

在 Claude Code 裡：

```
/plugin marketplace add musicjazz5/ai-tam-skill
/plugin install ai-tam@ai-tam
```

裝完重開 Claude Code，即可用 `/ai-tam`。

### 步驟 3：驗證

```bash
curl -s http://100.70.225.18:8504/market-scan/api/v1/health
# {"status":"ok","theme_map":{...}}
```

回 `403` = 你不在 tailnet；連線逾時 = API 主機沒開機。

---

## 疑難排解

**`marketplace add` 失敗 / 認證錯誤**
`owner/repo` 簡寫預設走 SSH。若你用 HTTPS 憑證（`gh auth login`），擇一：

```bash
gh auth setup-git                          # 讓 git 用 gh 的憑證
export CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1   # 或強制走 HTTPS
```

**背景更新後 marketplace 消失**
背景刷新會停用 credential helper。建議設：

```bash
export CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE=1
```

**不想裝 plugin，只要 skill**
直接複製也可以：

```bash
mkdir -p ~/.claude/skills/ai-tam/scripts
# 從本 repo 取 plugins/ai-tam/skills/ai-tam/ 底下兩個檔案放進去
chmod +x ~/.claude/skills/ai-tam/scripts/ai-tam.sh
```

**改用別的 API 主機位址**

```bash
export AI_TAM_BASE=http://<其他位址>:8504/market-scan/api/v1
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
