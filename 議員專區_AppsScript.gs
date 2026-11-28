/**
 * 學生議會 會內系統：登入＋提案＋建議事項＋議員索資＋邀請列席備詢＋陳情＋秘書處登入（Google Apps Script）
 *
 * ★ 這一版新增（從舊版升級只要做這三步）：
 *   A. 整份貼上取代舊程式 → 存檔 → 函式選單選「setup」→ 執行一次（會建立「議員名單」工作表）。
 *   B. 在「議員名單」填入議員：編號｜屆次｜選區｜姓名｜信箱｜狀態（在任／離任）。
 *      只有「在任」的議員會出現在陳情頁的下拉選單；信箱不會傳到網頁上。
 *   C. 部署 → 管理部署作業 → 編輯 → 版本選「新版本」→ 部署（網址不變，index.html 不用改網址）。
 *   秘書處草擬系統的帳號密碼改由這裡驗證（下方 SEC_USER／SEC_PASS），網頁原始碼裡不再有帳密。
 *
 * ★ 資安更新（v3）：
 *   - 議案查詢改由本程式提供（doGet），會自動拿掉「信箱／郵件」欄位。
 *     部署新版本、確認網站議案正常後，請到 檔案 → 分享 → 發布到網路 → 「停止發布」，
 *     舊的 CSV 網址（含提案人信箱）就不再公開。
 *   - 所有寫入試算表的文字，若以 = + - @ 開頭會自動當成純文字，防止有人塞公式偷資料。
 *   - 附件只接受常見文件與圖片格式（ALLOWED_EXT）。
 *   - 會議直播：在下方設定 YT_CHANNEL 後，首頁月曆下方會自動顯示議會 YouTube 直播（沒直播時顯示「當前無公開會議舉行」）。
 *     第一次使用會要求新的授權（連線到外部網站），請按允許。
 *   - 會議期程：首頁新增月曆；秘書處登入後可新增／刪除會議（存在「會議期程」工作表，執行 setup 會建立）。
 *   - 屆次改由「設定」工作表的「屆次」決定（執行 setup 會自動建立，預設 27）；換屆只要改那格。
 *   - 提案不再寫入「提案」工作表，改為直接新增到「議案」工作表（自動編號 NTPUSP-27-xxx、關卡「提案送出」、
 *     狀態「審查中」），立即出現在議案查詢。聯絡人與送出帳號會加在最右邊，不會公開。
 *
 * 安裝步驟：
 * 1. 用議會秘書處帳號（ntpuscs@gmail.com）開一個 Google 試算表。
 * 2. 擴充功能 → Apps Script，把這整份貼進去，存檔。
 * 3. 上方函式選單選「setup」→ 按「執行」一次（第一次會要求授權，按允許）。
 *    試算表會出現「會內帳號」工作表，填入可登入的帳號：帳號｜密碼｜名稱｜身分｜啟用。
 *    身分：學生議員＝提案、建議事項、索資、邀請列席；秘書處＝全部功能＋所有索資回覆；
 *          學生會／學生法院＝提案＋回覆自己單位的索資。
 *    再把下方設定區的 SITE_URL 改成網站網址，索資信裡才會有「前往索資回覆系統」的連結。
 *    ⚠️ 這張表有密碼，千萬不要「發布到網路」，也不要分享給不相關的人。
 * 4. 部署 → 新增部署作業 → 網頁應用程式：執行身分「我」，存取權「所有人」。
 *    部署後複製網址（結尾 /exec），貼到網站 index.html 的 FORM_API_URL。
 * 5. 其他工作表（索資、列席備詢、提案、建議事項）會在第一次有人送出時自動建立；
 *    提案附件會存到雲端硬碟的「提案附件」資料夾（自動建立）。
 *
 * 之後改了程式：部署 → 管理部署作業 → 編輯 → 版本選「新版本」→ 部署（網址不變）。
 * 新增、停用帳號或改密碼：直接改「會內帳號」工作表即可，不用重新部署。
 */

// ===== 設定 =====
const SU_EMAIL = 'ntpusu@gm.ntpu.edu.tw';      // 學生會
const SECRETARIAT_EMAIL = 'ntpuscs@gmail.com'; // 學生議會秘書處（一律收副本）
const COURT_EMAIL = 'ntpucourt@gmail.com';     // 學生法院書記處
const TERM = '27';                             // 屆次預設值；實際以試算表「設定」工作表的「屆次」為準（換屆改那格即可，不用重新部署）
const SITE_URL = '';                           // ★ 網站網址（例如 https://xxx.github.io/repo/），索資信會附上回覆連結
const MIN_DAYS = 7;                            // 索資回覆期限至少幾天
const ALLOWED_DOMAIN = '';                     // 不限定議員信箱網域
const SU_UNITS = ['正副會長', '秘書處', '學權暨學術部', '公關部', '財務部', '活動部', '新聞部', '國際部', '選委會'];
const UNITS = SU_UNITS.map(u => '學生會' + u).concat(['學生議會秘書處', '學生法院書記處']); // 索資的受索單位
const INVITE_ORGS = ['學生會', '學生法院'];                                     // 列席備詢的受邀機關
const SEC_USER = 'ntpusps';                    // ★ 秘書處草擬系統帳號
const SEC_PASS = '92613815';                   // ★ 秘書處草擬系統密碼（改這裡後要重新部署「新版本」）
const PETITION_HOURLY_MAX = 30;                // 陳情每小時最多收幾件（防止被大量灌信）
const YT_CHANNEL = '@ntpusu-sanxia-student-congress';                         // ★ 議會 YouTube 頻道：填頻道代號（例如 '@ntpusp'）或頻道 ID（UC 開頭）；留空＝首頁不顯示直播
const BILLS_SHEET = '議案';                     // 議案查詢讀取的工作表名稱
const BILLS_SPREADSHEET_ID = '';               // 議案若在「另一份」試算表，貼上該試算表網址中 /d/ 與 /edit 之間的 ID；同一份就留空
const BILLS_PRIVATE = /信箱|郵件|mail|電話|手機|聯絡人|送出帳號/i; // 表頭符合這些字的欄位不會公開
const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'txt', 'csv', 'jpg', 'jpeg', 'png', 'gif', 'heic', 'webp'];
// ================

/** 議案查詢（公開）：回傳「議案」工作表，但拿掉信箱等個資欄位；結果快取 60 秒 */
function doGet(e) {
  if (e && e.parameter && e.parameter.type === 'meetings') return meetingsOut_();
  if (e && e.parameter && e.parameter.type === 'live') return liveOut_();
  if (e && e.parameter && e.parameter.type === 'people') return peopleOut_();
  const cache = CacheService.getScriptCache();
  const hit = cache.get('bills_v1');
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  try {
    const sh = billsSheet_();
    if (sh.getLastRow() < 1) return reply({ ok: false, error: '議案工作表是空的' });
    const all = sh.getDataRange().getDisplayValues();
    const keep = all[0].map((h, i) => [h, i]).filter(x => String(x[0]).trim() && !BILLS_PRIVATE.test(x[0])).map(x => x[1]);
    const values = all.map(r => keep.map(i => r[i]));
    const out = JSON.stringify({ ok: true, values: values });
    try { cache.put('bills_v1', out, 60); } catch (err) {} // 資料太大放不進快取也沒關係
    return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return reply({ ok: false, error: '讀取議案失敗' });
  }
}

/** 防公式注入：以 = + - @ 開頭的文字前面加 '，試算表就只會當成文字（畫面上看不到這個 '） */
function safe_(v) { return (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) ? "'" + v : v; }
function appendSafe_(sheet, row) { sheet.appendRow(row.map(safe_)); }

