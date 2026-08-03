/* ================= Құрт сату — Telegram Mini App =================
   Дерек: Telegram CloudStorage (болмаса localStorage)
   Карта: OpenStreetMap + OSRM (тегін)
================================================================= */
const TG = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
const VER = "1.4";
const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/* ---------- Telegram баптау ---------- */
if (TG) {
  TG.ready(); TG.expand();
  try { TG.setHeaderColor("#ffffff"); TG.setBackgroundColor("#f5f6f8"); } catch (e) {}
  try { TG.enableClosingConfirmation(); } catch (e) {}
  try { TG.disableVerticalSwipes && TG.disableVerticalSwipes(); } catch (e) {}
}
function haptic(t) { try { if (!TG) return;
  if (t === "ok") TG.HapticFeedback.notificationOccurred("success");
  else if (t === "err") TG.HapticFeedback.notificationOccurred("error");
  else TG.HapticFeedback.impactOccurred(t || "light"); } catch (e) {} }

/* ---------- Уақыт: Астана (UTC+5) ---------- */
function astana() { const d = new Date(); return new Date(d.getTime() + d.getTimezoneOffset() * 60000 + 5 * 3600000); }
const hhmm = d => String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
function dkey(d) { d = d || astana(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
const WD = ["Жк", "Дс", "Сс", "Ср", "Бс", "Жм", "Сн"];
const MN = ["қаңтар","ақпан","наурыз","сәуір","мамыр","маусым","шілде","тамыз","қыркүйек","қазан","қараша","желтоқсан"];

/* ---------- Күй ---------- */
const DEF = {
  v: 1,
  plan: { pts: 40, kg: 30, tg: 200000 },
  cat: [{ id: 1, name: "Ащы құрт", buy: 1800, sell: 2500 },
        { id: 2, name: "Тұзды құрт", buy: 1600, sell: 2200 },
        { id: 3, name: "Сарымсақты құрт", buy: 2000, sell: 2800 },
        { id: 4, name: "Іркіт құрт", buy: 1500, sell: 2100 }],
  catSeq: 5,
  del: [],        // өшірілген базалық точкалар (индекс)
  add: [],        // қосылған точкалар {id,n,a,lat,lon}
  addSeq: 1,
  px: {},         // {pointKey: {catId: баға}}  — есте сақталған баға
  off: {},        // {'2026-08-03': true}  — демалыс күндері
  lastv: {},      // {pointKey: 'YYYY-MM-DD'} — соңғы рет қашан барылды
  cycle: 14,      // әр дүкенге қанша күнде бір рет кіру
  hist: {},       // {'2026-08-03': {route:[key], v:{key:{st,kg,sum,cat,price,time}} , started:bool}}
};
let S = JSON.parse(JSON.stringify(DEF));

/* ---------- Точкалар ---------- */
// базалық: KURT_POINTS[i] = [аты, мекенжай, lat, lon, белгі?]
function allPoints() {
  const out = [];
  const del = new Set(S.del);
  KURT_POINTS.forEach((p, i) => { if (!del.has(i)) out.push({ k: "b" + i, n: p[0], a: p[1], lat: p[2], lon: p[3], t: p[4] || "" }); });
  S.add.forEach(p => out.push({ k: "a" + p.id, n: p.n, a: p.a, lat: p.lat, lon: p.lon, t: p.t || "", own: true }));
  return out;
}
let PMAP = {};
function reindex() { PMAP = {}; allPoints().forEach(p => PMAP[p.k] = p); }
const P = k => PMAP[k];

/* ---------- Геометрия ---------- */
function dist(a, b) { const R = 6371000, t = Math.PI / 180;
  return Math.hypot((b.lon - a.lon) * t * R * Math.cos(a.lat * t), (b.lat - a.lat) * t * R); }
function bearing(a, b) { const t = Math.PI / 180;
  return (Math.atan2((b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * t), (b.lat - a.lat)) * 180 / Math.PI + 360) % 360; }

/* ---------- Сақтау (CloudStorage / localStorage) ---------- */
const CHUNK = 3800;
let saveTimer = null, saving = false;
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 900); }
function save() {
  const raw = JSON.stringify(S);
  const parts = []; for (let i = 0; i < raw.length; i += CHUNK) parts.push(raw.slice(i, i + CHUNK));
  if (TG && TG.CloudStorage && TG.initDataUnsafe && TG.initDataUnsafe.user) {
    saving = true; setSync("сақталуда…");
    let left = parts.length + 1, err = 0;
    const done = e => { if (e) err++; if (--left <= 0) { saving = false;
      setSync(err ? "қате — жергілікті сақталды" : "Telegram бұлтында ✓"); if (err) lsSave(); } };
    TG.CloudStorage.setItem("n", String(parts.length), done);
    parts.forEach((p, i) => TG.CloudStorage.setItem("d" + i, p, done));
    // ескі артық бөліктерді тазалау
    for (let i = parts.length; i < parts.length + 6; i++) TG.CloudStorage.removeItem("d" + i, () => {});
  } else { lsSave(); setSync("телефонда сақталды"); }
}
function lsSave() { try { localStorage.setItem("kurt", JSON.stringify(S)); } catch (e) {} }
function setSync(t) { const e = $("syncst"); if (e) e.textContent = t; }

function load(cb) {
  const fallback = () => {
    try { const r = localStorage.getItem("kurt"); if (r) S = Object.assign(JSON.parse(JSON.stringify(DEF)), JSON.parse(r)); } catch (e) {}
    cb();
  };
  if (TG && TG.CloudStorage && TG.initDataUnsafe && TG.initDataUnsafe.user) {
    TG.CloudStorage.getItem("n", (e, v) => {
      const n = parseInt(v || "0", 10);
      if (e || !n) return fallback();
      const keys = []; for (let i = 0; i < n; i++) keys.push("d" + i);
      TG.CloudStorage.getItems(keys, (e2, obj) => {
        if (e2 || !obj) return fallback();
        let raw = ""; for (let i = 0; i < n; i++) raw += (obj["d" + i] || "");
        try { S = Object.assign(JSON.parse(JSON.stringify(DEF)), JSON.parse(raw)); setSync("Telegram бұлтынан ✓"); }
        catch (er) { return fallback(); }
        cb();
      });
    });
  } else fallback();
}

/* ---------- Бүгінгі күн ---------- */
function today() {
  const d = dkey();
  if (!S.hist[d]) S.hist[d] = { route: [], v: {}, started: false, extra: [] };
  return S.hist[d];
}
const T = () => today();
const visitedKeys = () => T().route.filter(k => T().v[k]);
const waitKeys = () => T().route.filter(k => !T().v[k]);
function soldList() { const t = T(); return t.route.filter(k => t.v[k] && t.v[k].st === "sold").map(k => t.v[k]); }
const sumKg = () => soldList().reduce((a, x) => a + x.kg, 0);
const sumTg = () => soldList().reduce((a, x) => a + x.sum, 0);
// пайда = (сатқан баға − алған баға) × кг
function sumProfit() { return soldList().reduce((a, x) => {
  const c = S.cat.find(y => y.id === x.cat); return a + (c ? x.kg * (x.price - c.buy) : 0); }, 0); }
function planDone() {
  return visitedKeys().length >= S.plan.pts || sumKg() >= S.plan.kg || sumProfit() >= S.plan.tg; }

/* ---------- Маршрут құру ---------- */
let ME = { lat: 42.3175, lon: 69.6100 }, gpsOk = false;
let HEAD = 0, PREV = null, FOLLOW = false, spd = 0;
let ROUTE = [], ROUTEKM = 0;

