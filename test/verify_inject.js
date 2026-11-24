// 验证 content script 在真实 weread.qq.com 页面上确实注入
const { spawn } = require('child_process');
const path = require('path'), http = require('http');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const EXT = path.resolve(__dirname, '..').replace(/\\/g, '/');
const PORT = 9337;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)) } catch (e) { rej(e) } }); }).on('error', rej);
});
async function waitFor(fn, t = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < t) { try { const v = await fn(); if (v) return v; } catch (e) {} await sleep(400); }
  throw new Error('timeout');
}
(async () => {
  const ud = path.join(process.env.TEMP || '.', 'wr-edge2-' + Date.now());
  const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + ud,
    '--disable-extensions-except=' + EXT,
    '--load-extension=' + EXT,
    'about:blank'
  ], { stdio: 'ignore' });
  const cl = () => { try { edge.kill('SIGKILL'); } catch (e) {} };
  process.on('exit', cl);

  const v = await waitFor(() => getJSON(`http://127.0.0.1:${PORT}/json/version`));
  const sock = new WebSocket(v.webSocketDebuggerUrl);
  let id = 0; const p = new Map(); const logs = [];
  await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
  sock.onmessage = m => {
    const x = JSON.parse(m.data);
    if (x.id && p.has(x.id)) { p.get(x.id)(x); p.delete(x.id); return; }
    if (x.method === 'Runtime.consoleAPICalled') {
      const args = (x.params.args || []).map(a => a.value ?? a.description ?? '').join(' ');
      logs.push(args);
    }
  };
  const send = (m, pa = {}, s) => new Promise(r => { const i = ++id; p.set(i, r); sock.send(JSON.stringify({ id: i, method: m, params: pa, sessionId: s })); });

  const tt = await send('Target.createTarget', { url: 'https://weread.qq.com/' });
  const at = await send('Target.attachToTarget', { targetId: tt.result.targetId, flatten: true });
  const sid = at.result.sessionId;
  await send('Runtime.enable', {}, sid);
  await send('Log.enable', {}, sid);
  await sleep(6000);

  console.log('\n=== 页面 console 输出 ===');
  logs.forEach(l => console.log('   ', l));

  const injected = logs.some(l => String(l).indexOf('微信读书·中键翻页') !== -1);
  console.log('\n=== 结论 ===');
  if (injected) {
    console.log('✅ content script 已在真实 weread.qq.com 页面成功注入并执行');
  } else {
    console.log('⚠️  未捕获到注入日志（可能是网络未连通导致页面未加载完成）');
    console.log('   已捕获的日志条数:', logs.length);
  }
  cl();
  process.exit(injected ? 0 : 3);
})().catch(e => { console.error('验证失败:', e.message); process.exit(1); });