/** 陳情不接受連結：網址、www.、常見網域、HTML 標籤都擋（電子郵件地址不算） */
const LINK_MSG = '為保護議員與資訊安全，陳情內容不能包含網址、連結或程式碼。若有相關資料，請改用附件上傳（PDF、圖片等）。';
function hasLink_(t) {
  const s = String(t || '').normalize('NFKC').replace(/[。｡]/g, '.').replace(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, '');
  return /(https?|ftp|javascript|data|vbscript)\s*:|www\s*\./i.test(s) ||
    /\b[a-z0-9-]+(\.[a-z0-9-]+)*\s*\.\s*(com|net|org|edu|gov|tw|io|ly|me|cc|co|xyz|info|top|app|link|site|gl|tk|ml|ga|cf|gq|ru|cn|shop|online|club|live|vip|biz|page|dev|lnkd|to)\b/i.test(s) ||
    /<\s*\/?\s*(script|iframe|img|a|svg|object|embed|style|link|meta|form|input|button|body|html|base|frame|video|audio|math|details)\b|<!--/i.test(s);
}

/** 讓網址失效（defang）：就算有連結繞過檢查，寄出的信與試算表裡也點不下去。
 *  https:// → hxxps://、www. → www[.]、英數字後面接英文字母的點 → [.]（例如 evil[.]com）；1.5、2026.11.16 這類數字不受影響 */
function defang_(t) {
  return String(t || '')
    .replace(/h\s*t\s*t\s*p\s*(s?)\s*:/gi, 'hxxp$1:')
    .replace(/f\s*t\s*p\s*:/gi, 'fxp:')
    .replace(/([a-z0-9\uff21-\uff3a\uff41-\uff5a\uff10-\uff19])(\s*)[.\uff0e\u3002\uff61](\s*)(?=[a-z\uff21-\uff3a\uff41-\uff5a])/gi, '$1$2[.]$3');
}

/** 附件格式檢查：回傳錯誤訊息，沒問題回傳空字串 */
function badFile_(files) {
  for (const f of files) {
    const ext = String(f.name || '').toLowerCase().split('.').pop();
    if (String(f.name || '').indexOf('.') === -1 || ALLOWED_EXT.indexOf(ext) === -1) {
      return '附件「' + String(f.name || '').slice(0, 60) + '」的格式不接受。可上傳：PDF、Word、Excel、PowerPoint、圖片（JPG、PNG 等）。';
    }
  }
  return '';
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse(e.postData.contents);
    // 會內系統：登入／登出不需驗證，其他表單一律先驗證登入
    if (d.type === 'login') return handleLogin(d);
    if (d.type === 'logout') { revokeToken_(d.token); return reply({ ok: true }); }
    // 公開功能：陳情、議員名單、秘書處草擬系統登入（不需會內帳號）
    if (d.type === 'councillors') return reply({ ok: true, items: councillors_().filter(c => c.on).map(c => ({ id: c.id, seat: c.seat, name: c.name })).concat([{ id: SU_TARGET.id, seat: '', name: '直接向學生會陳情' }]) });
    if (d.type === 'petition') return handlePetition(d);
    if (d.type === 'secLogin') return handleSecLogin(d);
    if (d.type === 'meetingAdd' || d.type === 'meetingEdit' || d.type === 'meetingDel') {
      if (!checkSec_(d.secToken)) return reply({ ok: false, secRelogin: true, error: '秘書處登入已逾時，請重新登入。' });
      return d.type === 'meetingAdd' ? handleMeetingAdd(d) : d.type === 'meetingEdit' ? handleMeetingEdit(d) : handleMeetingDel(d);
    }
    const acc = checkToken_(d.token);
    if (!acc) return reply({ ok: false, relogin: true, error: '登入已逾時或帳號已停用，請重新登入。' });
    d._account = acc.label; d._role = acc.role;
    const need = { proposal: null, suggest: FULL_ROLES, request: FULL_ROLES, invite: FULL_ROLES, replyList: REPLY_ROLES, reply: REPLY_ROLES }[d.type || 'request'];
    if (need === undefined) return reply({ ok: false, error: '未知的操作' });
    if (need && need.indexOf(acc.role) === -1) {
      return reply({ ok: false, error: '您的帳號身分（' + (acc.role || '未設定') + '）不能使用這項功能。' });
    }
    if (d.type === 'replyList') return handleReplyList(d);
    if (d.type === 'reply') return handleReply(d);
    if (d.type === 'proposal') return handleProposal(d);
    if (d.type === 'suggest') return handleSuggest(d);
    const err = checkCommon(d);
    if (err) return reply({ ok: false, error: err });
    if (d.type === 'invite') return handleInvite(d);
    return handleRequest(d);
  } catch (err) {
    return reply({ ok: false, error: '系統錯誤，請聯絡議會秘書處 ' + SECRETARIAT_EMAIL });
  } finally {
    lock.releaseLock();
  }
}

