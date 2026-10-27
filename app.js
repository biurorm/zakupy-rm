// ZAKUPY RM: środowe sprawdzanie zapasów biura, lista do kupienia, wydruk, archiwum z kwotą
// Dane w bazie Zadań RM (Supabase, to samo logowanie). Bez config.js albo z ?proba: tryb próbny w tej przeglądarce.
// Zakończenie zakupów robi baza jedną funkcją (setup.sql, public.zakupy_zakoncz).
const WERSJA = 'v1';

const KATEGORIE = ['Kuchnia', 'Chemia i higiena', 'Biuro i papier', 'Inne'];
const JEDNOSTKI = ['szt.', 'opak.', 'kg', 'l', 'ryza', 'zgrz.', 'rolka'];
const SKLEPY = ['Biedronka', 'Lidl', 'Kaufland', 'Makro', 'Allegro'];
const DNI = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isoDzien = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dzis = () => isoDzien(new Date());
const dataPL = (iso) => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}.${m}.${y}`; };
const dzienTyg = (iso) => DNI[new Date(iso + 'T12:00').getDay()];
const bezOgonkow = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').trim();
const ileTxt = (n) => String(Number(n)).replace('.', ',');
const zl = (n) => Number(n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
const liczba = (t) => { const n = Number(String(t).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; };
const najblizszaSroda = () => { const d = new Date(); d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7)); return isoDzien(d); };

function toast(t, ms = 2600) {
  const el = $('#toast'); el.textContent = t; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms);
}

// ===================== MAGAZYN DANYCH =====================
function magazynSupabase(cfg) {
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  const blad = (e) => { if (e) throw new Error(e.message || String(e)); };
  let user = null;
  async function profil() {
    const { data, error } = await sb.from('profile').select('*').eq('id', user.id).maybeSingle(); blad(error);
    if (!data || !data.aktywny) throw new Error('To konto nie jest aktywne w zespole RM.');
    return data;
  }
  return {
    demo: false,
    async init() { const { data } = await sb.auth.getSession(); user = data.session?.user || null; return user ? { user, profil: await profil() } : null; },
    async zaloguj(email, haslo) {
      const { data, error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: haslo });
      if (error) throw new Error(/invalid/i.test(error.message) ? 'Zły e-mail albo hasło' : error.message);
      user = data.user; return { user, profil: await profil() };
    },
    async wyloguj() { await sb.auth.signOut(); },
    async osoby() { const { data, error } = await sb.from('profile').select('id, imie, rola, aktywny'); blad(error); return data; },
    async produkty() { const { data, error } = await sb.from('zakupy_produkty').select('*').order('nazwa'); blad(error); return data; },
    async dodaj(p) { const { data, error } = await sb.from('zakupy_produkty').insert(p).select().single(); blad(error); return data; },
    async zmien(id, zm) { const { error } = await sb.from('zakupy_produkty').update(zm).eq('id', id); blad(error); },
    async usun(id) { const { error } = await sb.from('zakupy_produkty').delete().eq('id', id); blad(error); },
    async zakoncz(z) { const { error } = await sb.rpc('zakupy_zakoncz', { p_kwota: z.kwota, p_sklep: z.sklep, p_uwagi: z.uwagi, p_kiedy: z.kiedy }); blad(error); },
    async archiwum() { const { data, error } = await sb.from('zakupy_archiwum').select('*').order('kiedy', { ascending: false }).order('utworzono', { ascending: false }).limit(200); blad(error); return data; },
    async zmienArchiwum(id, zm) { const { error } = await sb.from('zakupy_archiwum').update(zm).eq('id', id); blad(error); },
    async usunArchiwum(id) { const { error } = await sb.from('zakupy_archiwum').delete().eq('id', id); blad(error); },
    nasluchuj(fn) {
      let t; const odpal = () => { clearTimeout(t); t = setTimeout(fn, 400); };
      sb.channel('rm-zakupy')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'zakupy_produkty' }, odpal)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'zakupy_archiwum' }, odpal)
        .subscribe();
    }
  };
}

function magazynProbny() {
  const czytaj = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const pisz = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const user = { id: 'ja', email: 'tryb próbny' };
  const osoby = [{ id: 'ja', imie: 'Rafał (próba)', rola: 'admin', aktywny: true }, { id: 'aneta', imie: 'Aneta', rola: 'asystentka', aktywny: true }];
  const id = () => 'x' + Date.now() + Math.random().toString(36).slice(2, 6);
  const START = [['Papier do drukarki', 'Biuro i papier', 'ryza'], ['Toner', 'Biuro i papier', 'szt.'], ['Zszywki', 'Biuro i papier', 'opak.'], ['Teczki', 'Biuro i papier', 'szt.'], ['Markery', 'Biuro i papier', 'szt.'], ['Woda', 'Kuchnia', 'zgrz.'], ['Worki na śmieci', 'Chemia i higiena', 'rolka'], ['Płyn do mycia podłóg', 'Chemia i higiena', 'szt.'], ['Płyn do mycia naczyń', 'Chemia i higiena', 'szt.'], ['Gąbki do mycia naczyń', 'Chemia i higiena', 'opak.'], ['Ręczniki papierowe', 'Chemia i higiena', 'opak.'], ['Papier toaletowy', 'Chemia i higiena', 'opak.'], ['Trytytki do banerów', 'Inne', 'opak.']];
  if (!czytaj('zk-proba-produkty', null)) pisz('zk-proba-produkty', START.map(([n, k, j], i) => ({ id: 'p' + i, nazwa: n, kategoria: k, jednostka: j, staly: true, ile_domyslnie: 1, trzeba: false, ile: 1, kupione: false, uwagi: '' })));
  const P = () => czytaj('zk-proba-produkty', []), A = () => czytaj('zk-proba-archiwum', []);
  return {
    demo: true,
    async init() { return { user, profil: osoby[0] }; },
    async zaloguj() { return { user, profil: osoby[0] }; },
    async wyloguj() {},
    async osoby() { return osoby; },
    async produkty() { return P().sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl')); },
    async dodaj(p) { const n = { staly: true, ile_domyslnie: 1, trzeba: false, ile: 1, kupione: false, uwagi: '', kategoria: 'Inne', jednostka: 'szt.', ...p, id: id() }; pisz('zk-proba-produkty', [...P(), n]); return n; },
    async zmien(pid, zm) { pisz('zk-proba-produkty', P().map(p => p.id === pid ? { ...p, ...zm } : p)); },
    async usun(pid) { pisz('zk-proba-produkty', P().filter(p => p.id !== pid)); },
    async zakoncz(z) {
      const kup = P().filter(p => p.trzeba && p.kupione);
      if (!kup.length) throw new Error('Nic nie jest odhaczone jako kupione');
      pisz('zk-proba-archiwum', [{ id: id(), kiedy: z.kiedy, kwota: z.kwota, sklep: z.sklep, uwagi: z.uwagi, kto: 'ja', utworzono: new Date().toISOString(),
        pozycje: kup.map(p => ({ nazwa: p.nazwa, ile: p.ile, jednostka: p.jednostka, kategoria: p.kategoria })) }, ...A()]);
      pisz('zk-proba-produkty', P().filter(p => !(p.trzeba && p.kupione && !p.staly))
        .map(p => p.trzeba && p.kupione ? { ...p, trzeba: false, kupione: false, ile: p.ile_domyslnie } : p));
    },
    async archiwum() { return A().sort((a, b) => b.kiedy.localeCompare(a.kiedy) || b.utworzono.localeCompare(a.utworzono)); },
    async zmienArchiwum(aid, zm) { pisz('zk-proba-archiwum', A().map(a => a.id === aid ? { ...a, ...zm } : a)); },
    async usunArchiwum(aid) { pisz('zk-proba-archiwum', A().filter(a => a.id !== aid)); },
    nasluchuj() {}
  };
}

const cfg = window.RM_CONFIG || {};
const DB = (cfg.supabaseUrl && !/[?&]proba/.test(location.search)) ? magazynSupabase(cfg) : magazynProbny();

// ===================== STAN =====================
const S = { user: null, profil: null, admin: false, osoby: [], produkty: [], archiwum: [], nowy: { staly: true, kategoria: 'Kuchnia' }, koniec: { sklep: '', kwota: '', uwagi: '', kiedy: '' }, otwarty: null };
const imie = (id) => (S.osoby.find(o => o.id === id)?.imie) || 'ktoś z zespołu';
const doKupienia = () => S.produkty.filter(p => p.trzeba);
// kategorie w stałej kolejności, nowe (wpisane ręcznie) na końcu przed „Inne”
function kategorie(lista) {
  const ext = [...new Set(lista.map(p => p.kategoria))].filter(k => !KATEGORIE.includes(k)).sort((a, b) => a.localeCompare(b, 'pl'));
  const kol = [...KATEGORIE.slice(0, -1), ...ext, 'Inne'];
  return kol.map(k => [k, lista.filter(p => p.kategoria === k)]).filter(([, l]) => l.length);
}

// ===================== START =====================
async function start() {
  $$('[data-wersja]').forEach(el => el.textContent = WERSJA);
  if (DB.demo) { const b = $('#banner'); b.hidden = false; b.textContent = 'Tryb próbny: dane zostają tylko w tej przeglądarce.'; }
  try { const s = await DB.init(); if (s) await poZalogowaniu(s); else pokazLogowanie(); }
  catch (e) { pokazLogowanie(); $('#log-blad').textContent = e.message; }
}
function pokazLogowanie() {
  $$('.screen').forEach(el => el.hidden = true); $('#tabs').hidden = true; $('#btn-wyloguj').hidden = true;
  $('#ekran-logowanie').hidden = false;
}
$('#form-logowanie').addEventListener('submit', async (e) => {
  e.preventDefault(); $('#log-blad').textContent = '';
  try { await poZalogowaniu(await DB.zaloguj($('#log-email').value, $('#log-haslo').value)); }
  catch (err) { $('#log-blad').textContent = err.message; }
});
$('#btn-wyloguj').addEventListener('click', async () => { await DB.wyloguj(); location.reload(); });

async function poZalogowaniu({ user, profil }) {
  S.user = user; S.profil = profil; S.admin = profil.rola === 'admin';
  S.osoby = await DB.osoby();
  $('#ekran-logowanie').hidden = true; $('#tabs').hidden = false; $('#btn-wyloguj').hidden = false;
  await odswiez();
  // w trakcie zakupów (coś już odhaczone) aplikacja otwiera się od razu na liście do kupienia
  pokazZakladke(S.produkty.some(p => p.trzeba && p.kupione) ? 'kupuje' : 'sprawdz');
  DB.nasluchuj(() => odswiez());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) odswiez(); });
}

async function odswiez() {
  try {
    const [produkty, archiwum] = await Promise.all([DB.produkty(), DB.archiwum()]);
    S.produkty = produkty; S.archiwum = archiwum;
    rysuj();
  } catch (e) { toast('Nie udało się wczytać: ' + e.message, 5000); }
}
function rysuj() {
  const n = doKupienia().length;
  $('#tab-ile').textContent = n ? n : '';
  if (!$('#arkusz').hidden) return; // nie przerywamy edycji w karcie
  if (zakladka === 'sprawdz') rysujSprawdz();
  if (zakladka === 'kupuje') rysujKupuje();
  if (zakladka === 'archiwum') rysujArchiwum();
}

// zmiana od razu na ekranie, zapis w tle; błąd = wczytanie stanu z bazy
async function zmien(p, zm) {
  Object.assign(p, zm); rysuj();
  try { await DB.zmien(p.id, zm); } catch (e) { toast('Nie zapisało się: ' + e.message, 5000); await odswiez(); }
}

// ===================== ZAKŁADKI =====================
let zakladka = 'sprawdz';
function pokazZakladke(t) {
  zakladka = t;
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $$('.screen').forEach(el => el.hidden = true);
  $('#ekran-' + t).hidden = false;
  rysuj();
  window.scrollTo(0, 0);
}
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) pokazZakladke(b.dataset.tab); });

// ===================== SPRAWDZAMY =====================
function rysujSprawdz() {
  const ost = S.archiwum[0];
  const sroda = new Date().getDay() === 3;
  $('#info-sroda').innerHTML = `${sroda ? '📅 <b>Dziś środa, sprawdzamy zapasy.</b> Zaznacz, czego brakuje, i ustaw ile kupić.' : `Zapasy sprawdzamy w środy, najbliższa: <b>${dataPL(najblizszaSroda())}</b>.`}
    ${ost ? `<div class="small muted">Ostatnie zakupy: ${dataPL(ost.kiedy)}, ${zl(ost.kwota)}${ost.sklep ? ', ' + esc(ost.sklep) : ''}</div>` : ''}`;
  $('#info-sroda').classList.toggle('sroda', sroda);

  const N = S.nowy;
  $('#d-opcje').innerHTML = `<button type="button" class="chip${N.staly ? ' on' : ''}" data-staly="1">📌 Na stałe</button>
    <button type="button" class="chip${!N.staly ? ' on' : ''}" data-staly="0">Tylko tym razem</button>
    <span class="chips-sep"></span>
    ${KATEGORIE.map(k => `<button type="button" class="chip chip-mala${N.kategoria === k ? ' on' : ''}" data-kat="${esc(k)}">${esc(k)}</button>`).join('')}`;

  const grupy = kategorie(S.produkty);
  $('#lista').innerHTML = grupy.length ? grupy.map(([k, l]) => `<div class="sekcja-tytul">${esc(k)} <span class="muted">${l.filter(p => p.trzeba).length ? '· ' + l.filter(p => p.trzeba).length + ' do kupienia' : ''}</span></div>
    ${l.map(p => `<div class="poz${p.trzeba ? ' trzeba' : ''}">
      <button class="ptaszek" data-tog="${p.id}" aria-label="${p.trzeba ? 'Nie trzeba' : 'Trzeba kupić'}">${p.trzeba ? '✓' : ''}</button>
      <button class="poz-nazwa" data-tog="${p.id}">${esc(p.nazwa)}${p.staly ? '' : ' <span class="znaczek">tylko tym razem</span>'}${p.uwagi ? `<span class="poz-uwagi">${esc(p.uwagi)}</span>` : ''}</button>
      <div class="licznik"><button data-minus="${p.id}" aria-label="Mniej">−</button><span>${ileTxt(p.ile)}<small> ${esc(p.jednostka)}</small></span><button data-plus="${p.id}" aria-label="Więcej">+</button></div>
      <button class="kropki" data-edytuj="${p.id}" aria-label="Zmień albo usuń">⋯</button>
    </div>`).join('')}`).join('')
    : '<div class="pusto">Lista jest pusta. Dopisz produkty polem powyżej, te „na stałe” będą tu co środę.</div>';

  const n = doKupienia().length;
  $('#pasek-info').innerHTML = n ? `Zaznaczone: <b>${n}</b> · <button class="link" data-akcja="wyczysc">odznacz wszystko</button>` : 'Zaznacz, czego brakuje';
  $$('#pasek-sprawdz [data-akcja="drukuj"], #pasek-sprawdz [data-akcja="do-sklepu"]').forEach(b => b.disabled = !n);
}

$('#d-opcje').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.staly) S.nowy.staly = b.dataset.staly === '1';
  if (b.dataset.kat) S.nowy.kategoria = b.dataset.kat;
  rysujSprawdz();
});
$('#f-dodaj').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nazwa = $('#d-nazwa').value.trim().replace(/\s+/g, ' ');
  if (!nazwa) { $('#d-nazwa').focus(); return; }
  const jest = S.produkty.find(p => bezOgonkow(p.nazwa) === bezOgonkow(nazwa));
  $('#d-nazwa').value = '';
  if (jest) { if (!jest.trzeba) await zmien(jest, { trzeba: true }); toast(`„${jest.nazwa}” już jest na liście, zaznaczone`); return; }
  try {
    const p = await DB.dodaj({ nazwa: nazwa[0].toUpperCase() + nazwa.slice(1), kategoria: S.nowy.kategoria, staly: S.nowy.staly, trzeba: true, ile: 1, ile_domyslnie: 1 });
    S.produkty.push(p); S.produkty.sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl')); rysuj();
    toast(S.nowy.staly ? 'Dodane na stałe i zaznaczone' : 'Dodane tylko na te zakupy');
  } catch (err) { toast('Nie zapisało się: ' + err.message, 5000); }
  $('#d-nazwa').focus();
});

function klikPozycji(e) {
  const b = e.target.closest('button'); if (!b) return;
  const p = S.produkty.find(x => x.id === (b.dataset.tog || b.dataset.plus || b.dataset.minus || b.dataset.edytuj)); if (!p) return;
  if (b.dataset.tog) zmien(p, p.trzeba ? { trzeba: false, kupione: false } : { trzeba: true });
  if (b.dataset.plus) zmien(p, p.trzeba ? { ile: Number(p.ile) + 1 } : { trzeba: true });
  if (b.dataset.minus) {
    if (!p.trzeba) return;
    if (Number(p.ile) > 1) zmien(p, { ile: Math.max(1, Number(p.ile) - 1) }); else zmien(p, { trzeba: false, kupione: false });
  }
  if (b.dataset.edytuj) otworzProdukt(p);
}
$('#lista').addEventListener('click', klikPozycji);

$('#pasek-sprawdz').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-akcja]'); if (!b) return;
  if (b.dataset.akcja === 'drukuj') drukuj();
  if (b.dataset.akcja === 'do-sklepu') pokazZakladke('kupuje');
  if (b.dataset.akcja === 'wyczysc') {
    const l = doKupienia(); if (!l.length) return;
    l.forEach(p => Object.assign(p, { trzeba: false, kupione: false, ile: p.ile_domyslnie })); rysuj();
    try { await Promise.all(l.map(p => DB.zmien(p.id, { trzeba: false, kupione: false, ile: p.ile_domyslnie }))); toast('Odznaczone'); }
    catch (err) { toast('Nie zapisało się: ' + err.message, 5000); await odswiez(); }
  }
});

// ===================== WYDRUK =====================
function drukuj() {
  const l = doKupienia(); if (!l.length) { toast('Najpierw zaznacz, co kupić'); return; }
  $('#druk').innerHTML = `<div class="druk-glowa"><img src="logo.png" alt=""><div><h1>Zakupy biura</h1><div>${dzienTyg(dzis())}, ${dataPL(dzis())} · pozycji: ${l.length}</div></div></div>
    ${kategorie(l).map(([k, g]) => `<h2>${esc(k)}</h2><table>${g.map(p => `<tr><td class="kw">☐</td><td>${esc(p.nazwa)}${p.uwagi ? ` <i>(${esc(p.uwagi)})</i>` : ''}</td><td class="il">${ileTxt(p.ile)} ${esc(p.jednostka)}</td></tr>`).join('')}</table>`).join('')}
    <h2>Dopisane w sklepie</h2><table>${'<tr><td class="kw">☐</td><td class="linia"></td><td class="il"></td></tr>'.repeat(3)}</table>
    <div class="druk-stopka">Sklep: ______________________ &nbsp;&nbsp; Razem: ____________ zł &nbsp;&nbsp; Kupił(a): ______________</div>
    <div class="druk-nota">Po zakupach odhacz w aplikacji Zakupy RM i wpisz kwotę z paragonu.</div>`;
  window.print();
}

// ===================== DO KUPIENIA =====================
function rysujKupuje() {
  zapamietajKoniec(); // odświeżenie na żywo nie kasuje wpisywanej kwoty
  const l = doKupienia(), kup = l.filter(p => p.kupione).length;
  if (!l.length) {
    $('#kupuje-lista').innerHTML = `<div class="pusto">Nic nie jest zaznaczone do kupienia.<br><button class="btn btn-ghost" style="width:auto;margin:14px auto 0;padding:10px 18px" data-akcja="do-sprawdz">📝 Przejdź do sprawdzania</button></div>`;
    $('#kupuje-dol').innerHTML = ''; return;
  }
  const proc = Math.round(kup / l.length * 100);
  $('#kupuje-lista').innerHTML = `<div class="postep card"><div class="row-between"><b>Kupione ${kup} z ${l.length}</b><button class="link" data-akcja="drukuj">🖨️ Drukuj</button></div><div class="pasek"><i style="width:${proc}%"></i></div></div>
    ${kategorie(l).map(([k, g]) => `<div class="sekcja-tytul">${esc(k)}</div>
      ${g.sort((a, b) => a.kupione - b.kupione).map(p => `<button class="odhacz${p.kupione ? ' kupione' : ''}" data-kup="${p.id}">
        <span class="kratka">${p.kupione ? '✓' : ''}</span><span class="odhacz-nazwa">${esc(p.nazwa)}${p.uwagi ? `<span class="poz-uwagi">${esc(p.uwagi)}</span>` : ''}</span><span class="odhacz-ile">${ileTxt(p.ile)} ${esc(p.jednostka)}</span></button>`).join('')}`).join('')}`;

  const K = S.koniec;
  const zostaje = l.length - kup;
  $('#kupuje-dol').innerHTML = kup ? `<form class="card koniec" id="f-koniec">
    <div class="card-title">Po zakupach</div>
    <label>Kwota całościowa z paragonu (zł) <input type="text" inputmode="decimal" id="k-kwota" value="${esc(K.kwota)}" placeholder="np. 187,45" autocomplete="off" required></label>
    <div class="sekcja-tytul" style="margin-top:2px">Sklep</div>
    <div class="chips">${SKLEPY.map(s => `<button type="button" class="chip${K.sklep === s ? ' on' : ''}" data-sklep="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    <div class="grid2"><label>Inny sklep <input type="text" id="k-sklep" maxlength="80" value="${SKLEPY.includes(K.sklep) ? '' : esc(K.sklep)}" placeholder="wpisz"></label>
    <label>Data <input type="date" id="k-data" value="${K.kiedy || dzis()}" max="${dzis()}"></label></div>
    <label>Uwagi (nie musisz) <input type="text" id="k-uwagi" maxlength="300" value="${esc(K.uwagi)}" placeholder="np. faktura na spółkę"></label>
    ${zostaje ? `<div class="stan-box uwaga">Nieodhaczone (${zostaje}) zostaną na liście do następnych zakupów.</div>` : ''}
    <button class="btn btn-main btn-big" type="submit">✓ Zakończ zakupy i zapisz</button></form>`
    : '<p class="muted small" style="text-align:center;margin:14px 0">Odhaczaj, co już jest w koszyku. Po zakupach wpiszesz tu kwotę z paragonu.</p>';
}
$('#kupuje-lista').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.akcja === 'drukuj') drukuj();
  if (b.dataset.akcja === 'do-sprawdz') pokazZakladke('sprawdz');
  if (b.dataset.kup) { zapamietajKoniec(); const p = S.produkty.find(x => x.id === b.dataset.kup); if (p) zmien(p, { kupione: !p.kupione }); }
});
function zapamietajKoniec() {
  const K = S.koniec; if (!$('#f-koniec')) return;
  K.kwota = $('#k-kwota').value; K.uwagi = $('#k-uwagi').value; K.kiedy = $('#k-data').value;
  if ($('#k-sklep').value.trim()) K.sklep = $('#k-sklep').value.trim();
}
$('#kupuje-dol').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sklep]'); if (!b) return;
  zapamietajKoniec(); S.koniec.sklep = S.koniec.sklep === b.dataset.sklep ? '' : b.dataset.sklep; $('#k-sklep').value = ''; rysujKupuje();
});
$('#kupuje-dol').addEventListener('input', (e) => { if (e.target.id === 'k-sklep' && e.target.value.trim()) $$('#kupuje-dol [data-sklep]').forEach(c => c.classList.remove('on')); });
$('#kupuje-dol').addEventListener('submit', async (e) => {
  e.preventDefault(); zapamietajKoniec();
  const K = S.koniec, kwota = liczba(K.kwota);
  if (!(kwota >= 0)) { toast('Wpisz kwotę, np. 187,45'); $('#k-kwota').focus(); return; }
  const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
  try {
    await DB.zakoncz({ kwota, sklep: K.sklep.trim(), uwagi: K.uwagi.trim(), kiedy: K.kiedy || dzis() });
    S.koniec = { sklep: '', kwota: '', uwagi: '', kiedy: '' };
    toast(`Zapisane w archiwum: ${zl(kwota)}`, 3500);
    await odswiez(); pokazZakladke('archiwum');
  } catch (err) { toast('Nie zapisało się: ' + err.message, 5000); btn.disabled = false; }
});

