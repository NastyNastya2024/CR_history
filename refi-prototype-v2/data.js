/* Демо-данные клиента. Цифры сведены с прототипом bidonlab.com/customer-v2/arina:
   долг 5,26 млн = 3,71 + 0,397 + 1,15; платёж 139 тыс = 35 + 17 + 87; ПДН 139/480 = 29 %. */
window.DEMO = {
  client: {
    firstName: "Арина",
    fullName: "Демченко Арина Сергеевна",
    city: "Москва",
    age: 42,
    passport: "99•• ••3456",
    phone: "+7 (999) •••-12-34",
    email: "arina@bidon.com",
    incomeCpg: 480000,
    rating: 948,
    ratingMax: 999,
    ratingHistory: [
      ["июн 21", 702], ["дек 21", 715], ["июн 22", 731], ["дек 22", 748], ["июл 23", 760],
      ["янв 24", 786], ["авг 24", 812], ["дек 24", 828], ["июн 25", 822], ["дек 25", 880],
      ["май 26", 930], ["окт 26", 948]
    ]
  },

  // Действующие кредиты. refi: можно ли включать в рефинансирование и почему
  loans: [
    { id: "alfa",  kind: "Потреб. кредит",  bank: "Альфа-Банк", opened: "22.08.2024", original: 1500000, balance: 720000,  rate: 23.5, payment: 55000, refi: "good" },
    { id: "tbank", kind: "Потреб. кредит",  bank: "Т-Банк",     opened: "10.04.2024", original: 1000000, balance: 430000,  rate: 20.0, payment: 32000, refi: "good" },
    { id: "auto",  kind: "Автокредит",      bank: "СберБанк",   opened: "02.01.2024", original: 750000,  balance: 397000,  rate: 12.9, payment: 17000, refi: "weak",
      refiNote: "Ставка ниже рыночной. Включайте, только чтобы объединить платежи" },
    { id: "mort",  kind: "Ипотека",         bank: "ВТБ",        opened: "05.07.2023", original: 4000000, balance: 3715000, rate: 8.5,  payment: 35000, refi: "no",
      refiNote: "Ставка 8,5 % — ниже любого предложения" },
    { id: "alfacard", kind: "Кредитная карта", bank: "Альфа-Банк", opened: "17.10.2026", original: 150000, balance: 0, rate: 0, payment: 0, limit: 150000, refi: "no",
      refiNote: "Долга нет" },
    { id: "card",  kind: "Кредитная карта", bank: "Открытие",   opened: "05.02.2025", original: 30000,   balance: 0,       rate: 0,    payment: 0, limit: 30000, refi: "no",
      refiNote: "Долга нет" }
  ],
  closedLoans: [
    { kind: "Потреб. кредит", bank: "Райффайзенбанк", original: 300000,  closed: "окт 2024" },
    { kind: "Потреб. кредит", bank: "Газпромбанк",    original: 1100000, closed: "апр 2023" }
  ],
  overpayment: { total: 5820000, paid: 2290000, left: 3520000, pctOfOriginal: 80, interestShareNow: 59 },
  keyRateCb: 14.5,
  marketRefiRate: 17.5,        // средняя ставка рефинансирования по рынку (по выданным кредитам)
  marketRateSource: "средняя ставка рефинансирования по выданным кредитам, октябрь 2026",
  maxExtraCash: 450000,

  // Предодобрения (сценарий «есть предодобрения»)
  preapprovals: [
    { bank: "Совкомбанк", mark: "С", color: "#E6371F", rate: 14.9, amount: 1600000, until: "30 ноября" },
    { bank: "СберБанк",   mark: "С", color: "#21A038", rate: 15.9, amount: 1200000, until: "15 ноября" },
    { bank: "Альфа-Банк", mark: "А", color: "#EF3124", rate: 17.9, amount: 1000000, until: "31 октября", own: "alfa" }
  ],

  // Банки, подключённые к запросу по API. Исход зависит от сценария демо.
  banks: [
    { id: "sovcom", bank: "Совкомбанк",  mark: "С", color: "#E6371F", rate: 14.9, delay: 1600 },
    { id: "sber",   bank: "СберБанк",    mark: "С", color: "#21A038", rate: 15.9, delay: 2600 },
    { id: "gpb",    bank: "Газпромбанк", mark: "Г", color: "#1A4B9C", rate: 16.4, delay: 3700 },
    { id: "vtb",    bank: "ВТБ",         mark: "В", color: "#0A2896", rate: 17.2, delay: 4600, decline: "Высокая долговая нагрузка" },
    { id: "alfa",   bank: "Альфа-Банк",  mark: "А", color: "#EF3124", rate: 17.9, delay: 5400 },
    { id: "tbank",  bank: "Т-Банк",      mark: "Т", color: "#2B2D33", rate: 18.9, delay: 6200 }
  ],

  // Атрибуция: клиент смотрел предложение банка у нас, а кредит в КИ появился без перехода по нашей ссылке
  attribution: {
    id: "alfa-card-2026-10-17",
    bank: "Альфа-Банк", bankIn: "Альфа-Банке", product: "кредитную карту", productShort: "Кредитная карта", limit: 150000,
    issued: "17 октября", viewed: "16 октября", viewedWhat: "предложения Альфа-Банка"
  },

  applications: [
    { bank: "Т-Банк", product: "Кредитная карта Platinum", sent: "12.10.2026",
      steps: ["Отправлена", "Банк проверяет", "Решение", "Получение"], current: 1, eta: "до 17 октября" }
  ],

  requests: [
    { date: "17.10.2026", bank: "Альфа-Банк",     product: "Кредитная карта",   detail: "Лимит 150 000 ₽", ok: true },
    { date: "15.12.2025", bank: "СберБанк",       product: "Рефинансирование",  detail: "Предодобрено, не использовано", ok: true },
    { date: "22.10.2025", bank: "ВТБ",            product: "Кредит наличными",  detail: "Причина: высокая долговая нагрузка", ok: false },
    { date: "05.08.2025", bank: "Т-Банк",         product: "Кредитная линия",   detail: "", ok: false },
    { date: "14.06.2025", bank: "Альфа-Банк",     product: "Кредит наличными",  detail: "Запрошено 800 000 ₽", ok: false },
    { date: "05.02.2025", bank: "Открытие",       product: "Кредитная карта",   detail: "Лимит 30 000 ₽", ok: true },
    { date: "22.08.2024", bank: "Альфа-Банк",     product: "Кредит наличными",  detail: "1,5 млн ₽", ok: true },
    { date: "10.04.2024", bank: "Т-Банк",         product: "Кредит наличными",  detail: "1,0 млн ₽", ok: true },
    { date: "02.01.2024", bank: "СберБанк",       product: "Автокредит",        detail: "750 000 ₽", ok: true },
    { date: "05.07.2023", bank: "ВТБ",            product: "Ипотека",           detail: "4,0 млн ₽", ok: true },
    { date: "10.03.2022", bank: "Райффайзенбанк", product: "Кредит наличными",  detail: "300 000 ₽ · закрыт окт 2024", ok: true },
    { date: "05.05.2020", bank: "Газпромбанк",    product: "Кредит наличными",  detail: "1,1 млн ₽ · закрыт апр 2023", ok: true }
  ]
};
