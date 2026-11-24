# 微信读书 · 中键翻页 / WeRead Middle-Click Page Turn

> 一个极简的 Edge 浏览器扩展：在微信读书网页版，用鼠标中键单击翻到下一页。
> A minimal Edge extension: click the middle mouse button to turn to the next page on WeRead (微信读书) web.

[中文详版](./README_ZH.md) | [English](./README_EN.md)

---

**核心特性 / Key feature**

翻页走「点击页面真实的下一页按钮」，而不是派发合成键盘事件 ——
走的是微信读书自身的 React onClick 全链路，阅读位置与进度同步正常。

Page turning clicks the **real "next page" button** on the page instead of dispatching
synthetic keyboard events, so it goes through WeRead's own React onClick pipeline and
reading position / progress stay in sync.

**安装 / Install**

1. 打开 `edge://extensions` → 开启「开发人员模式」
2. 点击「加载解压缩」→ 选择本仓库根目录
3. 完成

Go to `edge://extensions` → enable Developer mode → **Load unpacked** → select this repo root.

**测试 / Tests**

```bash
cd test
node run_test.js      # 判定逻辑单元测试（17 项）
node verify_edge.js   # 验证 Edge 能加载该扩展
node verify_inject.js # 验证 content script 在 weread.qq.com 注入
```

测试使用模拟微信读书 DOM 的测试台（`test/harness.html`）与 CDP 直连 Chromium，
无需安装任何依赖。

The tests run against a simulated WeRead DOM (`test/harness.html`) driving Chromium
over CDP — no dependencies required.

**许可证 / License**

MIT
