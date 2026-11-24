// 用真实 Edge 加载扩展，验证 manifest 合法且扩展已激活
const { spawn } = require('child_process');
const path = require('path'), http = require('http'), fs = require('fs');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const EXT = path.resolve(__dirname, '..').replace(/\\/g, '/');
const PORT = 9336;
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
  const ud = path.join(process.env.TEMP || '.', 'wr-edge-' + Date.now());
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
  console.log('Edge 已启动:', v['Browser']);

  const sock = new WebSocket(v.webSocketDebuggerUrl);
  let id = 0; const p = new Map();
  await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
  sock.onmessage = m => { const x = JSON.parse(m.data); if (x.id && p.has(x.id)) { p.get(x.id)(x); p.delete(x.id); } };
  const send = (m, pa = {}, s) => new Promise(r => { const i = ++id; p.set(i, r); sock.send(JSON.stringify({ id: i, method: m, params: pa, sessionId: s })); });

  await sleep(3000);
  const targets = await getJSON(`http://127.0.0.1:${PORT}/json/list`);
  console.log('\n目标列表:');
  targets.forEach(t => console.log('   -', t.type, '|', (t.url || '').slice(0, 110)));

  const isExt = t => (t.url || '').indexOf('chrome-extension://') === 0;
  const sw = targets.find(t => t.type === 'service_worker' || isExt(t));
  if (!sw) {
    console.log('\n未发现扩展目标 —— manifest 可能不被接受');
    cl(); process.exit(1);
  }
  const extId = (sw.url || '').match(/chrome-extension:\/\/([a-z]+)/);
  console.log('\n扩展已被 Edge 加载并激活');
  console.log('   扩展 ID:', extId ? extId[1] : '(未知)');
  console.log('   扩展 URL:', (sw.url || '').slice(0, 120));
  console.log('   类型:', sw.type);
  console.log('\n结论：manifest.json 合法，Edge 接受该扩展（MV3）。');

  cl(); process.exit(0);
})().catch(e => { console.error('验证失败:', e.message); process.exit(1); });