// ---------- 索資 ----------
function handleRequest(d) {
  if (!d.subj || !String(d.subj).trim()) return reply({ ok: false, error: '請填寫索資主旨' });
  const asks = lines(d.asks);
  if (!asks.length) return reply({ ok: false, error: '請至少填一項索資事項' });
  const min = new Date(); min.setHours(0, 0, 0, 0); min.setDate(min.getDate() + MIN_DAYS);
  const due = new Date(String(d.due) + 'T00:00:00');
  if (isNaN(due) || due < min) return reply({ ok: false, error: '回覆期限至少要在 ' + MIN_DAYS + ' 天後' });

  const sheet = getSheet('索資', REQ_HEADER);
  const id = nextId(sheet);
  const dueText = d.due.replace(/-/g, '/');
  appendSafe_(sheet, [id, new Date(), d.who, d.seat || '', d.mail, d.org, d.subj, asks.join('\n'), d.why || '', dueText, d.mode || '', d._account, '待回覆', '', '', '', '']);

  const r = route(d);
  const html = frame('議員索資通知',
    '<p>' + r.toName + '您好：<br>學生議員 <b>' + whoLine(d) + '</b> 依職權向<b>' + esc(d.org) + '</b>調閱下列資料，請於 <b>' + dueText + '</b> 前回覆。</p>' +
    box([['索資編號', id], ['回覆期限', dueText], ['提供方式', esc(d.mode || '')]]) +
    '<h4 style="margin:20px 0 4px">索資事項</h4>' + ol(asks) +
    (d.why ? '<h4 style="margin:16px 0 4px">索資理由</h4><p style="margin:0">' + esc(d.why) + '</p>' : '') +
    note('如何回覆', '請登入本會「會內系統」→「索資回覆」，找到編號 <b>' + id + '</b> 後按「回覆」，填寫回覆內容並上傳資料。' +
      '系統會將回覆寄給索資議員，並副本給議會秘書處。請勿直接回覆此信。' +
      (SITE_URL ? '<br><a href="' + SITE_URL.replace(/#.*$/, '') + '#reply">前往索資回覆系統</a>' : '')));

  send(r, '【議員索資 ' + id + '】' + d.subj + '（請於 ' + dueText + ' 前回覆）', html);
  return reply({ ok: true, id: id });
}

// ---------- 索資回覆系統 ----------
// 「索資」工作表欄位（第 13 欄起為回覆紀錄）
const REQ_HEADER = ['索資編號', '送出時間', '議員', '選區', '議員信箱', '受索單位', '主旨', '索資事項', '理由', '回覆期限', '提供方式', '送出帳號',
  '狀態', '回覆時間', '回覆帳號', '回覆內容', '回覆附件'];
const REPLY_ROLES = ['學生會', '學生法院', '秘書處'];
const REPLY_MAX_MB = 20; // 附件總大小上限（寄信附件上限約 25MB）

/** 這個身分看得到哪些受索單位的索資 */
function canSee_(role, org) {
  if (role === '秘書處') return true;
  if (role === '學生會') return String(org).indexOf('學生會') === 0;
  if (role === '學生法院') return org === '學生法院書記處';
  return false;
}

function handleReplyList(d) {
  const sh = getSheet('索資', REQ_HEADER);
  if (sh.getLastRow() < 2) return reply({ ok: true, items: [] });
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, REQ_HEADER.length).getDisplayValues();
  const items = rows.filter(r => r[0] && canSee_(d._role, r[5])).map(r => ({
    id: r[0], time: r[1], who: r[2], seat: r[3], org: r[5], subj: r[6], asks: r[7], why: r[8], due: r[9], mode: r[10],
    status: r[12] || '待回覆', replyTime: r[13], replyBy: r[14], replyText: r[15],
    replyFiles: String(r[16] || '').split('\n').filter(Boolean).length
  })).reverse();
  return reply({ ok: true, items: items });
}

function handleReply(d) {
  const text = String(d.text || '').trim();
  if (!text) return reply({ ok: false, error: '請填寫回覆內容' });
  const files = (d.files || []).filter(f => f && f.data).slice(0, MAX_FILES);
  const bad = badFile_(files);
  if (bad) return reply({ ok: false, error: bad });
  const total = files.reduce((n, f) => n + f.data.length * 0.75, 0);
  if (total > REPLY_MAX_MB * 1024 * 1024) return reply({ ok: false, error: '附件合計超過 ' + REPLY_MAX_MB + 'MB，請壓縮或分次回覆' });

  const sh = getSheet('索資', REQ_HEADER);
  const ids = sh.getLastRow() < 2 ? [] : sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().map(r => r[0]);
  const idx = ids.indexOf(String(d.id));
  if (idx === -1) return reply({ ok: false, error: '找不到這筆索資' });
  const rowNo = idx + 2;
  const r = sh.getRange(rowNo, 1, 1, REQ_HEADER.length).getDisplayValues()[0];
  if (!canSee_(d._role, r[5])) return reply({ ok: false, error: '您的帳號不能回覆這筆索資' });

  // 附件：存一份到雲端硬碟「索資回覆附件」，並直接附在信件裡寄給議員
  const blobs = files.map((f, i) => Utilities.newBlob(Utilities.base64Decode(f.data), f.mimeType || 'application/octet-stream', f.name));
  const links = [];
  if (blobs.length) {
    const folder = getFolder_('索資回覆附件').createFolder(r[0] + ' ' + String(r[6]).slice(0, 40) + ' ' + twTime(new Date()).replace(/[\/:]/g, ''));
    blobs.forEach(b => links.push(b.getName() + ' | ' + folder.createFile(b.copyBlob()).getUrl()));
  }

  // 寫回試算表（可多次回覆：內容與附件會累加）
  const now = twTime(new Date());
  const prevText = r[15], prevFiles = r[16];
  const stamp = '【' + now + '　' + d._account + '】\n' + text;
  sh.getRange(rowNo, 13, 1, 5).setNumberFormat('@').setValues([[
    '已回覆', now, d._account, prevText ? prevText + '\n\n' + stamp : stamp,
    [prevFiles].concat(links).filter(Boolean).join('\n')]]); // 已設為純文字格式，公式不會執行

  // 寄給索資議員，副本給議會秘書處
  const html = frame('索資回覆',
    '<p>' + esc(r[2]) + (r[3] ? '（選區：' + esc(r[3]) + '）' : '') + ' 議員您好：<br><b>' + esc(r[5]) + '</b> 已回覆您的索資。</p>' +
    box([['索資編號', esc(r[0])], ['回覆時間', esc(now)], ['回覆人', esc(d._account)]]) +
    '<h4 style="margin:20px 0 4px">索資主旨</h4><p style="margin:0">' + esc(r[6]) + '</p>' +
    '<h4 style="margin:16px 0 4px">回覆內容</h4><p style="margin:0;white-space:pre-line">' + esc(text) + '</p>' +
    (blobs.length ? '<h4 style="margin:16px 0 4px">附件</h4>' + ol(blobs.map(b => b.getName())) + '<p style="font-size:13px;color:#5A6070">附件已附在本信中。</p>' : ''));
  const opt = { to: r[4], cc: SECRETARIAT_EMAIL, subject: '【索資回覆 ' + r[0] + '】' + r[6], htmlBody: html, name: '學生議會議員專區' };
  if (blobs.length) opt.attachments = blobs;
  MailApp.sendEmail(opt);
  return reply({ ok: true, id: r[0] });
}

// ---------- 邀請列席備詢 ----------
function handleInvite(d) {
  const people = (d.people || []).filter(p => p && String(p.title || '').trim() && String(p.name || '').trim());
  if (!people.length || people.length !== (d.people || []).length) return reply({ ok: false, error: '請填寫每位受邀人的職稱與姓名' });
  if (d.org === '學生法院' && (people.length !== 1 || String(people[0].title).trim() !== '書記長')) {
    return reply({ ok: false, error: '學生法院僅能邀請書記長' });
  }
  const topics = lines(d.topics);
  if (!topics.length) return reply({ ok: false, error: '請至少填一項詢答主題' });

  // 會議由議員自行填寫
  if (!d.meeting || !String(d.meeting).trim()) return reply({ ok: false, error: '請填寫會議名稱' });
  const m = { name: String(d.meeting).trim() }; // 時間地點以秘書處開會通知為準

  const sheet = getSheet('列席備詢', ['邀請編號', '送出時間', '議員', '選區', '議員信箱', '受邀機關', '受邀人', '會議', '備詢事項', '補充說明', '送出帳號']);
  const id = nextId(sheet);
  const peopleText = people.map(p => String(p.title).trim() + ' ' + String(p.name).trim()).join('、');
  appendSafe_(sheet, [id, new Date(), d.who, d.seat || '', d.mail, d.org, peopleText, m.name, topics.join('\n'), d.note || '', d._account]);

  const r = route(d);
  const html = frame('列席備詢邀請函',
    '<p>' + r.toName + '您好：<br>學生議員 <b>' + whoLine(d) + '</b> 敬邀下列人員，於本會會議列席並接受詢答：</p>' +
    '<table style="background:#F7F4EC;padding:12px 16px;border-radius:4px;width:100%;line-height:1.8">' +
    row('會議', esc(m.name)) + row('受邀人', esc(peopleText)) + '</table>' +
    '<p style="color:#3A4050;font-size:14px">會議時間與地點以議會秘書處發出的開會通知為準。</p>' +
    '<h4 style="margin:20px 0 4px">備詢事項</h4>' + ol(topics) +
    (d.note ? '<h4 style="margin:16px 0 4px">補充說明</h4><p style="margin:0">' + esc(d.note) + '</p>' : '') +
    note('請確認出席', '請直接在此信按「全部回覆」，告知能否出席及出席人員，議員與議會秘書處都會收到。'));

  send(r, '【邀請列席備詢 ' + id + '】' + m.name + ' 敬邀' + d.org + '列席', html);
  return reply({ ok: true, id: id, meeting: m });
}

// ---------- 提案（直接寫入「議案」工作表，立即出現在議案查詢；並通知秘書處） ----------
const PROPOSAL_UNITS = ['學生議員', '議長', '學生法院書記處', '學生會正副會長', '學生會秘書處', '學生會活動部',
  '學生會學生權益暨學術部', '學生會財務部', '學生會公關部', '學生會新聞部', '學生會國際事務部', '學生會選舉委員會'];
const PROPOSAL_TYPES = ['法律案', '財務案', '人事案', '備查案', '報告案', '一般決議'];
const MAX_FILES = 5;
const MAX_FILE_MB = 10; // 單一附件上限（網頁應用程式單次傳送上限約 50MB）

function handleProposal(d) {
  const need = { unit: '提案單位', who: '提案人', wmail: '提案人公務信箱', cname: '提案聯絡人姓名', cmail: '提案聯絡人公務電子郵件', ptype: '提案類型', title: '案由', desc: '說明' };
  for (const k in need) if (!d[k] || !String(d[k]).trim()) return reply({ ok: false, error: '請填寫：' + need[k] });
  if (PROPOSAL_UNITS.indexOf(d.unit) === -1) return reply({ ok: false, error: '提案單位不正確' });
  if (allowedUnits_(d._role).indexOf(d.unit) === -1) return reply({ ok: false, error: '您的帳號身分（' + d._role + '）不能以「' + d.unit + '」名義提案' });
  if (PROPOSAL_TYPES.indexOf(d.ptype) === -1) return reply({ ok: false, error: '提案類型不正確' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(d.wmail).trim())) return reply({ ok: false, error: '提案人公務信箱格式不正確' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(d.cmail).trim())) return reply({ ok: false, error: '聯絡人電子郵件格式不正確' });
  const files = (d.files || []).filter(f => f && f.data).slice(0, MAX_FILES);
  const bad = badFile_(files);
  if (bad) return reply({ ok: false, error: bad });
  for (const f of files) {
    if (f.data.length * 0.75 > MAX_FILE_MB * 1024 * 1024) return reply({ ok: false, error: '附件「' + f.name + '」超過 ' + MAX_FILE_MB + 'MB' });
  }

  const sheet = billsSheet_();
  const id = nextBillId_(sheet);

  // 附件存入本會雲端硬碟：「提案附件」資料夾下，每案一個子資料夾；設為「知道連結者可檢視」，議案查詢才打得開
  const links = [];
  if (files.length) {
    const folder = getFolder_('提案附件').createFolder(id + ' ' + String(d.title).slice(0, 40));
    files.forEach((f, i) => {
      const blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.mimeType || 'application/octet-stream', '附件' + (i + 1) + '_' + f.name);
      const file = folder.createFile(blob);
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) { console.error(err); }
      links.push(file.getUrl());
    });
  }

  const now = billDate_(new Date());
  const rec = {
    '編號': id, '標題': String(d.title).trim(), '分類': d.ptype, '提案人姓名': String(d.who).trim(), '提案人職稱': '',
    '提案人公務信箱': String(d.wmail).trim(), '提案單位': d.unit, '提案日期': now, '摘要': String(d.desc).trim(),
    '審查單位': '', '目前關卡': '提案送出', '狀態': '審查中', '最新說明': '',
    // 以下欄位不會出現在議案查詢（見 BILLS_PRIVATE）
    '提案聯絡人姓名': String(d.cname).trim(), '提案聯絡人公務信箱': String(d.cmail).trim(), '送出帳號': d._account
  };
  links.forEach((u, i) => { rec['附件' + (i + 1)] = u; });
  writeByHeader_(sheet, rec);
  try { CacheService.getScriptCache().remove('bills_v1'); } catch (err) {} // 議案查詢立刻看得到
  notifySecretariat_('提案', id, now, d.title, BILLS_SHEET);
  return reply({ ok: true, id: id });
}

/** 議案工作表（議案查詢與提案共用） */
function billsSheet_() {
  const ss = BILLS_SPREADSHEET_ID ? SpreadsheetApp.openById(BILLS_SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(BILLS_SHEET);
  if (!sh) throw new Error('找不到「' + BILLS_SHEET + '」工作表');
  return sh;
}

/** 下一個議案編號：找出 NTPUSP-27-xxx 最大的號碼再加一 */
function nextBillId_(sh) {
  const prefix = 'NTPUSP-' + term_() + '-';
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(h => String(h).trim());
  const col = head.indexOf('編號') + 1;
  let max = 0;
  if (col && sh.getLastRow() > 1) {
    sh.getRange(2, col, sh.getLastRow() - 1, 1).getDisplayValues().forEach(r => {
      const v = String(r[0]).trim();
      if (v.indexOf(prefix) === 0) max = Math.max(max, parseInt(v.slice(prefix.length), 10) || 0);
    });
  }
  return prefix + String(max + 1).padStart(3, '0');
}

/** 依表頭名稱寫入一列；表頭沒有的欄位會自動加在最右邊，欄位順序可以自由調整 */
function writeByHeader_(sh, rec) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const head = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(h => String(h).trim());
  Object.keys(rec).forEach(k => {
    if (head.indexOf(k) === -1) { head.push(k); sh.getRange(1, head.length).setValue(k); }
  });
  const row = head.map(h => (h in rec ? rec[h] : ''));
  const r = sh.getLastRow() + 1;
  const dateCol = head.indexOf('提案日期') + 1;
  if (dateCol) sh.getRange(r, dateCol).setNumberFormat('@'); // 日期存成文字，格式和既有資料一致
  sh.getRange(r, 1, 1, row.length).setValues([row.map(safe_)]);
}

/** 提案日期寫成「2026/7/6 上午 1:53:50」，和議案工作表既有格式相同 */
function billDate_(d) {
  const tz = 'Asia/Taipei', H = Number(Utilities.formatDate(d, tz, 'H'));
  return Utilities.formatDate(d, tz, 'yyyy/M/d') + ' ' + (H < 12 ? '上午' : '下午') + ' ' + (H % 12 || 12) + ':' + Utilities.formatDate(d, tz, 'mm:ss');
}

function getFolder_(name) {
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

// ---------- 建議事項（寫入試算表＋通知秘書處） ----------
// 依組織職權行使法第 34 條之 1：委員會得向其監督之部門提出建議事項
const COMMITTEES = {
  '文務委員會': ['正副會長', '秘書處', '活動部', '公關部', '新聞部', '國際部'],
  '法制委員會': ['正副會長', '學權暨學術部', '選舉委員會', '學生法院'],
  '財務委員會': ['正副會長', '財務部']
};
function handleSuggest(d) {
  const need = { who: '提案人', committee: '委員會', dept: '建議部門', subj: '主旨', desc: '說明', plan: '建議方案' };
  for (const k in need) if (!d[k] || !String(d[k]).trim()) return reply({ ok: false, error: '請填寫：' + need[k] });
  if (!COMMITTEES[d.committee]) return reply({ ok: false, error: '委員會不正確' });
  if (COMMITTEES[d.committee].indexOf(d.dept) === -1) return reply({ ok: false, error: d.committee + '沒有監督「' + d.dept + '」，請重新選擇部門' });

  const sheet = getSheet('建議事項', ['收件編號', '送出時間', '提案人', '委員會', '建議部門', '主旨', '說明', '建議方案', '送出帳號']);
  const id = nextId(sheet);
  const row = [id, null, d.who, d.committee, d.dept, d.subj, d.desc, d.plan, d._account];
  addRow(sheet, row);
  notifySecretariat_('建議事項', id, row[1], d.subj, '建議事項');
  return reply({ ok: true, id: id });
}

/** 有人送案時寄一封簡短通知給議會秘書處（寄信失敗不影響送出） */
function notifySecretariat_(kind, id, time, title, sheetName) {
  try {
    const url = SpreadsheetApp.getActiveSpreadsheet().getUrl();
    MailApp.sendEmail({
      to: SECRETARIAT_EMAIL,
      subject: '【新' + kind + '】' + id + ' ' + String(title).slice(0, 40),
      htmlBody: frame('收到新的' + kind,
        '<p>系統收到一筆新的' + kind + '，請至試算表「' + esc(sheetName) + '」工作表查看並處理。</p>' +
        box([['收件編號', id], ['送出時間', esc(time)]]) +
        '<p style="margin-top:16px">' + (kind === '提案' ? '案由' : '主旨') + '：' + esc(title) + '</p>' +
        '<p><a href="' + url + '">開啟試算表</a></p>'),
      name: '學生議會議員專區'
    });
  } catch (err) { console.error(err); }
}

// ---------- 議員名單（「議員名單」工作表；陳情寄信用，信箱不會傳到網頁） ----------
const CL_SHEET = '議員名單';
const CL_HEADER = ['編號', '屆次', '選區', '姓名', '信箱', '狀態'];
function councillors_() {
  const sh = getSheet(CL_SHEET, CL_HEADER);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, CL_HEADER.length).getDisplayValues().map(r => ({
    id: String(r[0]).trim(), term: String(r[1]).trim(), seat: String(r[2]).trim(), name: String(r[3]).trim(),
    mail: String(r[4]).trim(), on: String(r[5]).trim() !== '離任'
  })).filter(c => c.id && c.name && c.mail);
}

// ---------- 陳情（公開表單：寄給被陳情議員；另寄一封隱去個資的副本給秘書處） ----------
// 陳情對象可選「學生會」：寄到學生會信箱，不寄副本給秘書處
const SU_TARGET = { id: 'SU', seat: '', name: '學生會', mail: SU_EMAIL };
function petitionTarget_(cid) {
  if (cid === SU_TARGET.id) return { id: SU_TARGET.id, seat: '', name: SU_TARGET.name, mail: SU_TARGET.mail, on: true };
  return councillors_().find(x => x.id === cid && x.on) || null;
}
const PETITION_TYPES = ['陳情學生會之作為／不作為', '陳情臺北大學之作為／不作為'];
const PETITION_ROLES = ['大學部', '研究生', '教職員'];
const COLLEGES = ['法律學院', '商學院', '公共事務學院', '社會科學學院', '人文學院', '電機資訊學院', '永續創新國際學院'];
const PETITION_MAX_FILES = 3;
const PETITION_MAX_MB = 20; // 附件合計上限（寄信附件上限約 25MB）
const PETITION_HEADER = ['案件編號', '送出時間', '陳情類型', '議員編號', '議員', '姓名', '身分別', '所屬學院', '簡述',
  '附件1', '附件2', '附件3', '希望回復', '聯絡信箱', '同意公開', '處理狀態'];

function handlePetition(d) {
  if (d.website) return reply({ ok: true, id: '-' }); // 防機器人：隱藏欄位有值就不處理
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get('petition_hour') || 0);
  if (n >= PETITION_HOURLY_MAX) return reply({ ok: false, error: '目前陳情案件較多，請稍後再試，或直接來信議會秘書處 ' + SECRETARIAT_EMAIL });

  if (PETITION_TYPES.indexOf(d.ptype) === -1) return reply({ ok: false, error: '請選擇陳情類型' });
  const c = petitionTarget_(String(d.cid || ''));
  if (!c) return reply({ ok: false, error: '請重新選擇要陳情的議員' });
  const toSU = c.id === SU_TARGET.id; // 陳情學生會：不寄副本給秘書處
  if (d.role && PETITION_ROLES.indexOf(d.role) === -1) return reply({ ok: false, error: '身分別不正確' });
  if (d.college && COLLEGES.indexOf(d.college) === -1) return reply({ ok: false, error: '所屬學院不正確' });
  const desc = String(d.desc || '').trim();
  if (!desc) return reply({ ok: false, error: '請填寫簡述' });
  if (hasLink_(desc) || hasLink_(d.name)) return reply({ ok: false, error: LINK_MSG });
  if (d.wantReply !== '是' && d.wantReply !== '否') return reply({ ok: false, error: '請選擇是否希望議員回復' });
  const mail = String(d.mail || '').trim();
  if (d.wantReply === '是' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return reply({ ok: false, error: '請填寫正確的聯絡信箱' });
  if (d.publish !== '是' && d.publish !== '否') return reply({ ok: false, error: '請選擇是否同意公開處理結果' });
  const files = (d.files || []).filter(f => f && f.data);
  if (files.length > PETITION_MAX_FILES) return reply({ ok: false, error: '附件至多 ' + PETITION_MAX_FILES + ' 個' });
  const bad = badFile_(files);
  if (bad) return reply({ ok: false, error: bad });
  if (files.reduce((s, f) => s + f.data.length * 0.75, 0) > PETITION_MAX_MB * 1024 * 1024) return reply({ ok: false, error: '附件合計超過 ' + PETITION_MAX_MB + 'MB' });

  // 寄出與存檔前讓網址失效；有改動時在信裡註明
  const rawDesc = desc;
  const name = defang_(String(d.name || '').trim());
  const descSafe = defang_(rawDesc);
  const defanged = descSafe !== rawDesc || name !== String(d.name || '').trim();
  const sheet = getSheet('陳情', PETITION_HEADER);
  const id = 'P' + nextId(sheet);

  // 附件存入本會雲端硬碟「陳情附件」（不公開），並附在寄給議員的信裡
  const blobs = files.map(f => Utilities.newBlob(Utilities.base64Decode(f.data), f.mimeType || 'application/octet-stream', f.name));
  const links = [];
  if (blobs.length) {
    const folder = getFolder_('陳情附件').createFolder(id);
    blobs.forEach(b => links.push(b.getName() + ' | ' + folder.createFile(b.copyBlob()).getUrl()));
  }
  while (links.length < PETITION_MAX_FILES) links.push('');

  const who = toSU ? '學生會' : c.seat + '　' + c.name;
  const rec = [id, null, d.ptype, c.id, who, name, d.role || '', d.college || '', descSafe].concat(links)
    .concat([d.wantReply, d.wantReply === '是' ? mail : '', d.publish === '是' ? '同意' : '不同意', '待處理']);

  const guard = note('保密提醒', '陳情人的姓名與個人資料，未經陳情人同意，不得向其他人員透露。疑似校園性別事件應予保密。');
  const facts = box([['案件編號', id], ['陳情類型', esc(d.ptype)]]);
  const body = '<h4 style="margin:20px 0 4px">簡述</h4><p style="margin:0;white-space:pre-line">' + esc(descSafe) + '</p>' +
    (defanged ? '<p style="font-size:13px;color:#7A3200">為安全起見，內容中疑似網址的文字已自動失效（例如 example[.]com），請勿自行還原點擊。</p>' : '');
  const pub = d.publish === '是' ? '同意。結案後請去識別化，再交由本會公告於社群媒體。' : '不同意，請勿公開。';

  // 1) 寄給議員：完整內容＋附件
  const toCouncillor = frame(toSU ? '陳情通知（學生會）' : '陳情通知',
    '<p>' + (toSU ? '學生會您好：' : esc(c.name) + ' 議員您好：') + '<br>您收到一件新的陳情，內容如下。</p>' + guard + facts +
    '<table style="width:100%;line-height:1.8;margin-top:12px">' +
    row('陳情人', esc(name || '未提供')) + row('身分別', esc(d.role || '未註明')) + row('學院', esc(d.college || '未註明')) + '</table>' + body +
    (blobs.length ? '<h4 style="margin:16px 0 4px">附件</h4>' + ol(blobs.map(b => b.getName())) + '<p style="font-size:13px;color:#5A6070">附件已附在本信中。</p>' : '') +
    note('後續處理', '希望回復／諮詢：' + (d.wantReply === '是' ? '是，請以 <b>' + esc(mail) + '</b> 與陳情人聯絡。' : '否。') +
      '<br>公開處理結果：' + pub));
  const opt = { to: c.mail, subject: '【陳情 ' + id + '】' + d.ptype + (toSU ? '（學生會）' : ''), htmlBody: toCouncillor, name: '學生議會陳情系統' };
  if (d.wantReply === '是') opt.replyTo = mail;
  if (blobs.length) opt.attachments = blobs;
  MailApp.sendEmail(opt);
  addRow(sheet, rec); // 寄信成功才登錄，避免寄不出去卻留下一筆
  cache.put('petition_hour', String(n + 1), 3600);

  // 2) 副本給秘書處：隱去陳情人姓名、信箱與附件，僅供列管（寄給學生會時不寄）
  if (!toSU) try {
    MailApp.sendEmail({ to: SECRETARIAT_EMAIL, subject: '【陳情副本 ' + id + '】' + d.ptype + '（' + c.name + ' 議員）', name: '學生議會陳情系統',
      htmlBody: frame('陳情副本（列管用）',
        '<p>系統已將以下陳情寄給 <b>' + esc(who) + '</b> 議員。本副本已隱去陳情人姓名、聯絡信箱與附件。</p>' + facts +
        '<table style="width:100%;line-height:1.8;margin-top:12px">' +
        row('身分別', esc(d.role || '未註明')) + row('學院', esc(d.college || '未註明')) +
        row('附件', blobs.length + ' 個（僅寄給議員）') + row('希望回復', esc(d.wantReply)) + row('同意公開', d.publish === '是' ? '同意' : '不同意') + '</table>' + body) });
  } catch (err) { console.error(err); }

  return reply({ ok: true, id: id, councillor: who });
}

// ---------- 秘書處草擬系統登入（帳密只存在這份程式裡，網頁看不到） ----------
function handleSecLogin(d) {
  const cache = CacheService.getScriptCache(), key = 'secfail';
  const fails = Number(cache.get(key) || 0);
  if (fails >= MAX_FAILS) return reply({ ok: false, error: '嘗試次數過多，請 ' + LOCK_MINUTES + ' 分鐘後再試。' });
  if (String(d.user || '').trim() !== SEC_USER || String(d.pass || '') !== SEC_PASS) {
    cache.put(key, String(fails + 1), LOCK_MINUTES * 60);
    return reply({ ok: false, error: '帳號或密碼錯誤，請再試一次。' });
  }
  cache.remove(key);
  // 發一組 12 小時有效的秘書處通行碼（改密碼後自動失效），用來新增／刪除會議期程
  const props = PropertiesService.getScriptProperties();
  purgeTokens_(props);
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  props.setProperty('tok_' + token, JSON.stringify({ sec: true, fp: fp_(SEC_PASS), exp: Date.now() + SEC_HOURS * 36e5 }));
  return reply({ ok: true, token: token });
}
const SEC_HOURS = 12;
function checkSec_(token) {
  if (!token) return false;
  const raw = PropertiesService.getScriptProperties().getProperty('tok_' + token);
  if (!raw) return false;
  try { const t = JSON.parse(raw); return t.sec === true && t.exp > Date.now() && t.fp === fp_(SEC_PASS); } catch (e) { return false; }
}

// ---------- 會議直播（首頁）：檢查議會 YouTube 頻道現在有沒有在直播；結果快取 60 秒 ----------
// 做法是讀取頻道的「/live」頁面判斷，不需要 API 金鑰；YouTube 若改版導致判斷失效，首頁會顯示「無公開會議」，不會壞掉。

// ---------- 提案人頭像：讀學生會官網的「學生議員」各屆名單與學生會長頁（快取 6 小時） ----------
// 議案頁依議案編號的屆次（NTPUSP-27-001 → 第 27 屆）找提案議員；官網新增屆次頁面時會自動抓到，換屆不用改程式。
const SU_SITE = 'https://ntpusu.ntpu.edu.tw';
const ROSTER_INDEX = SU_SITE + '/p/412-1015-176.php?Lang=zh-tw';      // 學生議員（各屆名單目錄）
const PRES_PAGES = [SU_SITE + '/p/412-1015-204.php?Lang=zh-tw',        // 學生會長（當屆）
  SU_SITE + '/p/412-1015-238.php?Lang=zh-tw', SU_SITE + '/p/412-1015-248.php?Lang=zh-tw']; // 歷屆學生會長
const PHOTO_SKIP_SVG = false; // 官網的 .svg 是真的照片（向量圖，縮放不糊），照常顯示

function peopleOut_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('people_v1');
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  let out;
  try {
    const terms = {};
    rosterIndex_().forEach(t => {
      try { terms[t.term] = parseCards_(fetchHtml_(t.url)).filter(p => /選區|議員/.test(p.text)).map(p => ({
        name: p.name, seat: (p.text.match(/[^\s、，,／/]*選區/) || [''])[0], role: /副議長/.test(p.text) ? '副議長' : /議長/.test(p.text) ? '議長' : '',
        photo: p.photo, link: p.link })); } catch (err) { console.error('roster ' + t.term, err); }
    });
    const pres = [];
    PRES_PAGES.forEach(u => {
      try { parseCards_(fetchHtml_(u)).forEach(p => { if (!pres.some(x => x.name === p.name)) pres.push({ name: p.name, term: (p.text.match(/第\s*(\d+)\s*屆/) || [])[1] || '', photo: p.photo, link: p.link }); }); }
      catch (err) { console.error('pres', err); }
    });
    out = JSON.stringify({ ok: true, terms: terms, pres: pres, index: ROSTER_INDEX, at: twTime(new Date()) });
    try { cache.put('people_v1', out, 21600); } catch (err) {}
  } catch (err) {
    console.error(err);
    out = JSON.stringify({ ok: false, error: '暫時讀不到官網資料' });
  }
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}
function fetchHtml_(url) {
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) throw new Error('HTTP ' + r.getResponseCode() + ' ' + url);
  return r.getContentText('UTF-8');
}
const absUrl_ = (u) => { u = String(u || '').replace(/&amp;/g, '&').trim(); if (!u) return ''; if (/^\/\//.test(u)) return 'https:' + u; if (/^\//.test(u)) return SU_SITE + u; return u; };
const plain_ = (h) => String(h || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
/** 目錄頁：找出「第 N 屆學生議員」連結 */
function rosterIndex_() {
  const html = fetchHtml_(ROSTER_INDEX), seen = {}, list = [];
  const re = /<a\b[^>]*href="([^"]*412-1015-\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const t = plain_(m[2]), n = (t.match(/第\s*(\d+)\s*屆/) || [])[1];
    if (n && /議員/.test(t) && !seen[n]) { seen[n] = 1; list.push({ term: n, url: absUrl_(m[1]) }); }
  }
  return list;
}
/** 人員卡片：照片與姓名都連到同一個個人頁（…/p/405-1015-編號…），卡片內其餘文字含選區、職稱 */
function parseCards_(html) {
  const re = /<a\b[^>]*href="([^"]*\/p\/405-1015-(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, cards = [], byId = {};
  let m;
  while ((m = re.exec(html))) {
    const id = m[2];
    let c = byId[id];
    if (!c) { c = byId[id] = { id: id, link: absUrl_(m[1]), start: m.index, end: m.index, name: '', photo: '' }; cards.push(c); }
    const img = m[3].match(/<img\b[^>]*?(?:data-src|src)="([^"]+)"/i);
    if (img && !c.photo) c.photo = absUrl_(img[1]);
    const t = plain_(m[3]);
    if (t && !c.name) { c.name = t; c.nameEnd = m.index + m[0].length; }
    c.end = m.index + m[0].length;
  }
  cards.forEach((c, i) => {
    const stop = i + 1 < cards.length ? cards[i + 1].start : Math.min(html.length, c.end + 1500);
    c.text = plain_(html.slice(c.start, stop)).replace(c.name, ' ').trim();
    if (PHOTO_SKIP_SVG && /\.svg(\?|$)/i.test(c.photo)) c.photo = '';
    c.name = c.name.replace(/\s+/g, '');
  });
  return cards.filter(c => c.name && c.name.length <= 12);
}

