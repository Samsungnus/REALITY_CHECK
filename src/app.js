const ROUTES = {
  prehlad: "Prehľad trhu",
  ceny: "Vývoj cien",
  byty: "Ponuka bytov",
  vyber: "Môj výber",
  odkazy: "Užitočné odkazy",
};

const COLORS = {
  green: "#3f9f80",
  blue: "#5686d8",
  amber: "#d49a3a",
  red: "#be5e53",
  navy: "#173f45",
};

const CURATED = [
  ["Galvania Rezidencie", 179000, "2027", "Najnižší vstup; preveriť, či ide o byt alebo apartmán"],
  ["Kvarter", 192000, "2026", "Dobrá vstupná cena, širšie centrum"],
  ["Jašik Ružinov", 201000, "2027", "Najlepší kompromis lokalita/cena"],
  ["Nuppu", 202000, "2027", "Zabehnutý projekt, veľa bytov a služieb"],
  ["Slnečná Strana", 203000, "2026", "Cenovo zaujímavá, treba posúdiť konkrétnu polohu"],
  ["Downtown Yards", 212000, "neuvedené", "Výborná poloha, malé jednotky môžu byť drahé za m²"],
  ["Milrose", 214000, "2029", "Dlhé čakanie, potenciál rastu ceny"],
  ["ALVY", 219000, "2028", "Veľký výber, relatívne skorá fáza"],
  ["BAYA", 220000, "2027", "Veľa dostupných bytov"],
  ["Novanta Prievoz", 249000, "2028", "Komorný projekt, už len malý výber"],
  ["Nový Ružinov", 249000, "hotový", "Možnosť bývať skôr, slabšia pešia vybavenosť"],
  ["Byty Ružinov", 260000, "2026", "Menší projekt, skoré dokončenie"],
  ["Pri Mlynoch", 274000, "2028", "Dobrá dostupnosť Nív, už vyššia vstupná cena"],
  ["Danubius Two", 287000, "neuvedené", "Širšie centrum, skôr stredná až vyššia trieda"],
  ["Rezidencia Liptovská", 290000, "2026", "Komorné bývanie, malý zostávajúci výber"],
];

const SEASONALITY = [
  ["Jan", 92], ["Feb", 140], ["Mar", 125], ["Apr", 85],
  ["Máj", 115], ["Jún", 128], ["Júl", 99], ["Aug", 98],
  ["Sep", 100], ["Okt", 90], ["Nov", 158], ["Dec", 85],
];

const state = {
  prices: [],
  apartments: [],
  apartmentColumns: [],
  sources: [],
  apartmentMeta: {},
  priceMeta: {},
  filteredApartments: [],
  page: 1,
  pageSize: 30,
  sortColumn: "Projekt",
  sortDirection: "asc",
};

const PRIORITY_APARTMENT_COLUMNS = [
  "Projekt",
  "Označenie bytu",
  "Stav",
  "Počet izieb",
  "Interiér m²",
  "Aktuálna cena",
  "Cena za m² interiéru",
  "Mestská časť",
  "Zdroj",
];

