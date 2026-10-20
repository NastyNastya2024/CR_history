/* Запускается из auth.js после успешного входа */
window.startApp = function () {
  "use strict";
  if (window.__appStarted) return;
  window.__appStarted = true;
  const D = window.DEMO;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- форматирование ---------- */
  const nf = new Intl.NumberFormat("ru-RU");
  const NB = " ";
  const rub = (v) => nf.format(Math.round(v)) + NB + "₽";
  const short = (v) => {
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + NB + "млн" + NB + "₽";
    if (a >= 1e3) return nf.format(Math.round(v / 1e3)) + NB + "тыс" + NB + "₽";
    return rub(v);
  };
  const round1k = (v) => Math.round(v / 1000) * 1000;
  const pct = (v) => v.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + NB + "%";
  const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; };
  const termText = (m) => (m % 12 === 0 ? `${m / 12}${NB}${plural(m / 12, "год", "года", "лет")}` : `${m}${NB}мес`);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- финансы ---------- */
  const annuity = (P, ratePct, n) => { const r = ratePct / 1200; return r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n)); };
  const monthsLeft = (P, ratePct, A) => { const r = ratePct / 1200; return -Math.log(1 - (P * r) / A) / Math.log(1 + r); };

  const loanById = Object.fromEntries(D.loans.map((l) => [l.id, l]));
  const active = D.loans.filter((l) => l.balance > 0);
  const totalDebt = active.reduce((s, l) => s + l.balance, 0);
  const totalPay = active.reduce((s, l) => s + l.payment, 0);
  const totalOrig = active.reduce((s, l) => s + l.original, 0);
  const avgRate = active.reduce((s, l) => s + l.balance * l.rate, 0) / totalDebt;
  const pdnOf = (pay) => Math.round((pay / D.client.incomeCpg) * 100);
  const pdn = pdnOf(totalPay);

  /* ---------- состояние ---------- */
  const DEFAULT = { goals: ["pay"], picked: ["alfa", "tbank"], term: 60, cash: 300000, scenario: "pre", request: null };
  const has = (g) => S.goals.includes(g);
  const GOAL_ORDER = ["pay", "rate", "cash"];
  const isCardLoan = (l) => l.kind === "Кредитная карта";
  const todayText = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }).replace(/\s?г\.?$/, "");
  const preNames = new Set(D.preapprovals.map((p) => p.bank));
  const rateTxt = (v, approx) => `ставка ${approx ? "≈" + NB : ""}${pct(v)}`;
  const S = JSON.parse(JSON.stringify(DEFAULT));

  // ставка: лучшее подходящее предодобрение, иначе оценка по рынку
  function bestRate(principal) {
    if (S.scenario === "pre") {
      const fit = D.preapprovals
        .filter((p) => p.amount >= principal && !(p.own && S.picked.includes(p.own)))
        .sort((a, b) => a.rate - b.rate)[0];
      if (fit) return { rate: fit.rate, source: "pre", bank: fit.bank, amount: fit.amount };
    }
    return { rate: D.marketRefiRate, source: "market" };
  }

  function calc(rateOverride, termOverride) {
    const loans = S.picked.map((id) => loanById[id]);
    if (!loans.length) return null;
    const base = loans.reduce((s, l) => s + l.balance, 0);
    const curPay = loans.reduce((s, l) => s + l.payment, 0);
    const curInterest = loans.reduce((s, l) => s + (l.payment * monthsLeft(l.balance, l.rate, l.payment) - l.balance), 0);
    const curMonths = Math.max(...loans.map((l) => monthsLeft(l.balance, l.rate, l.payment)));
    const curRate = loans.reduce((s, l) => s + l.balance * l.rate, 0) / base;
    const extra = has("cash") ? S.cash : 0;
    const principal = base + extra;
    const r = rateOverride ? { rate: rateOverride, source: "bank" } : bestRate(principal);
    const term = termOverride || S.term;
    const newPay = annuity(principal, r.rate, term);
    const newInterest = newPay * term - principal;
    // переплата только по рефинансируемой части — честное сравнение «было/стало»
    const refiPay = annuity(base, r.rate, term);
    const refiInterest = refiPay * term - base;
    return {
      loans, base, curPay, curInterest, curMonths, curRate, extra, principal, r, newPay, newInterest, term, refiPay, refiInterest,
      payDiff: curPay - newPay, intDiff: curInterest - refiInterest,
      pdnAfter: pdnOf(totalPay - curPay + newPay)
    };
  }

  // Срок, при котором выполняются все выбранные цели одновременно (или лучший компромисс)
  function recommendTerm() {
    const c0 = calc(null, 60);
    if (!c0) return { term: 60, note: "" };
    const remain = Math.max(12, Math.min(60, Math.ceil(c0.curMonths / 3) * 3));
    const wantPay = has("pay"), wantRate = has("rate");
    if (wantPay && !wantRate) return { term: 60, note: "самый длинный срок — самый низкий платёж" };
    if (wantRate && !wantPay) return { term: remain, note: "как у текущих кредитов — меньше переплата" };
    if (wantPay && wantRate) {
      let best = null;
      for (let t = 60; t >= 12; t -= 3) {
        const c = calc(null, t);
        if (c.payDiff > 0 && c.intDiff >= 0) { best = t; break; }
      }
      return best ? { term: best, note: "платёж ниже и переплата не растёт" } : { term: remain, note: "обе цели сразу недостижимы — приоритет переплате" };
    }
    return { term: 36, note: "типичный срок для кредита с деньгами сверху" };
  }

  function goalStatus(c) {
    // для каждой цели: достигнута ли и на сколько
    return {
      pay: { ok: c.payDiff > 0, value: c.payDiff },
      rate: { ok: c.intDiff >= 0, value: c.intDiff },
      cash: { ok: c.extra > 0, value: c.extra }
    };
  }

  function renderHeader() {
    const pre = S.scenario === "pre";
    const total = D.preapprovals.reduce((sum, p) => sum + p.amount, 0);
    const maxP = D.preapprovals.slice().sort((a, b) => b.amount - a.amount)[0];
    $("#saveEyebrow").textContent = `${D.client.firstName}, данные на ${todayText}`;
    if (pre) {
      $("#saveTitle").innerHTML = `Вам предодобрено <span class="nowrap">${short(total)}</span> в ${D.preapprovals.length} банках`;
      $("#preBanks").innerHTML = D.preapprovals.map((p) => `
        <li class="pre-bank">
          <span class="bank-mark" style="--bank:${p.color}">${p.mark}</span>
          <span><b>${p.bank}</b><small>до ${short(p.amount)} · ставка от ${pct(p.rate)}</small></span>
          <span class="badge badge--ok">Предодобрено</span>
        </li>`).join("");
      $("#preBanks").hidden = false;
      $("#saveSource").innerHTML = `Сумма — это сумма лимитов всех предодобрений. Взять один кредит можно в пределах лимита одного банка, максимум ${short(maxP.amount)} в ${maxP.bank}. Средняя ставка по рынку — <b>${pct(D.marketRefiRate)}</b> (${D.marketRateSource}).`;
    } else {
      $("#saveTitle").textContent = `Предодобрений пока нет. Узнайте условия в ${D.banks.length} банках одним запросом`;
      $("#preBanks").hidden = true;
      $("#saveSource").innerHTML = `Ниже — оценка по средней ставке рефинансирования на рынке <b>${pct(D.marketRefiRate)}</b> (${D.marketRateSource}). Точные условия банки дадут после запроса.`;
    }
  }

  /* ---------- 1. Главный блок: экономия ---------- */
  function renderPick() {
    $("#loanPick").innerHTML = D.loans.filter((l) => l.balance > 0).map((l) => {
      const on = S.picked.includes(l.id), dis = l.refi === "no";
      return `
      <li class="pick__item ${on ? "is-on" : ""} ${dis ? "is-off" : ""}">
        <label>
          <input type="checkbox" value="${l.id}" ${on ? "checked" : ""} ${dis ? "disabled" : ""}>
          <span class="pick__box" aria-hidden="true"></span>
          <span class="pick__main"><b>${l.kind} · ${l.bank}</b><small>${short(l.balance)} · ${short(l.payment)}/мес</small></span>
          <span class="pick__rate ${l.refi === "good" ? "neg" : ""}"><small>ставка</small>${pct(l.rate)}</span>
        </label>
        ${l.refiNote ? `<p class="pick__note">${l.refiNote}</p>` : ""}
      </li>`;
    }).join("");
  }
  $("#loanPick").addEventListener("change", (e) => {
    const id = e.target.value;
    S.picked = e.target.checked ? [...new Set([...S.picked, id])] : S.picked.filter((x) => x !== id);
    renderAll();
  });

  $("#goalSwitch").addEventListener("click", (e) => {
    const b = e.target.closest(".goal__btn"); if (!b) return;
    const g = b.dataset.goal;
    let next = has(g) ? S.goals.filter((x) => x !== g) : [...S.goals, g];
    if (!next.length) { b.classList.add("is-shake"); setTimeout(() => b.classList.remove("is-shake"), 300); return; } // хотя бы одна цель
    setGoals(next);
  });
  function setGoals(list) {
    S.goals = GOAL_ORDER.filter((g) => list.includes(g));
    S.term = recommendTerm().term;
    $$(".goal__btn").forEach((x) => { const on = has(x.dataset.goal); x.classList.toggle("is-active", on); x.setAttribute("aria-pressed", on); });
    renderAll();
  }
  $("#termRange").addEventListener("input", (e) => { S.term = +e.target.value; renderSave(); renderOffers(); });
  $("#cashRange").addEventListener("input", (e) => { S.cash = +e.target.value; renderSave(); renderOffers(); });

  function renderSave() {
    const c = calc();
    const rec = recommendTerm();
    $("#termRange").value = S.term; $("#termOut").textContent = termText(S.term);
    $("#termHint").textContent = S.term === rec.term ? `· рекомендуем: ${rec.note}` : `· рекомендуем ${termText(rec.term)}`;
    $("#termHint").classList.toggle("is-off", S.term !== rec.term);
    $("#cashField").hidden = !has("cash");
    $("#cashRange").max = D.maxExtraCash; $("#cashRange").value = S.cash;
    $("#cashOut").textContent = short(S.cash); $("#cashMax").textContent = short(D.maxExtraCash);
    $("#pickedSum").textContent = c ? `${short(c.base)} · ${short(c.curPay)}/мес` : "";

    if (!c) {
      $("#stickyLabel").textContent = "Экономия"; $("#stickyValue").textContent = "—";
      $("#saveResult").innerHTML = `<p class="empty">Отметьте хотя бы один кредит слева — посчитаем, сколько можно сэкономить.</p>`;
      return;
    }
    const st = goalStatus(c);
    const approx = c.r.source === "market";
    const srcLine = c.r.source === "pre" ? `предодобрение ${c.r.bank}` : "средняя ставка по рынку";

    // три плитки: выбранные цели выделены, остальные видны для полной картины
    const tile = (g, label, valueTxt, sub, good) => `
      <div class="res-tile ${has(g) ? "is-goal" : ""} ${good ? "is-good" : "is-bad"}">
        <span class="res-tile__label">${label}${has(g) ? `<i class="res-tile__tag">ваша цель</i>` : ""}</span>
        <span class="res-tile__value">${valueTxt}</span>
        <span class="res-tile__sub">${sub}</span>
      </div>`;
    const tiles =
      tile("pay", "Платёж в месяц", (c.payDiff >= 0 ? "−" : "+") + short(round1k(Math.abs(c.payDiff))), `${short(c.curPay)} → ${short(c.newPay)}`, c.payDiff > 0) +
      tile("rate", "Переплата за срок", (c.intDiff >= 0 ? "−" : "+") + short(round1k(Math.abs(c.intDiff))), `проценты ${short(c.curInterest)} → ${short(c.refiInterest)}`, c.intDiff >= 0) +
      tile("cash", "Деньги на руки", c.extra ? "+" + short(c.extra) : "0 ₽", c.extra ? "сверх погашения кредитов" : "выберите цель «Больше денег»", c.extra > 0);

    const missed = S.goals.filter((g) => !st[g].ok);
    const goalWord = { pay: "платёж", rate: "переплата", cash: "деньги" };
    let verdict;
    if (!missed.length) {
      verdict = `<p class="verdict verdict--ok">${S.goals.length > 1 ? "Все выбранные цели достигнуты при сроке " + termText(S.term) + "." : "Цель достигнута."} Банк сам погасит выбранные кредиты, останется один платёж.</p>`;
    } else if (missed.includes("rate") && has("pay")) {
      verdict = `<p class="verdict verdict--warn">При сроке ${termText(S.term)} платёж ниже, но переплата вырастет на ${short(-c.intDiff)}. Чтобы переплата не росла, выберите срок ${termText(recommendTerm().term)} или короче.</p>`;
    } else if (missed.includes("rate")) {
      verdict = `<p class="verdict verdict--warn">При сроке ${termText(S.term)} переплата вырастет на ${short(-c.intDiff)}. Сократите срок.</p>`;
    } else {
      verdict = `<p class="verdict verdict--warn">Не достигнуто: ${missed.map((g) => goalWord[g]).join(", ")}. Измените срок или набор кредитов.</p>`;
    }
    if (S.picked.includes("auto")) verdict += `<p class="verdict verdict--warn">Автокредит (ставка 12,9 %) дешевле нового кредита. Объединять его стоит только ради одного платежа.</p>`;

    // сравнение ставок: сейчас, рынок, предложение
    const rates = [["Ваша средняя сейчас", c.curRate, "cur"], ["Средняя по рынку", D.marketRefiRate, "mkt"], [approx ? "Оценка для вас" : `Предодобрение ${c.r.bank}`, c.r.rate, "new"]];
    const rmax = Math.max(...rates.map((x) => x[1])) * 1.08;
    const rateBars = rates.map(([n, v, k]) => `
      <div class="rb rb--${k}"><span class="rb__name">${n}</span><span class="rb__track"><span style="width:${(v / rmax) * 100}%"></span></span><span class="rb__val">ставка ${pct(v)}</span></div>`).join("");

    const loansLine = c.loans.map((l) => `${l.bank} ${rub(l.payment)}`).join(" + ");
    const loansBal = c.loans.map((l) => rub(l.balance)).join(" + ");
    const loansInt = c.loans.map((l) => `${l.bank} ${short(l.payment * monthsLeft(l.balance, l.rate, l.payment) - l.balance)} (ещё ${Math.round(monthsLeft(l.balance, l.rate, l.payment))} мес)`).join(", ");

    $("#saveResult").innerHTML = `
      <div class="res-tiles">${tiles}</div>
      <div class="rates">
        <p class="rates__title">Сравнение ставок (годовых)</p>
        ${rateBars}
        <p class="rates__note">${approx ? "Предложения банков после запроса могут быть ниже или выше средней по рынку." : `Предодобренная ставка на ${pct(D.marketRefiRate - c.r.rate)} п.п. ниже средней по рынку.`}</p>
      </div>
      ${verdict}
      <details class="how" open>
        <summary>Как мы посчитали</summary>
        <ol class="how__list">
          <li><b>Сейчас платите</b> ${loansLine} = <b>${rub(c.curPay)}</b> в месяц.</li>
          <li><b>Новый кредит</b> закроет остатки ${loansBal}${c.extra ? ` и даст ${rub(c.extra)} на руки` : ""} — всего <b>${rub(c.principal)}</b>. ${approx ? "Средняя ставка по рынку" : "Ставка по предодобрению " + c.r.bank}: <b>${pct(c.r.rate)}</b>, срок ${termText(S.term)}, платежи равными долями — <b>${rub(c.newPay)}</b> в месяц.</li>
          <li><b>Платёж:</b> ${rub(c.curPay)} − ${rub(c.newPay)} = <b class="${c.payDiff >= 0 ? "pos" : "neg"}">${c.payDiff >= 0 ? "" : "−"}${rub(Math.abs(c.payDiff))}</b> ${c.payDiff >= 0 ? "экономии" : "переплаты"} в месяц.</li>
          <li><b>Переплата:</b> по текущим кредитам осталось заплатить процентов ${short(c.curInterest)} — ${loansInt}. По новому кредиту на ту же сумму проценты составят ${short(c.refiInterest)}. Разница — <b class="${c.intDiff >= 0 ? "pos" : "neg"}">${c.intDiff >= 0 ? "экономия " : "рост "}${short(Math.abs(c.intDiff))}</b>.${c.extra ? ` Проценты за деньги сверху (${short(c.newInterest - c.refiInterest)}) в сравнение не входят.` : ""}</li>
          <li><b>Нагрузка (ПДН):</b> ${pdn}% → ${c.pdnAfter}% от дохода ${short(D.client.incomeCpg)}.</li>
        </ol>
        <p class="how__note">Расчёт ориентировочный: ${srcLine}, без страховок и комиссий. Точные условия банк покажет в договоре.</p>
      </details>
      <button class="btn btn--primary btn--lg btn--block" type="button" data-start>Собрать предложения банков</button>
      <p class="fine">Бесплатно. Запрос уйдёт в ${D.banks.length} банков, ответ обычно за 1–2 минуты.</p>`;

    const main = S.goals[0];
    $("#stickyLabel").textContent = main === "pay" ? "Платёж в месяц" : main === "rate" ? "Переплата" : "На руки";
    $("#stickyValue").textContent = main === "cash" ? "+" + short(c.extra) : (main === "pay" ? (c.payDiff >= 0 ? "−" : "+") + short(round1k(Math.abs(c.payDiff))) : (c.intDiff >= 0 ? "−" : "+") + short(round1k(Math.abs(c.intDiff))));
  }

  function gainText(cc) {
    const parts = [];
    if (has("pay")) parts.push(`${cc.payDiff >= 0 ? "−" : "+"}${short(round1k(Math.abs(cc.payDiff)))} в месяц`);
    if (has("rate")) parts.push(`${cc.intDiff >= 0 ? "−" : "+"}${short(round1k(Math.abs(cc.intDiff)))} переплаты`);
    if (has("cash")) parts.push(`+${short(cc.extra)} на руки`);
    return parts.join(" · ");
  }

  /* ---------- 2. Предложения ---------- */
  function renderOffers() {
    const c = calc();
    if (S.scenario === "pre") {
      $("#offersHint").textContent = `Предодобрено по вашей кредитной истории · средняя ставка по рынку ${pct(D.marketRefiRate)}`;
      $("#offersList").innerHTML = D.preapprovals.map((p) => {
        const own = p.own && S.picked.includes(p.own);
        const cc = c && !own ? calc(p.rate) : null;
        const fits = c && p.amount >= c.principal;
        let gain = "";
        if (own) gain = `<p class="offer__no">Не рефинансирует собственный кредит Альфа-Банка</p>`;
        else if (!fits && c) gain = `<p class="offer__no">Сумма ${short(p.amount)} меньше нужной ${short(c.principal)}</p>`;
        else if (cc) {
          gain = `<div class="offer__gain"><b class="pos">${gainText(cc)}</b><span>платёж ${short(cc.newPay)}/мес на ${termText(S.term)}</span></div>`;
        }
        return `
        <article class="offer card ${own || (!fits && c) ? "is-dim" : ""}">
          <header class="offer__head">
            <span class="bank-mark bank-mark--lg" style="--bank:${p.color}">${p.mark}</span>
            <div><b>${p.bank}</b><small>Рефинансирование · действует до ${p.until}</small></div>
            <span class="badge badge--ok">Предодобрено</span>
          </header>
          <dl class="offer__facts">
            <div><dt>Ставка</dt><dd>от ${pct(p.rate)}</dd><dd class="offer__mkt">рынок ${pct(D.marketRefiRate)} · <span class="pos">−${pct(D.marketRefiRate - p.rate)} п.п.</span></dd></div>
            <div><dt>Предодобренная сумма</dt><dd>до ${short(p.amount)}</dd></div>
          </dl>
          ${gain}
          <button class="btn btn--secondary btn--block" type="button" data-start ${own || (!fits && c) ? "disabled" : ""}>Запросить условия</button>
        </article>`;
      }).join("");
    } else {
      $("#offersHint").textContent = `Предодобрений пока нет · средняя ставка по рынку ${pct(D.marketRefiRate)}`;
      $("#offersList").innerHTML = `
        <div class="card banks-empty">
          <div>
            <h3 class="h3">Узнайте условия в ${D.banks.length} банках одним запросом</h3>
            <p class="muted">Анкета заполнится из Госуслуг. Ответы банков появятся здесь, мы пришлём уведомление, когда ответят все.</p>
          </div>
          <ul class="bank-row">${D.banks.map((b) => `<li><span class="bank-mark" style="--bank:${b.color}">${b.mark}</span>${b.bank}</li>`).join("")}</ul>
          <button class="btn btn--primary" type="button" data-start>Собрать предложения</button>
        </div>`;
    }
  }

  /* ---------- 3. Кредиты: точки входа ---------- */
  function singleSaving(l) {
    const r = S.scenario === "pre" ? Math.min(...D.preapprovals.filter((p) => p.own !== l.id).map((p) => p.rate)) : D.marketRefiRate;
    return l.payment - annuity(l.balance, r, 60);
  }
  function renderLoans() {
    $("#loansSummary").textContent = `${short(totalDebt)} · ${short(totalPay)}/мес · средняя ставка ${pct(avgRate)}`;
    $("#navLoans").textContent = D.loans.length;
    $("#loansTable").innerHTML = `
      <div class="lrow lrow--head" role="row">
        <span role="columnheader">Кредит</span><span role="columnheader">Остаток</span>
        <span role="columnheader">Платёж</span><span role="columnheader">Ставка, годовых</span><span role="columnheader">Если рефинансировать</span>
      </div>` + D.loans.map((l) => {
        const paid = l.original ? Math.round(((l.original - l.balance) / l.original) * 100) : 0;
        const isCard = isCardLoan(l);
        const act = l.refi === "good"
          ? `<button class="entry" type="button" data-entry="${l.id}"><b>−${short(round1k(singleSaving(l)))}/мес</b><span>${S.scenario === "pre" ? "по предодобрению" : "по ставке рынка"} · посчитать</span></button>`
          : `<span class="entry-note">${l.refiNote || ""}</span>`;
        return `
        <div class="lrow" role="row">
          <span role="cell" class="lrow__name"><b>${l.kind}</b><small>${l.bank} · с ${l.opened}</small></span>
          <span role="cell" data-l="Остаток"><b>${isCard ? "0 ₽" : short(l.balance)}</b>
            ${isCard ? `<small>лимит ${short(l.limit)}</small>` : `<span class="bar bar--sm"><span style="width:${paid}%"></span></span><small>погашено ${paid}%</small>`}</span>
          <span role="cell" data-l="Платёж">${l.payment ? short(l.payment) : "—"}</span>
          <span role="cell" data-l="Ставка" class="${l.refi === "good" ? "neg" : ""}">${isCard ? "—" : pct(l.rate)}</span>
          <span role="cell" class="lrow__act">${act}</span>
        </div>`;
      }).join("");
    $("#closedLoans").innerHTML = D.closedLoans.map((l) =>
      `<div class="mini-row"><span><b>${l.kind}</b><small>${l.bank} · ${short(l.original)}</small></span><span class="badge badge--ok">Закрыт ${l.closed}</span></div>`).join("");
  }
  $("#loansTable").addEventListener("click", (e) => {
    const b = e.target.closest("[data-entry]"); if (!b) return;
    S.picked = [b.dataset.entry];
    setGoals(["pay"]);
    $("#save").scrollIntoView({ behavior: "smooth" });
  });

  /* ---------- 4. Нагрузка ---------- */
  function renderLoad() {
    const zone = pdn < 50 ? ["Безопасно", "ok"] : pdn < 80 ? ["Повышенная", "warn"] : ["Критичная", "no"];
    const paidPct = Math.round(((totalOrig - totalDebt) / totalOrig) * 100);
    const r = D.client;
    $("#kpis").innerHTML = `
      <article class="kpi card">
        <span class="kpi__label">Общий долг</span>
        <strong class="kpi__value">${short(totalDebt)}</strong>
        <div class="bar"><span style="width:${paidPct}%"></span></div>
        <p class="kpi__hint">Погашено ${paidPct}% · ${active.length} ${plural(active.length, "кредит", "кредита", "кредитов")}</p>
        <p class="kpi__hint">Ещё заплатите процентов: <b>${short(D.overpayment.left)}</b></p>
      </article>
      <article class="kpi card">
        <span class="kpi__label">Платежи в месяц</span>
        <strong class="kpi__value">${short(totalPay)}</strong>
        <div class="gauge" role="img" aria-label="Долговая нагрузка ${pdn}%">
          <div class="gauge__track"><span class="gauge__mark" style="left:${Math.min(pdn, 100)}%"></span></div>
          <div class="gauge__scale"><span>0</span><span>50%</span><span>80%</span><span>100%</span></div>
        </div>
        <p class="kpi__hint"><span class="badge badge--${zone[1]}">${zone[0]}</span> ${pdn}% от дохода ${short(r.incomeCpg)}</p>
      </article>
      <article class="kpi card">
        <span class="kpi__label">Кредитный рейтинг</span>
        <strong class="kpi__value">${r.rating} <small>из ${r.ratingMax}</small></strong>
        ${sparkline(r.ratingHistory)}
        <p class="kpi__hint"><span class="badge badge--ok">Отличный</span> +${r.rating - r.ratingHistory[0][1]} за 5 лет</p>
      </article>`;
    $("#loadDetails").innerHTML = `
      <dl class="facts">
        <div><dt>Средняя ставка по кредитам</dt><dd>${pct(avgRate)} <span class="muted">· ключевая ЦБ ${pct(D.keyRateCb)}</span></dd></div>
        <div><dt>Переплата за весь срок</dt><dd>${short(D.overpayment.total)} <span class="badge badge--warn">${D.overpayment.pctOfOriginal}% от суммы кредитов</span></dd></div>
        <div><dt>Уже выплачено процентов</dt><dd>${short(D.overpayment.paid)} из ${short(D.overpayment.total)}</dd></div>
        <div><dt>Доля процентов в платеже сейчас</dt><dd>${D.overpayment.interestShareNow}%</dd></div>
        <div><dt>ПДН по доходу из Госуслуг</dt><dd>${pdn}% · доход ${short(r.incomeCpg)}</dd></div>
        <div><dt>ПДН по доходу, указанному вами</dt><dd><span class="muted">Доход не указан</span> <button class="link" type="button">Указать</button></dd></div>
      </dl>
      <p class="note">ПДН — какую часть дохода съедают платежи по кредитам. Норматив ЦБ: до 50% — безопасно, 50–80% — повышенная нагрузка, выше 80% — банки почти всегда отказывают.</p>`;
  }
  function sparkline(pts) {
    const w = 260, h = 56, min = 650, max = 999;
    const xy = pts.map((p, i) => [(i / (pts.length - 1)) * w, h - ((p[1] - min) / (max - min)) * h]);
    const line = xy.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const last = xy[xy.length - 1];
    return `<svg class="spark" viewBox="0 0 ${w} ${h + 16}" preserveAspectRatio="none" role="img" aria-label="Рейтинг вырос с ${pts[0][1]} до ${pts[pts.length - 1][1]}">
      <path d="${line} L ${w} ${h} L 0 ${h} Z" class="spark__area"/>
      <path d="${line}" class="spark__line" vector-effect="non-scaling-stroke"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="3.5" class="spark__dot"/>
      <text x="0" y="${h + 14}">${pts[0][0]}</text><text x="${w}" y="${h + 14}" text-anchor="end">${pts[pts.length - 1][0]}</text>
    </svg>`;
  }

  /* ---------- 5. Заявки ---------- */
  function renderApps() {
    const req = S.request;
    let reqCard = "";
    if (req) {
      const done = req.answers.length, total = D.banks.length;
      const ok = req.answers.filter((a) => a.ok).length;
      const status = req.chosen ? ["Переход в банк", "primary"] : done < total ? [`Ответили ${done} из ${total}`, "warn"] : ok ? [`${ok} ${plural(ok, "банк одобрил", "банка одобрили", "банков одобрили")}`, "ok"] : ["Все отказали", "no"];
      reqCard = `
      <article class="card app">
        <header class="app__head">
          <div><b>Рефинансирование · ${short(req.principal)}</b><small>Запрос в ${total} банков · сегодня</small></div>
          <span class="badge badge--${status[1]}">${status[0]}</span>
        </header>
        <div class="bar"><span style="width:${(done / total) * 100}%;${done < total ? "background:var(--warn-bar)" : ""}"></span></div>
        <p class="muted">${req.chosen ? `Вы выбрали ${req.chosen}. Оформление продолжается на сайте банка.` : done < total ? "Ждём ответы банков. Мы пришлём уведомление, когда ответят все." : "Все банки ответили."}</p>
        <button class="btn btn--secondary" type="button" data-open-flow>Открыть</button>
      </article>`;
    }
    $("#appsList").innerHTML = reqCard + D.applications.map((a) => `
      <article class="card app">
        <header class="app__head">
          <div><b>${a.bank}</b><small>${a.product} · отправлена ${a.sent}</small></div>
          <span class="badge badge--warn">На рассмотрении</span>
        </header>
        <ol class="track">${a.steps.map((s, i) => `<li class="${i < a.current ? "is-done" : i === a.current ? "is-current" : ""}">${s}</li>`).join("")}</ol>
        <p class="muted">Ответ ожидается ${a.eta}.</p>
      </article>`).join("") + `
      <div class="card tip">
        <b>Один запрос лучше пяти заявок</b>
        <p>Каждую заявку видят другие банки. Несколько заявок за месяц снижают шанс одобрения.</p>
      </div>`;
  }

  /* ---------- 6. История ---------- */
  const refusals = D.requests.filter((q) => !q.ok);
  $("#histInsight").innerHTML = `
    <span class="insight__icon" aria-hidden="true">i</span>
    <p>В 2025 году было <b>${refusals.length} отказа</b>, тогда нагрузка была выше. Сейчас она ${pdn}%, это безопасный уровень.</p>`;
  let histFilter = "all", histAll = false;
  $("#hcAll").textContent = D.requests.length; $("#hcOk").textContent = D.requests.filter((q) => q.ok).length;
  $("#hcNo").textContent = refusals.length; $("#navHist").textContent = D.requests.length;
  $("#histMore").textContent = `Показать все ${D.requests.length}`;
  function renderHist() {
    const list = D.requests.filter((q) => histFilter === "all" || (histFilter === "ok" ? q.ok : !q.ok));
    const shown = histAll || histFilter !== "all" ? list : list.slice(0, 5);
    $("#histList").innerHTML = shown.map((q) => `
      <li class="tl">
        <span class="tl__dot ${q.ok ? "ok" : "no"}" aria-hidden="true"></span>
        <div class="tl__main"><b>${q.bank}</b><small>${q.product}${q.detail ? " · " + q.detail : ""}</small></div>
        <div class="tl__side"><span class="badge badge--${q.ok ? "ok" : "no"}">${q.ok ? "Одобрено" : "Отказ"}</span><small>${q.date}</small></div>
      </li>`).join("");
    $("#histMore").hidden = histAll || histFilter !== "all";
  }
  bindChips("#histFilter", (f) => { histFilter = f; renderHist(); });
  $("#histMore").addEventListener("click", () => { histAll = true; renderHist(); });

  /* ---------- ФЛОУ ЗАПРОСА (стори 3.1–3.6) ---------- */
  const flow = $("#flow"), body = $("#flowBody");
  let timers = [];
  function openFlow(step) {
    if (!flow.open) flow.showModal ? flow.showModal() : flow.setAttribute("open", "");
    if (step) S.flowStep = step;
    renderFlow();
  }
  function closeFlow() { flow.open && flow.close(); }
  flow.addEventListener("click", (e) => { if (e.target === flow || e.target.closest("[data-close]")) closeFlow(); });

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-start]")) {
      if (!S.picked.length) { $("#save").scrollIntoView({ behavior: "smooth" }); return; }
      if (S.request && S.request.answers.length < D.banks.length) return openFlow("wait");
      openFlow("check");
    }
    if (e.target.closest("[data-open-flow]")) openFlow(S.request.chosen ? "go" : "wait");
  });

  const goalName = { pay: "Меньше платёж", rate: "Ниже ставка и переплата", cash: "Больше денег" };

  function renderFlow() {
    const c = calc();
    const head = (t, sub) => `
      <header class="flow__head">
        <div><h2 class="h3" id="flowTitle">${t}</h2>${sub ? `<p class="muted">${sub}</p>` : ""}</div>
        <button class="icon-btn" data-close aria-label="Закрыть">×</button>
      </header>`;
    const stepper = (i) => `<ol class="flow__steps" aria-label="Шаги">${["Проверка", "Ответы банков", "Выбор", "Оформление"].map((s, k) => `<li class="${k < i ? "is-done" : k === i ? "is-current" : ""}">${s}</li>`).join("")}</ol>`;

    if (S.flowStep === "check") {
      body.innerHTML = head("Проверим перед отправкой", "Чтобы банки не отказали из-за ошибок в анкете") + stepper(0) + `
        <dl class="summary">
          <div><dt>${S.goals.length > 1 ? "Цели" : "Цель"}</dt><dd>${S.goals.map((g) => goalName[g]).join(", ")}</dd></div>
          <div><dt>Кредиты</dt><dd>${c.loans.map((l) => `${l.bank} ${short(l.balance)}`).join(", ")}</dd></div>
          <div><dt>Сумма запроса</dt><dd>${rub(c.principal)}${c.extra ? ` <small>(${short(c.extra)} на руки)</small>` : ""}</dd></div>
          <div><dt>Срок</dt><dd>${termText(S.term)}</dd></div>
        </dl>
        <ul class="checks">
          <li class="is-ok"><b>Паспорт актуален</b><small>Данные из Госуслуг от 14.10.2026 совпадают с профилем</small></li>
          <li class="is-ok"><b>Доход подтверждён</b><small>${short(D.client.incomeCpg)} в месяц по данным Госуслуг</small></li>
          <li class="is-ok"><b>Самозапрета на кредиты нет</b><small>Проверено сегодня</small></li>
          <li class="is-ok"><b>Закрытые кредиты отмечены закрытыми</b><small>Нашли ошибку в истории? <a class="link" href="#">Оспорить</a></small></li>
        </ul>
        <label class="consent"><input type="checkbox" id="consent"> <span>Согласна отправить запрос в ${D.banks.length} банков. Запросы банков будут видны в моей кредитной истории.</span></label>
        <button class="btn btn--primary btn--lg btn--block" id="sendReq" disabled>Отправить запрос</button>`;
      $("#consent").addEventListener("change", (e) => ($("#sendReq").disabled = !e.target.checked));
      $("#sendReq").addEventListener("click", sendRequest);
      return;
    }

    const req = S.request;
    if (S.flowStep === "wait" || S.flowStep === "result") {
      const total = D.banks.length, done = req.answers.length;
      const all = done === total;
      const okList = req.answers.filter((a) => a.ok);
      if (all && !okList.length) { S.flowStep = "declined"; return renderFlow(); }
      const rows = D.banks.map((b) => {
        const a = req.answers.find((x) => x.id === b.id);
        const st = !a ? `<span class="spinner" aria-hidden="true"></span><span class="muted">Ждём ответ</span>`
          : a.ok ? `<span class="badge badge--ok">${preNames.has(b.bank) && S.scenario === "pre" ? "Предодобрено · подтверждено" : "Одобрено"}</span>` : `<span class="badge badge--no">Отказ</span>`;
        return `<li class="bank-st ${a ? (a.ok ? "is-ok" : "is-no") : ""}"><span class="bank-mark" style="--bank:${b.color}">${b.mark}</span><span class="bank-st__name">${b.bank}${a && !a.ok ? `<small>${a.reason}</small>` : ""}</span>${st}</li>`;
      }).join("");
      const sorted = okList.map((a) => ({ a, cc: calc(a.rate) }))
        .sort((x, y) => has("pay") ? x.cc.newPay - y.cc.newPay : x.cc.newInterest - y.cc.newInterest);
      const offers = sorted.map(({ a, cc }, i) => {
        const gain = gainText(cc);
        const isPre = preNames.has(a.bank) && S.scenario === "pre";
        return `
        <li class="res ${i === 0 ? "is-best" : ""}">
          <span class="bank-mark bank-mark--lg" style="--bank:${a.color}">${a.mark}</span>
          <div class="res__main">
            <b>${a.bank}${isPre ? ` <span class="badge badge--ok">Предодобрено</span>` : ""}${i === 0 ? ` <span class="badge badge--primary">Выгоднее всего</span>` : ""}</b>
            <small>ставка ${pct(a.rate)} (рынок ${pct(D.marketRefiRate)}) · ${termText(S.term)} · платёж ${short(cc.newPay)}/мес</small>
            <span class="pos res__gain">${gain}</span>
          </div>
          <button class="btn ${i === 0 ? "btn--primary" : "btn--secondary"}" data-choose="${a.id}">Выбрать</button>
        </li>`;
      }).join("");
      body.innerHTML = head(all ? "Все банки ответили" : "Собираем ответы банков", all ? "Выберите подходящее предложение" : "Обычно это занимает 1–2 минуты. Окно можно закрыть, ответы сохранятся в «Моих заявках».") + stepper(all ? 2 : 1) + `
        <div class="progress"><div class="progress__bar"><span style="width:${(done / total) * 100}%"></span></div><span class="progress__txt">Ответили ${done} из ${total}</span></div>
        ${offers ? `<ul class="results">${offers}</ul>` : ""}
        <details class="details details--flat" ${all ? "" : "open"}><summary>Статус по банкам</summary><ul class="bank-list">${rows}</ul></details>`;
      return;
    }

    if (S.flowStep === "declined") {
      const reasons = [...new Set(req.answers.map((a) => a.reason))];
      const tb = loanById.tbank;
      body.innerHTML = head("Банки пока не одобрили", "Так бывает. Вот что можно сделать") + stepper(2) + `
        <div class="reasons"><b>Причины, которые назвали банки</b><ul>${reasons.map((r) => `<li>${r}</li>`).join("")}</ul></div>
        <ol class="next">
          <li><b>Рефинансируйте один кредит вместо двух</b><p>Меньшая сумма — выше шанс. Например, ${tb.bank}: ${short(tb.balance)}, ставка ${pct(tb.rate)}.</p><button class="btn btn--secondary" data-only="tbank">Посчитать для одного кредита</button></li>
          <li><b>Проверьте кредитную историю на ошибки</b><p>Закрытый кредит, который висит действующим, повышает нагрузку в глазах банка.</p><a class="link" href="#loans">Открыть мои кредиты →</a></li>
          <li><b>Укажите весь доход</b><p>Подработка и другие доходы снижают ПДН.</p><a class="link" href="#load">Указать доход →</a></li>
          <li><b>Повторите запрос через 30 дней</b><p>Частые заявки снижают шанс одобрения. Мы напомним, когда можно попробовать снова.</p>
            <label class="consent"><input type="checkbox" id="remind" checked> <span>Напомнить 14 ноября</span></label></li>
        </ol>
        <button class="btn btn--primary btn--block" data-close>Понятно</button>`;
      const only = body.querySelector("[data-only]");
      only && only.addEventListener("click", () => { S.picked = ["tbank"]; S.request = null; closeFlow(); setGoals(["pay"]); $("#save").scrollIntoView({ behavior: "smooth" }); });
      return;
    }

    if (S.flowStep === "go") {
      const a = req.answers.find((x) => x.bank === req.chosen);
      const cc = calc(a.rate);
      const url = `https://partner.example/${a.id}/refinance?utm_source=credistory&utm_medium=lk&utm_campaign=refi_${S.goals.join("-")}&utm_content=${a.id}&lead_id=${req.leadId}`;
      body.innerHTML = head(`Оформление: ${a.bank}`, "Последний шаг — на сайте банка") + stepper(3) + `
        <div class="go">
          <span class="bank-mark bank-mark--lg" style="--bank:${a.color}">${a.mark}</span>
          <dl class="summary summary--tight">
            <div><dt>Сумма</dt><dd>${rub(cc.principal)}</dd></div>
            <div><dt>Ставка, годовых</dt><dd>${pct(a.rate)} <small>рынок ${pct(D.marketRefiRate)}</small></dd></div>
            <div><dt>Платёж</dt><dd>${short(cc.newPay)}/мес</dd></div>
            <div><dt>Срок</dt><dd>${termText(S.term)}</dd></div>
          </dl>
        </div>
        <ol class="steps steps--compact">
          <li class="step is-current"><span class="step__dot">1</span><div><b>Перейдите на сайт банка</b><p>Анкета уже заполнена, проверьте её</p></div></li>
          <li class="step"><span class="step__dot">2</span><div><b>Подпишите договор</b><p>Онлайн или в отделении — как предложит банк</p></div></li>
          <li class="step"><span class="step__dot">3</span><div><b>Банк погасит старые кредиты</b><p>Закрытие появится в вашей кредитной истории в течение 5 рабочих дней</p></div></li>
        </ol>
        <a class="btn btn--primary btn--lg btn--block" href="#" id="goPartner">Перейти на сайт банка</a>
        <p class="fine">Демо: переход не выполняется. В продукте ссылка содержит метки для учёта заявки:<br><code>${esc(url)}</code></p>
        <button class="btn btn--text btn--block" type="button" id="backToResults">Вернуться к предложениям</button>`;
      $("#goPartner").addEventListener("click", (e) => e.preventDefault());
      $("#backToResults").addEventListener("click", () => { req.chosen = null; renderApps(); openFlow("result"); });
    }
  }

  function sendRequest() {
    timers.forEach(clearTimeout); timers = [];
    const c = calc();
    S.request = { principal: c.principal, answers: [], chosen: null, leadId: "CR-" + Date.now().toString(36).toUpperCase() };
    S.flowStep = "wait";
    renderFlow(); renderApps();
    D.banks.forEach((b) => {
      timers.push(setTimeout(() => {
        const declineAll = S.scenario === "decline";
        const own = c.loans.some((l) => l.bank === b.bank);
        const reason = own ? "Банк не рефинансирует собственный кредит"
          : b.decline ? b.decline
          : declineAll ? ["Не подходит по внутренней политике банка", "Недостаточно данных о доходе", "Высокая долговая нагрузка"][D.banks.indexOf(b) % 3] : null;
        const ok = !reason;
        S.request.answers.push({ ...b, ok, reason });
        renderApps();
        if (flow.open && (S.flowStep === "wait" || S.flowStep === "result")) renderFlow();
      }, b.delay));
    });
  }
  body.addEventListener("click", (e) => {
    const b = e.target.closest("[data-choose]"); if (!b) return;
    S.request.chosen = S.request.answers.find((a) => a.id === b.dataset.choose).bank;
    renderApps(); openFlow("go");
  });

  /* ---------- профиль, демо, общее ---------- */
  /* ---------- ОПРОС ОБ АТРИБУЦИИ (ненавязчивый) ----------
     Показываем, если клиент смотрел предложение банка у нас, а кредит в этом банке
     появился в КИ без перехода по нашей ссылке. Один раз; «Не сейчас» скрывает на 30 дней. */
  const SV_KEY = "refi_survey_" + D.attribution.id;
  const svRead = () => { try { return JSON.parse(localStorage.getItem(SV_KEY) || "null"); } catch (e) { return null; } };
  const svWrite = (v) => { try { localStorage.setItem(SV_KEY, JSON.stringify(v)); } catch (e) { /* без хранилища — до перезагрузки */ } };
  const sv = $("#survey"), A = D.attribution;
  let svAnswer = {};
  function renderSurvey(step) {
    const head = (t) => `
      <div class="survey__head">
        <span class="survey__eyebrow" id="surveyTitle">Вопрос на 10 секунд</span>
        <button class="survey__x" type="button" data-sv="later" aria-label="Не сейчас">×</button>
      </div>
      <p class="survey__q">${t}</p>`;
    if (step === 1) {
      sv.innerHTML = head(`${A.issued} вы оформили ${A.product} в ${A.bankIn}. Помогла ли Кредистория с этим решением?`) + `
        <div class="survey__opts" role="group" aria-label="Ответ">
          <button type="button" class="survey__opt" data-q1="found">Да, нашла это предложение здесь</button>
          <button type="button" class="survey__opt" data-q1="compared">Сравнила здесь, оформила сама в банке</button>
          <button type="button" class="survey__opt" data-q1="no">Нет, решила без Кредистории</button>
        </div>
        <p class="survey__fine">${A.viewed} вы смотрели ${A.viewedWhat} в Кредистории. Ответ анонимен для банка и не влияет на ваши предложения.</p>`;
    } else if (step === 2) {
      sv.innerHTML = head("Спасибо! И последнее: как вы оформили карту?") + `
        <div class="survey__opts" role="group" aria-label="Способ оформления">
          <button type="button" class="survey__opt" data-q2="app">В приложении или на сайте банка</button>
          <button type="button" class="survey__opt" data-q2="call">Банк сам позвонил с предложением</button>
          <button type="button" class="survey__opt" data-q2="office">В отделении</button>
          <button type="button" class="survey__opt survey__opt--ghost" data-q2="skip">Пропустить</button>
        </div>`;
    } else {
      sv.innerHTML = `<div class="survey__done"><span class="survey__ok" aria-hidden="true">✓</span><p><b>Спасибо за ответ.</b> Он помогает нам показывать вам более точные предложения.</p><button class="survey__x" type="button" data-sv="close" aria-label="Закрыть">×</button></div>`;
      setTimeout(() => { if (sv.querySelector(".survey__done")) sv.hidden = true; }, 4000);
    }
  }
  function maybeShowSurvey(force) {
    const st = svRead();
    if (!force && st && (st.answered || (st.snoozeUntil && st.snoozeUntil > Date.now()))) { sv.hidden = true; return; }
    svAnswer = {};
    renderSurvey(1); sv.hidden = false;
  }
  sv.addEventListener("click", (e) => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.sv === "later") { svWrite({ snoozeUntil: Date.now() + 30 * 864e5 }); sv.hidden = true; console.info("[survey] snoozed 30d"); return; }
    if (t.dataset.sv === "close") { sv.hidden = true; return; }
    if (t.dataset.q1) {
      svAnswer.influence = t.dataset.q1;
      if (t.dataset.q1 === "no") { finish(); } else renderSurvey(2);
    }
    if (t.dataset.q2) { if (t.dataset.q2 !== "skip") svAnswer.channel = t.dataset.q2; finish(); }
    function finish() {
      svWrite({ answered: true, answer: svAnswer, at: new Date().toISOString() });
      // в продукте: событие attribution_survey_answered { attribution_id, bank, influence, channel }
      console.info("[survey] answered", { attribution_id: A.id, bank: A.bank, ...svAnswer });
      renderSurvey(3);
    }
  });
  $("#showSurvey").addEventListener("click", () => { maybeShowSurvey(true); sv.scrollIntoView({ behavior: "smooth", block: "center" }); });
  setTimeout(() => maybeShowSurvey(false), 1500);

  const pp = $("#profilePanel");
  pp.innerHTML = `<div class="container"><div class="card profile">
    <b>${D.client.fullName}</b>
    <span>${D.client.city} · ${D.client.age} года</span><span>Паспорт ${D.client.passport}</span><span>${D.client.phone}</span><span>${D.client.email}</span>
    <button class="btn btn--secondary" type="button" data-logout>Выйти</button>
  </div></div>`;
  $("#profileBtn").addEventListener("click", (e) => { const open = pp.hidden; pp.hidden = !open; e.currentTarget.setAttribute("aria-expanded", open); });

  $("#scenario").addEventListener("change", (e) => {
    S.scenario = e.target.value; S.request = null; timers.forEach(clearTimeout); closeFlow(); S.term = recommendTerm().term; renderAll();
  });
  $("#resetDemo").addEventListener("click", () => {
    timers.forEach(clearTimeout); closeFlow();
    Object.assign(S, JSON.parse(JSON.stringify(DEFAULT))); $("#scenario").value = "pre"; setGoals(["pay"]);
  });

  function bindChips(sel, cb) {
    $(sel).addEventListener("click", (e) => {
      const b = e.target.closest(".chip"); if (!b) return;
      $$(".chip", $(sel)).forEach((x) => { x.classList.toggle("is-active", x === b); x.setAttribute("aria-selected", x === b); });
      cb(b.dataset.f);
    });
  }

  function renderAll() { renderHeader(); renderPick(); renderSave(); renderOffers(); renderLoans(); renderApps(); }
  renderAll(); renderLoad(); renderHist();

  const links = $$(".subnav a");
  const io = new IntersectionObserver((ents) => ents.forEach((en) => {
    if (en.isIntersecting) links.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === "#" + en.target.id));
  }), { rootMargin: "-40% 0px -55% 0px" });
  ["save", "offers", "loans", "load", "apps", "history"].forEach((id) => io.observe(document.getElementById(id)));

  const sticky = $("#stickyCta");
  new IntersectionObserver(([en]) => sticky.classList.toggle("is-visible", !en.isIntersecting)).observe($("#saveResult"));
};
