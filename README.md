# 魚魚出去玩 · Yuyu goes out

榆芳（魚魚）的旅行生活品牌網站：旅遊、美食、度假與日常。
魚魚可以用手機在後台發文、上傳照片，發布後網站立即更新。

- 公開網站：`index.html`、`posts.html`、`post.html`、`footprints.html`、`about.html`
- 手機後台：`admin/`
- 資料庫、登入、照片：Supabase（`supabase/migrations/`）

## 文件
| 文件 | 內容 |
| --- | --- |
| [docs/01-現況與改造方案.md](docs/01-現況與改造方案.md) | 為什麼選這個架構 |
| [docs/02-設計系統.md](docs/02-設計系統.md) | 色彩、字體、間距、元件、動態規則 |
| [docs/03-部署與維護.md](docs/03-部署與維護.md) | **第一次上線步驟**、環境設定、測試、維護 |
| [docs/04-魚魚使用說明.md](docs/04-魚魚使用說明.md) | 給魚魚的發文說明 |

## 快速開始
```bash
npm install
npm run dev            # http://127.0.0.1:5500 （未設定 Supabase 時顯示示範內容）
npx supabase start     # 本機資料庫（需要 Docker）
npm test               # 端對端測試
```

## 檔案結構
```
assets/
  css/site.css        設計系統與公開網站樣式
  css/admin.css       後台樣式
  js/config.js        ← 上線時填入 Supabase URL 與 anon key
  js/lib/             共用：資料存取、介面、文章排版、示範內容
  js/pages/           各公開頁面
  js/admin/           後台與照片壓縮上傳
supabase/migrations/  資料表、RLS、Storage 規則
tests/                Playwright 測試
```
