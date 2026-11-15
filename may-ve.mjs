// 📟 Máy vẽ bảng Kindle – bản Android: chạy 1 lần trên GitHub Actions (không cần máy tính), xuất ảnh lên GitHub Pages.
// Mỗi phút vẽ 1 ảnh 1072x1448 xám: Dương lịch | Thứ + thời tiết | Âm lịch · châm ngôn · việc cần làm · mức dùng Claude.
// Phát trong mạng nhà/văn phòng: http://<IP máy Mac>:8466/<ma>/kindle.png  (Kindle thức dậy vài lần/ngày tải về).
// Cấu hình: cau-hinh.json cạnh file này. Việc cần làm: viec.txt (mỗi dòng 1 việc, có thể bắt đầu bằng giờ "14:00 Gọi khách").
// Chạy thử 1 lần ra ảnh: node may-ve.mjs --mot-lan   → ~/.bang-kindle/kindle.png
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { amLich } from './am-lich.mjs';

const chay = promisify(execFile);
const DAY = path.dirname(new URL(import.meta.url).pathname);
const NHA = os.homedir(), THU = process.env.OUT_DIR || path.join(NHA, '.bang-kindle');
fs.mkdirSync(THU, { recursive: true });
const docJ = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const CH = docJ(path.join(DAY, 'cau-hinh.json')) || {};
const MA = CH.ma, LAT = CH.vi_do ?? 21.03, LON = CH.kinh_do ?? 105.85;           // mặc định: Hà Nội
const TZ = CH.mui_gio ?? 7;
const MOC = (CH.moc || ['07:30', '12:00', '17:00']).map((x) => x.split(':').map(Number)); // PHẢI trùng bin/chay.sh trên Kindle
const CHROME = process.env.CHROME || CH.chrome || 'google-chrome';
const FFMPEG = CH.ffmpeg || 'ffmpeg';
const CONG = CH.cong || 8466, W = 1072, H = 1448;
if (!MA) { console.error('Thiếu "ma" trong cau-hinh.json (chuỗi ngẫu nhiên, giống ma.txt trên Kindle)'); process.exit(1); }

// ---------- mức dùng Claude (gói Pro/Max) ----------
// Nguồn 1: ~/.bang-kindle/usage.json do ghi-usage.py ghi (thanh trạng thái Claude Code).
// Nguồn 2: file của app Claude desktop (nếu có). Lấy cái mới hơn.
function usage() { return {}; } // bản Android: không có mức dùng Claude

// ---------- việc cần làm: viec.txt ----------
// "14:00 Gọi khách A"  → có giờ;  "x Nộp báo cáo" → đã xong (gạch);  "! Đóng tiền điện" → gấp (ô đặc)
function viec() {
  let t = ''; try { t = fs.readFileSync(path.join(DAY, 'viec.txt'), 'utf8'); } catch (e) { return []; }
  return t.split('\n').map((d) => d.trim()).filter((d) => d && !d.startsWith('#')).map((d) => {
    let k = '';
    if (/^x\s+/i.test(d)) { k = 'xong'; d = d.replace(/^x\s+/i, ''); } else if (d.startsWith('!')) { k = 'gap'; d = d.slice(1).trim(); }
    const m = d.match(/^(\d{1,2}[:h]\d{2})\s+(.*)$/);
    return m ? { g: m[1].replace('h', ':'), t: m[2], k } : { t: d, k };
  });
}

