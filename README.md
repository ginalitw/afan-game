# 阿飯餵飯糰 第四版原型

手繪橫向捲動散步地圖：阿飯沿著彎曲小路上下坡走，三段關卡（入村，棚田，遠山），霧會隨探索散開，抵達作品立牌玩 10 秒接稻穗小遊戲。

* `scroll/far.webp`，`mid.webp`，`near.webp`：由 s1／s2／s3 去背處理的三層視差圖
* `scroll/afan/`：阿飯走路與動作圖（背影，不露臉）
* 路徑座標寫在 `app.js` 的 `PATH_PTS`（原圖 4128x1024 座標）
* localStorage `afanV4Records` 只存 `{id,date,size,type}`
* 第三版保留在 `v3/`（僅本機）

## 第四版之一：互動小物

* `items/`：稻草人，麻雀，柿子枝，稻架，紅蜻蜓，貓咪，炊煙（由 Gemini 洋紅底圖切格去背，WebP）
* 稻穗叢沿用 `sprites/rice.png` 三根疊成一叢，亮點用程式畫
* 每樣小物每天第一次點擊送一顆小飯糰，存在 localStorage `afanV41PropBonus`，只存 `{p,d,n}`，和作品紀錄分開，不影響柵欄
* 支援減少動態設定
