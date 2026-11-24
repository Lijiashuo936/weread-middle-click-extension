// 微信读书·中键翻页 —— 判定逻辑自动化测试
// 用 CDP 直接驱动 Chromium，无需安装 playwright
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

const CHROME = 'C:/Users/21964/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const PORT = 9333;
const PAGE = 'file:///' + path.join(__dirname, 'harness.html').replace(/\\/g,'/');

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function getJSON(url){
  return new Promise((res,rej)=>{
    http.get(url, r=>{ let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ try{res(JSON.parse(d))}catch(e){rej(e)} }); }).on('error',rej);
  });
}
async function waitFor(fn, timeout=20000, step=300){
  const t0=Date.now();
  while(Date.now()-t0<timeout){
    try{ const v=await fn(); if(v) return v; }catch(e){}
    await sleep(step);
  }
  throw new Error('timeout waiting');
}

(async ()=>{
  const userDir = path.join(process.env.TEMP||'.', 'wr-test-profile-'+Date.now());
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--remote-debugging-port='+PORT, '--user-data-dir='+userDir,
    '--window-size=1400,1000', 'about:blank'
  ], { stdio:'ignore' });

  const cleanup = ()=>{ try{chrome.kill('SIGKILL')}catch(e){} };
  process.on('exit', cleanup);

  const targets = await waitFor(()=>getJSON(`http://127.0.0.1:${PORT}/json/version`));
  // Node 22 内置全局 WebSocket，无需 ws 依赖
  const sock = new WebSocket(targets.webSocketDebuggerUrl);
  let id=0; const pending=new Map(); const events=[];
  await new Promise((r,j)=>{ sock.onopen=r; sock.onerror=j; });
  sock.onmessage = (m)=>{
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)){ pending.get(msg.id)(msg); pending.delete(msg.id); }
    else events.push(msg);
  };
  const send = (method, params={}, sessionId)=> new Promise(r=>{
    const mid=++id; pending.set(mid,r);
    sock.send(JSON.stringify({id:mid, method, params, sessionId}));
  });

  // 新建 target 并 attach
  const t = await send('Target.createTarget', { url: PAGE });
  const at = await send('Target.attachToTarget', { targetId: t.result.targetId, flatten: true });
  const sid = at.result.sessionId;

  const evalJS = async (expr)=>{
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid);
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result.result.value;
  };

  await send('Page.enable', {}, sid);
  await send('Runtime.enable', {}, sid);
  // 必须等页面真正导航到 harness.html（about:blank 的 readyState 也是 complete）
  await waitFor(async()=> {
    const st = await evalJS('location.href + "|" + document.readyState');
    return String(st).indexOf('harness.html') !== -1 && String(st).endsWith('|complete');
  }, 20000);

  // 注入 content.js（模拟扩展 content script 环境）
  const code = fs.readFileSync(path.join(__dirname,'content.js'),'utf8');
  const inj = await send('Runtime.evaluate', { expression: code + '\n//# sourceURL=content.js', returnByValue:true }, sid);
  if (inj.result && inj.result.exceptionDetails) {
    console.log('❌ content.js 注入抛异常:');
    console.log(JSON.stringify(inj.result.exceptionDetails, null, 2));
    cleanup(); process.exit(1);
  }
  console.log('✅ content.js 注入成功，无异常');

  // 等待页面就绪
  await sleep(500);

  // ---- 测试用例 ----
  const cases = [
    { name:'正文段落（应翻页）',      sel:'#readerChapterContent p', expect:'flip' },
    { name:'正文留白处（应翻页）',    sel:'#readerChapterContent .box.ok', expect:'flip' },
    { name:'Canvas 渲染区（应翻页）', sel:'#canvasBox', expect:'flip' },
    { name:'正文链接（不应翻页）',    sel:'#aLink', expect:'noflip' },
    { name:'输入框（不应翻页）',      sel:'#inp', expect:'noflip' },
    { name:'多行输入框（不应翻页）',  sel:'#ta', expect:'noflip' },
    { name:'contenteditable（不应翻页）', sel:'#ce', expect:'noflip' },
    { name:'顶部栏（不应翻页）',      sel:'#uiTop', expect:'noflip' },
    { name:'底部栏（不应翻页）',      sel:'#uiBottom', expect:'noflip' },
    { name:'控制栏（不应翻页）',      sel:'#uiCtrl', expect:'noflip' },
    { name:'目录面板（不应翻页）',    sel:'#uiCatalog', expect:'noflip' },
    { name:'划线工具栏（不应翻页）',  sel:'#uiToolbar', expect:'noflip' },
    { name:'阅读区外元素（不应翻页）',sel:'#outside', expect:'noflip' },
  ];

  // 中键点击：dispatch 原生 MouseEvent(button=1)，等价于真实中键
  const middleClick = (sel)=> evalJS(`(()=>{
    const el = document.querySelector(${JSON.stringify(sel)});
    if(!el) return 'NO_ELEMENT';
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width/2, cy = r.top + r.height/2;
    const opt = { bubbles:true, cancelable:true, composed:true, view:window,
                  clientX:cx, clientY:cy, button:1, buttons:1, detail:1 };
    el.dispatchEvent(new MouseEvent('mousedown', opt));
    el.dispatchEvent(new MouseEvent('mouseup',   {...opt, buttons:0}));
    el.dispatchEvent(new MouseEvent('auxclick', {...opt, buttons:0}));
    return 'OK';
  })()`);

  let pass=0, fail=0;
  console.log('\n=== 判定逻辑测试 ===');

  for (const c of cases){
    // 每个用例前真正重置内部计数（不是只改显示文本）
    await evalJS(`window.__resetFlip();`);
    const before = await evalJS(`document.getElementById('count').textContent`);
    const r = await middleClick(c.sel);
    await sleep(260); // 超过 200ms 冷却
    const after = await evalJS(`document.getElementById('count').textContent`);
    const flipped = (after !== before);
    const ok = (c.expect==='flip') ? flipped : !flipped;
    if(ok){ pass++; console.log(`  ✅ ${c.name} — ${flipped?'已翻页':'未翻页'}`); }
    else { fail++; console.log(`  ❌ ${c.name} — 期望${c.expect==='flip'?'翻页':'不翻页'}，实际${flipped?'翻页':'未翻页'}`); }
  }

  // ---- 连点防抖测试 ----
  console.log('\n=== 防抖测试（快速连点 5 次，期望翻页 1 次） ===');
  await evalJS(`window.__resetFlip();`);
  await evalJS(`(()=>{const el=document.querySelector('#readerChapterContent p');
    for(let i=0;i<5;i++){ el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:1,buttons:1})); } })()`);
  await sleep(400);
  const dbgCount = await evalJS(`document.getElementById('count').textContent`);
  const dbgOk = parseInt(dbgCount) === 1;
  if(dbgOk){ pass++; console.log(`  ✅ 5 次连点只翻 ${dbgCount} 页（防抖生效）`); }
  else { fail++; console.log(`  ❌ 5 次连点翻了 ${dbgCount} 页，期望 1 页`); }

  // ---- 冷却后正常翻页 ----
  console.log('\n=== 冷却结束后恢复翻页 ===');
  await evalJS(`window.__resetFlip();`);
  await evalJS(`document.querySelector('#readerChapterContent p').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:1,buttons:1}))`);
  await sleep(300);
  await evalJS(`document.querySelector('#readerChapterContent p').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:1,buttons:1}))`);
  await sleep(300);
  const seq = await evalJS(`document.getElementById('count').textContent`);
  const seqOk = parseInt(seq) === 2;
  if(seqOk){ pass++; console.log(`  ✅ 间隔点击 2 次翻 ${seq} 页（正常）`); }
  else { fail++; console.log(`  ❌ 间隔点击翻了 ${seq} 页，期望 2 页`); }

  // ---- 抗改版：按钮类名变化后退化逻辑 ----
  console.log('\n=== 抗改版测试（模拟微信读书改了 class） ===');
  await evalJS(`(()=>{
    const b = document.getElementById('pagerRight');
    b.className = 'pager wr_newPagingButton_next';  // 模拟类名全变
    document.getElementById('pagerLeft').className = 'pager wr_newPagingButton_prev';
  })()`);
  await evalJS(`window.__resetFlip();`);
  await evalJS(`document.querySelector('#readerChapterContent p').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:1,buttons:1}))`);
  await sleep(300);
  const fallbackCount = await evalJS(`document.getElementById('count').textContent`);
  const fbOk = parseInt(fallbackCount) === 1;
  if(fbOk){ pass++; console.log(`  ✅ class 全变后仍能翻页（退化到最靠右 pager 按钮）`); }
  else { fail++; console.log(`  ❌ class 全变后翻页失败（翻了 ${fallbackCount} 页）`); }
  // 还原
  await evalJS(`(()=>{
    document.getElementById('pagerRight').className = 'pager renderTarget_pager_button renderTarget_pager_button_right';
    document.getElementById('pagerLeft').className = 'pager renderTarget_pager_button';
  })()`);

  // ---- 验证退化时选中的是「右」按钮而非「左」按钮 ----
  console.log('\n=== 退化方案方向正确性 ===');
  await evalJS(`(()=>{
    const b = document.getElementById('pagerRight');
    b.className = 'pager wr_newPagingButton_next';
    document.getElementById('pagerLeft').className = 'pager wr_newPagingButton_prev';
  })()`);
  // 给左按钮加一个标记，若插件误选左按钮，计数不会变而 leftClicked 会变
  await evalJS(`window.__leftClicked=0; document.getElementById('pagerLeft').addEventListener('click',()=>window.__leftClicked++);`);
  await evalJS(`window.__resetFlip();`);
  await evalJS(`document.querySelector('#readerChapterContent p').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:1,buttons:1}))`);
  await sleep(300);
  const leftClicked = await evalJS(`window.__leftClicked`);
  const dirOk = parseInt(leftClicked) === 0 && parseInt(await evalJS(`document.getElementById('count').textContent`)) === 1;
  if(dirOk){ pass++; console.log('  ✅ 退化方案选中的是右侧「下一页」按钮，未误选左侧'); }
  else { fail++; console.log(`  ❌ 退化方向错误：left=${leftClicked}`); }
  await evalJS(`(()=>{
    document.getElementById('pagerRight').className = 'pager renderTarget_pager_button renderTarget_pager_button_right';
    document.getElementById('pagerLeft').className = 'pager renderTarget_pager_button';
  })()`);

  // ---- 左侧按钮不被误当下一页 ----
  console.log('\n=== 下一页按钮解析 ===');
  const btnInfo = await evalJS(`(()=>{
    const r = document.querySelector('button.renderTarget_pager_button_right');
    return r ? {cls:r.className, text:r.textContent} : null;
  })()`);
  console.log('  解析到的按钮:', JSON.stringify(btnInfo));

  console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===`);
  cleanup();
  process.exit(fail===0?0:1);
})().catch(e=>{ console.error('测试异常:', e.message); process.exit(2); });