// күндер айырмасы
function daysAgo(k) {
  const d = S.lastv[k]; if (!d) return 9999;
  return Math.round((astana() - new Date(d + "T00:00:00")) / 86400000);
}
/* Бүгінгі 40 точка: базаны біртіндеп аралау үшін
   1) ең ұзақ уақыт барылмаған дүкенді «тірек» етіп аламыз
   2) соның айналасынан ең жақын 39 дүкенді қосамыз (циклы жеткендерді)
   Нәтиже: маршрут ықшам аймақта, әрі база кезекпен толық аралады. */
function makeRoute(force) {
  const t = T();
  if (t.route.length && !force) { buildOrder(); return; }
  const all = allPoints();
  if (!all.length) { t.route = []; buildOrder(); return; }
  // циклы жеткендер (әдепкі 14 күн)
  let cand = all.filter(p => daysAgo(p.k) >= S.cycle);
  if (cand.length < S.plan.pts) cand = all.slice();   // жетпесе — бәрі
  // тірек: ең ұзақ барылмаған
  // ең ұзақ барылмағаны; бірдей болса — тұрған жеріңізге жақыны
  cand.sort((a, b) => (daysAgo(b.k) - daysAgo(a.k)) || (dist(ME, a) - dist(ME, b)));
  const seed = cand[0];
  // тірек айналасынан ең жақындарын алу
  const near = cand.slice().sort((a, b) => dist(seed, a) - dist(seed, b)).slice(0, S.plan.pts);
  t.route = near.map(p => p.k);
  t.zone = seed.a || seed.n;
  t.made = dkey();
  saveSoon(); buildOrder();
}
function buildOrder() {
  reindex();
  const t = T();
  t.route = t.route.filter(k => PMAP[k]);      // өшірілгендерді алып тастау
  let from = { ...ME };
  const vk = visitedKeys(); if (vk.length) { const l = P(vk[vk.length - 1]); if (l) from = { lat: l.lat, lon: l.lon }; }
  let rest = waitKeys().map(P).filter(Boolean);
  ROUTE = []; ROUTEKM = 0;
  while (rest.length) {
    let bi = 0, bd = Infinity;
    rest.forEach((p, i) => { const d = dist(from, p); if (d < bd) { bd = d; bi = i; } });
    const p = rest.splice(bi, 1)[0]; ROUTE.push(p); ROUTEKM += bd; from = { lat: p.lat, lon: p.lon };
  }
}
const nextPt = () => ROUTE[0] || null;

/* ---------- Хабарлама ---------- */
let tt = null;
function toast(t) { $("toast").textContent = t; $("toast").classList.add("on");
  clearTimeout(tt); tt = setTimeout(() => $("toast").classList.remove("on"), 2800); }

/* ---------- Парақ (sheet) ---------- */
function showSheet() { $("sheet").classList.add("on"); $("mask").classList.add("on");
  if (TG && TG.BackButton) { TG.BackButton.show(); } }
function closeSheet() { restoreSnap(); $("sheet").classList.remove("on"); $("mask").classList.remove("on");
  clearInterval(vtick); if (TG && TG.BackButton) TG.BackButton.hide(); }
$("mask").onclick = closeSheet;
if (TG && TG.BackButton) TG.BackButton.onClick(() => {
  if ($("sheet").classList.contains("on")) closeSheet();
  else if (FOLLOW) MAP.follow(false);
});

/* ================= КҮН экраны ================= */
function renderDay() {
  buildOrder();
  const t = T(), vs = visitedKeys(), kg = sumKg(), pr = sumProfit();
  $("pdone").textContent = vs.length; $("pplan").textContent = S.plan.pts;
  $("pkg").textContent = S.plan.kg; $("ptg").textContent = S.plan.tg >= 10000 ? Math.round(S.plan.tg / 1000) : (S.plan.tg / 1000).toFixed(1);
  const pc = Math.max(0, Math.min(1, vs.length / Math.max(1, S.plan.pts)));
  $("rg").style.strokeDashoffset = 157 * (1 - pc); $("rgt").textContent = Math.round(pc * 100) + "%";
  $("mkg").textContent = kg.toFixed(1);
  $("mtg").textContent = pr >= 10000 ? fmt(pr / 1000) : (pr / 1000).toFixed(1);
  $("bkg").style.width = Math.max(0, Math.min(100, kg / Math.max(1, S.plan.kg) * 100)) + "%";
  $("btg").style.width = Math.max(0, Math.min(100, pr / Math.max(1, S.plan.tg) * 100)) + "%";
  $("plancard").className = "plan" + (planDone() ? " done" : "");
  $("leftc").textContent = ROUTE.length + " точка қалды";
  $("routekm").textContent = ROUTE.length ? (ROUTEKM / 1000).toFixed(1) + " км" : "аяқталды";
  renderZone();
  const d = astana();
  $("dayline").textContent = WD[d.getDay()] + " · " + d.getDate() + " " + MN[d.getMonth()] + " · Астана";
  $("wstat").textContent = S.off[dkey()] ? "Демалыс" : "Жұмыс күні";
  $("daybtn").className = "btn big " + (t.started ? "dan" : "ok");
  $("daybtn").textContent = t.started ? "■ Күнді аяқтау" : "▶︎ Күнді бастау";
  $("daymini").textContent = t.started ? "Күн жүріп жатыр." : "Басқан соң ең жақын дүкенге бағыт беріледі.";

  const L = $("todaylist"); L.innerHTML = ""; let no = 0;
  vs.forEach(k => { const p = P(k), r = t.v[k]; if (!p) return; no++;
    const cl = r.st === "sold" ? "sold" : r.st === "no" ? "no" : "cls";
    const tg2 = r.st === "sold" ? `<span class="tag g">${r.kg} кг · ${fmt(r.sum)} ₸</span>`
      : r.st === "no" ? `<span class="tag r">алмады</span>` : `<span class="tag gr">жабық</span>`;
    L.insertAdjacentHTML("beforeend",
      `<div class="item" data-k="${k}"><div class="dot ${cl}">${no}</div>
       <div class="it"><div class="n">${esc(p.n)}</div><div class="a">${r.time || ""} · ${esc(p.a)}</div></div>${tg2}</div>`);
  });
  ROUTE.forEach((p, i) => { no++;
    const isExtra = (t.extra || []).indexOf(p.k) >= 0;
    const tg2 = i === 0 ? `<span class="tag b">келесі</span>` : isExtra ? `<span class="tag o">қосымша</span>` : `<span class="chev">›</span>`;
    const dd = i === 0 ? dist(ME, p) : dist(ROUTE[i - 1], p);
    L.insertAdjacentHTML("beforeend",
      `<div class="item" data-k="${p.k}"><div class="dot ${i === 0 ? "next" : ""}">${no}</div>
       <div class="it"><div class="n">${esc(p.n)}</div><div class="a">${fmt(dd)} м · ${esc(p.a)}</div></div>${tg2}</div>`);
  });
  if (!t.route.length) L.innerHTML = '<div class="empty">Маршрут бос.<br>«Күнді бастау» басыңыз.</div>';
  L.querySelectorAll(".item").forEach(el => el.onclick = () => openPoint(el.dataset.k));
}
function renderZone() {
  const t = T(), all = allPoints();
  if (!t.route.length) { $("zonename").textContent = "Маршрут құрылмаған";
    $("zoneinfo").textContent = "«Күнді бастау» басыңыз"; $("zcov").style.width = "0%"; $("covtxt").textContent = ""; return; }
  $("zonename").textContent = t.zone || "Бүгінгі аймақ";
  const ages = t.route.map(k => daysAgo(k)).filter(x => x < 9999);
  const never = t.route.filter(k => daysAgo(k) >= 9999).length;
  const avg = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0;
  $("zoneinfo").textContent = t.route.length + " точка · " +
    (never ? never + " әлі кірілмеген" : "орташа " + avg + " күн бұрын барылған");
  const seen = Object.keys(S.lastv).length;
  $("zcov").style.width = Math.min(100, seen / Math.max(1, all.length) * 100) + "%";
  $("covtxt").textContent = "Базаның " + seen + " / " + all.length + " дүкені аралды";
}
const esc = s => String(s || "").replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