function liveOut_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('live_v1');
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  const ch = String(YT_CHANNEL || '').trim();
  let res = { ok: true, configured: !!ch, live: false, channelUrl: '' };
  if (ch) {
    const base = /^UC[\w-]{22}$/.test(ch) ? 'https://www.youtube.com/channel/' + ch : 'https://www.youtube.com/' + (ch.charAt(0) === '@' ? ch : '@' + ch);
    res.channelUrl = base;
    try {
      const html = UrlFetchApp.fetch(base + '/live', { muteHttpExceptions: true, followRedirects: true,
        headers: { 'Accept-Language': 'zh-TW,zh;q=0.9', 'Cookie': 'CONSENT=YES+1' } }).getContentText();
      const vid = (html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/) || [])[1];
      if (vid && /"isLiveNow"\s*:\s*true/.test(html)) {
        const title = (html.match(/<meta name="title" content="([^"]*)"/) || [])[1] || '';
        res.live = true; res.videoId = vid;
        res.title = title.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      }
    } catch (err) { console.error(err); }
  }
  const out = JSON.stringify(res);
  try { cache.put('live_v1', out, 60); } catch (err) {}
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}

// ---------- 會議期程（「會議期程」工作表；首頁月曆公開讀取，秘書處新增／刪除） ----------
const MEET_SHEET = '會議期程';
const MEET_HEADER = ['編號', '日期', '開始時間', '結束時間', '會議名稱', '類型', '地點', '備註', '建立時間'];
const MEET_TYPES = ['常會', '臨時會', '委員會', '其他'];
function meetingsOut_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('meet_v1');
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  const sh = getSheet(MEET_SHEET, MEET_HEADER);
  const rows = sh.getLastRow() < 2 ? [] : sh.getRange(2, 1, sh.getLastRow() - 1, MEET_HEADER.length).getDisplayValues();
  const items = rows.filter(r => r[0] && /^\d{4}-\d{2}-\d{2}$/.test(r[1])).map(r => ({
    id: r[0], date: r[1], start: r[2], end: r[3], name: r[4], type: r[5], place: r[6], note: r[7]
  })).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const out = JSON.stringify({ ok: true, items: items });
  try { cache.put('meet_v1', out, 60); } catch (err) {}
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}
/** 新增與修改共用的欄位檢查；回傳 { m } 或 { error } */
function meetingFields_(d) {
  const t = (v, n) => String(v || '').trim().slice(0, n);
  const m = { date: t(d.date, 10), start: t(d.start, 5), end: t(d.end, 5), name: t(d.name, 60), type: t(d.mtype, 10), place: t(d.place, 60), note: t(d.note, 200) };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date) || isNaN(new Date(m.date + 'T00:00:00'))) return { error: '請選擇正確的日期' };
  if (m.start && !/^\d{2}:\d{2}$/.test(m.start)) return { error: '開始時間格式不正確' };
  if (m.end && !/^\d{2}:\d{2}$/.test(m.end)) return { error: '結束時間格式不正確' };
  if (m.start && m.end && m.end <= m.start) return { error: '結束時間要晚於開始時間' };
  if (!m.name) return { error: '請填寫會議名稱' };
  if (MEET_TYPES.indexOf(m.type) === -1) return { error: '請選擇會議類型' };
  return { m: m };
}
function handleMeetingAdd(d) {
  const f = meetingFields_(d);
  if (f.error) return reply({ ok: false, error: f.error });
  const m = f.m;
  const sh = getSheet(MEET_SHEET, MEET_HEADER);
  const id = 'M' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  const r = sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, MEET_HEADER.length).setNumberFormat('@')
    .setValues([[id, m.date, m.start, m.end, m.name, m.type, m.place, m.note, twTime(new Date())].map(safe_)]);
  CacheService.getScriptCache().remove('meet_v1');
  return reply({ ok: true, id: id });
}
// 修改已排定的會議：只覆寫日期到備註那幾欄，編號與建立時間保留
function handleMeetingEdit(d) {
  const f = meetingFields_(d);
  if (f.error) return reply({ ok: false, error: f.error });
  const sh = getSheet(MEET_SHEET, MEET_HEADER);
  if (sh.getLastRow() < 2) return reply({ ok: false, error: '找不到這場會議' });
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().map(r => r[0]);
  const i = ids.indexOf(String(d.id || ''));
  if (i === -1) return reply({ ok: false, error: '找不到這場會議，可能已被刪除' });
  const m = f.m;
  sh.getRange(i + 2, 2, 1, 7).setValues([[m.date, m.start, m.end, m.name, m.type, m.place, m.note].map(safe_)]);
  CacheService.getScriptCache().remove('meet_v1');
  return reply({ ok: true, id: String(d.id) });
}
function handleMeetingDel(d) {
  const sh = getSheet(MEET_SHEET, MEET_HEADER);
  if (sh.getLastRow() < 2) return reply({ ok: false, error: '找不到這場會議' });
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().map(r => r[0]);
  const i = ids.indexOf(String(d.id || ''));
  if (i === -1) return reply({ ok: false, error: '找不到這場會議，可能已被刪除' });
  sh.deleteRow(i + 2);
  CacheService.getScriptCache().remove('meet_v1');
  return reply({ ok: true });
}