// ===================== ARCHIWUM =====================
function rysujArchiwum() {
  const A = S.archiwum, mies = dzis().slice(0, 7);
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); const poprz = isoDzien(d).slice(0, 7);
  const suma = (m) => A.filter(a => a.kiedy.startsWith(m)).reduce((s, a) => s + Number(a.kwota), 0);
  const ile = (m) => A.filter(a => a.kiedy.startsWith(m)).length;
  const d3 = new Date(); d3.setMonth(d3.getMonth() - 3); const od3 = isoDzien(d3);
  const ost3 = A.filter(a => a.kiedy >= od3);
  const nazwaMies = (m) => new Date(m + '-15T12:00').toLocaleDateString('pl-PL', { month: 'long' });
  $('#archiwum-podsumowanie').innerHTML = A.length ? `<div class="kafle">
    <div class="kafel"><b>${zl(suma(mies))}</b><span>${nazwaMies(mies)} · ${ile(mies)}×</span></div>
    <div class="kafel"><b>${zl(suma(poprz))}</b><span>${nazwaMies(poprz)} · ${ile(poprz)}×</span></div>
    <div class="kafel"><b>${ost3.length ? zl(ost3.reduce((s, a) => s + Number(a.kwota), 0) / ost3.length) : '–'}</b><span>średnio na zakupy, 3 mies.</span></div></div>` : '';

  let m = '';
  $('#archiwum-lista').innerHTML = A.length ? A.map(a => {
    const naglowek = a.kiedy.slice(0, 7) !== m ? (m = a.kiedy.slice(0, 7), `<div class="sekcja-tytul">${new Date(m + '-15T12:00').toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })} · ${zl(suma(m))}</div>`) : '';
    const poz = a.pozycje || [];
    return `${naglowek}<div class="card arch">
      <div class="row-between"><div><b>${dataPL(a.kiedy)}</b> <span class="muted small">${dzienTyg(a.kiedy)}</span></div><div class="arch-kwota">${zl(a.kwota)}</div></div>
      <div class="small muted">${[a.sklep, imie(a.kto), poz.length + ' poz.'].filter(Boolean).map(esc).join(' · ')}${a.uwagi ? `<br>${esc(a.uwagi)}` : ''}</div>
      <details><summary>Co kupiono</summary><ul class="arch-poz">${poz.map(p => `<li>${esc(p.nazwa)} <span class="muted">${ileTxt(p.ile)} ${esc(p.jednostka)}</span></li>`).join('')}</ul>
        <div class="akcje-dol"><button class="link" data-ponow="${a.id}">Zaznacz te pozycje do kupienia</button><button class="link" data-kwota="${a.id}">Popraw kwotę</button>${S.admin ? `<button class="link czerwony" data-usun-arch="${a.id}">Usuń wpis</button>` : ''}</div></details>
    </div>`;
  }).join('') : '<div class="pusto">Archiwum jest puste. Zakupy trafiają tu po wpisaniu kwoty w zakładce „Do kupienia”.</div>';
}
$('#archiwum-lista').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const a = S.archiwum.find(x => x.id === (b.dataset.ponow || b.dataset.kwota || b.dataset.usunArch)); if (!a) return;
  if (b.dataset.ponow) {
    let n = 0;
    for (const p of a.pozycje || []) {
      const jest = S.produkty.find(x => bezOgonkow(x.nazwa) === bezOgonkow(p.nazwa));
      try {
        if (jest) { if (!jest.trzeba) { await DB.zmien(jest.id, { trzeba: true, kupione: false, ile: p.ile }); n++; } }
        else { await DB.dodaj({ nazwa: p.nazwa, kategoria: p.kategoria || 'Inne', jednostka: p.jednostka || 'szt.', staly: false, trzeba: true, ile: p.ile, ile_domyslnie: 1 }); n++; }
      } catch (err) { toast('Nie zapisało się: ' + err.message, 5000); break; }
    }
    await odswiez(); toast(n ? `Zaznaczone do kupienia: ${n}` : 'Wszystko już było zaznaczone');
  }
  if (b.dataset.kwota) { S.otwarty = { arch: a.id }; rysujArkuszArchiwum(a); otworzArkusz(); setTimeout(() => $('#a-kwota')?.select(), 80); }
  if (b.dataset.usunArch) { S.otwarty = { arch: a.id }; rysujArkuszArchiwum(a, true); otworzArkusz(); }
});
function rysujArkuszArchiwum(a, usun) {
  $('#ark-nr').textContent = 'Zakupy ' + dataPL(a.kiedy);
  $('#ark-tresc').innerHTML = usun
    ? `<div class="ark-nazwa" id="ark-tytul">Usunąć ten wpis?</div><div class="potwierdz">${zl(a.kwota)}${a.sklep ? ', ' + esc(a.sklep) : ''}, ${(a.pozycje || []).length} pozycji. Tego nie da się cofnąć.
      <div class="akcje-dol"><button class="link czerwony" data-akcja="arch-usun-tak">Tak, usuń</button><button class="link" data-akcja="zamknij">Zostaw</button></div></div>`
    : `<div class="ark-nazwa" id="ark-tytul">Popraw zakupy</div><form id="f-arch">
      <label>Kwota (zł) <input type="text" inputmode="decimal" id="a-kwota" value="${ileTxt(a.kwota)}" required></label>
      <div class="grid2"><label>Sklep <input type="text" id="a-sklep" maxlength="80" value="${esc(a.sklep)}"></label>
      <label>Data <input type="date" id="a-data" value="${a.kiedy}" max="${dzis()}"></label></div>
      <label>Uwagi <input type="text" id="a-uwagi" maxlength="300" value="${esc(a.uwagi)}"></label>
      <button class="btn btn-main" type="submit">Zapisz</button></form>`;
}