/* ================= Күнді бастау / аяқтау ================= */
$("daybtn").onclick = () => {
  const t = T();
  if (!t.started) {
    haptic("medium");
    if (!t.route.length) makeRoute();
    t.started = true; saveSoon(); renderDay(); go("map"); MAP.refresh();
    const n = nextPt(); if (n) toast("🧭 Бірінші дүкен: " + n.n);
  } else finishDay();
};
function finishDay() {
  const t = T(), vs = visitedKeys(), s = soldList();
  const kg = sumKg(), tg = sumTg();
  const pr = t.route.filter(k => t.v[k] && t.v[k].st === "sold")
    .reduce((a, k) => { const r = t.v[k], c = S.cat.find(x => x.id === r.cat); return a + (c ? r.kg * (r.price - c.buy) : 0); }, 0);
  $("sbody").innerHTML = `<div class="sh">Күн қорытындысы</div><div class="sa">${hhmm(astana())} · Астана</div>
   <div style="height:16px"></div>
   <div class="tot">
     <div class="r"><span>Барған точка</span><b>${vs.length} / ${S.plan.pts}</b></div>
     <div class="r"><span>Алды</span><b>${s.length}</b></div>
     <div class="r"><span>Алмады</span><b>${vs.filter(k => t.v[k].st === "no").length}</b></div>
     <div class="r"><span>Жабық</span><b>${vs.filter(k => t.v[k].st === "closed").length}</b></div>
     <div class="r"><span>Құрт</span><b>${kg.toFixed(1)} кг</b></div>
     <div class="r"><span>Түскен сома</span><b>${fmt(tg)} ₸</b></div>
     <div class="m"><span>Таза пайда</span><b>${fmt(pr)} ₸</b></div></div>
   <div style="height:14px"></div>
   <button class="btn dark" id="bcloseday">Күнді жабу</button>
   <div style="height:9px"></div><button class="btn gh" onclick="closeSheet()">Жалғастыру</button>`;
  showSheet();
  $("bcloseday").onclick = () => { T().started = false; saveSoon(); closeSheet(); go("day"); renderDay();
    haptic("ok"); toast("Күн жабылды, есеп сақталды"); };
}

/* ================= Точкаға келу ================= */
let atKey = null, arrivedAt = null, vtick = null;
$("barr").onclick = () => { const n = nextPt(); if (!n) { toast("Барлық точка өтті"); return; }
  atKey = n.k; arrivedAt = astana(); haptic("medium"); openVisit(); };

function openVisit() {
  const p = P(atKey); if (!p) return;
  $("sbody").innerHTML = `<div class="sh">${esc(p.n)}</div><div class="sa">${esc(p.a)}</div>
   <div style="height:12px"></div>
   <div class="card" style="padding:13px;display:flex;gap:11px;align-items:center">
     <div class="arrow" style="border-radius:13px;background:#12a150">📍</div>
     <div style="flex:1"><div style="font-size:13.5px;font-weight:800">Келдіңіз</div>
       <div style="font-size:11.5px;color:#8a919e;margin-top:2px">Кірген уақыт: ${hhmm(arrivedAt)} · <span id="vt">00:00</span></div></div></div>
   <div style="height:14px"></div>
   <button class="btn dark big" id="bfin">■ Аяқтау</button>
   <div class="mini">Аяқтағанда: алды / алмады / жабық екенін белгілейсіз.</div>
   <div style="height:12px"></div><button class="btn gh" onclick="closeSheet()">Артқа</button>`;
  showSheet();
  $("bfin").onclick = openResult;
  clearInterval(vtick);
  vtick = setInterval(() => { const e = $("vt"); if (!e) { clearInterval(vtick); return; }
    const s = Math.floor((astana() - arrivedAt) / 1000);
    e.textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }, 1000);
}
function openResult() {
  clearInterval(vtick);
  const p = P(atKey); if (!p) return;
  $("sbody").innerHTML = `<div class="sh">${esc(p.n)}</div><div class="sa">Нәтижесі қандай?</div>
   <div style="height:16px"></div>
   <button class="btn ok big" id="rsold">✓ Алды</button><div style="height:9px"></div>
   <button class="btn dan big" id="rno">✕ Алмады</button><div style="height:9px"></div>
   <button class="btn gh big" id="rcls">🔒 Жабық</button><div style="height:14px"></div>
   <button class="btn gh" id="rback">Артқа</button>`;
  showSheet();
  $("rsold").onclick = openSale; $("rno").onclick = () => setRes("no");
  $("rcls").onclick = () => setRes("closed"); $("rback").onclick = openVisit;
}
function setRes(st) {
  const t = T(), p = P(atKey); if (!p) return;
  undoSnap = null;
  t.v[atKey] = { st, kg: 0, sum: 0, time: hhmm(arrivedAt) };
  S.lastv[atKey] = dkey();
  ME = { lat: p.lat, lon: p.lon };
  saveSoon(); closeSheet(); renderDay(); MAP.refresh(); haptic("err");
  autoExtra("«" + p.n + "» " + (st === "closed" ? "жабық" : "алмады"), true);
  toast(st === "closed" ? "🔒 Жабық деп белгіленді" : "✕ Алмады деп белгіленді");
}

/* ---------- Сату ---------- */
let sel = null, selKg = 0, selPrice = 0;
function openSale() {
  const p = P(atKey); if (!p) return;
  sel = null; selKg = 0; selPrice = 0;
  if (!S.cat.length) {
    $("sbody").innerHTML = `<div class="sh">${esc(p.n)}</div><div class="sa">Каталог бос</div>
     <div style="height:14px"></div>
     <div class="banner"><div class="ic">📦</div><div><b>Құрт түрі жоқ</b><p>Баптаулар → каталогтан бір түр қосыңыз.</p></div></div>
     <div style="height:14px"></div><button class="btn pri" id="tocat">Баптауға өту</button>
     <div style="height:9px"></div><button class="btn gh" id="bk2">Артқа</button>`;
    showSheet(); $("tocat").onclick = () => { closeSheet(); go("set"); }; $("bk2").onclick = openResult; return;
  }
  const last = S.px[atKey] || {};
  const cards = S.cat.map(c => `<div class="kc" data-c="${c.id}">
      <div class="kn">${esc(c.name)}</div><div class="kp">${fmt(c.sell)} ₸/кг</div>
      ${last[c.id] ? `<div class="kl">↩︎ өткенде ${fmt(last[c.id])} ₸</div>` : ""}</div>`).join("");
  $("sbody").innerHTML = `<div class="sh">${esc(p.n)}</div><div class="sa">Қандай құрт алды?</div>
   <div style="height:12px"></div><div class="kgrid" id="kg">${cards}</div>
   <div id="saleform" style="display:none">
     <div style="height:14px"></div>
     <div class="stepper"><span class="sl">Салмағы</span>
       <button class="qb" id="km">−</button><span class="qv" id="kgv">0 кг</span><button class="qb" id="kp">＋</button></div>
     <div class="f"><label>Сатқан бағам (₸ / кг) — жеңілдік осында</label>
       <input id="pin" type="number" inputmode="decimal"></div>
     <div class="tot"><div class="r"><span>Салмақ</span><b id="tk">0 кг</b></div>
       <div class="r"><span>Баға</span><b id="tp">0 ₸/кг</b></div>
       <div class="r"><span>Пайда</span><b id="tpr">0 ₸</b></div>
       <div class="m"><span>Сома</span><b id="ts">0 ₸</b></div></div>
     <div class="mini">Бағаны өзгертсеңіз — осы дүкенге есте сақталады.</div>
     <div style="height:12px"></div><button class="btn ok big" id="bsave">Сақтау</button></div>
   <div style="height:10px"></div><button class="btn gh" id="bk3">Артқа</button>`;
  showSheet();
  $("bk3").onclick = openResult;
  $("kg").querySelectorAll(".kc").forEach(el => el.onclick = () => pick(+el.dataset.c));
  $("km").onclick = () => addKg(-0.5); $("kp").onclick = () => addKg(0.5);
  $("bsave").onclick = saveSale;
}
function pick(id) {
  sel = id; haptic("light");
  $("kg").querySelectorAll(".kc").forEach(e => e.classList.toggle("on", +e.dataset.c === id));
  const c = S.cat.find(x => x.id === id), last = (S.px[atKey] || {})[id];
  selPrice = last || c.sell;
  $("saleform").style.display = "block"; $("pin").value = selPrice;
  $("pin").oninput = calc;
  if (selKg === 0) { selKg = 1; $("kgv").textContent = "1 кг"; }
  calc();
}
function addKg(d) { selKg = Math.max(0, Math.round((selKg + d) * 10) / 10); $("kgv").textContent = selKg + " кг"; haptic("light"); calc(); }
function calc() {
  selPrice = +$("pin").value || 0;
  const c = S.cat.find(x => x.id === sel) || { buy: 0 };
  $("tk").textContent = selKg + " кг"; $("tp").textContent = fmt(selPrice) + " ₸/кг";
  $("tpr").textContent = fmt(selKg * (selPrice - c.buy)) + " ₸";
  $("ts").textContent = fmt(selKg * selPrice) + " ₸";
}
function saveSale() {
  if (!sel || selKg <= 0) { toast("Түрін және салмағын таңдаңыз"); return; }
  const t = T(), p = P(atKey);
  undoSnap = null;
  t.v[atKey] = { st: "sold", kg: selKg, sum: selKg * selPrice, cat: sel, price: selPrice, time: hhmm(arrivedAt) };
  S.lastv[atKey] = dkey();
  if (!S.px[atKey]) S.px[atKey] = {}; S.px[atKey][sel] = selPrice;
  ME = { lat: p.lat, lon: p.lon };
  saveSoon(); closeSheet(); renderDay(); MAP.refresh(); haptic("ok");
  autoExtra("жоспар әлі жабылған жоқ", false);
  toast("✓ " + p.n + " — " + selKg + " кг · " + fmt(selKg * selPrice) + " ₸");
}