// ---------- thời tiết (Open-Meteo: miễn phí, không cần chìa) – 30 phút/lần ----------
const F_TT = path.join(THU, 'thoitiet.json');
let ttLuc = 0;
async function layThoiTiet() {
  if (Date.now() - ttLuc < 30 * 60e3) return; ttLuc = Date.now();
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&hourly=precipitation_probability&timezone=auto&forecast_days=1`, { signal: AbortSignal.timeout(15e3) });
    const j = await r.json(); if (!j.current) return;
    fs.writeFileSync(F_TT, JSON.stringify({ luc: Date.now(), t: j.current.temperature_2m, ma: j.current.weather_code, ngay: j.current.is_day,
      cao: j.daily?.temperature_2m_max?.[0], thap: j.daily?.temperature_2m_min?.[0], mua: muaConLai(j) }));
  } catch (e) { console.error('Thời tiết lỗi:', e.message); ttLuc = Date.now() - 25 * 60e3; }
}
function muaConLai(j) { // khả năng mưa CAO NHẤT từ giờ tới hết ngày (bỏ giờ đã qua)
  const h = j.hourly, gioNay = String(j.current?.time || '').slice(0, 13); if (!h?.time) return null;
  const ds = h.time.map((t, i) => [t, h.precipitation_probability[i]]).filter(([t]) => t.slice(0, 13) >= gioNay && t.slice(0, 10) === gioNay.slice(0, 10));
  return ds.length ? Math.max(...ds.map(([, p]) => p ?? 0)) : null;
}
function thoiTiet() { const t = docJ(F_TT); return t && Date.now() - t.luc < 3 * 3600e3 ? t : null; }
function bieuTuong(ma, ngay) { // icon nét (vẽ trên nền đen rồi cả trang được đảo màu)
  const nang = '<circle cx="24" cy="24" r="9"/><path d="M24 6v5M24 37v5M6 24h5M37 24h5M11 11l3.5 3.5M36.5 11L33 14.5M11 37l3.5-3.5"/>';
  const trang = '<path d="M30 10a14 14 0 1 0 12 22A12 12 0 0 1 30 10z"/>';
  const may = (x = 0) => `<path transform="translate(${x} 0)" d="M22 52h24a10 10 0 0 0-1.5-19.9A13 13 0 0 0 19 36a8 8 0 0 0 3 16z" fill="#000"/>`;
  let n;
  if (ma === 0) n = ngay ? '<g transform="translate(8 8)">' + nang + '</g>' : '<g transform="translate(4 6)">' + trang + '</g>';
  else if (ma <= 2) n = (ngay ? nang : trang) + may(4);
  else if (ma === 3) n = may(-4).replace('fill="#000"', 'fill="none"');
  else if (ma === 45 || ma === 48) n = '<path d="M10 24h44M6 34h52M12 44h40"/>';
  else if (ma >= 95) n = may(-4) + '<path d="M30 54l-6 8h8l-5 8" />';
  else n = may(-4) + '<path d="M24 56l-3 6M34 56l-3 6M44 56l-3 6"/>';
  return `<svg viewBox="0 0 64 68" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${n}</svg>`;
}

// ---------- mốc cập nhật + pin Kindle (Kindle gửi kèm ?b=pin&c=sạc khi tải ảnh) ----------
const hhmm = (h, m) => String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
const mocCua = (h, m) => { const p = h * 60 + m; let i = -1; MOC.forEach(([a, b], k) => { if (p >= a * 60 + b - 5) i = k; }); return i; };
const mocSau = (h, m) => { const p = h * 60 + m + 5; const x = MOC.find(([a, b]) => a * 60 + b > p) || MOC[0]; return hhmm(x[0], x[1]); };
function tinhTrangKindle() { return {}; } // bản Android: máy chủ tĩnh không biết pin Kindle

// ---------- châm ngôn: đổi ở mỗi mốc (3 câu/ngày), đi hết kho mới lặp ----------
function chamNgon(dd, mm, yy, al, moc) {
  const k = docJ(path.join(DAY, 'cham-ngon.json')); if (!k?.ds?.length) return null;
  const db = k.dac_biet || {};
  const dacBiet = db[`${dd}/${mm}`] || db[`am:${al.ngay}/${al.thang}`] || (al.ngay === 1 && db['am:1']) || (al.ngay === 15 && db['am:15']);
  const ngay = Math.floor(Date.UTC(yy, mm - 1, dd) / 86400e3), luot = ngay * MOC.length + Math.max(0, moc);
  const c = (moc <= 0 && dacBiet) || k.ds[(luot * 37) % k.ds.length];
  return c ? { cau: c[0], nguon: c[1] } : null;
}
const CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'], CHI = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];
const namAm = (n) => CAN[(n + 6) % 10] + ' ' + CHI[(n + 8) % 12];
const THU_VN = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- bố cục ----------
function html(u, now) {
  const vn = new Date(now.getTime() + TZ * 3600e3);
  const dd = vn.getUTCDate(), mm = vn.getUTCMonth() + 1, yy = vn.getUTCFullYear(), hh = vn.getUTCHours(), mi = vn.getUTCMinutes();
  const al = amLich(dd, mm, yy, TZ), cn = chamNgon(dd, mm, yy, al, mocCua(hh, mi)), tt = thoiTiet(), kt = tinhTrangKindle();
  const todo = viec(), conLai = todo.filter((x) => x.k !== 'xong').length;
  const dsTodo = todo.length ? todo.slice(0, 8).map((x) => `<li class="${x.k}">${x.g ? `<span class="g">${esc(x.g)}</span>` : ''}${esc(x.t)}</li>`).join('')
    : '<li class="trong">Không có việc nào ✓</li>';
  const ngayNam = Math.round((Date.UTC(yy, mm - 1, dd) - Date.UTC(yy, 0, 0)) / 86400e3), tongNam = (yy % 4 === 0 && (yy % 100 !== 0 || yy % 400 === 0)) ? 366 : 365;
  const conNam = tongNam - ngayNam, tuanNam = Math.ceil(ngayNam / 7);
  const chan = `Cập nhật ${hhmm(hh, mi)} · lần sau ${kt.sac ? '30 phút nữa (đang sạc)' : mocSau(hh, mi)}${kt.pin ? ' · pin ' + kt.pin + '%' : ''}`;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><style>
  html,body{margin:0;background:#000}
  html{filter:invert(1)} /* nền trắng chữ đen: thiết kế cho nền đen rồi đảo cả trang. Muốn nền đen thì xóa dòng này */
  body{width:${W}px;height:${H}px;overflow:hidden;color:#fff;box-sizing:border-box;padding:52px 72px 36px;
    font-family:-apple-system,"SF Pro Display",Inter,"Helvetica Neue",Arial,sans-serif;display:flex;flex-direction:column}
  .to{display:grid;grid-template-columns:1fr 1.1fr 1fr;align-items:center;text-align:center}
  .cot .nhan{font-size:22px;letter-spacing:3px;color:#999;font-weight:700}
  .cot .lon{font-size:200px;font-weight:800;line-height:.95;letter-spacing:-6px;font-variant-numeric:tabular-nums}
  .cot .duoi{font-size:27px;color:#ccc;font-weight:600;margin-top:4px;white-space:nowrap}
  .giua{border-left:3px solid #333;border-right:3px solid #333;padding:6px 0}
  .giua .thu{font-size:56px;font-weight:800;line-height:1.05}
  .giua .tt{display:flex;justify-content:center;align-items:center;gap:12px;margin-top:16px}
  .giua .tt svg{width:64px;height:68px}
  .giua .tt b{font-size:56px;font-weight:700}
  .giua .tt2{font-size:23px;color:#aaa;font-weight:600;margin-top:6px}
  .cn{font-size:40px;font-style:italic;font-weight:500;color:#eee;text-align:center;margin:40px 10px 28px;line-height:1.3;text-wrap:balance}
  .cn small{display:block;font-style:normal;font-size:23px;color:#8a8a8a;margin-top:10px;font-weight:400}
  .todo{flex:1;border-top:3px solid #444;padding-top:20px;overflow:hidden}
  .todo h2{margin:0 0 4px;font-size:26px;letter-spacing:3px;color:#999;font-weight:700;display:flex;justify-content:space-between}
  .todo h2 b{color:#fff;letter-spacing:0}
  .todo ul{list-style:none;margin:0;padding:0}
  .todo li{font-size:40px;font-weight:600;padding:10px 0;display:flex;gap:22px;align-items:center;white-space:nowrap;overflow:hidden}
  .todo li::before{content:"";width:30px;height:30px;border:4px solid #fff;border-radius:6px;flex:none;box-sizing:border-box}
  .todo li.gap::before{background:#fff}
  .todo li .g{width:116px;flex:none;font-variant-numeric:tabular-nums}
  .todo li.xong{color:#555;text-decoration:line-through}.todo li.xong::before{border-color:#555;background:#555}
  .todo li.trong{color:#777;font-size:32px}.todo li.trong::before{display:none}
  .so{display:grid;grid-template-columns:1fr 1fr 1fr;border-top:3px solid #444;padding-top:24px;text-align:center}
  .so div+div{border-left:3px solid #333}
  .so b{display:block;font-size:68px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}
  .so span{display:block;font-size:21px;color:#aaa;font-weight:600;margin-top:10px;letter-spacing:1px}
  .chan{font-size:21px;color:#888;text-align:center;margin-top:18px}
  </style></head><body>
  <div class="to">
    <div class="cot"><div class="nhan">DƯƠNG LỊCH</div><div class="lon">${dd}</div><div class="duoi">Tháng ${mm} · ${yy}</div></div>
    <div class="giua"><div class="thu">${THU_VN[vn.getUTCDay()]}</div>
      ${tt ? `<div class="tt">${bieuTuong(tt.ma, tt.ngay)}<b>${Math.round(tt.t)}°</b></div><div class="tt2">${tt.thap != null ? Math.round(tt.thap) + '°–' + Math.round(tt.cao) + '°' : ''}${tt.mua != null ? ' · mưa ' + tt.mua + '%' : ''}</div>` : ''}
    </div>
    <div class="cot"><div class="nhan">ÂM LỊCH</div><div class="lon">${al.ngay}</div><div class="duoi">Tháng ${al.thang}${al.nhuan ? ' nhuận' : ''} · ${namAm(al.nam)}</div></div>
  </div>
  ${cn ? `<div class="cn">“${esc(cn.cau)}”<small>${esc(cn.nguon)}</small></div>` : ''}
  <section class="todo"><h2>VIỆC CẦN LÀM ${conLai ? `<b>${conLai} việc</b>` : ''}</h2><ul>${dsTodo}</ul></section>
  <section class="so">
    <div><b>${tuanNam}</b><span>TUẦN TRONG NĂM</span></div>
    <div><b>${ngayNam}</b><span>NGÀY TRONG NĂM</span></div>
    <div><b>${conNam}</b><span>NGÀY CÒN LẠI</span></div>
  </section>
  <div class="chan">${chan}</div>
  </body></html>`;
}

