// 示範內容：只有在 config.js 尚未填入 Supabase 時才會顯示，畫面上會清楚標示「示範內容」。
// 照片來自 Unsplash（Unsplash License，可免費使用），連上資料庫後會換成魚魚自己的文章與照片。

const U = (id, w = 2000) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=72`;
const ph = (id, caption = "", w = 3, h = 2) => ({
  url: U(id, 2000), thumb: U(id, 800), w: 2000, h: Math.round(2000 * h / w), caption
});

export const DEMO_PROFILE = {
  nickname: "魚魚",
  full_name: "榆芳",
  tagline: "吃美食、看風景，收集世界的溫柔。",
  hero_note: "下一站，會是更遠的地方。",
  hero_image: { ...ph("1570077188670-e3a8d69ac5ff", "希臘・聖托里尼的黃昏"), credit: "Unsplash" },
  avatar: ph("1527631746610-bca00a040d60", "", 4, 5),
  intro: "大家好，我是魚魚！一個愛吃、愛玩、愛拍照的女生，夢想是環遊世界，用自己的雙腳走過每一個想去的地方。",
  bio: "白天是普通的上班族，存下來的假期和薪水，幾乎都換成了機票。\n\n我喜歡在陌生城市的早晨散步，找一間當地人才會去的早餐店；喜歡在旅館的窗邊發呆，看光線一點一點變化。拍照不是為了打卡，是為了記住那一刻的溫度。\n\n這個網站是我的旅行筆記本，也是寫給未來自己的信。",
  philosophy: "旅行不是逃避生活，而是讓生活更完整。",
  favorites: ["清晨的海", "在地早餐", "老街散步", "日落時分", "手沖咖啡", "底片相機"],
  socials: { instagram: "", facebook: "", threads: "", youtube: "", email: "" },
  wishlist: [
    { country_code: "IS", city: "雷克雅維克", note: "看一次真正的極光" },
    { country_code: "IT", city: "五漁村", note: "沿著海岸線健行" },
    { country_code: "NZ", city: "皇后鎮", note: "在南半球的星空下露營" },
    { country_code: "MV", city: "", note: "住一晚水上屋" },
    { country_code: "PE", city: "馬丘比丘", note: "爬上天空之城" }
  ]
};

const posts = [
  {
    id: "demo-santorini", category: "travel", featured: true, likes: 128,
    title: "希臘・聖托里尼｜藍白小鎮的浪漫，真的會讓人想再去一次",
    excerpt: "在伊亞的懸崖邊等一場日落，看整座小鎮從白色慢慢變成粉橘色。這篇整理了住宿、交通和拍照私房角度。",
    country_code: "GR", city: "聖托里尼", place: "伊亞 Oia", visited_on: "2025-09-15",
    photos: [
      ph("1533105079780-92b9be482077", "伊亞的藍頂教堂，早上七點前幾乎沒有人"),
      ph("1570077188670-e3a8d69ac5ff", "傍晚的懸崖步道，整座小鎮慢慢變成粉橘色"),
      ph("1530841377377-3ff06c0ca713", "從費拉往下看的愛琴海")
    ],
    body: "飛機降落在聖托里尼的那一刻，窗外的海藍到不真實。\n\n## 伊亞的日落\n\n大家都說伊亞的日落是世界最美之一，我原本有點懷疑，直到自己坐在城堡遺跡的石階上，看太陽一點一點沉進愛琴海。\n\n[照片 2]\n\n小提醒：日落前兩小時就要去卡位，帶一件薄外套，海風比想像中涼。\n\n## 藍頂教堂的拍照角度\n\n> 早上七點前的伊亞，是只屬於早起的人的。\n\n[照片 1]\n\n- 藍頂教堂：沿著主街往東走，在 Three Bells of Fira 附近\n- 風車：伊亞城堡往西 5 分鐘\n- 費拉往伊亞的健行步道：約 3 小時，景色一路都很美\n\n這是一個會讓人想再回來的地方。",
    details: {
      cost: { currency: "TWD", items: [
        { label: "台北—雅典來回機票", amount: 32000 },
        { label: "雅典—聖托里尼渡輪", amount: 3600 },
        { label: "伊亞洞穴屋 3 晚", amount: 21000 },
        { label: "餐飲與交通", amount: 8000 }
      ], note: "九月是旺季尾聲，住宿比七八月便宜約三成。" },
      itinerary: [
        { title: "Day 1", text: "抵達費拉，懸崖步道散步，晚餐吃海鮮" },
        { title: "Day 2", text: "費拉健行到伊亞，留在伊亞看日落" },
        { title: "Day 3", text: "黑沙灘、紅沙灘，傍晚搭船出海" }
      ],
      transport: "雅典 Piraeus 港搭高速渡輪約 5 小時；島上靠公車和 ATV，費拉是公車總站。"
    }
  },
  {
    id: "demo-taipei-steak", category: "food", featured: false, likes: 96,
    title: "台北｜必吃牛排推薦！這間真的超級好吃",
    excerpt: "炭烤的焦香加上恰到好處的五分熟，配一杯紅酒就是週五晚上最好的犒賞。",
    country_code: "TW", city: "台北", place: "大安區", visited_on: "2025-09-10",
    photos: [
      ph("1414235077428-338989a2e8c0", "主餐：炭烤肋眼，五分熟"),
      ph("1517248135467-4c7edcad34c4", "店內是低調的工業風"),
      ph("1504674900247-0877df9cc836", "前菜拼盤")
    ],
    body: "週五下班和朋友約吃飯，終於來到收藏很久的這間牛排館。\n\n[照片 1]\n\n## 主餐\n\n肋眼外層有漂亮的焦脆，切開是均勻的粉紅色。**醬汁一定要點黑胡椒**，但其實只灑海鹽就很好吃。\n\n[照片 3]\n\n前菜拼盤的份量很足，兩個人分剛好。整體 CP 值很高，會再訪！",
    details: {
      restaurant: { name: "示範牛排館", address: "台北市大安區", hours: "17:30–22:00（週一公休）", price: "每人約 1,500–2,000 元", tips: "週末建議提前一週訂位" }
    }
  },
  {
    id: "demo-cebu", category: "stay", featured: false, likes: 73,
    title: "宿霧 Cebu｜海景度假村，躺著發呆也太幸福了吧！",
    excerpt: "無邊際泳池正對著海，什麼都不做的假期，原來這麼療癒。",
    country_code: "PH", city: "宿霧", place: "麥克坦島", visited_on: "2025-08-27",
    photos: [
      ph("1540541338287-41700207dee6", "無邊際泳池"),
      ph("1512100356356-de1b84283e18", "跳島行程的小島")
    ],
    body: "這趟旅行的目標只有一個：什麼都不做。\n\n[照片 1]\n\n早上睡到自然醒，吃完早餐就在泳池邊看書，下午跳進海裡浮潛，傍晚喝一杯椰子水看夕陽。\n\n[照片 2]",
    details: { transport: "宿霧機場到麥克坦島度假村車程約 20 分鐘，可請飯店接送。" }
  },
  {
    id: "demo-kyoto", category: "travel", featured: false, likes: 101,
    title: "日本・京都｜穿和服散步清水寺，傍晚的八坂塔超級美",
    excerpt: "租一套和服，從二年坂走到八坂之塔，石板路上的每一步都像在拍電影。",
    country_code: "JP", city: "京都", place: "東山區", visited_on: "2025-08-20",
    photos: [
      ph("1493976040374-85c8e12f0c0e", "傍晚的八坂之塔"),
      ph("1480796927426-f609979314bd", "二年坂的老店")
    ],
    body: "京都是我去最多次的城市，每次都有新發現。\n\n[照片 1]\n\n## 和服體驗\n\n和服店就在清水寺附近，挑衣服、綁腰帶加髮型大約一小時。建議選早上的時段，下午人會很多。\n\n[照片 2]",
    details: {
      itinerary: [
        { title: "上午", text: "和服店著裝 → 清水寺" },
        { title: "下午", text: "二年坂、三年坂 → 八坂神社" },
        { title: "傍晚", text: "八坂之塔拍照 → 祇園晚餐" }
      ]
    }
  },
  {
    id: "demo-cafe", category: "life", featured: false, likes: 58,
    title: "生活｜我的週末咖啡廳清單，適合一個人放空",
    excerpt: "不出國的週末，就在城市裡找一間安靜的咖啡廳，寫寫字、整理照片。",
    country_code: "TW", city: "台北", place: "", visited_on: "2025-08-02",
    photos: [
      ph("1495474472287-4d71bcdd2085", "拿鐵拉花"),
      ph("1554118811-1e0d58224f24", "靠窗的位子")
    ],
    body: "旅行之外的日子，我也很喜歡好好生活。\n\n[照片 1]\n\n- 適合工作：插座多、不限時\n- 適合發呆：有大窗戶、採光好\n- 適合聊天：甜點好吃、位子寬敞\n\n[照片 2]",
    details: {}
  },
  {
    id: "demo-bali", category: "travel", featured: false, likes: 64,
    title: "峇里島｜烏布森林與水神廟，慢下來的一天",
    excerpt: "清晨的布拉坦湖起了一層薄霧，水神廟像漂浮在湖面上。",
    country_code: "ID", city: "峇里島", place: "烏布", visited_on: "2025-06-03",
    photos: [
      ph("1537996194471-e657df975ab4", "布拉坦湖上的水神廟"),
      ph("1559339352-11d035aa65de", "海邊的早午餐")
    ],
    body: "包了一台車，從烏布出發往北走。\n\n[照片 1]\n\n[照片 2]",
    details: { transport: "島上建議包車，一天約 1,500 元台幣，司機也會兼導遊。" }
  },
  {
    id: "demo-tokyo", category: "food", featured: false, likes: 47,
    title: "東京｜深夜的新宿，一碗拉麵的溫度",
    excerpt: "霓虹燈下排隊四十分鐘，換來一碗濃郁的豚骨拉麵，值得。",
    country_code: "JP", city: "東京", place: "新宿", visited_on: "2025-03-08",
    photos: [
      ph("1542051841857-5f90071e7989", "新宿的夜晚"),
      ph("1478145046317-39f10e56b5e9", "拉麵")
    ],
    body: "[照片 1]\n\n東京的夜晚好像永遠不會結束。\n\n[照片 2]",
    details: { restaurant: { name: "示範拉麵店", address: "東京都新宿區", hours: "11:00–翌日 02:00", price: "約 1,100 日圓" } }
  },
  {
    id: "demo-paris", category: "travel", featured: false, likes: 88,
    title: "法國・巴黎｜塞納河畔的黃昏散步",
    excerpt: "從亞歷山大三世橋一路走到艾菲爾鐵塔，傍晚的光把整座城市染成金色。",
    country_code: "FR", city: "巴黎", place: "第七區", visited_on: "2024-10-12",
    photos: [
      ph("1499856871958-5b9627545d1a", "亞歷山大三世橋"),
      ph("1502602898657-3e91760cbb34", "艾菲爾鐵塔")
    ],
    body: "[照片 1]\n\n巴黎最美的時刻，是黃昏。\n\n[照片 2]",
    details: {}
  }
].map(p => ({ ...p, status: "published", cover: p.photos[0], published_at: p.visited_on + "T12:00:00Z" }));

export const DEMO_POSTS = posts;