/* ---------- Қосымша точка ---------- */
function autoExtra(reason, failed) {
  if (planDone()) return;
  const t = T(), vs = visitedKeys().length;
  const need = S.plan.pts - vs, left = waitKeys().length;
  if (!failed && left >= need) return;
  if (failed && left >= need && (sumKg() >= S.plan.kg || sumTg() >= S.plan.tg)) return;
  const inRoute = new Set(t.route);
  const vk = visitedKeys(); let from = ME;
  if (vk.length) { const l = P(vk[vk.length - 1]); if (l) from = l; }
  let pool = allPoints().filter(p => !inRoute.has(p.k) && daysAgo(p.k) >= S.cycle);
  if (!pool.length) pool = allPoints().filter(p => !inRoute.has(p.k));
  const res = pool.sort((a, b) => dist(from, a) - dist(from, b))[0];
  if (!res) { toast("Резервте точка қалмады"); return; }
  t.route.push(res.k); (t.extra = t.extra || []).push(res.k);
  saveSoon();
  $("autobanner").style.display = "flex";
  $("abtxt").textContent = `«${res.n}» қосылды (${fmt(dist(from, res))} м). Себебі: ${reason}.`;
  renderDay(); MAP.refresh();
  toast("⚡️ +1 қосымша точка: " + res.n);
}

/* ---------- Точка карточкасы ---------- */
let undoSnap = null;
function openPoint(k) {
  const p = P(k); if (!p) return;
  const t = T(), r = t.v[k];
  if (!r) {
    const d = dist(ME, p);
    $("sbody").innerHTML = `<div class="sh">${esc(p.n)}</div><div class="sa">${esc(p.a)}</div>
     <div style="height:14px"></div>
     <div class="card" style="padding:13px;display:flex;gap:11px;align-items:center">
       <div class="arrow" style="border-radius:13px">🧭</div>
       <div style="flex:1"><div style="font-size:13.5px;font-weight:800">${fmt(d)} м · ~${Math.max(1, Math.round(d / 420))} мин</div>
       <div style="font-size:11.5px;color:#8a919e;margin-top:2px">${t.route.indexOf(k) >= 0 ? "Маршрутта" : "Базада"}</div></div></div>
     <div style="height:12px"></div>
     <button class="btn pri" id="pjump">Осыған бару</button>
     <div style="height:9px"></div><button class="btn gh" id="pext">🗺 Басқа навигаторда ашу</button>
     ${t.route.indexOf(k) < 0 ? `<div style="height:9px"></div><button class="btn gh" id="padd2">Маршрутқа қосу</button>` : ""}
     <div style="height:9px"></div><button class="btn dan" id="pdel">Точканы өшіру</button>
     <div style="height:9px"></div><button class="btn gh" onclick="closeSheet()">Жабу</button>`;
    showSheet();
    $("pjump").onclick = () => jumpTo(k);
    $("pext").onclick = () => openExternal(p);
    if ($("padd2")) $("padd2").onclick = () => { T().route.push(k); saveSoon(); closeSheet(); renderDay(); MAP.refresh(); toast("Маршрутқа қосылды"); };
    $("pdel").onclick = () => delPt(k);
  } else {
    const c = S.cat.find(x => x.id === r.cat);
    $("sbody").innerHTML = `<div class="sh">${esc(p.n)}</div><div class="sa">${esc(p.a)} · ${r.time || ""}</div>
     <div style="height:12px"></div>
     <span class="tag ${r.st === "sold" ? "g" : r.st === "no" ? "r" : "gr"}" style="display:inline-block">
       ${r.st === "sold" ? "Алды" : r.st === "no" ? "Алмады" : "Жабық"}</span>
     <div style="height:12px"></div>
     ${r.st === "sold" ? `<div class="tot">
        <div class="r"><span>Құрт түрі</span><b>${c ? esc(c.name) : "—"}</b></div>
        <div class="r"><span>Салмақ</span><b>${r.kg} кг</b></div>
        <div class="r"><span>Сатқан бағам</span><b>${fmt(r.price)} ₸/кг</b></div>
        <div class="m"><span>Сома</span><b>${fmt(r.sum)} ₸</b></div></div>
        <div style="height:10px"></div>
        <div class="banner"><div class="ic">💾</div><div><b>Баға есте сақталды</b>
        <p>Келесіде ${fmt(r.price)} ₸ автоматты қойылады.</p></div></div>` : `<div class="empty">Бұл жолы сатылмады</div>`}
     <div style="height:14px"></div>
     <button class="btn gh" id="predo">Қайта өзгерту</button>
     <div style="height:9px"></div><button class="btn dan" id="pdel2">Точканы өшіру</button>
     <div style="height:9px"></div><button class="btn gh" onclick="closeSheet()">Жабу</button>`;
    showSheet();
    $("predo").onclick = () => { undoSnap = { k, r: JSON.parse(JSON.stringify(r)) };
      delete T().v[k]; atKey = k; arrivedAt = astana(); renderDay(); MAP.refresh(); openResult(); };
    $("pdel2").onclick = () => delPt(k);
  }
}
function restoreSnap() { if (!undoSnap) return;
  const t = T(); if (!t.v[undoSnap.k]) t.v[undoSnap.k] = undoSnap.r;
  undoSnap = null; renderDay(); MAP.refresh(); }
function jumpTo(k) { const t = T();
  if (t.route.indexOf(k) < 0) t.route.push(k);
  const i = t.route.indexOf(k); t.route.splice(i, 1);
  const firstWait = t.route.findIndex(x => !t.v[x]);
  t.route.splice(firstWait < 0 ? t.route.length : firstWait, 0, k);
  saveSoon(); closeSheet(); go("map"); renderDay(); MAP.refresh();
  toast("🧭 Келесі: " + P(k).n); }