/** 第一次安裝（或升級）時，在 Apps Script 編輯器上方選「setup」按「執行」，建立「會內帳號」與「議員名單」工作表 */
function setup() {
  const sh = getSheet(ACCOUNT_SHEET, ACCOUNT_HEADER);
  sh.getRange('A:B').setNumberFormat('@'); // 帳號、密碼存成文字，避免 0 開頭被吃掉
  sh.setFrozenRows(1);
  // 「身分」欄做成下拉選單
  sh.getRange('D2:D500').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(ROLES, true).setAllowInvalid(false).build());
  const mt = getSheet(MEET_SHEET, MEET_HEADER);
  mt.getRange('A:I').setNumberFormat('@');
  mt.setFrozenRows(1);
  const cl = getSheet(CL_SHEET, CL_HEADER);
  cl.getRange('A:B').setNumberFormat('@');
  cl.setFrozenRows(1);
  const st = getSheet(SETTINGS_SHEET, ['項目', '值', '說明']);
  if (!st.getRange(1, 1, st.getLastRow(), 1).getDisplayValues().some(r => r[0] === '屆次')) {
    st.appendRow(['屆次', TERM, '換屆時改這格（只填數字，例如 28）。議案編號會變成 NTPUSP-28-001 起算。']);
  }
  st.getRange('B:B').setNumberFormat('@');
  st.setFrozenRows(1);
  cl.getRange('F2:F200').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['在任', '離任'], true).setAllowInvalid(false).build());
}

