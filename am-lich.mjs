// Đổi ngày dương → âm lịch Việt Nam (múi giờ +7). Thuật toán của Hồ Ngọc Đức (công khai, dùng rộng rãi).
const PI = Math.PI, fl = Math.floor;
function jdFromDate(dd, mm, yy) {
  const a = fl((14 - mm) / 12), y = yy + 4800 - a, m = mm + 12 * a - 3;
  let jd = dd + fl((153 * m + 2) / 5) + 365 * y + fl(y / 4) - fl(y / 100) + fl(y / 400) - 32045;
  if (jd < 2299161) jd = dd + fl((153 * m + 2) / 5) + 365 * y + fl(y / 4) - 32083;
  return jd;
}
function newMoon(k, tz) {
  const T = k / 1236.85, T2 = T * T, T3 = T2 * T, dr = PI / 180;
  let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 = C1 + 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  const dt = T < -11 ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3 : -0.000278 + 0.000265 * T + 0.000262 * T2;
  return fl(Jd1 + C1 - dt + 0.5 + tz / 24);
}
function sunLong(jdn, tz) {
  const T = (jdn - 2451545.5 - tz / 24) / 36525, T2 = T * T, dr = PI / 180;
  const M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL += (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M);
  let L = (L0 + DL) * dr; L -= PI * 2 * fl(L / (PI * 2));
  return fl(L / PI * 6);
}
function month11(yy, tz) {
  const off = jdFromDate(31, 12, yy) - 2415021, k = fl(off / 29.530588853);
  let nm = newMoon(k, tz); if (sunLong(nm, tz) >= 9) nm = newMoon(k - 1, tz);
  return nm;
}
function leapOffset(a11, tz) {
  const k = fl((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last, i = 1, arc = sunLong(newMoon(k + i, tz), tz);
  do { last = arc; i++; arc = sunLong(newMoon(k + i, tz), tz); } while (arc !== last && i < 14);
  return i - 1;
}
export function amLich(dd, mm, yy, tz = 7) {
  const day = jdFromDate(dd, mm, yy), k = fl((day - 2415021.076998695) / 29.530588853);
  let start = newMoon(k + 1, tz); if (start > day) start = newMoon(k, tz);
  let a11 = month11(yy, tz), b11 = a11, nam;
  if (a11 >= start) { nam = yy; a11 = month11(yy - 1, tz); } else { nam = yy + 1; b11 = month11(yy + 1, tz); }
  const ngay = day - start + 1, diff = fl((start - a11) / 29);
  let nhuan = false, thang = diff + 11;
  if (b11 - a11 > 365) { const lm = leapOffset(a11, tz); if (diff >= lm) { thang = diff + 10; if (diff === lm) nhuan = true; } }
  if (thang > 12) thang -= 12;
  if (thang >= 11 && diff < 4) nam -= 1;
  return { ngay, thang, nam, nhuan };
}