function delPt(k) {
  const p = P(k); if (!p) return;
  if (k[0] === "b") S.del.push(+k.slice(1)); else S.add = S.add.filter(x => "a" + x.id !== k);
  const t = T(); t.route = t.route.filter(x => x !== k); delete t.v[k]; delete S.px[k];
  saveSoon(); closeSheet(); reindex(); renderDay(); renderPts(); MAP.refresh();
  toast("«" + p.n + "» өшірілді");
}

/* ================= Точкалар тізімі ================= */
let listLimit = 60;
function renderPts() {
  const q = ($("q").value || "").toLowerCase().trim();
  const all = allPoints(); $("ptotal").textContent = all.length;
  const inR = new Set(T().route);
  let list = q ? all.filter(p => (p.n + " " + p.a).toLowerCase().includes(q)) : all.slice().sort((a, b) => dist(ME, a) - dist(ME, b));
  const total = list.length; list = list.slice(0, listLimit);
  const L = $("ptslist"); L.innerHTML = "";
  if (!list.length) { L.innerHTML = '<div class="empty">Табылмады</div>'; $("ptsmore").textContent = ""; return; }
  list.forEach(p => L.insertAdjacentHTML("beforeend",
    `<div class="item"><div class="dot" style="background:${inR.has(p.k) ? "#1f6feb" : "#aab2bf"}">${esc(p.n[0] || "?")}</div>
     <div class="it" data-k="${p.k}"><div class="n">${esc(p.n)}</div><div class="a">${fmt(dist(ME, p))} м · ${esc(p.a)}</div></div>
     <span class="tag ${inR.has(p.k) ? "b" : "gr"}">${inR.has(p.k) ? "маршрут" : "база"}</span>
     <button class="swipe-del" data-d="${p.k}">Өшіру</button></div>`));
  L.querySelectorAll(".it").forEach(e => e.onclick = () => openPoint(e.dataset.k));
  L.querySelectorAll(".swipe-del").forEach(e => e.onclick = ev => { ev.stopPropagation(); delPt(e.dataset.d); });
  $("ptsmore").textContent = total > listLimit ? `${listLimit} / ${total} көрсетілді — іздеуді қолданыңыз` : "";
}
$("q").oninput = () => { listLimit = 60; renderPts(); };
$("badd").onclick = () => {
  $("sbody").innerHTML = `<div class="sh">Жаңа точка</div><div class="sa">Дүкен қосу</div><div style="height:16px"></div>
   <div class="f"><label>Дүкен аты</label><input id="a_n" placeholder="Мысалы: Береке"></div>
   <div class="f"><label>Мекенжай</label><input id="a_a" placeholder="Көше, үй"></div>
   <div class="card" style="padding:13px;display:flex;gap:11px;align-items:center;margin-bottom:12px">
     <div class="arrow" style="border-radius:13px;background:#12a150">📍</div>
     <div style="flex:1"><div style="font-size:13px;font-weight:800">Осы жердегі координата</div>
       <div style="font-size:11.5px;color:#8a919e" id="acoord">${ME.lat.toFixed(5)}, ${ME.lon.toFixed(5)}</div></div></div>
   <button class="btn pri" id="a_ok">Қосу</button>
   <div style="height:9px"></div><button class="btn gh" onclick="closeSheet()">Болдырмау</button>`;
  showSheet();
  $("a_ok").onclick = () => {
    const n = $("a_n").value.trim() || "Жаңа точка";
    S.add.push({ id: S.addSeq++, n, a: $("a_a").value.trim() || "—", lat: ME.lat, lon: ME.lon });
    saveSoon(); closeSheet(); reindex(); renderPts(); MAP.refresh(); haptic("ok"); toast("«" + n + "» қосылды");
  };
};

/* ================= Каталог / жоспар ================= */
function renderCat() {
  const L = $("catlist"); L.innerHTML = "";
  if (!S.cat.length) { L.innerHTML = '<div class="empty">Түр жоқ</div>'; return; }
  S.cat.forEach(c => L.insertAdjacentHTML("beforeend",
    `<div class="item" data-c="${c.id}"><div class="dot" style="background:#39414f">${esc(c.name[0])}</div>
     <div class="it"><div class="n">${esc(c.name)}</div><div class="a">Алу ${fmt(c.buy)} · Сату ${fmt(c.sell)} ₸/кг</div></div>
     <span class="tag g">+${fmt(c.sell - c.buy)}</span></div>`));
  L.querySelectorAll(".item").forEach(e => e.onclick = () => openCat(+e.dataset.c));
}
function openCat(id) {
  const c = S.cat.find(x => x.id === id) || { name: "", buy: "", sell: "" };
  $("sbody").innerHTML = `<div class="sh">${id ? "Түрді өзгерту" : "Жаңа құрт түрі"}</div><div style="height:16px"></div>
   <div class="f"><label>Аты</label><input id="c_n" value="${esc(c.name)}"></div>
   <div class="row2"><div class="f" style="flex:1"><label>Алатын ₸/кг</label><input id="c_b" type="number" inputmode="numeric" value="${c.buy}"></div>
     <div class="f" style="flex:1"><label>Сататын ₸/кг</label><input id="c_s" type="number" inputmode="numeric" value="${c.sell}"></div></div>
   <button class="btn pri" id="c_ok">Сақтау</button>
   ${id ? `<div style="height:9px"></div><button class="btn dan" id="c_del">Өшіру</button>` : ""}
   <div style="height:9px"></div><button class="btn gh" onclick="closeSheet()">Болдырмау</button>`;
  showSheet();
  $("c_ok").onclick = () => {
    const o = { name: $("c_n").value.trim() || "Құрт", buy: +$("c_b").value || 0, sell: +$("c_s").value || 0 };
    if (id) Object.assign(S.cat.find(x => x.id === id), o); else S.cat.push({ id: S.catSeq++, ...o });
    saveSoon(); closeSheet(); renderCat(); toast("Каталог жаңарды");
  };
  if ($("c_del")) $("c_del").onclick = () => { S.cat = S.cat.filter(x => x.id !== id); saveSoon(); closeSheet(); renderCat(); toast("Өшірілді"); };
}
$("bcat").onclick = () => openCat(0);
function bindPlan() {
  const cl = (v, d) => { v = Math.floor(+v); return (!isFinite(v) || v < 1) ? d : Math.min(v, 100000); };
  const on = () => { S.plan = { pts: cl($("s_pts").value, 40), kg: cl($("s_kg").value, 30),
    tg: Math.min(9e8, Math.max(1000, +$("s_tg").value || 200000)) }; saveSoon(); renderDay(); renderCal(); };
  ["s_pts", "s_kg", "s_tg"].forEach(i => $(i).oninput = on);
  $("s_cyc").oninput = () => { const v = Math.floor(+$("s_cyc").value);
    S.cycle = (!isFinite(v) || v < 1) ? 14 : Math.min(v, 365); saveSoon(); renderZone(); };
}
$("bremake").onclick = () => {
  const t = T();
  if (visitedKeys().length) {
    $("sbody").innerHTML = `<div class="sh">Маршрутты қайта құру</div>
     <div class="sa">Бүгін ${visitedKeys().length} точкаға кірдіңіз</div><div style="height:14px"></div>
     <div class="banner"><div class="ic">⚠️</div><div><b>Абайлаңыз</b>
       <p>Қайта құрсаңыз кірілмеген точкалар ауысады. Кірілгендер сақталады.</p></div></div>
     <div style="height:14px"></div>
     <button class="btn pri" id="rmok">Иә, қайта құру</button>
     <div style="height:9px"></div><button class="btn gh" onclick="closeSheet()">Болдырмау</button>`;
    showSheet();
    $("rmok").onclick = () => { const keep = visitedKeys(); makeRoute(true);
      T().route = Array.from(new Set(keep.concat(T().route)));
      saveSoon(); closeSheet(); renderDay(); MAP.refresh(); toast("Маршрут жаңартылды"); };
  } else { makeRoute(true); renderDay(); MAP.refresh(); haptic("ok"); toast("Жаңа аймақ таңдалды"); }
};
$("breset").onclick = () => { const d = dkey(); delete S.hist[d]; saveSoon(); renderDay(); MAP.refresh();
  haptic("ok"); toast("Бүгінгі күн тазаланды"); };