// ===================== KARTA PRODUKTU =====================
function otworzArkusz() { $('#tlo').hidden = false; $('#arkusz').hidden = false; document.body.style.overflow = 'hidden'; }
function zamknijArkusz() { $('#tlo').hidden = true; $('#arkusz').hidden = true; document.body.style.overflow = ''; S.otwarty = null; rysuj(); }
$('#tlo').addEventListener('click', zamknijArkusz);
$('#ark-zamknij').addEventListener('click', zamknijArkusz);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#arkusz').hidden) zamknijArkusz(); });

function otworzProdukt(p) { S.otwarty = { id: p.id, staly: p.staly, jednostka: p.jednostka }; rysujProdukt(p); otworzArkusz(); }
function rysujProdukt(p, usun) {
  const O = S.otwarty, kat = [...new Set([...KATEGORIE, ...S.produkty.map(x => x.kategoria)])];
  $('#ark-nr').textContent = O.staly ? '📌 Produkt stały' : 'Tylko na te zakupy';
  $('#ark-tresc').innerHTML = `<form id="f-produkt">
    <label>Nazwa <input type="text" id="e-nazwa" value="${esc(p.nazwa)}" maxlength="80" required></label>
    <div class="chips"><button type="button" class="chip${O.staly ? ' on' : ''}" data-e-staly="1">📌 Na stałe, co środę</button>
      <button type="button" class="chip${!O.staly ? ' on' : ''}" data-e-staly="0">Tylko tym razem</button></div>
    <label>Kategoria <select id="e-kat">${kat.map(k => `<option${p.kategoria === k ? ' selected' : ''}>${esc(k)}</option>`).join('')}</select></label>
    <div class="sekcja-tytul" style="margin-top:2px">Jednostka</div>
    <div class="chips">${JEDNOSTKI.map(j => `<button type="button" class="chip chip-mala${O.jednostka === j ? ' on' : ''}" data-jedn="${esc(j)}">${esc(j)}</button>`).join('')}</div>
    <div class="grid2"><label>Ile kupić teraz <input type="text" inputmode="decimal" id="e-ile" value="${ileTxt(p.ile)}"></label>
    ${O.staly ? `<label>Ile zwykle <input type="text" inputmode="decimal" id="e-ile-dom" value="${ileTxt(p.ile_domyslnie)}"></label>` : '<span></span>'}</div>
    <label>Uwagi <input type="text" id="e-uwagi" value="${esc(p.uwagi)}" maxlength="200" placeholder="np. bez laktozy, marka, gdzie najtaniej"></label>
    <button class="btn btn-main" type="submit">Zapisz</button></form>
    ${usun ? `<div class="potwierdz">${p.staly ? `<b>${esc(p.nazwa)}</b> zniknie z listy stałych i nie wróci w następną środę.` : `<b>${esc(p.nazwa)}</b> zniknie z listy.`} W archiwum zostaje.
      <div class="akcje-dol"><button class="link czerwony" data-akcja="usun-tak">Tak, usuń</button><button class="link" data-akcja="anuluj">Zostaw</button></div></div>`
    : `<div class="akcje-dol"><button class="link czerwony" data-akcja="usun">${p.staly ? 'Usuń ze stałych' : 'Usuń z listy'}</button></div>`}`;
}
function zapamietajProdukt() {
  const p = S.produkty.find(x => x.id === S.otwarty?.id); if (!p || !$('#f-produkt')) return null;
  return { nazwa: $('#e-nazwa').value, kategoria: $('#e-kat').value, ile: $('#e-ile').value, ile_dom: $('#e-ile-dom')?.value ?? p.ile_domyslnie, uwagi: $('#e-uwagi').value };
}
$('#arkusz').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b || !S.otwarty) return;
  if (S.otwarty.arch) {
    const a = S.archiwum.find(x => x.id === S.otwarty.arch);
    if (b.dataset.akcja === 'zamknij') zamknijArkusz();
    if (b.dataset.akcja === 'arch-usun-tak' && a) {
      try { await DB.usunArchiwum(a.id); toast('Wpis usunięty'); zamknijArkusz(); await odswiez(); } catch (err) { toast('Nie udało się: ' + err.message, 5000); }
    }
    return;
  }
  const p = S.produkty.find(x => x.id === S.otwarty.id); if (!p) { zamknijArkusz(); return; }
  if (b.dataset.eStaly || b.dataset.jedn) {
    const pola = zapamietajProdukt();
    if (b.dataset.eStaly) S.otwarty.staly = b.dataset.eStaly === '1';
    if (b.dataset.jedn) S.otwarty.jednostka = b.dataset.jedn;
    rysujProdukt({ ...p, ...pola, ile: liczba(pola.ile) || p.ile, ile_domyslnie: liczba(pola.ile_dom) || p.ile_domyslnie });
    return;
  }
  const a = b.dataset.akcja;
  if (a === 'usun') rysujProdukt({ ...p, ...zapamietajProdukt(), ile: p.ile }, true);
  if (a === 'anuluj') rysujProdukt(p);
  if (a === 'usun-tak') {
    try { await DB.usun(p.id); S.produkty = S.produkty.filter(x => x.id !== p.id); toast(`Usunięte: ${p.nazwa}`); zamknijArkusz(); }
    catch (err) { toast('Nie udało się: ' + err.message, 5000); }
  }
});
$('#arkusz').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (e.target.id === 'f-arch') {
    const kwota = liczba($('#a-kwota').value);
    if (!(kwota >= 0)) { toast('Wpisz kwotę, np. 187,45'); return; }
    try { await DB.zmienArchiwum(S.otwarty.arch, { kwota, sklep: $('#a-sklep').value.trim(), kiedy: $('#a-data').value || dzis(), uwagi: $('#a-uwagi').value.trim() }); toast('Zapisano'); zamknijArkusz(); await odswiez(); }
    catch (err) { toast('Nie zapisało się: ' + err.message, 5000); }
    return;
  }
  if (e.target.id !== 'f-produkt') return;
  const p = S.produkty.find(x => x.id === S.otwarty.id); if (!p) return;
  const pola = zapamietajProdukt(), ile = liczba(pola.ile), dom = liczba(pola.ile_dom);
  const nazwa = pola.nazwa.trim().replace(/\s+/g, ' ');
  if (!nazwa) { toast('Wpisz nazwę'); return; }
  if (!(ile > 0) || !(dom > 0)) { toast('Ilość musi być większa od zera'); return; }
  const zm = { nazwa, kategoria: pola.kategoria, jednostka: S.otwarty.jednostka, staly: S.otwarty.staly, ile, ile_domyslnie: dom, uwagi: pola.uwagi.trim() };
  if (ile !== Number(p.ile)) zm.trzeba = true;
  try { await DB.zmien(p.id, zm); Object.assign(p, zm); toast('Zapisano'); zamknijArkusz(); }
  catch (err) { toast('Nie zapisało się: ' + err.message, 5000); }
});

// ===================== SERVICE WORKER =====================
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  let przeladowano = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (przeladowano || !$('#arkusz').hidden || document.activeElement?.tagName === 'INPUT') return;
    przeladowano = true; location.reload();
  });
}

start();
