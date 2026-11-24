# 微信读书 · 中键翻页

> 一个极简的 Edge 浏览器扩展：**在微信读书网页版，用鼠标中键单击翻到下一页。**
> 仅此而已。

[English](./README_EN.md) | 简体中文

---

## 这是什么 / What is this

一个 Manifest V3 的 Edge 扩展，只做一件事：

> 在 `weread.qq.com` 的阅读页，**鼠标中键单击 = 翻到下一页**。

没有设置面板，没有图标弹窗，没有翻页音效，没有自动阅读，没有划线增强。
装上即生效。

## 为什么不用现成的「微信读书助手」

市面上的微信读书扩展（如「微信读书助手」）功能繁多，但本项目只需要中键翻页。
更重要的是，主流脚本实现中键翻页的方式是**派发一个合成的 `ArrowRight` 键盘事件**：

```js
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ... }))
```

这类事件 `isTrusted === false`，并且绕开了微信读书自身「翻页 → 上报阅读位置 → 同步章节」
的完整链路，容易出现**翻页了但进度/章节不同步**的问题。

本扩展改为**点击页面上真实的「下一页」按钮**（`button.renderTarget_pager_button_right`），
走的是微信读书自己的 React `onClick` 全链路，与手动点击完全一致。

## 特性 / Features

- **点真实按钮翻页** — 与手动点击「下一页」等价，阅读位置与进度同步正常
- **正文白名单判定** — 只有点在正文阅读区才翻页，目录 / 笔记 / 划线工具栏等 UI 不受影响
- **不误伤输入框** — 在划线、想法的输入框里打字不会被翻页打断
- **不劫持链接** — 正文中链接的中键点击仍保留浏览器原生的「新标签页打开」
- **抗改版** — 按钮 class 找不到时自动退化到「最靠右的 pager 按钮」，不至于某天突然失效
- **拦截自动滚动** — 阻止 Chrome/Edge 中键在页面上的 autoscroll 行为
- **零权限、零网络请求** — 只申请 `weread.qq.com` 的内容脚本权限，不收集任何数据

## 安装 / Installation

### Edge（推荐）

1. 打开 `edge://extensions`
2. 打开左下角的 **「开发人员模式」**（Developer mode）
3. 点击 **「加载解压缩」**（Load unpacked）
4. 选择本仓库根目录（即包含 `manifest.json` 的那一层）
5. 完成。打开微信读书网页版，在正文里按下鼠标中键即可翻页

### Chrome / Chromium

步骤相同，地址为 `chrome://extensions`。

### 打包为 .zip 分发

```bash
cd weread-middle-click-extension
zip -r weread-middle-click-extension.zip manifest.json content.js
```

## 使用 / Usage

| 操作 | 行为 |
|---|---|
| 在正文上**中键单击** | 翻到下一页 |
| 在正文链接上中键单击 | 保持浏览器原生行为（新标签页打开） |
| 在划线/想法输入框中键 | 不翻页，不干扰输入 |
| 在目录/笔记面板中键 | 不翻页 |

翻到本章最后一页时，与手动点击完全一致：由微信读书自己决定是否进入下一章。

### 调试

插件在浏览器控制台输出调试日志（`[微信读书·中键翻页]` 前缀），
包含每次中键点击的判定结果与是否翻页的原因，便于排查。

## 兼容性 / Compatibility

- Edge / Chrome / Chromium 等 Manifest V3 浏览器
- 微信读书网页版**分页模式**（左右箭头翻页）
- 微信读书网页版**滚动模式**下无分页箭头，插件会自动退化到底部「下一章」按钮

## 已知问题 / Known issues

- 若微信读书大改 DOM 结构，可能需要更新 `content.js` 中的选择器常量
- 微信读书自身的**跨端进度同步**（在手机 App 读到较后章节后回到电脑端）可能造成位置跳变，
  这属于微信读书自身的行为，与本扩展无关

## 许可证 / License

[MIT](./LICENSE)

## 致谢 / Credits

- [mefengl/wereadhelper](https://github.com/mefengl/wereadhelper) — 中键翻页功能思路参考
- [EwenYoung/weread-plus](https://github.com/EwenYoung/weread-plus) — 微信读书 DOM 结构文档