$("bsync").onclick = () => { save(); toast("Сақталуда…"); };

/* ================= Есеп / күнтізбе ================= */
function renderCal() {
  const C = $("cal"); C.innerHTML = "";
  const now = astana();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000), k = dkey(d);
    const off = !!S.off[k], isT = i === 0;
    C.insertAdjacentHTML("beforeend",
      `<div class="cd ${off ? "off" : ""} ${isT ? "today" : ""}" data-d="${k}">
        <div class="w">${WD[d.getDay()]}</div><div class="d">${d.getDate()}</div>
        <div class="p">${off ? "—" : (S.hist[k] ? Object.keys(S.hist[k].v || {}).length : 0)}</div></div>`);
  }
  C.querySelectorAll(".cd").forEach(e => e.onclick = () => {
    const k = e.dataset.d; S.off[k] = !S.off[k]; saveSoon(); renderCal(); renderDay();
    toast(S.off[k] ? "Демалыс белгіленді" : "Жұмыс күні"); });
  // 7 күндік қорытынды
  let p = 0, kg = 0, tg = 0;
  for (let i = 0; i < 7; i++) { const k = dkey(new Date(now.getTime() - i * 86400000)), h = S.hist[k];
    if (!h) continue; Object.values(h.v || {}).forEach(r => { p++; kg += r.kg || 0; tg += r.sum || 0; }); }
  $("s7p").textContent = p; $("s7k").textContent = kg.toFixed(1); $("s7t").textContent = fmt(tg / 1000);
  // базаны қамту
  const all = allPoints(), seen = Object.keys(S.lastv).filter(k => PMAP[k]).length;
  const fresh = Object.keys(S.lastv).filter(k => PMAP[k] && daysAgo(k) < S.cycle).length;
  $("covn").textContent = seen + " / " + all.length;
  $("covbar").style.width = Math.min(100, seen / Math.max(1, all.length) * 100) + "%";
  $("covdet").textContent = "Соңғы " + S.cycle + " күнде: " + fresh + " дүкен · қалғаны кезекте: " + (all.length - fresh);
  // тарих
  const H = $("hist"); H.innerHTML = "";
  const days = Object.keys(S.hist).sort().reverse().slice(0, 14);
  if (!days.length) { H.innerHTML = '<div class="empty">Әзірге тарих жоқ</div>'; return; }
  days.forEach(k => { const h = S.hist[k], rs = Object.values(h.v || {});
    const kg2 = rs.reduce((a, r) => a + (r.kg || 0), 0), tg2 = rs.reduce((a, r) => a + (r.sum || 0), 0);
    const dd = new Date(k + "T00:00:00");
    H.insertAdjacentHTML("beforeend",
      `<div class="item"><div class="dot" style="background:${rs.length ? "#12a150" : "#aab2bf"}">${dd.getDate()}</div>
       <div class="it"><div class="n">${WD[dd.getDay()]}, ${dd.getDate()} ${MN[dd.getMonth()]}</div>
       <div class="a">${rs.length} точка · ${kg2.toFixed(1)} кг</div></div>
       <span class="tag ${tg2 ? "g" : "gr"}">${fmt(tg2)} ₸</span></div>`); });
}

/* ================= Жол / OSRM ================= */
const OSRM = "https://router.project-osrm.org/route/v1/driving/";
let roadInfo = null, STEPS = [], roadKey = "";
const L10N = { left: "Солға бұрылыңыз", right: "Оңға бұрылыңыз", "slight left": "Сәл солға", "slight right": "Сәл оңға",
  "sharp left": "Күрт солға", "sharp right": "Күрт оңға", straight: "Түзу жүріңіз", uturn: "Кері бұрылыңыз" };