const chartRegistry = new Map();
const euro = new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 1 });

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function median(values) {
  const sorted = values.filter(isNumber).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function formatDate(value, includeTime = false) {
  const date = parseDate(value);
  if (!date) return value || "—";
  return new Intl.DateTimeFormat("sk-SK", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function formatCell(column, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (column.includes("Cena") && isNumber(value)) return euro.format(value);
  if (column.includes("m²") && isNumber(value)) return decimal.format(value);
  if (["Počet izieb", "Poschodie"].includes(column) && isNumber(value)) return decimal.format(value);
  if (["Prvý záznam", "Posledné videnie", "Posledná kontrola", "Dátum"].includes(column)) return formatDate(value);
  return String(value);
}

function routeFromHash() {
  const route = location.hash.replace(/^#\//, "").split("?")[0];
  return ROUTES[route] ? route : "prehlad";
}

function activateRoute() {
  const route = routeFromHash();
  document.querySelectorAll("[data-view]").forEach((element) => {
    element.hidden = element.dataset.view !== route;
  });
  document.querySelectorAll("[data-route]").forEach((element) => {
    if (element.dataset.route === route) element.setAttribute("aria-current", "page");
    else element.removeAttribute("aria-current");
  });
  document.querySelector("#page-title").textContent = ROUTES[route];
  document.title = `${ROUTES[route]} · Bratislavské bývanie`;
  window.scrollTo({ top: 0, behavior: "instant" });
  requestAnimationFrame(redrawVisibleCharts);
}

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Nepodarilo sa načítať ${path}.`);
  return response.json();
}

async function loadData() {
  const error = document.querySelector("#global-error");
  error.hidden = true;
  try {
    const [prices, apartments, sources] = await Promise.all([
      loadJson("./data/prices.json"),
      loadJson("./data/apartments.json"),
      loadJson("./data/sources.json"),
    ]);
    state.prices = prices.rows || [];
    state.priceMeta = prices.meta || {};
    state.apartments = apartments.rows || [];
    const sourceColumns = apartments.columns || [];
    state.apartmentColumns = [
      ...PRIORITY_APARTMENT_COLUMNS.filter((column) => sourceColumns.includes(column)),
      ...sourceColumns.filter((column) => !PRIORITY_APARTMENT_COLUMNS.includes(column)),
    ];
    state.apartmentMeta = apartments.meta || {};
    state.sources = sources.rows || [];
    renderAll();
  } catch (caught) {
    console.error(caught);
    error.textContent = "Dáta sa nepodarilo načítať. Skontrolujte, či prebehlo spracovanie Excel súborov a obnovte stránku.";
    error.hidden = false;
  }
}

function latestApartmentDate() {
  const values = state.apartments
    .map((row) => parseDate(row["Posledná kontrola"] || row["Posledné videnie"]))
    .filter(Boolean);
  return values.length ? new Date(Math.max(...values.map((value) => value.valueOf()))) : null;
}

function renderStatus() {
  const latest = latestApartmentDate();
  const updateText = latest ? formatDate(latest.toISOString(), true) : formatDate(state.apartmentMeta.generatedAt, true);
  document.querySelector("#sidebar-date").textContent = `Posledná kontrola ${updateText}`;
  document.querySelector("#footer-data").textContent = `${integer.format(state.apartments.length)} bytov · ${integer.format(state.prices.length)} mesiacov · aktualizované ${updateText}`;
}

function renderOverview() {
  const total = state.apartments.length;
  const available = state.apartments.filter((row) => row.Stav === "available").length;
  const prices = state.apartments.map((row) => row["Aktuálna cena"]).filter(isNumber);
  const m2Prices = state.apartments.map((row) => row["Cena za m² interiéru"]).filter(isNumber);
  const lastPrice = state.prices.at(-1);
  const previousYear = state.prices.at(-13);
  const latestNewBuild = lastPrice?.["Novostavby €/m²"];
  const priorNewBuild = previousYear?.["Novostavby €/m²"];
  const annualChange = isNumber(latestNewBuild) && isNumber(priorNewBuild)
    ? ((latestNewBuild / priorNewBuild) - 1) * 100
    : null;

  document.querySelector("#kpi-total").textContent = integer.format(total);
  document.querySelector("#kpi-available").textContent = integer.format(available);
  document.querySelector("#kpi-available-share").textContent = total ? `${decimal.format((available / total) * 100)} % z ponuky` : "—";
  document.querySelector("#kpi-median").textContent = median(prices) === null ? "—" : euro.format(median(prices));
  document.querySelector("#kpi-m2").textContent = median(m2Prices) === null ? "—" : `${integer.format(median(m2Prices))} €`;
  document.querySelector("#hero-price").textContent = isNumber(latestNewBuild) ? `${integer.format(latestNewBuild)} €/m²` : "—";
  document.querySelector("#hero-change").textContent = annualChange === null
    ? "Medziročná zmena nie je dostupná"
    : `${annualChange >= 0 ? "+" : ""}${decimal.format(annualChange)} % medziročne`;

  const projects = new Map();
  state.apartments.forEach((row) => {
    const name = row.Projekt || "Bez projektu";
    projects.set(name, (projects.get(name) || 0) + 1);
  });
  const projectEntries = [...projects.entries()].sort((a, b) => b[1] - a[1]);
  document.querySelector("#project-count").textContent = `${integer.format(projectEntries.length)} projektov`;
  const max = Math.max(...projectEntries.map(([, count]) => count), 1);
  const bars = document.querySelector("#project-bars");
  bars.replaceChildren();
  projectEntries.slice(0, 5).forEach(([name, count]) => {
    const row = document.createElement("div");
    row.className = "project-bar-row";
    const label = document.createElement("strong");
    label.textContent = name;
    label.title = name;
    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("span");
    fill.style.width = `${(count / max) * 100}%`;
    track.append(fill);
    const value = document.createElement("small");
    value.textContent = integer.format(count);
    row.append(label, track, value);
    bars.append(row);
  });

  renderShortlist();
}

function currentProjectMinimums() {
  const minimums = new Map();
  state.apartments.forEach((row) => {
    if (!row.Projekt || row.Stav !== "available" || !isNumber(row["Aktuálna cena"])) return;
    const current = minimums.get(row.Projekt);
    if (current === undefined || row["Aktuálna cena"] < current) minimums.set(row.Projekt, row["Aktuálna cena"]);
  });
  return minimums;
}

function curatedRows() {
  const minimums = currentProjectMinimums();
  return CURATED.map(([project, basePrice, completion, note]) => ({
    project,
    price: minimums.get(project) ?? basePrice,
    completion,
    note,
    live: minimums.has(project),
  }));
}

function renderShortlist() {
  const container = document.querySelector("#shortlist");
  container.replaceChildren();
  curatedRows().slice(0, 5).forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "shortlist-row";
    const rank = document.createElement("span");
    rank.className = "shortlist-rank";
    rank.textContent = index + 1;
    const copy = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = item.project;
    const meta = document.createElement("small");
    meta.textContent = item.live ? "Aktuálne minimum v dátach" : `Kolaudácia ${item.completion}`;
    copy.append(name, meta);
    const price = document.createElement("span");
    price.className = "shortlist-price";
    price.textContent = euro.format(item.price);
    row.append(rank, copy, price);
    container.append(row);
  });
}

function renderCurated() {
  const body = document.querySelector("#curated-table tbody");
  body.replaceChildren();
  curatedRows().forEach((item, index) => {
    const row = document.createElement("tr");
    [index + 1, item.project, `${euro.format(item.price)}${item.live ? " · aktuálne" : ""}`, item.completion, item.note].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    body.append(row);
  });
}

function populateFilter(select, values, formatter = (value) => value) {
  const first = select.firstElementChild;
  select.replaceChildren(first);
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = formatter(value);
    select.append(option);
  });
}

function setupApartmentFilters() {
  const unique = (column) => [...new Set(state.apartments.map((row) => row[column]).filter((value) => value !== null && value !== undefined && value !== ""))].sort((a, b) => String(a).localeCompare(String(b), "sk", { numeric: true }));
  populateFilter(document.querySelector("#filter-project"), unique("Projekt"));
  populateFilter(document.querySelector("#filter-status"), unique("Stav"), (value) => ({ available: "Voľný", reserved: "Rezervovaný", pre_reserved: "Predrezervovaný", sold: "Predaný" }[value] || value));
  populateFilter(document.querySelector("#filter-rooms"), unique("Počet izieb"), (value) => `${decimal.format(value)} iz.`);
}

function applyApartmentFilters() {
  const search = document.querySelector("#filter-search").value.trim().toLocaleLowerCase("sk");
  const project = document.querySelector("#filter-project").value;
  const status = document.querySelector("#filter-status").value;
  const rooms = document.querySelector("#filter-rooms").value;

  state.filteredApartments = state.apartments.filter((row) => {
    if (project && String(row.Projekt) !== project) return false;
    if (status && String(row.Stav) !== status) return false;
    if (rooms && String(row["Počet izieb"]) !== rooms) return false;
    if (search) {
      const haystack = state.apartmentColumns.map((column) => row[column]).filter((value) => value !== null && value !== undefined).join(" ").toLocaleLowerCase("sk");
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const { sortColumn, sortDirection } = state;
  const direction = sortDirection === "asc" ? 1 : -1;
  state.filteredApartments.sort((a, b) => {
    const left = a[sortColumn];
    const right = b[sortColumn];
    if (left === null || left === undefined) return 1;
    if (right === null || right === undefined) return -1;
    if (isNumber(left) && isNumber(right)) return (left - right) * direction;
    return String(left).localeCompare(String(right), "sk", { numeric: true }) * direction;
  });

  const maxPage = Math.max(1, Math.ceil(state.filteredApartments.length / state.pageSize));
  state.page = Math.min(state.page, maxPage);
  renderApartmentTable();
}

function renderApartmentHeader() {
  const head = document.querySelector("#apartments-table thead");
  const row = document.createElement("tr");
  state.apartmentColumns.forEach((column) => {
    const cell = document.createElement("th");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.column = column;
    button.textContent = column;
    if (state.sortColumn === column) {
      const marker = document.createElement("span");
      marker.setAttribute("aria-hidden", "true");
      marker.textContent = state.sortDirection === "asc" ? "↑" : "↓";
      button.append(marker);
    }
    button.addEventListener("click", () => {
      if (state.sortColumn === column) state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
      else {
        state.sortColumn = column;
        state.sortDirection = "asc";
      }
      state.page = 1;
      applyApartmentFilters();
    });
    cell.append(button);
    row.append(cell);
  });
  head.replaceChildren(row);
}

function renderApartmentTable() {
  renderApartmentHeader();
  const body = document.querySelector("#apartments-table tbody");
  body.replaceChildren();
  const start = (state.page - 1) * state.pageSize;
  const pageRows = state.filteredApartments.slice(start, start + state.pageSize);

  pageRows.forEach((record) => {
    const row = document.createElement("tr");
    state.apartmentColumns.forEach((column) => {
      const cell = document.createElement("td");
      const value = record[column];
      if (column === "Zdroj" && safeUrl(value)) {
        const link = document.createElement("a");
        link.href = safeUrl(value);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Otvoriť ponuku ↗";
        cell.append(link);
      } else if (column === "Stav" && value) {
        const chip = document.createElement("span");
        chip.className = `status-chip ${String(value).replace(/[^a-z_]/g, "")}`;
        chip.textContent = ({ available: "Voľný", reserved: "Rezervovaný", pre_reserved: "Predrezervovaný", sold: "Predaný" }[value] || value);
        cell.append(chip);
      } else {
        cell.textContent = formatCell(column, value);
      }
      row.append(cell);
    });
    body.append(row);
  });

  const maxPage = Math.max(1, Math.ceil(state.filteredApartments.length / state.pageSize));
  document.querySelector("#apartment-result-count").textContent = `${integer.format(state.filteredApartments.length)} z ${integer.format(state.apartments.length)} záznamov`;
  document.querySelector("#page-status").textContent = `Strana ${state.page} z ${maxPage}`;
  document.querySelector("#page-prev").disabled = state.page <= 1;
  document.querySelector("#page-next").disabled = state.page >= maxPage;
}

function renderSources() {
  const container = document.querySelector("#source-links");
  container.replaceChildren();
  state.sources.filter((row) => safeUrl(row.URL)).forEach((row) => {
    const link = document.createElement("a");
    link.className = "source-link";
    link.href = safeUrl(row.URL);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const segment = document.createElement("span");
    segment.textContent = row.Segment || "Zdroj";
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = row["Hodnota / informácia"] || row.Použitie || "Otvoriť zdroj";
    const period = document.createElement("small");
    period.textContent = [row.Obdobie, row.Použitie].filter(Boolean).join(" · ");
    copy.append(title, period);
    const arrow = document.createElement("span");
    arrow.textContent = "↗";
    link.append(segment, copy, arrow);
    container.append(link);
  });
}

function renderSeasonality() {
  const container = document.querySelector("#seasonality-chart");
  container.replaceChildren();
  const min = 50;
  const max = 165;
  SEASONALITY.forEach(([month, value]) => {
    const item = document.createElement("div");
    item.className = "seasonality-item";
    const number = document.createElement("strong");
    number.textContent = value;
    const bar = document.createElement("div");
    bar.className = "seasonality-bar";
    bar.style.height = `${((value - min) / (max - min)) * 85 + 15}%`;
    bar.title = `${month}: ${value}`;
    const label = document.createElement("span");
    label.textContent = month;
    item.append(number, bar, label);
    container.append(item);
  });
}

function renderPriceCopy() {
  const first = state.prices[0]?.Mesiac;
  const last = state.prices.at(-1)?.Mesiac;
  document.querySelector("#price-range-copy").textContent = first && last
    ? `${integer.format(state.prices.length)} mesačných bodov od ${first} do ${last}. Model rozlišuje novostavby, pôvodný stav a prerobené byty.`
    : "Cenové dáta nie sú dostupné.";
}

function makeLegend(elementId, series) {
  const legend = document.querySelector(`#${elementId}`);
  legend.replaceChildren();
  series.forEach((item) => {
    const entry = document.createElement("span");
    const line = document.createElement("i");
    line.style.background = item.color;
    entry.append(line, document.createTextNode(item.label));
    legend.append(entry);
  });
}

function registerLineChart(canvasId, rows, series, valueFormatter, legendId) {
  const canvas = document.querySelector(`#${canvasId}`);
  if (!canvas) return;
  chartRegistry.set(canvasId, { canvas, rows, series, valueFormatter });
  makeLegend(legendId, series);

  if (!canvas.dataset.bound) {
    canvas.dataset.bound = "true";
    const showTooltip = (event) => {
      const chart = chartRegistry.get(canvasId);
      if (!chart || !chart.rows.length) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const usable = Math.max(1, rect.width - 76);
      const index = Math.max(0, Math.min(chart.rows.length - 1, Math.round(((x - 56) / usable) * (chart.rows.length - 1))));
      chart.hoverIndex = index;
      drawLineChart(chart);
      const tooltip = document.querySelector(`[data-tooltip-for="${canvasId}"]`);
      const row = chart.rows[index];
      tooltip.replaceChildren();
      const title = document.createElement("strong");
      title.textContent = row.Mesiac || formatDate(row.Dátum);
      tooltip.append(title);
      chart.series.forEach((item) => {
        const line = document.createElement("div");
        line.textContent = `${item.label}: ${chart.valueFormatter(row[item.key])}`;
        tooltip.append(line);
      });
      tooltip.style.left = `${Math.max(80, Math.min(rect.width - 80, x))}px`;
      tooltip.style.top = `${Math.max(50, event.clientY - rect.top)}px`;
      tooltip.hidden = false;
    };
    const hideTooltip = () => {
      const chart = chartRegistry.get(canvasId);
      if (chart) {
        chart.hoverIndex = null;
        drawLineChart(chart);
      }
      document.querySelector(`[data-tooltip-for="${canvasId}"]`).hidden = true;
    };
    canvas.addEventListener("pointermove", showTooltip);
    canvas.addEventListener("pointerleave", hideTooltip);
    new ResizeObserver(() => drawLineChart(chartRegistry.get(canvasId))).observe(canvas);
  }
  drawLineChart(chartRegistry.get(canvasId));
}

function drawLineChart(chart) {
  if (!chart || chart.canvas.offsetParent === null) return;
  const { canvas, rows, series } = chart;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 20 || rect.height < 20 || !rows.length) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(rect.width * ratio);
  canvas.height = Math.floor(rect.height * ratio);
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);

  const width = rect.width;
  const height = rect.height;
  const pad = { left: 56, right: 18, top: 18, bottom: 35 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const values = rows.flatMap((row) => series.map((item) => row[item.key])).filter(isNumber);
  if (!values.length) return;
  let min = Math.min(...values);
  let max = Math.max(...values);
  const spread = Math.max(max - min, max * 0.08, 1);
  min = Math.max(0, min - spread * 0.12);
  max += spread * 0.12;
  const xAt = (index) => pad.left + (index / Math.max(rows.length - 1, 1)) * plotWidth;
  const yAt = (value) => pad.top + (1 - ((value - min) / (max - min))) * plotHeight;

  context.clearRect(0, 0, width, height);
  context.lineWidth = 1;
  context.font = "10px DM Sans, sans-serif";
  context.textBaseline = "middle";
  for (let step = 0; step <= 4; step += 1) {
    const y = pad.top + (plotHeight / 4) * step;
    const value = max - ((max - min) / 4) * step;
    context.strokeStyle = "#e2e0d8";
    context.beginPath();
    context.moveTo(pad.left, y);
    context.lineTo(width - pad.right, y);
    context.stroke();
    context.fillStyle = "#7d898c";
    context.textAlign = "right";
    context.fillText(integer.format(value), pad.left - 9, y);
  }

  const labelEvery = Math.max(1, Math.ceil(rows.length / Math.max(4, Math.floor(plotWidth / 90))));
  rows.forEach((row, index) => {
    if (index % labelEvery !== 0 && index !== rows.length - 1) return;
    context.fillStyle = "#7d898c";
    context.textAlign = index === rows.length - 1 ? "right" : "center";
    context.fillText(row.Mesiac || String(index + 1), xAt(index), height - 13);
  });

  series.forEach((item) => {
    context.beginPath();
    context.lineWidth = 2.4;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.strokeStyle = item.color;
    rows.forEach((row, index) => {
      const value = row[item.key];
      if (!isNumber(value)) return;
      const x = xAt(index);
      const y = yAt(value);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  });

  if (Number.isInteger(chart.hoverIndex)) {
    const x = xAt(chart.hoverIndex);
    context.strokeStyle = "rgba(23, 35, 38, 0.35)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, pad.top);
    context.lineTo(x, pad.top + plotHeight);
    context.stroke();
    series.forEach((item) => {
      const value = rows[chart.hoverIndex][item.key];
      if (!isNumber(value)) return;
      context.fillStyle = "#fffefa";
      context.strokeStyle = item.color;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x, yAt(value), 4, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    });
  }
}

function redrawVisibleCharts() {
  chartRegistry.forEach((chart) => drawLineChart(chart));
}

function renderCharts() {
  const m2Series = [
    { key: "Novostavby €/m²", label: "Novostavby", color: COLORS.green },
    { key: "Pôvodný stav €/m²", label: "Pôvodný stav", color: COLORS.blue },
    { key: "Prerobený byt €/m²", label: "Prerobený stav", color: COLORS.amber },
  ];
  const totalSeries = [
    { key: "2i novostavba celkom", label: "2i novostavba", color: COLORS.green },
    { key: "2i pôvodný stav celkom", label: "2i pôvodný stav", color: COLORS.blue },
    { key: "2i prerobený byt celkom", label: "2i prerobený stav", color: COLORS.amber },
  ];
  registerLineChart("overview-chart", state.prices, m2Series, (value) => `${integer.format(value)} €/m²`, "overview-legend");
  registerLineChart("price-m2-chart", state.prices, m2Series, (value) => `${integer.format(value)} €/m²`, "price-m2-legend");
  registerLineChart("price-total-chart", state.prices, totalSeries, (value) => euro.format(value), "price-total-legend");
}

function bindControls() {
  window.addEventListener("hashchange", activateRoute);
  document.querySelector("#refresh-button").addEventListener("click", () => location.reload());
  ["#filter-search", "#filter-project", "#filter-status", "#filter-rooms"].forEach((selector) => {
    const element = document.querySelector(selector);
    element.addEventListener(element.tagName === "INPUT" ? "input" : "change", () => {
      state.page = 1;
      applyApartmentFilters();
    });
  });
  document.querySelector("#clear-filters").addEventListener("click", () => {
    ["#filter-search", "#filter-project", "#filter-status", "#filter-rooms"].forEach((selector) => {
      document.querySelector(selector).value = "";
    });
    state.page = 1;
    applyApartmentFilters();
  });
  document.querySelector("#page-prev").addEventListener("click", () => {
    if (state.page > 1) {
      state.page -= 1;
      renderApartmentTable();
    }
  });
  document.querySelector("#page-next").addEventListener("click", () => {
    const maxPage = Math.ceil(state.filteredApartments.length / state.pageSize);
    if (state.page < maxPage) {
      state.page += 1;
      renderApartmentTable();
    }
  });
}

function renderAll() {
  renderStatus();
  renderOverview();
  renderCurated();
  renderSources();
  renderSeasonality();
  renderPriceCopy();
  setupApartmentFilters();
  state.filteredApartments = [...state.apartments];
  applyApartmentFilters();
  renderCharts();
  activateRoute();
}

bindControls();
activateRoute();
loadData();


