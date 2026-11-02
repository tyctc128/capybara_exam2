# 卡皮九九樂園

一款適合 PC 與 iPad 的純 Web 九九乘法打卡皮巴拉遊戲。

## 遊戲規則

- 80 秒內答對 10 題即可過關。
- 點擊拿著正確答案的卡皮巴拉得 1 分。
- 答錯扣 1 顆愛心，每局共有 5 顆愛心。
- 遊戲分成三個速度階段，後段會同時出現更多卡皮巴拉。

## 本機執行

這是無建置步驟的靜態網站，可使用任意靜態伺服器：

```powershell
python -m http.server 8000
```

瀏覽器開啟 `http://127.0.0.1:8000/`。

## GitHub Pages

將整個專案推送至 GitHub，在 Repository Settings → Pages 中選擇由分支部署，來源設為 `main` 與根目錄 `/` 即可。

## 技術

- 純 HTML / CSS / JavaScript
- Pointer Events 同時支援滑鼠與觸控
- `localStorage` 保存最佳成績與音效設定
- 所有圖片均為專案本地資源，不依賴外部服務