function mnvText(s) {
  const t = s.maneuver.type, m = s.maneuver.modifier || "", nm = s.name || "";
  const IC = { left: "↰", right: "↱", "slight left": "↖", "slight right": "↗", "sharp left": "⤺", "sharp right": "⤻", straight: "↑", uturn: "⤶" };
  let ic = "↑", tx = L10N.straight;
  if (t === "depart") { ic = "●"; tx = "Жолға шығу"; }
  else if (t === "arrive") { ic = "🏁"; tx = "Дүкенге келдіңіз"; }
  else if (t === "roundabout" || t === "rotary") { ic = "◎"; tx = "Айналмаға кіріңіз"; }
  else if (IC[m]) { ic = IC[m]; tx = L10N[m]; }
  return { ic, tx, nm };
}
async function drawRoad() {
  if (!MAP.ok) return;
  const wp = [{ lat: ME.lat, lon: ME.lon }, ...ROUTE.slice(0, 6)];
  if (wp.length < 2) { MAP.road.clearLayers(); roadInfo = null; STEPS = []; paintNav(); return; }
  const key = wp.map(p => p.lat.toFixed(FOLLOW ? 4 : 3) + "," + p.lon.toFixed(FOLLOW ? 4 : 3)).join(";");
  if (key === roadKey) return; roadKey = key;
  try {
    const co = wp.map(p => p.lon + "," + p.lat).join(";");
    const r = await fetch(OSRM + co + "?overview=full&geometries=geojson&steps=true");
    const j = await r.json();
    if (!j.routes || !j.routes[0]) throw 0;
    const R = j.routes[0];
    roadInfo = { geo: R.geometry.coordinates.map(c => [c[1], c[0]]), leg: R.legs[0], total: R.distance,
      from: { lat: ME.lat, lon: ME.lon } };
    STEPS = (R.legs[0] && R.legs[0].steps) || [];
  } catch (e) { roadInfo = null; STEPS = []; }
  MAP.road.clearLayers();
  if (roadInfo) {
    L.polyline(roadInfo.geo, { color: "#1f6feb", weight: 8, opacity: .25 }).addTo(MAP.road);
    L.polyline(roadInfo.geo, { color: "#1f6feb", weight: 4, opacity: .95 }).addTo(MAP.road);
  } else if (ROUTE.length) {
    L.polyline([[ME.lat, ME.lon], ...ROUTE.slice(0, 8).map(p => [p.lat, p.lon])],
      { color: "#1f6feb", weight: 4, opacity: .5, dashArray: "1 9" }).addTo(MAP.road);
  }
  paintNav();
}
// жолдан қанша метр алыстадық
function offRouteM() {
  if (!roadInfo || !roadInfo.geo || !roadInfo.geo.length) return 0;
  let m = Infinity;
  const g = roadInfo.geo, step = Math.max(1, Math.floor(g.length / 260));
  for (let i = 0; i < g.length; i += step) {
    const d = dist(ME, { lat: g[i][0], lon: g[i][1] });
    if (d < m) m = d;
    if (m < 25) break;
  }
  return m;
}
let reroutedAt = 0;
function navRefresh() {
  if (!FOLLOW) return;
  const n = nextPt();
  if (!n) { MAP.follow(false); return; }
  // бұрылысты өткізіп жіберсеңіз — жол автоматты қайта есептеледі
  const off = offRouteM();
  const now = Date.now();
  if (off > 45 && now - reroutedAt > 6000) {
    reroutedAt = now; roadKey = "";           // кэшті тазалау → жаңа жол сұралады
    $("nvRer").classList.add("on"); haptic("light");
    drawRoad().then(() => setTimeout(() => $("nvRer").classList.remove("on"), 900));
  } else if (off <= 45) $("nvRer").classList.remove("on");
  $("nvDest").textContent = n.n; $("nvDestA").textContent = n.a;
  $("nvSpd").textContent = Math.round(spd);
  if (roadInfo && roadInfo.leg) {
    const st = STEPS;
    const nx = st[1] || st[0];
    // бұрылысқа дейінгі қашықтық — ағымдағы орыннан тірідей
    let toM = st.length ? st[0].distance : dist(ME, n);
    const ml = nx && nx.maneuver && nx.maneuver.location;
    if (ml) toM = Math.min(toM, dist(ME, { lat: ml[1], lon: ml[0] }));
    const m = nx ? mnvText(nx) : { ic: "↑", tx: "Түзу жүріңіз", nm: "" };
    $("nvIc").textContent = m.ic;
    $("nvDist").innerHTML = toM >= 1000 ? (toM / 1000).toFixed(1) + ' <small>км</small>'
      : toM < 15 ? "Қазір" : Math.round(toM / 10) * 10 + ' <small>м</small>';
    $("nvStreet").textContent = m.nm || m.tx;
    const nx2 = st[2];
    if (nx2) { const m2 = mnvText(nx2); $("nvThenIc").textContent = m2.ic; $("nvThen").textContent = "содан кейін " + m2.tx; }
    else { $("nvThenIc").textContent = "🏁"; $("nvThen").textContent = "дүкенге келу"; }
    const gone = roadInfo.from ? dist(roadInfo.from, ME) : 0;
    const left = Math.max(dist(ME, n), roadInfo.leg.distance - gone);
    const secs = roadInfo.leg.duration * (left / Math.max(1, roadInfo.leg.distance));
    $("nvLeft").textContent = left >= 1000 ? (left / 1000).toFixed(1) + " км" : Math.round(left) + " м";
    $("nvMin").textContent = Math.max(1, Math.round(secs / 60));
    $("nvEta").textContent = hhmm(new Date(astana().getTime() + secs * 1000));
  } else {
    const d = dist(ME, n);
    $("nvIc").textContent = "↑"; $("nvDist").innerHTML = fmt(d) + ' <small>м</small>';
    $("nvStreet").textContent = n.a; $("nvThenIc").textContent = "🏁"; $("nvThen").textContent = "дүкенге келу";
    $("nvLeft").textContent = d >= 1000 ? (d / 1000).toFixed(1) + " км" : Math.round(d) + " м";
    $("nvMin").textContent = Math.max(1, Math.round(d / 420));
    $("nvEta").textContent = hhmm(new Date(astana().getTime() + d / 7 * 1000));
  }
  // жеткенде
  const dd = dist(ME, n);
  if (dd <= 40 && !navArrived) { navArrived = true; haptic("ok");
    toast("📍 " + n.n + " — келдіңіз"); }
  if (dd > 90) navArrived = false;
}
let navArrived = false;
function paintNav() {
  const n = nextPt(), off = visitedKeys().length;
  if (!n) { $("nnm").textContent = "Барлық точка өтті 🎉"; $("nad").textContent = "Күнді аяқтауға болады";
    $("ndist").textContent = "0"; $("ntime").textContent = "0"; $("nnext").textContent = "";
    $("mvi").textContent = "🏁"; $("mvt").innerHTML = "Маршрут аяқталды<small></small>"; return; }
  $("nnm").textContent = n.n; $("nad").textContent = n.a; $("nnum").textContent = off + 1;
  $("nnext").textContent = "кейін: " + (ROUTE[1] ? ROUTE[1].n : "—");
  $("narr").style.transform = `rotate(${bearing(ME, n)}deg)`;
  $("navsub").textContent = T().started ? "Күн жүріп жатыр" : "Күн басталған жоқ";
  if (roadInfo && roadInfo.leg) {
    $("ndist").textContent = fmt(roadInfo.leg.distance);
    $("ntime").textContent = Math.max(1, Math.round(roadInfo.leg.duration / 60));
    const s = STEPS.find(x => x.maneuver.type !== "depart") || STEPS[0];
    if (s) { const m = mnvText(s); $("mvi").textContent = m.ic;
      $("mvt").innerHTML = `${fmt(s.distance)} м · ${m.tx}<small>${esc(m.nm || "жол бойымен")}</small>`; }
    $("routekm").textContent = (roadInfo.total / 1000).toFixed(1) + " км";
  } else { const d = dist(ME, n);
    $("ndist").textContent = fmt(d); $("ntime").textContent = Math.max(1, Math.round(d / 420));
    $("mvi").textContent = "↑"; $("mvt").innerHTML = `Түзу бағыт<small>жол деректері жоқ</small>`; }
}
$("mnv").onclick = () => {
  const n = nextPt(); if (!n) return;
  const rows = STEPS.length ? STEPS.map((s, i) => { const m = mnvText(s);
    return `<div class="item"><div class="dot" style="background:${i === 0 ? "#1f6feb" : "#eef0f4"};color:${i === 0 ? "#fff" : "#39414f"}">${m.ic}</div>
      <div class="it"><div class="n">${m.tx}</div><div class="a">${esc(m.nm || "—")}</div></div>
      <span class="tag gr">${s.distance >= 1000 ? (s.distance / 1000).toFixed(1) + " км" : fmt(s.distance) + " м"}</span></div>`;
    }).join("") : '<div class="empty">Жол деректері жоқ</div>';
  $("sbody").innerHTML = `<div class="sh">${esc(n.n)}</div><div class="sa">${esc(n.a)}</div>
    <div style="height:12px"></div><div class="card">${rows}</div>
    <div style="height:14px"></div><button class="btn pri" onclick="closeSheet()">Жабу</button>`;
  showSheet();
};
$("bskip").onclick = () => { const n = nextPt(); if (!n) return;
  const t = T(); t.route = t.route.filter(k => k !== n.k);
  const inR = new Set(t.route);
  let pl = allPoints().filter(p => !inR.has(p.k) && daysAgo(p.k) >= S.cycle);
  if (!pl.length) pl = allPoints().filter(p => !inR.has(p.k));
  const rep = pl.sort((a, b) => dist(ME, a) - dist(ME, b))[0];
  if (rep) t.route.push(rep.k);
  saveSoon(); renderDay(); MAP.refresh(); toast("«" + n.n + "» өткізілді" + (rep ? " · орнына " + rep.n : "")); };

