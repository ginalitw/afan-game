# 阿飯餵飯糰 探索地圖 原型（試玩版）

這是「阿飯餵飯糰」小遊戲的**原型試玩版**，僅供內部測試與討論使用。

* 本專案為獨立的倉庫，與 echigo.fans 網站及越後妻有地圖完全分開，互不影響。
* 頁面已加上 noindex，不會被搜尋引擎收錄。
* 建議以手機直向畫面（約 390×844）遊玩。

## 檔案結構

* `index.html`，`style.css`，`app.js`：遊戲主程式
* `sprites/`：飯糰，米粒，落葉等小圖示
* `assets/autumn/`：秋季背景與阿飯動作圖
* `assets/seasons/`：其他季節的參考場景圖

## 本機執行

在此資料夾執行 `python3 -m http.server`，再開啟 http://localhost:8000 即可。