let dangVe = false;
async function ve() {
  if (dangVe) return; dangVe = true;
  try {
    const fHtml = path.join(THU, 'man.html'), fMau = path.join(THU, 'man-mau.png'), fTam = path.join(THU, 'kindle.tam.png');
    fs.writeFileSync(fHtml, html(usage(), new Date()));
    const truoc = Date.now();
    try {
      await chay(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--user-data-dir=${path.join(THU, 'chrome')}`,
        `--window-size=${W},${H}`, `--screenshot=${fMau}`, 'file://' + fHtml], { timeout: 40e3 });
    } catch (e) { // Chrome đôi khi báo lỗi lúc đóng dù đã chụp xong → chỉ coi là lỗi khi không có ảnh mới
      if (!fs.existsSync(fMau) || fs.statSync(fMau).mtimeMs < truoc) throw e;
    }
    await chay(FFMPEG, ['-loglevel', 'error', '-y', '-i', fMau, '-vf', 'format=gray', '-pix_fmt', 'gray', fTam], { timeout: 20e3 });
    fs.renameSync(fTam, path.join(THU, 'kindle.png'));
  } catch (e) { console.error('Vẽ lỗi:', e.message); }
  dangVe = false;
}

if (process.argv.includes('--mot-lan')) {
  await layThoiTiet(); await ve();
  const ra = path.join(THU, 'kindle.png');
  if (!fs.existsSync(ra)) { console.error('Không vẽ được ảnh'); process.exit(1); }
  const xuat = process.env.XUAT; // vd public/<ma>/kindle.png (GitHub Pages)
  if (xuat) { fs.mkdirSync(path.dirname(xuat), { recursive: true }); fs.copyFileSync(ra, xuat); }
  console.log('Đã vẽ:', ra); process.exit(0);
}

console.error('Chỉ chạy được với --mot-lan'); process.exit(1);
