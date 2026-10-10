// 網站設定：從 Supabase 後台 → Project Settings → API 複製貼上。
// anon（publishable）key 本來就是公開用的，可以放在這裡；權限由資料庫的 RLS 規則控制。
// 絕對不要把 service_role（secret）key 放進任何網站檔案。
// 兩個值都空白時，公開網站會顯示「示範內容」，後台會顯示設定說明。
export default {
  supabaseUrl: "",
  supabaseAnonKey: ""
};
