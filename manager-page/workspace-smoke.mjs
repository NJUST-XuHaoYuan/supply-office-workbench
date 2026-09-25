import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DIALOGUE_STORE } from './dialogue-model.mjs';

const output = fileURLToPath(new URL('./artifacts/workspace/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ ...(process.env.WORKBENCH_BROWSER === 'chromium' ? {} : { channel: 'chrome' }), headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(); page.setDefaultTimeout(9000);
const errors = []; const requests = []; const checks = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => { if (!['127.0.0.1', 'localhost'].includes(new URL(r.url()).hostname)) requests.push(r.url()); });
const button = name => page.getByRole('button', { name, exact: true });
const chooseRole = role => page.getByLabel('当前演示岗位').selectOption(role);
const getState = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), DIALOGUE_STORE);
const chat = page.locator('.dsh-panel');
const input = page.getByLabel('给 DSH 的工作安排');
const lens = name => page.getByRole('tablist', { name: '工作关注视图' }).getByRole('tab').filter({ hasText: name });
const work = id => page.locator('[data-matter-id="' + id + '"]');
const matter = (state, id = 'loss') => state.matters.find(m => m.id === id);
async function send(text) { await input.fill(text); await button('发送给 DSH').click(); }
async function act(text) { await send(text); await button('确认执行').click(); }
async function more(name) { await button('更多').click(); await page.locator('#workspace-menu').getByRole('button', { name, exact: true }).click(); }
async function showList() { if (await button('返回工作列表').isVisible()) await button('返回工作列表').click(); }
async function details() { const panel = chat.locator('.work-details'); if (!await panel.getAttribute('open')) { if (await panel.getAttribute('open') === null) await panel.locator(':scope > summary').click(); } }
async function focusWork(id) {
  await showList();
  await page.getByLabel('搜索事项').fill('');
  if (await button('返回待处理').isVisible()) await button('返回待处理').click();
  if (!await work(id).count()) await lens('待我处理').click();
  if (!await work(id).count()) await lens('我在跟进').click();
  if (!await work(id).count()) await more('已完成工作');
  const entry = work(id).locator('.work-entry');
  await entry.click();
  await assertBinding(id);
}
async function assertBinding(id) {
  assert.equal(await page.locator('.is-selected').getAttribute('data-matter-id'), id);
  assert.equal(await chat.locator('.conversation-scope').getAttribute('data-context-id'), id);
  assert.equal(await work(id).locator('.entry-title strong').textContent(), await chat.locator('.conversation-scope h2').textContent());
}
async function snapshot(name) { await page.screenshot({ path: output + name + '.png', animations: 'disabled' }); }
async function noOverflow() {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const issues = await page.locator('h1,h2,h3,p,button').evaluateAll(nodes => nodes.filter(el => el.checkVisibility() && getComputedStyle(el).overflowX === 'visible').map(el => ({ text: el.textContent, width: el.clientWidth, scroll: el.scrollWidth })).filter(el => el.width > 0 && el.scroll > el.width + 3));
  assert.deepEqual(issues, []);
  if (await input.isVisible()) {
    const sendBounds = await button('发送给 DSH').boundingBox();
    assert.ok(sendBounds.y + sendBounds.height <= page.viewportSize().height, 'Send action stays within the visible viewport');
    assert.ok(sendBounds.height >= 44 && sendBounds.width >= 44);
    assert.equal(await input.evaluate(el => getComputedStyle(el).fontSize), '16px');
  }
}
async function reset() { await more('重置对话演示'); await button('确认重置').click(); }
try {
  await page.goto(process.env.WORKBENCH_URL || 'http://127.0.0.1:5174/');
  await page.getByRole('heading', { name: '我的工作', exact: true }).waitFor();
  assert.equal(await page.getByRole('navigation').count(), 0);
  assert.equal(await page.getByRole('tablist', { name: '工作关注视图' }).getByRole('tab').count(), 2);
  assert.equal(await chat.locator('.work-detail').isVisible(), false);
  assert.equal(await page.locator('.work-item .work-detail').count(), 0);
  assert.equal(await page.locator('.my-attention,.detail-tabs,.people,.chat-date').count(), 0);
  await assertBinding('loss'); await noOverflow(); await snapshot('01-director-decision');
  await page.evaluate(() => { window.originalArea = document.querySelector('.stable-work-area'); });
  await chooseRole('marketing');
  assert.equal(await work('loss').count(), 0);
  await lens('我在跟进').click(); assert.equal(await work('loss').count(), 0);
  await chooseRole('leader'); assert.equal(await work('loss').count(), 0);
  await chooseRole('director');
  await act('同意');
  assert.equal(matter(await getState()).tasks.find(t => t.id === 'supervise').status, 'done');
  await assertBinding('loss');
  assert.match(await work('loss').locator('.pinned-context').innerText(), /已转入跟进/);
  assert.match(await chat.locator('.current-request').innerText(), /营销员/);
  await snapshot('02-director-following');
  await focusWork('report');
  assert.equal(await work('loss').count(), 0, 'Completed director action is no longer in pending');
  await assertBinding('report');
  await lens('我在跟进').click(); await focusWork('loss');
  await chooseRole('marketing'); await lens('待我处理').click(); await focusWork('loss');
  await assertBinding('loss'); assert.equal(await chat.locator('.current-request p').count(), 1);
  assert.match(await chat.locator('.current-request').innerText(), /核对/);
  checks.push('Director-first release, downstream hidden beforehand, exactly one active serial step, upstream tracking after handoff');

  await input.fill('尚未发送的核对意见');
  await lens('我在跟进').click();
  assert.equal(await work('loss').count(), 0, 'Manual filters do not mix pending work into following');
  await lens('待我处理').click(); await focusWork('loss');
  await page.getByLabel('搜索事项').fill('线损');
  await assertBinding('loss'); assert.equal(await input.inputValue(), '尚未发送的核对意见');
  await chooseRole('director'); await chooseRole('marketing');
  await assertBinding('loss'); assert.equal(await input.inputValue(), '尚未发送的核对意见');
  await lens('待我处理').click(); await page.getByLabel('搜索事项').fill('');
  await act('采集口径已核对，总表分表统计时点一致，数据完整');
  assert.match(await chat.locator('.current-request').innerText(), /确认专业分析/);
  await act('确认专业分析与核查范围，按两处疑似范围核查');
  assert.match(await work('loss').locator('.pinned-context').innerText(), /跟进/);
  await focusWork('replacement');
  await details();
  assert.equal(await chat.locator('[data-block="table"]').count(), 1);
  await noOverflow();
  await snapshot('03-batch-plan');
  await act('确认12只表计轮换调整至首批');
  await chooseRole('leader'); await focusWork('loss');
  await act('确认现场安排，派发给台区经理王晨');
  await chooseRole('manager'); await focusWork('loss');
  await act('现场核查已完成，7号表箱异常点已核实并整改，现场记录完整');
  await chooseRole('marketing'); await focusWork('loss');
  await act('现场结果已复核，确认回复督办，继续观察');
  await send('效果验证预计后天恢复正常');
  assert.match(await chat.locator('.assistant-message').last().innerText(), /不能登记/);
  await act('效果验证已完成，后续两个统计周期数据已核实，结果恢复正常');
  await chooseRole('director'); await focusWork('loss');
  await act('确认验收通过，依据已核对，当前督办收口');
  assert.equal(matter(await getState()).closed, true);
  assert.equal(matter(await getState(), 'replacement').closed, false);
  assert.match(await work('loss').locator('.pinned-context').innerText(), /已完成/);
  checks.push('Persistent selection and role drafts; four-role downward/upward chain; independent orders; observed verification before final acceptance');

  await chooseRole('marketing'); await focusWork('customer');
  await snapshot('04-parallel-service');
  await act('客户资料已复核，所有材料齐全，补充项已确认完整');
  assert.equal(matter(await getState(), 'customer').tasks.find(t => t.id === 'customer-field').status, 'ready');
  await act('通知台区经理：请补充现场核对结果，请反馈安排');
  await chooseRole('manager'); await focusWork('customer');
  await details();
  await chat.locator('.record-fold > summary').filter({ hasText: '沟通记录' }).click();
  await chat.locator('.shared-message').getByText('请补充现场核对结果，请反馈安排', { exact: true }).waitFor();
  await act('回复营销员：已收到现场核对安排，稍后反馈');
  assert.equal(matter(await getState(), 'customer').messages[0].waiting, false);
  checks.push('Parallel independent duties and matter-linked communication retain separate responsibility');

  await chooseRole('marketing'); await focusWork('customer');
  await send('依据这件事生成工作报告');
  const report = (await getState()).artifacts[0]; const reportId = report.context;
  assert.notEqual(reportId, 'customer'); await assertBinding(reportId);
  assert.deepEqual(report.matterIds, ['customer']);
  await chat.locator('.artifact-link').last().click();
  const downloadEvent = page.waitForEvent('download'); await button('下载这版报告').click();
  const download = await downloadEvent; await download.saveAs(output + 'report-v1.txt');
  await page.keyboard.press('Escape');
  await focusWork('customer');
  await more('工作成果'); await page.getByRole('dialog').locator('.artifact-link').click();
  await button('继续对话修改').click();
  await assertBinding(reportId); await button('发送给 DSH').click();
  assert.equal((await getState()).artifacts[0].versions.length, 2);
  await snapshot('05-independent-report');
  await act('确认报告，依据已审阅，报告收口');
  assert.equal(matter(await getState(), reportId).closed, true);
  assert.equal(matter(await getState(), 'customer').closed, false);
  assert.equal(await page.evaluate(() => window.originalArea === document.querySelector('.stable-work-area')), true);
  checks.push('Report owns its work and conversation; revise switches both panes atomically; version/download works; approval never closes source work');

  await button('发起工作').click();
  assert.equal(await page.locator('.is-selected').count(), 0);
  assert.match(await chat.locator('.conversation-scope').innerText(), /新工作/);
  await send('为新桥村3号台区创建采集异常核实自主工单');
  const id = (await getState()).matters[0].id; await assertBinding(id);
  await send('暂停'); assert.equal(matter(await getState(), id).jobs[0].status, 'paused');
  await send('继续运行'); await button('确认执行').waitFor();
  assert.equal(matter(await getState(), id).orders.length, 0);
  await button('确认执行').click();
  await page.waitForFunction(({key, id}) => JSON.parse(localStorage.getItem(key)).matters.find(m => m.id === id).orders.length > 0, {key: DIALOGUE_STORE, id});
  await act('安排台区经理王晨落实，核实后反馈');
  await chooseRole('manager'); await focusWork(id); await act('后续现场信息已核实，资料完整，记录已完成');
  await chooseRole('marketing'); await focusWork(id); await act('确认验收通过，资料完整，当前工单收口');
  await page.reload(); assert.equal(matter(await getState(), id).closed, true);
  checks.push('Autonomous order preparation, pause/resume, human gate, MOCK receipt, assignment, feedback, acceptance and persistence');

  await button('发起工作').click();
  await page.evaluate(key => { const original = Storage.prototype.setItem; window.restoreStorage = () => { Storage.prototype.setItem = original; }; Storage.prototype.setItem = function(k, v) { if (k === key) throw new Error('测试存储不可用'); return original.call(this, k, v); }; }, DIALOGUE_STORE);
  const count = (await getState()).artifacts.length;
  await send('生成周报');
  assert.equal((await getState()).artifacts.length, count); assert.equal(await input.inputValue(), '生成周报');
  await page.getByRole('alert').filter({ hasText: '未保存' }).waitFor();
  assert.equal(await page.locator('.is-selected').count(), 0);
  await page.evaluate(() => window.restoreStorage()); await send('不要生成周报');
  assert.equal((await getState()).artifacts.length, count);
  checks.push('Failed storage does not change work, selection or draft; negative request does not execute');

  await reset();
  for (const [name, width, height] of [['desktop',1440,1000], ['laptop',1280,800], ['tablet',860,900], ['mobile',390,844], ['narrow',320,700]]) {
    await page.setViewportSize({width, height});
    for (const role of ['director','marketing','leader','manager']) { await chooseRole(role); await noOverflow(); }
    await chooseRole('director'); await showList(); await noOverflow(); await snapshot(name + '-list');
    await lens('待我处理').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await lens('我在跟进').getAttribute('aria-selected'), 'true');
    await focusWork('loss'); await noOverflow(); await snapshot(name + '-dialogue');
    await details(); await noOverflow(); await snapshot(name + '-details');
    const tiny = await page.locator('button,p,small,dt,dd,th,td,figcaption').evaluateAll(nodes => nodes.filter(el => el.checkVisibility() && el.textContent.trim() && parseFloat(getComputedStyle(el).fontSize) < 14).map(el => el.textContent));
    assert.deepEqual(tiny, [], 'Visible content is not smaller than 14px');
    await chat.locator('.work-details > summary').click();
    await send('分析当前进展'); await noOverflow();
    await more('今日简报'); await noOverflow(); await snapshot(name + '-brief');
    await page.keyboard.press('Escape');
    await chooseRole('marketing'); await focusWork('replacement'); await details(); await noOverflow(); await snapshot(name + '-batch');
    await focusWork('customer'); await details(); await noOverflow(); await snapshot(name + '-service');
    await showList();
  }
  checks.push('Simplified first screen, progressive details, 16px composer, 44px send, desktop/tablet/mobile/narrow layouts, keyboard tabs and no clipping');
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  await writeFile(output + 'report.json', JSON.stringify({ok:true,checks,errors,externalRequests:requests},null,2));
  console.log(JSON.stringify({ok:true,checks},null,2));
} catch(error) { await snapshot('failure'); console.error(error); process.exitCode=1; }
finally { await browser.close(); }