/* ================= Карта ================= */
const MAP = {
  map: null, layer: null, road: null, ok: false,
  init() {
    try {
      this.map = L.map("map", { zoomControl: false, attributionControl: false }).setView([ME.lat, ME.lon], 14);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(this.map);
      this.road = L.layerGroup().addTo(this.map);
      this.layer = L.layerGroup().addTo(this.map);
      this.ok = true;
    } catch (e) {}
  },
  refresh() {
    if (!this.ok) return;
    this.layer.clearLayers();
    const t = T();
    visitedKeys().forEach((k, i) => { const p = P(k); if (!p) return; const r = t.v[k];
      const col = r.st === "sold" ? "#12a150" : r.st === "no" ? "#e5484d" : "#6b7280";
      L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "pin", html: `<div style="background:${col}">${i + 1}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) })
        .addTo(this.layer).on("click", () => openPoint(k)); });
    const off = visitedKeys().length;
    ROUTE.forEach((p, i) => {
      const col = i === 0 ? "#1f6feb" : ((t.extra || []).indexOf(p.k) >= 0 ? "#b45f06" : "#98a0ac");
      L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "pin", html: `<div style="background:${col}">${off + i + 1}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) })
        .addTo(this.layer).on("click", () => openPoint(p.k)); });
    this.meMk = L.marker([ME.lat, ME.lon], { icon: L.divIcon({
      className: FOLLOW ? "mearrow" : "me", html: "<div></div>",
      iconSize: FOLLOW ? [20, 24] : [18, 18], iconAnchor: FOLLOW ? [10, 12] : [9, 9] }) }).addTo(this.layer);
    paintNav();
    clearTimeout(this._t); this._t = setTimeout(drawRoad, 400);
  },
  center() { if (this.ok) this.map.setView([ME.lat, ME.lon], FOLLOW ? 17 : 16); },
  follow(on) {
    FOLLOW = on === undefined ? !FOLLOW : on;
    document.querySelector(".mapwrap").classList.toggle("follow", FOLLOW);
    document.body.classList.toggle("nav", FOLLOW);
    $("mfollow").classList.toggle("act", FOLLOW);
    if (FOLLOW) {
      if (!nextPt()) { FOLLOW = false; document.body.classList.remove("nav");
        document.querySelector(".mapwrap").classList.remove("follow");
        toast("Барлық точка өтті"); return; }
      this.center(); haptic("medium"); navRefresh();
      try { TG && TG.BackButton && TG.BackButton.show(); } catch (e) {}
    } else {
      $("maprot").style.transform = "rotate(0deg)";
      try { if (!$("sheet").classList.contains("on")) TG && TG.BackButton && TG.BackButton.hide(); } catch (e) {}
    }
    setTimeout(() => { this.map && this.map.invalidateSize(); this.refresh(); }, 120);
  },
  followTick() {
    if (!this.ok) return;
    if (FOLLOW) {
      this.map.setView([ME.lat, ME.lon], this.map.getZoom(), { animate: false });
      $("maprot").style.transform = `rotate(${-HEAD}deg)`;
    }
    if (this.meMk) this.meMk.setLatLng([ME.lat, ME.lon]);
  }
};
$("mz1").onclick = () => MAP.ok && MAP.map.setZoom(MAP.map.getZoom() + 1);
$("mz2").onclick = () => MAP.ok && MAP.map.setZoom(MAP.map.getZoom() - 1);
$("mc").onclick = () => MAP.center();
$("mfollow").onclick = () => MAP.follow();
$("nvExit").onclick = () => MAP.follow(false);
function openExternal(p) {
  if (!p) return;
  const la = p.lat, lo = p.lon;
  const links = [
    { n: "2GIS", i: "🟢", u: `https://2gis.kz/directions/points/%7C${lo}%2C${la}` },
    { n: "Яндекс Навигатор", i: "🟡", u: `https://yandex.kz/maps/?rtext=~${la}%2C${lo}&rtt=auto` },
    { n: "Apple Карта", i: "🍎", u: `https://maps.apple.com/?daddr=${la},${lo}&dirflg=d` },
    { n: "Google Карта", i: "🔵", u: `https://www.google.com/maps/dir/?api=1&destination=${la},${lo}&travelmode=driving` }
  ];
  $("sbody").innerHTML = `<div class="sh">${esc(p.n)}</div><div class="sa">${esc(p.a)}</div>
    <div style="height:14px"></div>
    <div class="card">${links.map((l, i) => `<div class="item" data-u="${i}">
      <div class="dot" style="background:#eef0f4;font-size:17px">${l.i}</div>
      <div class="it"><div class="n">${l.n}</div><div class="a">осы дүкенге бағыт салады</div></div>
      <span class="chev">›</span></div>`).join("")}</div>
    <div class="mini">Қосымша жабылмайды — навигатор бөлек ашылады, қайтып келе бересіз.</div>
    <div style="height:14px"></div><button class="btn gh" onclick="closeSheet()">Жабу</button>`;
  showSheet();
  $("sbody").querySelectorAll(".item").forEach(el => el.onclick = () => {
    const u = links[+el.dataset.u].u;
    haptic("medium"); closeSheet();
    try { if (TG && TG.openLink) TG.openLink(u); else window.open(u, "_blank"); }
    catch (e) { window.open(u, "_blank"); }
  });
}
$("nvOpen").onclick = () => openExternal(nextPt());
$("nvArrive").onclick = () => { MAP.follow(false); $("barr").click(); };
$("mloc").onclick = locateMe;

/* ================= GPS ================= */
let watchId = null, lastRefresh = 0;
function startGPS() {
  if (!navigator.geolocation) { $("gpsi").textContent = "GPS қолжетімсіз"; return; }
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(pos => {
    const first = !gpsOk; gpsOk = true;
    const nw = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    // бағыт: GPS-тен алынады, болмаса жылжудан есептеледі
    if (typeof pos.coords.heading === "number" && !isNaN(pos.coords.heading) && pos.coords.speed > 0.6)
      HEAD = pos.coords.heading;
    else if (PREV && dist(PREV, nw) > 4) HEAD = bearing(PREV, nw);
    if (!PREV || dist(PREV, nw) > 4) PREV = { ...nw };
    spd = (pos.coords.speed || 0) * 3.6;
    ME = nw;
    $("gpsi").className = "gps on";
    $("gpsi").textContent = "GPS ±" + Math.round(pos.coords.accuracy) + " м" + (spd > 2 ? " · " + Math.round(spd) + " км/сағ" : "");
    if (first) { MAP.center(); renderDay(); renderPts(); }
    MAP.followTick(); navRefresh();
    const now = Date.now();
    if (now - lastRefresh > (FOLLOW ? 1800 : 6000)) { lastRefresh = now; MAP.refresh(); }
  }, err => {
    $("gpsi").className = "gps off";
    $("gpsi").textContent = err.code === 1 ? "GPS рұқсат жоқ — баптаудан қосыңыз" : "GPS сигналы жоқ";
  }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
}
// «Мен қайдамын» — бірден анықтап, картаны сол жерге апару
function locateMe() {
  haptic("medium");
  $("gpsi").className = "gps off"; $("gpsi").textContent = "GPS ізделуде…";
  if (!navigator.geolocation) { toast("GPS қолжетімсіз"); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    ME = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    gpsOk = true;
    $("gpsi").className = "gps on"; $("gpsi").textContent = "GPS ±" + Math.round(pos.coords.accuracy) + " м";
    MAP.center(); renderDay(); MAP.refresh(); haptic("ok");
    toast("📍 Орныңыз анықталды (±" + Math.round(pos.coords.accuracy) + " м)");
  }, e => { toast(e.code === 1 ? "GPS рұқсаты жоқ" : "GPS табылмады"); },
  { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}

/* ================= Навигация (беттер) ================= */
function go(p) {
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("on", x.dataset.p === p));
  document.querySelectorAll(".page").forEach(x => x.classList.remove("on"));
  $("p-" + p).classList.add("on");
  if (p === "map" && MAP.ok) setTimeout(() => { MAP.map.invalidateSize(); MAP.refresh(); MAP.followTick(); }, 80);
  if (p === "pts") renderPts();
  if (p === "rep") renderCal();
  haptic("light");
}
document.querySelectorAll(".tab").forEach(t => t.onclick = () => go(t.dataset.p));

/* ================= Іске қосу ================= */
load(() => {
  reindex();
  $("s_pts").value = S.plan.pts; $("s_kg").value = S.plan.kg; $("s_tg").value = S.plan.tg;
  $("s_cyc").value = S.cycle;
  bindPlan();
  const u = TG && TG.initDataUnsafe && TG.initDataUnsafe.user;
  $("uname").textContent = u ? (u.first_name || "") + (u.username ? " · @" + u.username : "") : "Браузер режимі";
  $("verline").textContent = "Нұсқа " + VER + " · " + KURT_POINTS.length + " дүкен базада";
  if (!TG || !TG.initDataUnsafe || !TG.initDataUnsafe.user) setSync("телефон жадында");
  MAP.init(); renderDay(); renderCat(); renderCal(); renderPts();
  startGPS();
  $("splash").classList.add("hide");
});
window.closeSheet = closeSheet;
