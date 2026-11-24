/**
 * 微信读书 · 中键翻页
 * ------------------------------------------------------------------
 * 唯一职责：在微信读书网页版的阅读页，鼠标中键单击 = 翻到下一页。
 *
 * 设计原则：
 *  1. 只在「正文阅读区」生效，不碰目录、笔记、划线工具栏等 UI。
 *  2. 翻页走「点击页面真实的下一页按钮」，而不是派发合成键盘事件 ——
 *     这样走的是微信读书自身的 React onClick 全链路，
 *     阅读位置、章节定位、进度上报都和手动点完全一致。
 *  3. 按钮在每次点击时重新解析，避免 SPA 重渲染后拿到失效节点。
 */

(() => {
  'use strict';

  // 打开控制台可看到每次翻页的判定过程，便于排查。
  const DEBUG = true;
  const log = (...args) => DEBUG && console.debug('[微信读书·中键翻页]', ...args);

  /* ------------------------------------------------------------------ *
   * 一、正文阅读区（白名单）
   *    只有命中这些容器，才认为「点在正文上」。
   *    采用白名单而非黑名单：微信读书改版时黑名单容易漏掉新 UI，
   *    白名单则天然不会误伤。
   * ------------------------------------------------------------------ */
  const BODY_SELECTORS = [
    '.readerChapterContent',   // 章节文字区域
    '.readerChapter_content',  // 章节内容（部分版本下划线命名）
    '.renderTargetContainer',  // 文字渲染容器
    '.renderTargetContent',    // 文字渲染容器
    '.wr_canvasContainer',     // Canvas 文字渲染区域（宽屏/高性能模式）
    '.preRenderContainer',      // 预渲染内容区域
    '#preRenderContainer',
    '#preRenderContent',
  ];

  /* 广义阅读区：用于覆盖正文周边的空白留白（点到空白处也算在正文） */
  const BROAD_BODY_SELECTORS = ['.readerContent'];

  /* UI 区域（从广义阅读区里排除） */
  const UI_SELECTORS = [
    '.readerTopBar',
    '.readerBottomBar',
    '.readerControls',
    '.readerCatalog',          // 目录面板
    '.readerNotePanel',        // 笔记面板
    '.readerAIChatPanel',      // AI 问书面板
    '.readerReviewDetailPanel',
    '.reader_toolbar_container', // 划线工具栏
    '.font-panel-content',     // 字体设置面板
    '.reviews_panel',          // 想法面板
    '.reader_pdf_tool',
    '.readerFooter_button',    // 底部「下一章」按钮
  ];

  /* ------------------------------------------------------------------ *
   * 二、下一页按钮解析
   *    分三层，逐层退化，保证微信读书改版后仍能工作：
   *      1) 精确 class 命中
   *      2) 语义 class 命中（含 pager / paging / page 等关键词）
   *      3) 几何兜底：在阅读区右侧找一个「半透明竖条状的可点击元素」
   * ------------------------------------------------------------------ */
  const NEXT_BTN_SELECTORS = [
    'button.renderTarget_pager_button_right',
    '.renderTarget_pager_button_right',
    '[class*="pager_button_right"]',
    '[class*="paging_button_right"]',
    '[class*="page_button_right"]',
    '[class*="pager_next"]',
    '[class*="paging_next"]',
    '[class*="btn_next"]',
    '[class*="next_page"]',
    '[class*="nextPage"]',
  ];

  /**
   * 语义候选：class 名里带翻页相关关键词的元素。
   * 不写死具体类名，避免微信读书改名后彻底失效。
   */
  const SEMANTIC_KEYWORDS = /(pager|paging|page_?turn|turn_?page|next_?page|page_?next|btn_?next|next_?btn)/i;

  /** 候选元素：class 含翻页语义关键词 */
  function collectSemanticCandidates() {
    const out = [];
    const all = document.querySelectorAll('[class]');
    for (const el of all) {
      const cls = typeof el.className === 'string' ? el.className : '';
      if (!cls) continue;
      if (!SEMANTIC_KEYWORDS.test(cls)) continue;
      // 排除容器类（pager / paging_container 之类），只保留按钮类
      if (/(container|wrapper|panel|group|list|body|content|root)/i.test(cls)) continue;
      out.push(el);
    }
    return out;
  }

  /** 元素当前是否可见且可交互 */
  function isUsable(el) {
    if (!el || !el.isConnected) return false;
    if (el.disabled) return false;
    if (el.getAttribute('aria-disabled') === 'true') return false;
    const st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    // getClientRects 为空说明没有布局盒子（display:none / 已移除）
    return el.getClientRects().length > 0;
  }

  /** 取水平位置最靠右的元素（下一页箭头在右，上一页箭头在左） */
  function pickRightmost(list) {
    if (list.length === 0) return null;
    // 按 left 升序排列，末尾即最靠右
    const sorted = list.slice().sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return ra.left - rb.left;
    });
    return sorted[sorted.length - 1];
  }

  /**
   * 几何合理性校验：翻页箭头应位于阅读区（或视口）的右侧区域。
   * 用于过滤掉那些 class 名碰巧含 page/paging 关键词、但其实不是翻页箭头的元素
   * （例如「第 3 页」页码标签、pageHeader 等）。
   */
  function isRightSideCandidate(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    // 以阅读区为基准；阅读区找不到时退化为视口
    const anchor =
      document.querySelector('.readerContent, .renderTargetContainer, .readerChapterContent') ||
      document.documentElement;
    const aRect = anchor.getBoundingClientRect();
    const base = aRect.width > 0 ? aRect : { left: 0, right: window.innerWidth };
    // 元素中心应落在锚点右半部分
    const center = rect.left + rect.width / 2;
    return center > (base.left + base.right) / 2;
  }

  /** 从候选列表中挑出「下一页」按钮 */
  function resolveNextButton() {
    // 第 1 层：精确选择器
    for (const sel of NEXT_BTN_SELECTORS) {
      const hit = [...document.querySelectorAll(sel)].find(isUsable);
      if (hit) return hit;
    }

    // 第 2 层：语义 class —— 挑最靠右的那个
    const semantic = collectSemanticCandidates().filter(isUsable);
    if (semantic.length > 0) {
      const rightSide = semantic.filter(isRightSideCandidate);
      // 优先在右侧子集中挑最靠右的；右侧无解时退回全部候选
      const pool = rightSide.length > 0 ? rightSide : semantic;
      return pickRightmost(pool);
    }

    // 第 3 层：部分版本把「下一章」放在底部
    const footer = [...document.querySelectorAll('.readerFooter_button')].filter(isUsable);
    if (footer.length === 1) return footer[0];

    return null;
  }

  /* ------------------------------------------------------------------ *
   * 三、区域判定
   * ------------------------------------------------------------------ */
  const isInside = (el, selectors) =>
    !!el && selectors.some((sel) => el.closest(sel) !== null);

  /** 是否处于编辑类元素内（划线/想法输入框） */
  function isEditable(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (el.isContentEditable) return true;
    return isInside(el, ['[contenteditable="true"]', '[contenteditable=""]']);
  }

  /** 是否在链接上 */
  function isLink(el) {
    return !!el && !!el.closest('a[href]');
  }

  /** 是否在翻页按钮上（点到箭头上也算翻页） */
  function isPagerButton(el) {
    if (!el) return false;
    if (el.closest(NEXT_BTN_SELECTORS.join(','))) return true;
    const cls = typeof el.className === 'string' ? el.className : '';
    return !!cls && SEMANTIC_KEYWORDS.test(cls);
  }

  /** 判定这次中键点击是否应该翻页 */
  function shouldFlip(target) {
    // 1) 落在链接上：完全不动，保留浏览器「中键新标签页打开链接」的原生行为
    if (isLink(target)) return { flip: false, reason: '链接上，保留原生行为' };

    // 2) 落在输入框 / 划线输入区：不翻页（只阻止浏览器的粘贴等默认行为）
    if (isEditable(target)) return { flip: false, reason: '输入框内' };

    // 3) 落在 UI 面板上：不翻页
    if (isInside(target, UI_SELECTORS)) return { flip: false, reason: 'UI 面板上' };

    // 4) 命中正文白名单：翻页
    if (isInside(target, BODY_SELECTORS)) return { flip: true, reason: '正文区' };

    // 5) 落在广义阅读区的空白处（排除 UI）：翻页
    if (isInside(target, BROAD_BODY_SELECTORS)) return { flip: true, reason: '阅读区留白' };

    // 6) 落在翻页箭头上：翻页
    if (isPagerButton(target)) return { flip: true, reason: '翻页箭头' };

    return { flip: false, reason: '不在阅读区' };
  }

  /* ------------------------------------------------------------------ *
   * 四、是否处于阅读页
   * ------------------------------------------------------------------ */
  function isReaderPage() {
    if (location.pathname.indexOf('/web/reader') !== -1) return true;
    return !!document.querySelector('.readerContent, .renderTargetContainer, .readerChapterContent');
  }

  /* ------------------------------------------------------------------ *
   * 五、翻页
   * ------------------------------------------------------------------ */
  const COOLDOWN_MS = 200; // 两次翻页最小间隔，防止抖动 / 双击
  let lastFlipAt = 0;
  let flipTimer = null;

  function flipToNextPage() {
    const now = Date.now();
    if (now - lastFlipAt < COOLDOWN_MS) {
      log('冷却中，忽略本次点击');
      return;
    }

    const btn = resolveNextButton();
    if (!btn) {
      log('未找到下一页按钮，忽略');
      return;
    }

    lastFlipAt = now;

    // 使用真实 click()，让微信读书走自己的 React onClick 链路，
    // 与手动点击完全一致（阅读位置与进度同步依赖这条链路）。
    btn.click();

    log('已翻页 ->', btn.className || btn.tagName);

    // 翻页动画期间锁定，避免连点导致跳页
    if (flipTimer) clearTimeout(flipTimer);
    flipTimer = setTimeout(() => { flipTimer = null; }, COOLDOWN_MS);
  }

  /* ------------------------------------------------------------------ *
   * 六、事件绑定
   * ------------------------------------------------------------------ */
  document.addEventListener(
    'mousedown',
    (event) => {
      // 中键
      if (event.button !== 1) return;
      if (!isReaderPage()) return;

      const target = event.target;
      const verdict = shouldFlip(target);

      if (!verdict.flip) {
        // 编辑框内仍然屏蔽浏览器默认的中键粘贴等行为，其余情况一概不干预
        if (isEditable(target)) event.preventDefault();
        log('不翻页：' + verdict.reason);
        return;
      }

      // 阻止 Chrome/Edge 的自动滚动（autoscroll）与中键粘贴等默认行为
      event.preventDefault();
      flipToNextPage();
    },
    true // 捕获阶段，先于页面自身监听器
  );

  // 屏蔽中键在阅读区产生的默认行为（autoscroll）
  document.addEventListener(
    'auxclick',
    (event) => {
      if (event.button !== 1) return;
      if (!isReaderPage()) return;
      if (isLink(event.target)) return; // 链接保持原生
      event.preventDefault();
    },
    true
  );

  log('已加载（Manifest V3）');
})();