// ---------- 會內系統帳號（讀取試算表「會內帳號」工作表） ----------
// 欄位：帳號｜密碼｜名稱｜身分｜啟用
//   身分：學生議員、秘書處 → 可用全部功能；學生會、學生法院 → 只能提案（未填視同只能提案）
//   啟用：留空或打勾＝可登入；填「否」或取消勾選＝停用
const ACCOUNT_SHEET = '會內帳號';
const ACCOUNT_HEADER = ['帳號', '密碼', '名稱', '身分', '啟用'];
const ROLES = ['學生議員', '秘書處', '學生會', '學生法院'];
const FULL_ROLES = ['學生議員', '秘書處'];
/** 各身分可選的提案單位 */
function allowedUnits_(role) {
  if (role === '學生會') return PROPOSAL_UNITS.filter(u => u.indexOf('學生會') === 0);
  if (role === '學生法院') return ['學生法院書記處'];
  if (FULL_ROLES.indexOf(role) !== -1) return PROPOSAL_UNITS;
  return [];
}
const TOKEN_DAYS = 30;     // 登入後保持幾天
const MAX_FAILS = 5;       // 同一帳號連續輸錯幾次就暫停
const LOCK_MINUTES = 10;   // 暫停幾分鐘

function accounts_() {
  const sh = getSheet(ACCOUNT_SHEET, ACCOUNT_HEADER);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 5).getDisplayValues().map(r => {
    const flag = String(r[4]).trim().toUpperCase();
    return { u: String(r[0]).trim(), p: String(r[1]), name: String(r[2]).trim() || String(r[0]).trim(),
      role: String(r[3]).trim(), on: ['FALSE', '否', '停用', 'N', 'NO'].indexOf(flag) === -1 };
  }).filter(a => a.u);
}
const fp_ = (pw) => Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pw, Utilities.Charset.UTF_8)).slice(0, 16);

