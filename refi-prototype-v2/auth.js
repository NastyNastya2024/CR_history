/* =============================================================
   Вход в прототип по паролю.

   КАК СМЕНИТЬ ПАРОЛЬ
   1. Откройте set-password.html в браузере, введите новый пароль.
   2. Скопируйте полученную строку и вставьте её в PASSWORD_HASH ниже.
   Все, у кого была сохранённая сессия, должны будут войти заново.

   ВАЖНО: это защита от случайных посетителей, а не от взлома —
   код страницы открыт в браузере. Не кладите в прототип реальные
   персональные данные. Для серверной защиты см. README.
   ============================================================= */
(function () {
  "use strict";

  var CONFIG = {
    PASSWORD_HASH: "53cfb2ef9d9680f57185098e33e7ebc559c9f22e945d4cddbdde444d4c9c5843",
    SALT: "credistory-refi-proto",
    REMEMBER_DAYS: 7,
    MAX_ATTEMPTS: 5,       // после стольких ошибок — пауза
    LOCK_SECONDS: 30
  };
  var KEY = "refi_proto_auth";

  /* ---------- SHA-256 (чистый JS, работает и при открытии файла с диска) ---------- */
  function sha256(ascii) {
    function rrot(v, n) { return (v >>> n) | (v << (32 - n)); }
    var maxWord = Math.pow(2, 32), result = "", words = [], i, j;
    var bytes = unescape(encodeURIComponent(ascii)); // UTF-8
    var bitLen = bytes.length * 8;
    var hash = [], k = [], primeCounter = 0, isComposite = {};
    for (var c = 2; primeCounter < 64; c++) {
      if (!isComposite[c]) {
        for (i = 0; i < 313; i += c) isComposite[i] = c;
        hash[primeCounter] = (Math.pow(c, 0.5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(c, 1 / 3) * maxWord) | 0;
      }
    }
    hash = hash.slice(0, 8);
    bytes += "\x80";
    while (bytes.length % 64 - 56) bytes += "\x00";
    for (i = 0; i < bytes.length; i++) {
      j = bytes.charCodeAt(i);
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = (bitLen / maxWord) | 0;
    words[words.length] = bitLen;
    for (j = 0; j < words.length;) {
      var w = words.slice(j, (j += 16)), oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
        var t1 = hash[7] + (rrot(e, 6) ^ rrot(e, 11) ^ rrot(e, 25)) + ((e & hash[5]) ^ (~e & hash[6])) + k[i] +
          (w[i] = i < 16 ? w[i] : (w[i - 16] + (rrot(w15, 7) ^ rrot(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rrot(w2, 17) ^ rrot(w2, 19) ^ (w2 >>> 10))) | 0);
        var t2 = (rrot(a, 2) ^ rrot(a, 13) ^ rrot(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(t1 + t2) | 0].concat(hash);
        hash[4] = (hash[4] + t1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) {
      var b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? "0" : "") + b.toString(16);
    }
    return result;
  }
  window.__refiHash = function (pass) { return sha256(CONFIG.SALT + ":" + pass); };

  // На служебной странице set-password.html нужен только расчёт хеша
  if (document.body && document.body.getAttribute("data-auth") === "tool") return;

  /* ---------- хранение сессии (браузерное хранилище может быть недоступно) ---------- */
  function store(remember) { try { return remember ? window.localStorage : window.sessionStorage; } catch (e) { return null; } }
  function readSession() {
    var stores = [store(false), store(true)];
    for (var i = 0; i < stores.length; i++) {
      try {
        var raw = stores[i] && stores[i].getItem(KEY);
        if (!raw) continue;
        var s = JSON.parse(raw);
        if (s.h === CONFIG.PASSWORD_HASH && (!s.exp || s.exp > Date.now())) return true;
        stores[i].removeItem(KEY);
      } catch (e) { /* пропускаем */ }
    }
    return false;
  }
  function saveSession(remember) {
    var s = store(remember);
    try { s && s.setItem(KEY, JSON.stringify({ h: CONFIG.PASSWORD_HASH, exp: remember ? Date.now() + CONFIG.REMEMBER_DAYS * 864e5 : 0 })); } catch (e) { /* сессия только до перезагрузки */ }
  }
  function clearSession() {
    [store(false), store(true)].forEach(function (s) { try { s && s.removeItem(KEY); } catch (e) {} });
  }

  /* ---------- интерфейс ---------- */
  var gate = document.getElementById("gate");
  var app = document.getElementById("app");
  var form = document.getElementById("gateForm");
  var input = document.getElementById("gatePass");
  var err = document.getElementById("gateError");
  var submit = document.getElementById("gateSubmit");
  var fails = 0, lockedUntil = 0;

  function openApp() {
    gate.hidden = true;
    app.hidden = false;
    document.title = "Кабинет Арины · Кредистория";
    if (typeof window.startApp === "function") window.startApp();
  }
  function showError(text) {
    err.textContent = text; err.hidden = false;
    gate.classList.remove("is-error"); void gate.offsetWidth; gate.classList.add("is-error");
  }

  document.getElementById("gateEye").addEventListener("click", function () {
    var show = input.type === "password";
    input.type = show ? "text" : "password";
    this.textContent = show ? "Скрыть" : "Показать";
    this.setAttribute("aria-label", show ? "Скрыть пароль" : "Показать пароль");
    input.focus();
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var now = Date.now();
    if (now < lockedUntil) {
      showError("Слишком много попыток. Подождите " + Math.ceil((lockedUntil - now) / 1000) + " с.");
      return;
    }
    if (!input.value) { showError("Введите пароль."); input.focus(); return; }
    if (window.__refiHash(input.value) === CONFIG.PASSWORD_HASH) {
      saveSession(document.getElementById("gateRemember").checked);
      input.value = "";
      err.hidden = true;
      openApp();
    } else {
      fails++;
      input.select();
      if (fails >= CONFIG.MAX_ATTEMPTS) {
        fails = 0; lockedUntil = now + CONFIG.LOCK_SECONDS * 1000;
        showError("Неверный пароль. Вход заблокирован на " + CONFIG.LOCK_SECONDS + " секунд.");
      } else {
        showError("Неверный пароль. Проверьте раскладку и регистр.");
      }
    }
  });

  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("[data-logout]")) {
      clearSession();
      window.location.reload();
    }
  });

  if (readSession()) openApp();
  else { gate.hidden = false; app.hidden = true; input.focus(); }
})();