function handleLogin(d) {
  const u = String(d.user || '').trim(), p = String(d.pass || '');
  const cache = CacheService.getScriptCache(), key = 'fail_' + u.toLowerCase();
  const fails = Number(cache.get(key) || 0);
  if (fails >= MAX_FAILS) return reply({ ok: false, error: '嘗試次數過多，請 ' + LOCK_MINUTES + ' 分鐘後再試。' });
  const a = accounts_().find(x => x.u === u && x.p === p && x.on);
  if (!a) { cache.put(key, String(fails + 1), LOCK_MINUTES * 60); return reply({ ok: false, error: '帳號或密碼錯誤，請再試一次。' }); }
  cache.remove(key);
  const props = PropertiesService.getScriptProperties();
  purgeTokens_(props);
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  props.setProperty('tok_' + token, JSON.stringify({ u: a.u, fp: fp_(a.p), exp: Date.now() + TOKEN_DAYS * 864e5 }));
  return reply({ ok: true, token: token, name: a.name, role: a.role, units: allowedUnits_(a.role) });
}

/** 驗證登入：帳號被停用、改密碼或過期，舊的登入就失效。回傳 { label: 名稱（帳號）, role } 或 null */
function checkToken_(token) {
  if (!token) return null;
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('tok_' + token);
  if (!raw) return null;
  let t; try { t = JSON.parse(raw); } catch (e) { return null; }
  if (t.exp < Date.now()) { props.deleteProperty('tok_' + token); return null; }
  const a = accounts_().find(x => x.u === t.u && x.on && fp_(x.p) === t.fp);
  return a ? { label: a.name + '（' + a.u + '）', role: a.role } : null;
}
function revokeToken_(token) { if (token) PropertiesService.getScriptProperties().deleteProperty('tok_' + token); }
function purgeTokens_(props) {
  const all = props.getProperties(), now = Date.now();
  Object.keys(all).forEach(k => {
    if (k.indexOf('tok_') !== 0) return;
    try { if (JSON.parse(all[k]).exp < now) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}

// ---------- 共用 ----------
function checkCommon(d) {
  for (const k of ['who', 'mail', 'org']) if (!d[k] || !String(d[k]).trim()) return '缺少欄位：' + k;
  if ((d.type === 'invite' ? INVITE_ORGS : UNITS).indexOf(d.org) === -1) return '單位不正確';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(d.mail).trim())) return '回覆信箱格式不正確';
  if (ALLOWED_DOMAIN && !String(d.mail).toLowerCase().endsWith(ALLOWED_DOMAIN)) return '請使用 ' + ALLOWED_DOMAIN + ' 信箱';
  return '';
}

/** 依單位決定收件人：議會秘書處收件時不再重複副本給自己 */
function route(d) {
  if (d.org === '學生議會秘書處' || d.org === '學生議會') return { toName: d.org, to: SECRETARIAT_EMAIL, cc: [d.mail] };
  if (d.org === '學生法院書記處' || d.org === '學生法院') return { toName: d.org, to: COURT_EMAIL, cc: [SECRETARIAT_EMAIL, d.mail] };
  return { toName: '學生會', to: SU_EMAIL, cc: [SECRETARIAT_EMAIL, d.mail] };
}

function send(r, subject, html) {
  MailApp.sendEmail({ to: r.to, cc: r.cc.join(','), subject: subject, htmlBody: html, name: '學生議會議員專區' });
}

/** 提案的送出時間寫成「2026/10/20 上午 1:54:38」（台灣時間，存成文字以免試算表自動改格式） */
function twTime(d) {
  const tz = 'Asia/Taipei';
  const H = Number(Utilities.formatDate(d, tz, 'H'));
  return Utilities.formatDate(d, tz, 'yyyy/MM/dd') + ' ' + (H < 12 ? '上午' : '下午') + ' ' + (H % 12 || 12) + ':' + Utilities.formatDate(d, tz, 'mm:ss');
}
function addRow(sheet, row) {
  row[1] = twTime(new Date());
  appendSafe_(sheet, row);
  sheet.getRange(sheet.getLastRow(), 2).setNumberFormat('@').setValue(row[1]);
}

function getSheet(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(header);
  return sh;
}
function nextId(sheet) { return term_() + '-' + String(sheet.getLastRow()).padStart(3, '0'); }

// ---------- 設定（「設定」工作表：A 欄項目、B 欄值） ----------
const SETTINGS_SHEET = '設定';
/** 目前屆次：讀「設定」工作表裡「屆次」那一列的值；沒填就用上方 TERM 預設值 */
function term_() {
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SETTINGS_SHEET);
    if (sh && sh.getLastRow() >= 1) {
      const rows = sh.getRange(1, 1, sh.getLastRow(), 2).getDisplayValues();
      const r = rows.find(x => String(x[0]).trim() === '屆次');
      const v = r ? String(r[1]).normalize('NFKC').replace(/\D/g, '') : '';
      if (v) return v;
    }
  } catch (err) { console.error(err); }
  return TERM;
}
function lines(s) { return String(s || '').split('\n').map(x => x.trim()).filter(Boolean); }
function whoLine(d) { return esc(d.who) + (d.seat ? '（選區：' + esc(d.seat) + '）' : ''); }
function ol(items) { return '<ol>' + items.map(a => '<li>' + esc(a) + '</li>').join('') + '</ol>'; }
function row(k, v) { return '<tr><td style="color:#5A6070;width:70px;vertical-align:top">' + k + '</td><td><b>' + v + '</b></td></tr>'; }
function box(cells) {
  return '<table style="background:#F7F4EC;padding:12px 16px;border-radius:4px;width:100%"><tr>' +
    cells.map(c => '<td>' + c[0] + '<br><b>' + c[1] + '</b></td>').join('') + '</tr></table>';
}
function note(title, text) {
  return '<p style="border:2px solid #1D2230;border-radius:4px;padding:12px 16px;margin-top:24px"><b>' + title + '：</b>' + text + '</p>';
}
function frame(title, body) {
  return '<div style="font-family:sans-serif;color:#1D2230;max-width:640px;line-height:1.8">' +
    '<div style="font-size:13px;color:#5A6070;letter-spacing:.1em">國立臺北大學三峽校區學生議會</div>' +
    '<h2 style="margin:4px 0 16px;border-bottom:3px double #1D2230;padding-bottom:12px">' + title + '</h2>' + body +
    '<p style="font-size:12px;color:#5A6070">此信由學生議會議員專區自動寄出。對系統有疑問，請洽議會秘書處 ' + SECRETARIAT_EMAIL + '。</p></div>';
}
function reply(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/*
 * ===== 網站端呼叫方式 =====
 * const SCRIPT_URL = '部署後拿到的網址';
 *
 * // 送出（Content-Type 用 text/plain 才不會被瀏覽器的 CORS 擋下）
 * const post = (data) => fetch(SCRIPT_URL, {
 *   method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data)
 * }).then(r => r.json());
 *
 * // 索資
 * post({ type: 'request', who, seat, mail, org, subj, asks, why, due, mode });
 * // 邀請列席備詢（org = '學生會' / '學生法院'；people = [{ title: '財務部部長', name: '王某某' }, ...]）
 * post({ type: 'invite', who, seat, mail, org, people, meeting: '第 27 屆第 5 次常會', topics, note });
 *
 * // 提案（不寄信，只寫入「提案」工作表；files 最多 5 個，用 FileReader 讀成 base64）
 * // const toB64 = f => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(f); });
 * // files = await Promise.all(選到的檔案.map(async f => ({ name: f.name, mimeType: f.type, data: await toB64(f) })));
 * post({ type: 'proposal', unit, who, wmail, cname, cmail, ptype: 提案類型, title, desc, files });
 *
 * // 建議事項（committee = 文務委員會／法制委員會／財務委員會；dept 須為該委員會監督的部門）
 * post({ type: 'suggest', who, committee, dept, subj, desc, plan });
 *
 * // 會內系統登入：post({ type: 'login', user, pass }) → { ok, token, name }；之後每次送出都要帶 token
 *
 * 回傳 { ok: true, id } 表示成功；{ ok: false, error } 則把 error 顯示給使用者。
 */
