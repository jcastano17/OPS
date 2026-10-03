const $ = (s) => document.querySelector(s);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const currency = (value) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
const date = (value, time = false) =>
  new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "America/Bogota",
  }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
const period = (value) =>
  new Intl.DateTimeFormat("es-CO", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T12:00:00Z`));
const monthNow = () =>
  new Date()
    .toLocaleDateString("en-CA", { timeZone: "America/Bogota" })
    .slice(0, 7);
const glyphs = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5",
  contract:
    "M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-4 M9 2h6v4H9z M8 11h8 M8 15h5",
  help: "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3 M12 17h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  plus: "M12 5v14 M5 12h14",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  check: "M5 12l4 4L19 6",
  clock: "M12 8v4l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  back: "M19 12H5 M11 18l-6-6 6-6",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  download: "M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4",
  upload: "M12 16V4 M7 9l5-5 5 5 M4 16v5h16v-5",
  close: "M6 6l12 12 M6 18L18 6",
  logout: "M9 3H4v18h5 M9 12h12 M16 7l5 5-5 5",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  shield: "M12 3l9 4v6c0 5-9 9-9 9s-9-4-9-9V7z M8 12l3 3 5-6",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  chevron: "M9 5l7 7-7 7",
  alert: "M12 8v4 M12 16h.01 M12 3L2 21h20z",
  wallet: "M3 7V5a2 2 0 0 1 2-2h14v4 M3 7h18v14H3z M16 12h5v5h-5z",
};
const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${glyphs[name] || glyphs.file}"/></svg>`;
const badge = (status) =>
  `<span class="badge ${{ Radicada: "blue", "En revisión": "amber", Devuelta: "red", Aprobada: "green" }[status]}"><span></span>${esc(status)}</span>`;
const logo = `<span class="brand-mark"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M6 7l10 19L26 7M11 7l5 10 5-10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>VIVIR<span class="brand-sub">PORTAL DE CONTRATISTAS</span></span>`;
const state = {
  user: null,
  policy: { years: {} },
  demo: false,
  page: "home",
  claims: [],
  contracts: [],
  users: [],
  search: "",
  filter: "Todas",
};
const DOCS = [
  ["cuenta", "Cuenta firmada / factura (PDF)"],
  ["excel", "Cuenta de cobro en Excel"],
  ["informe", "Bitácoras / ruta / listado de pacientes"],
  ["seguridad", "Planilla de seguridad social (PILA)"],
  ["banco", "Certificación bancaria"],
  ["identidad", "Documento de identidad"],
  ["rut", "RUT"],
  ["declaracion", "Declaración juramentada del periodo"],
  ["paz", "Paz y salvo"],
];
let busy = false;
async function api(path, method = "GET", body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-OPS-Request": "1" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 && path !== "/login") {
      state.user = null;
      closeOverlay();
      renderLogin();
    }
    throw new Error(data.error);
  }
  return data;
}
function toast(message, error = false) {
  $("#toast").textContent = message;
  $("#toast").className = `visible ${error ? "error" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("#toast").className = ""), 5000);
}
function formError(form, error) {
  let box = form.querySelector(".form-error");
  if (!box) {
    box = document.createElement("p");
    box.className = "form-error";
    box.setAttribute("role", "alert");
    form.prepend(box);
  }
  box.textContent = error.message;
  box.scrollIntoView({ block: "nearest" });
}
async function refresh() {
  const [c, t, u] = await Promise.all([
    api("/claims"),
    api("/contracts"),
    state.user.role === "admin"
      ? api("/users")
      : Promise.resolve({ users: [] }),
  ]);
  state.claims = c.claims;
  state.contracts = t.contracts;
  state.users = u.users;
}
function closeOverlay() {
  const old = $("#overlay dialog");
  if (old) old.close();
  $("#overlay").innerHTML = "";
  busy = false;
}
function dialog(content, wide = false) {
  $("#overlay").innerHTML =
    `<dialog class="${wide ? "wide" : ""}"><button class="close-dialog" aria-label="Cerrar">${icon("close")}</button>${content}</dialog>`;
  const el = $("#overlay dialog");
  el.showModal();
  el.querySelector(".close-dialog").onclick = closeOverlay;
  el.addEventListener("cancel", (e) => {
    if (busy) e.preventDefault();
    else closeOverlay();
  });
  el.querySelector("button,input,select,textarea")?.focus();
  return el;
}
function renderLogin() {
  $("#app").innerHTML =
    `<main class="login-page"><section class="login-story"><a class="brand" href="/">${logo}</a><div class="story-content"><span class="eyebrow">MENOS TRÁMITES. MÁS TRANQUILIDAD.</span><h1>Tus cuentas,<br>en buenas manos.</h1><p>Un solo lugar para radicar tus cuentas de cobro y acompañar cada paso de su revisión.</p><div class="story-steps"><div>${icon("upload")}<span>Radica con todos tus soportes</span></div><div>${icon("search")}<span>Consulta el estado de tu cuenta</span></div><div>${icon("check")}<span>Recibe observaciones claras</span></div></div></div><footer>VIVIR · Gestión de cuentas OPS</footer><div class="story-ring"></div></section><section class="login-form-area"><div class="login-form-wrap"><span class="eyebrow">BIENVENIDO A TU PORTAL</span><h2>Vamos a empezar</h2><p class="muted">Ingresa con el acceso que te entregó VIVIR.</p><form id="login"><label>Correo electrónico<input type="email" name="email" autocomplete="username" placeholder="tu.correo@ejemplo.com" required></label><label>Contraseña<input type="password" name="password" autocomplete="current-password" placeholder="Ingresa tu contraseña" required maxlength="200"></label><button class="btn primary full" type="submit">Ingresar al portal ${icon("arrow")}</button></form><p class="login-note">${icon("shield")} Tus documentos solo son visibles para ti y el equipo de administración.</p>${state.demo ? `<div class="demo-access"><strong>Explora la demostración</strong><p>Accesos y contrato ficticios para probar el flujo.</p><div><button class="btn secondary" data-demo="contractor">Como contratista</button><button class="btn secondary" data-demo="admin">Como administración</button></div></div>` : `<p class="help-login">¿Necesitas acceso? Solicítalo a administración de VIVIR.</p>`}</div><span class="login-copyright">Cuentas de cobro · VIVIR</span></section></main>`;
  $("#login").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target,
      b = f.querySelector("button");
    b.disabled = true;
    b.textContent = "Ingresando…";
    try {
      const d = await api(
        "/login",
        "POST",
        Object.fromEntries(new FormData(f)),
      );
      state.user = d.user;
      await refresh();
      render();
    } catch (err) {
      formError(f, err);
      b.disabled = false;
      b.innerHTML = `Ingresar al portal ${icon("arrow")}`;
    }
  };
  document.querySelectorAll("[data-demo]").forEach(
    (b) =>
      (b.onclick = () => {
        $("#login [name=email]").value =
          b.dataset.demo === "admin"
            ? "admin@demo.vivir.local"
            : "contratista@demo.vivir.local";
        $("#login [name=password]").value = "VivirDemo2026!";
        $("#login").requestSubmit();
      }),
  );
}
function render() {
  if (!state.user) return renderLogin();
  const admin = state.user.role === "admin";
  const titles = {
    home: "Inicio",
    claims: admin ? "Cuentas recibidas" : "Mis cuentas",
    contracts: "Contratos",
    guide: "Guía de radicación",
  };
  $("#app").innerHTML =
    `<div class="app-shell"><aside class="sidebar"><a class="brand" href="/">${logo}</a><div class="workspace-label">${admin ? "ADMINISTRACIÓN" : "MI ESPACIO"}</div><nav aria-label="Navegación principal">${[
      ["home", "grid", "Inicio"],
      ["claims", "file", admin ? "Cuentas recibidas" : "Mis cuentas"],
      ["contracts", "contract", "Contratos"],
      ["guide", "help", "Guía de radicación"],
    ]
      .map(
        ([page, i, t]) =>
          `<button class="nav-link ${state.page === page ? "active" : ""}" data-page="${page}" ${state.page === page ? 'aria-current="page"' : ""}>${icon(i)}${t}${page === "claims" && state.claims.filter((c) => c.status === "Devuelta").length ? `<span class="nav-count">${state.claims.filter((c) => c.status === "Devuelta").length}</span>` : ""}</button>`,
      )
      .join(
        "",
      )}</nav><div class="sidebar-bottom"><div class="sidebar-tip">${icon("shield")}<strong>Todo en un mismo lugar</strong><p>Tus cuentas, documentos y seguimiento, siempre a mano.</p></div><div class="profile"><span class="avatar">${esc(
      state.user.name
        .split(" ")
        .slice(0, 2)
        .map((n) => n[0])
        .join(""),
    )}</span><span><strong>${esc(state.user.name)}</strong><small>${admin ? "Administración" : "Contratista OPS"}</small></span><button class="icon-btn" id="logout" aria-label="Cerrar sesión">${icon("logout")}</button></div></div></aside><div class="main-shell"><header class="topbar"><button class="icon-btn mobile-menu" aria-label="Abrir menú">${icon("menu")}</button><div class="breadcrumb">Mi portal ${icon("chevron")}<strong>${titles[state.page]}</strong></div><div class="topbar-right">${state.demo ? '<span class="demo-pill">Modo demostración</span>' : ""}<span class="today">${date(new Date().toISOString())}</span><span class="top-avatar">${esc(state.user.name[0])}</span></div></header><main id="content">${state.page === "home" ? home() : state.page === "claims" ? claimsPage() : state.page === "contracts" ? contractsPage() : guide()}</main><footer class="main-footer">VIVIR · Portal de cuentas OPS<span>Un proceso más claro, de principio a fin.</span></footer></div></div>`;
  document.querySelectorAll("[data-page]").forEach(
    (b) =>
      (b.onclick = () => {
        state.page = b.dataset.page;
        state.search = "";
        state.filter = "Todas";
        render();
        window.scrollTo(0, 0);
      }),
  );
  $("#logout").onclick = async () => {
    try {
      await api("/logout", "POST");
      state.user = null;
      state.page = "home";
      renderLogin();
    } catch (e) {
      toast(e.message, true);
    }
  };
  $(".mobile-menu").onclick = () => $(".sidebar").classList.toggle("open");
  bindContent();
}
function pageHead(eyebrow, title, subtitle, action = "") {
  return `<div class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}
function newButton() {
  return `<button class="btn primary" data-new>${icon("plus")} Nueva radicación</button>`;
}
function home() {
  const admin = state.user.role === "admin",
    c = state.claims;
  const counts = ["Radicada", "En revisión", "Devuelta", "Aprobada"].map(
    (s) => c.filter((x) => x.status === s).length,
  );
  const pending = c
    .filter((x) => x.status !== "Aprobada")
    .reduce((a, x) => a + x.amount, 0);
  return `${pageHead(admin ? "PANEL DE ADMINISTRACIÓN" : "TU GESTIÓN, AL DÍA", `Hola, ${esc(state.user.name.split(" ")[0])}<span class="hello-dot">.</span>`, admin ? "Acompaña cada cuenta, desde la radicación hasta su aprobación." : "Aquí puedes radicar tus cuentas y consultar cómo va su revisión.", admin ? `<button class="btn primary" data-page="contracts">${icon("plus")} Gestionar contratos</button>` : newButton())}<section class="stats" aria-label="Resumen de cuentas">${[
    ["file", "Cuentas radicadas", c.length, "En todos los periodos", "mint"],
    [
      "clock",
      "En revisión",
      counts[1],
      `${counts[0]} pendientes de revisión`,
      "sand",
    ],
    ["alert", "Por corregir", counts[2], "Revisa las observaciones", "rose"],
    ["check", "Aprobadas", counts[3], "Con revisión completa", "mint"],
  ]
    .map(
      ([i, t, n, h, style]) =>
        `<article class="stat-card"><div><span>${t}</span><span class="stat-icon ${style}">${icon(i)}</span></div><strong>${n.toString().padStart(2, "0")}</strong><small>${h}</small></article>`,
    )
    .join(
      "",
    )}</section><div class="dashboard-grid"><div><section class="panel accounts-panel"><div class="panel-heading"><div><h2>${admin ? "Últimas cuentas recibidas" : "Mis últimas cuentas"}</h2><p>El estado de cada radicación, sin perder el hilo.</p></div><button class="text-btn" data-page="claims">Ver todas ${icon("arrow")}</button></div>${table(c.slice(0, 5), false)}</section><div class="bottom-banner"><span class="banner-icon">${icon("wallet")}</span><div><strong>${admin ? "Valor pendiente de aprobación" : "Tus cuentas en trámite"}</strong><p>${c.filter((x) => x.status !== "Aprobada").length} cuenta(s) radicada(s) por revisar o corregir.</p></div><strong class="banner-amount">${currency(pending)}</strong></div></div><aside class="dashboard-aside"><section class="next-card"><span class="eyebrow">${admin ? "UN PROCESO CON TRAZABILIDAD" : "TU PRÓXIMA RADICACIÓN"}</span><div class="next-icon">${icon(admin ? "shield" : "contract")}</div><h2>${admin ? "Cada revisión cuenta." : "Todo listo para dar el siguiente paso."}</h2><p>${admin ? "Consulta los soportes y deja observaciones concretas para facilitar las correcciones." : "Ten a mano tu cuenta de cobro y los soportes del periodo que vas a radicar."}</p><button class="btn light full" ${admin ? 'data-page="claims"' : "data-new"}>${admin ? "Ir a cuentas recibidas" : "Preparar mi cuenta"} ${icon("arrow")}</button><small>${admin ? "La aprobación se registra en el historial." : "Recibirás tu número de radicado al enviar."}</small></section><section class="panel checklist"><h3>Antes de radicar</h3><p>Revisa los soportes que aplican:</p>${[
    ["01", "Cuenta de cobro", "Del contrato y periodo a radicar"],
    [
      "02",
      "Bitácoras / listado de pacientes",
      "Actividades realizadas en el periodo",
    ],
    ["03", "Seguridad social", "Soporte correspondiente al periodo"],
  ]
    .map(
      ([n, t, s]) =>
        `<div class="checklist-item"><span>${n}</span><div><strong>${t}</strong><small>${s}</small></div></div>`,
    )
    .join(
      "",
    )}<button class="text-btn" data-page="guide">Consultar la guía ${icon("arrow")}</button></section></aside></div>`;
}
function table(rows, admin = state.user.role === "admin") {
  return rows.length
    ? `<div class="table-scroll"><table><thead><tr><th>RADICADO / CONTRATO</th>${admin ? "<th>CONTRATISTA</th>" : ""}<th>PERIODO</th><th>VALOR</th><th>ESTADO</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>${rows.map((c) => `<tr><td><button class="table-link" data-detail="${c.id}">${esc(c.radicado)}</button><small>${esc(c.contract_number)}</small></td>${admin ? `<td>${esc(c.contractor_name)}</td>` : ""}<td class="period-cell">${esc(period(c.period))}</td><td class="amount-cell">${currency(c.amount)}</td><td>${badge(c.status)}</td><td><button class="icon-btn" data-detail="${c.id}" aria-label="Ver cuenta ${esc(c.radicado)}">${icon("chevron")}</button></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty-state"><span>${icon("file")}</span><h3>${state.search || state.filter !== "Todas" ? "No hay cuentas con estos filtros" : state.user.role === "admin" ? "Las próximas cuentas aparecerán aquí" : "Tu primera cuenta empieza aquí"}</h3><p>${state.search || state.filter !== "Todas" ? "Prueba otro radicado, periodo o estado." : state.user.role === "admin" ? "Cuando un contratista radique, podrás revisar sus documentos y gestionar su estado." : "Radica tu cuenta con los soportes y consulta su avance desde este espacio."}</p>${!state.search && state.filter === "Todas" && state.user.role === "contractor" ? `<button class="btn secondary" data-new>${icon("plus")} Radicar una cuenta</button>` : ""}</div>`;
}
function filtered() {
  const q = state.search.toLowerCase();
  return state.claims.filter(
    (c) =>
      (state.filter === "Todas" || c.status === state.filter) &&
      [
        c.radicado,
        c.contract_number,
        c.contractor_name,
        period(c.period),
        ...(c.metadata?.lines || []).flatMap((l) => [
          l.city,
          l.program,
          l.entity,
        ]),
      ].some((t) => t.toLowerCase().includes(q)),
  );
}
function claimsPage() {
  const admin = state.user.role === "admin";
  return `${pageHead("RADICACIÓN Y SEGUIMIENTO", admin ? "Cuentas recibidas" : "Mis cuentas", admin ? "Revisa los soportes y gestiona cada cuenta de cobro." : "Todos tus periodos y documentos, organizados en un solo lugar.", admin ? "" : newButton())}<section class="panel"><div class="filters"><div class="filter-tabs" role="group" aria-label="Filtrar por estado">${["Todas", "Radicada", "En revisión", "Devuelta", "Aprobada"].map((s) => `<button class="filter-tab ${s === state.filter ? "active" : ""}" data-filter="${s}">${s} <span>${s === "Todas" ? state.claims.length : state.claims.filter((c) => c.status === s).length}</span></button>`).join("")}</div><div class="filter-tools"><label class="search-box">${icon("search")}<input type="search" id="search" aria-label="Buscar cuentas" placeholder="Buscar radicado, contrato…" value="${esc(state.search)}"></label><button class="btn secondary compact" id="export">${icon("download")} Exportar</button></div></div><div id="claims-table">${table(filtered())}</div><div class="table-footer"><span id="result-count">${filtered().length} cuenta(s)</span><span>Los estados se actualizan con cada revisión.</span></div></section>`;
}
function contractsPage() {
  const admin = state.user.role === "admin";
  return `${pageHead("INFORMACIÓN CONTRACTUAL", admin ? "Contratos OPS" : "Mis contratos", admin ? "Crea accesos y asigna los contratos que podrán radicar cuentas." : "Consulta tus contratos y el valor mensual disponible para radicar.", admin ? '<div class="heading-actions"><button class="btn secondary" id="new-user">' + icon("users") + ' Crear contratista</button><button class="btn primary" id="new-contract">' + icon("plus") + " Nuevo contrato</button></div>" : "")}<div class="contract-grid">${state.contracts.length ? state.contracts.map((c) => `<article class="panel contract-card"><div class="contract-top"><span class="contract-icon">${icon("contract")}</span><span class="badge green">Habilitado</span></div><span class="eyebrow">CONTRATO DE PRESTACIÓN DE SERVICIOS</span><h2>${esc(c.number)}</h2><p class="contract-object">${esc(c.object)}</p><dl>${admin ? `<div><dt>Contratista</dt><dd>${esc(c.contractor_name)}</dd></div>` : ""}<div><dt>Supervisor / responsable</dt><dd>${esc(c.supervisor)}</dd></div><div><dt>Vigencia</dt><dd>${date(c.start)} — ${date(c.end)}</dd></div></dl><div class="contract-bottom"><div><small>Honorarios mensuales</small><strong>${currency(c.monthly_amount)}</strong></div>${!admin ? `<button class="icon-btn" data-new="${c.id}" aria-label="Radicar para ${esc(c.number)}">${icon("arrow")}</button>` : ""}</div></article>`).join("") : `<section class="panel empty-state"><span>${icon("contract")}</span><h3>No hay contratos asignados</h3><p>${admin ? "Crea un contratista y luego asigna su contrato." : "Solicita a administración de VIVIR que asigne tu contrato para empezar."}</p></section>`}</div>${admin ? `<section class="panel user-panel"><div class="panel-heading"><div><h2>Contratistas con acceso</h2><p>${state.users.length} persona(s) registrada(s)</p></div></div><div class="table-scroll"><table><thead><tr><th>NOMBRE</th><th>DOCUMENTO</th><th>CORREO</th></tr></thead><tbody>${state.users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.document)}</td><td>${esc(u.email)}</td></tr>`).join("")}</tbody></table></div></section>` : ""}`;
}
function guide() {
  return `${pageHead("TE ACOMPAÑAMOS EN EL PROCESO", "Una cuenta completa, un trámite más claro.", "Sigue estos pasos para radicar tu cuenta de cobro en VIVIR.")}<div class="guide-grid">${[
    [
      "01",
      "Revisa tu contrato",
      "Verifica el número de contrato, su vigencia y el periodo que vas a cobrar. Registra cada servicio por entidad, municipio, programa, cantidad y tarifa. Puedes radicar varias cuentas del mismo periodo cuando correspondan a servicios distintos.",
      "contract",
    ],
    [
      "02",
      "Prepara los soportes",
      "Adjunta la cuenta firmada, el Excel original y los soportes aplicables. Se recibe un PDF por soporte, de hasta 8 MB cada uno; la cuenta en Excel puede ser .xlsx o .xlsm. Adjunta certificación bancaria y RUT vigentes en cada radicación. Para cuenta de cobro también adjunta el Excel original y la cédula. La PILA y la declaración se piden según tus respuestas y el valor cobrado.",
      "upload",
    ],
    [
      "03",
      "Radica y guarda tu número",
      "Completa las actividades realizadas y envía la cuenta. El portal te entregará un número único de radicado con la fecha de recepción.",
      "file",
    ],
    [
      "04",
      "Consulta el seguimiento",
      "Administración revisará la cuenta. Si se devuelve, encontrarás las observaciones y podrás corregir y volver a enviar conservando el radicado.",
      "search",
    ],
  ]
    .map(
      ([n, t, p, i]) =>
        `<article class="panel guide-card"><span class="guide-number">${n}</span>${icon(i)}<h2>${t}</h2><p>${p}</p></article>`,
    )
    .join(
      "",
    )}</div><section class="panel guide-status"><h2>¿Qué significa cada estado?</h2>${[
    [
      "Radicada",
      "Tu envío y sus soportes fueron recibidos. Administración validará firma, legibilidad y consistencia.",
    ],
    [
      "En revisión",
      "Administración está verificando la información y los documentos.",
    ],
    [
      "Devuelta",
      "Se requieren correcciones. Consulta la observación en el historial.",
    ],
    [
      "Aprobada",
      "Administración aprobó la cuenta. Este estado no confirma que se haya realizado el pago.",
    ],
  ]
    .map(([s, d]) => `<div>${badge(s)}<p>${d}</p></div>`)
    .join("")}</section>`;
}
function bindTable() {
  document
    .querySelectorAll("[data-detail]")
    .forEach((b) => (b.onclick = () => showDetail(Number(b.dataset.detail))));
  document
    .querySelectorAll("[data-new]")
    .forEach(
      (b) => (b.onclick = () => showClaim(null, Number(b.dataset.new) || null)),
    );
}
function bindContent() {
  bindTable();
  document.querySelectorAll("[data-page]").forEach(
    (b) =>
      (b.onclick = () => {
        state.page = b.dataset.page;
        state.search = "";
        state.filter = "Todas";
        render();
        window.scrollTo(0, 0);
      }),
  );
  $("#new-user")?.addEventListener("click", showUser);
  $("#new-contract")?.addEventListener("click", showContract);
  document.querySelectorAll("[data-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        state.filter = b.dataset.filter;
        render();
      }),
  );
  $("#search")?.addEventListener("input", (e) => {
    state.search = e.target.value;
    $("#claims-table").innerHTML = table(filtered());
    $("#result-count").textContent = `${filtered().length} cuenta(s)`;
    bindTable();
  });
  $("#export")?.addEventListener("click", exportCsv);
}
function exportCsv() {
  const cell = (v) =>
    `"${String(v ?? "")
      .replace(/^[=+@\-]/, "'$&")
      .replace(/"/g, '""')}"`;
  const content =
    "\uFEFF" +
    [
      [
        "Radicado",
        "Contrato",
        "Contratista",
        "Documento",
        "Periodo",
        "Municipios",
        "Programas",
        "Valor bruto COP",
        "Estado",
        "Fecha de radicación",
      ],
      ...filtered().map((c) => [
        c.radicado,
        c.contract_number,
        c.contractor_name,
        c.contractor_document,
        c.period,
        (c.metadata?.lines || []).map((l) => l.city).join(" / "),
        (c.metadata?.lines || []).map((l) => l.program).join(" / "),
        c.amount,
        c.status,
        date(c.created),
      ]),
    ]
      .map((row) => row.map(cell).join(";"))
      .join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8;" }),
  );
  link.download = `VIVIR-cuentas-${monthNow()}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
function showDetail(id) {
  const c = state.claims.find((x) => x.id === id);
  if (!c) return;
  const admin = state.user.role === "admin";
  dialog(
    `<span class="eyebrow">DETALLE DE LA CUENTA</span><div class="detail-heading"><h2>${esc(c.radicado)}</h2>${badge(c.status)}</div><p class="muted">Primer envío: ${date(c.created, true)} · Último envío/revisión: ${date(c.updated, true)}</p><div class="detail-summary"><div><small>Contrato</small><strong>${esc(c.contract_number)}</strong></div><div><small>Periodo</small><strong class="capitalize">${period(c.period)}</strong></div><div><small>Valor de la cuenta</small><strong>${currency(c.amount)}</strong></div></div><dl class="detail-person"><div><dt>Contratista</dt><dd>${esc(c.contractor_name)} · ${esc(c.contractor_document)}</dd></div><div><dt>Supervisor / responsable</dt><dd>${esc(c.supervisor)}</dd></div></dl>${businessDetail(c)}<h3>Actividades del periodo</h3><p class="activity-text">${esc(c.description)}</p><h3>Soportes adjuntos</h3><div class="document-list">${c.documents.map((d) => `<a href="/api/documents/${d.id}" class="document-link" download>${icon("file")}<span><strong>${esc(d.name)}</strong><small>${DOCS.find((x) => x[0] === d.kind)?.[1] || d.kind} · ${(d.size / 1024).toFixed(0)} KB</small></span>${icon("download")}</a>`).join("")}</div><h3>Historial de la cuenta</h3><div class="timeline">${c.events.map((e) => `<div class="timeline-item"><span class="timeline-dot"></span><div><strong>${esc(e.status)}</strong><small>${date(e.created, true)} · ${esc(e.author)}</small><p>${esc(e.note)}</p></div></div>`).join("")}</div>${admin && ["Radicada", "En revisión"].includes(c.status) ? `<form id="review"><h3>${c.status === "Radicada" ? "Iniciar revisión" : "Registrar resultado de la revisión"}</h3>${c.status === "En revisión" ? '<label>Motivo de devolución<select id="return-reason"><option value="">Selecciona un motivo si vas a devolver</option>' + ["Excel original ausente o convertido desde PDF", "Juramento tributario incompleto o inconsistente", "Declaración juramentada ausente o de otro periodo", "PILA ausente, sin pagar o de otro periodo", "RUT desactualizado", "Cuenta sin firma", "Datos bancarios inconsistentes con la certificación", "Bitácoras ilegibles o cantidades inconsistentes", "Servicios glosados incluidos en el cobro", "Debe presentar factura electrónica", "PDF de la cuenta dividido en varias páginas"].map((r) => "<option>" + r + "</option>").join("") + '</select></label><label>Observaciones<textarea name="note" rows="3" maxlength="2000" placeholder="Indica qué debe corregirse o deja una nota de aprobación."></textarea></label><label class="checkbox-label review-check"><input type="checkbox" name="review_confirmed"><span>Verifiqué firma, identidad, datos bancarios, vigencia del RUT, cantidades y soportes aplicables (PILA pagada y del periodo; declaración firmada cuando aplique). Esta confirmación es necesaria para aprobar.</span></label>' : ""}<div class="dialog-actions">${c.status === "Radicada" ? '<button class="btn primary" type="submit" name="status" value="En revisión">Iniciar revisión</button>' : '<button class="btn secondary danger" type="submit" name="status" value="Devuelta">Devolver con observaciones</button><button class="btn primary" type="submit" name="status" value="Aprobada">' + icon("check") + " Aprobar cuenta</button>"}</div></form>` : c.status === "Devuelta" && !admin ? `<div class="dialog-actions"><button class="btn primary" id="correct">Corregir y volver a radicar ${icon("arrow")}</button></div>` : ""}`,
    true,
  );
  $("#correct")?.addEventListener("click", () => showClaim(c));
  $("#return-reason")?.addEventListener("change", (e) => {
    if (e.target.value) $("#review textarea").value = e.target.value + ". ";
  });
  $("#review")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target,
      status = e.submitter.value,
      note = form.querySelector("textarea")?.value || "";
    if (status === "Devuelta" && note.trim().length < 10)
      return formError(
        form,
        new Error("Explica qué debe corregirse (mínimo 10 caracteres)."),
      );
    busy = true;
    form.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try {
      await api(`/claims/${id}/status`, "POST", {
        status,
        note,
        review_confirmed: form.elements.review_confirmed?.checked === true,
      });
      await refresh();
      render();
      closeOverlay();
      showDetail(id);
      toast(
        `Cuenta ${status === "Aprobada" ? "aprobada" : status === "Devuelta" ? "devuelta" : "en revisión"}.`,
      );
    } catch (err) {
      busy = false;
      formError(form, err);
      form.querySelectorAll("button").forEach((b) => (b.disabled = false));
    }
  });
}
function lineForm(line = {}, index = 0) {
  return `<fieldset class="service-line"><legend>Servicio ${index + 1}</legend><div class="form-grid"><label>Departamento<input data-field="department" value="${esc(line.department)}" required maxlength="200" placeholder="Departamento de ejecución"></label><label>Municipio<input data-field="city" value="${esc(line.city)}" required maxlength="200" placeholder="Municipio de ejecución"></label></div><div class="form-grid"><label>Entidad / pagador<input data-field="entity" value="${esc(line.entity)}" required maxlength="200" placeholder="EPS, Policía, Ejército…"></label><label>Programa<input data-field="program" value="${esc(line.program)}" required maxlength="200" placeholder="B24X, PPL/TB, PAD…"></label></div><div class="form-grid"><label>Servicio<input data-field="service" value="${esc(line.service)}" required maxlength="200" placeholder="Servicio prestado"></label><label>Modalidad<select data-field="modality">${["Presencial", "Teleconsulta", "Domiciliaria", "Otra"].map((v) => `<option ${line.modality === v ? "selected" : ""}>${v}</option>`).join("")}</select></label></div><div class="form-grid"><label>Cantidad / turnos<input data-field="quantity" type="number" min="0.001" max="100000" step="0.001" value="${line.quantity ?? 1}" required></label><label>Valor unitario (COP)<input data-field="unit_price" type="number" min="1" max="1000000000" step="1" value="${line.unit_price ?? ""}" required></label></div><div class="line-total"><span>Subtotal: <strong class="subtotal">${currency(Math.round((line.quantity || 0) * (line.unit_price || 0)))}</strong></span><button type="button" class="text-btn danger" data-remove-line>Eliminar servicio</button></div></fieldset>`;
}
function showClaim(existing = null, contractId = null) {
  const contracts = state.contracts.filter((c) => c.active);
  if (!contracts.length)
    return toast(
      "Aún no tienes contratos asignados. Contacta a administración.",
      true,
    );
  const selected =
    contracts.find((c) => c.id === (existing?.contract_id || contractId)) ||
    contracts[0];
  const previous =
      existing?.metadata ||
      state.claims.find((c) => c.metadata?.bank)?.metadata ||
      {},
    bank = previous.bank || {};

  const initialLines = existing?.metadata?.lines?.length
    ? existing.metadata.lines
    : [
        {
          quantity: 1,
          unit_price: existing?.amount || selected.monthly_amount,
        },
      ];
  dialog(
    `<span class="eyebrow">${existing ? "CORREGIR CUENTA" : "NUEVA RADICACIÓN"}</span><h2>${existing ? esc(existing.radicado) : "Vamos a preparar tu cuenta"}</h2><p class="muted">Registra los servicios prestados y los soportes de este periodo.</p>${existing ? `<div class="notice warning">${icon("alert")}<span>${esc(existing.events.find((e) => e.status === "Devuelta")?.note || "Revisa y corrige tu cuenta antes de enviarla.")}</span></div>` : ""}<form id="claim-form"><div class="form-section-label"><span>1</span> Contrato y periodo</div><label>Contrato<select name="contract_id" ${existing ? "disabled" : ""}>${contracts.map((c) => `<option value="${c.id}" ${selected.id === c.id ? "selected" : ""}>${esc(c.number)}</option>`).join("")}</select></label><div id="contract-info" class="contract-info"></div><div class="form-grid"><label>Periodo a cobrar<input type="month" name="period" value="${existing?.period || monthNow()}" required ${existing ? "readonly" : ""}></label><label>Profesión / cargo<input name="profession" value="${esc(previous.profession)}" required maxlength="200"></label></div><div class="form-section-label"><span>2</span> Servicios prestados</div><p class="field-help">Agrega un renglón por servicio, municipio, programa o tarifa. El total se calcula con la cantidad y el valor unitario.</p><div id="service-lines">${initialLines.map(lineForm).join("")}</div><button class="btn secondary compact" type="button" id="add-line">${icon("plus")} Agregar servicio</button><label>Total bruto de la cuenta (COP)<input type="number" name="amount" readonly required></label><label>Actividades realizadas<textarea name="description" rows="3" minlength="10" maxlength="3000" placeholder="Resume las actividades realizadas durante este periodo…" required>${esc(existing?.description || "")}</textarea></label><div class="form-section-label"><span>3</span> Información para revisión y pago</div><div class="form-grid"><label>Banco / entidad financiera<input name="bank_name" value="${esc(bank.name)}" required maxlength="200"></label><label>Tipo de cuenta<select name="bank_type">${["Ahorros", "Corriente", "Depósito electrónico"].map((v) => `<option ${bank.type === v ? "selected" : ""}>${v}</option>`).join("")}</select></label></div><label>Número de cuenta<input name="bank_number" value="${esc(bank.number)}" inputmode="numeric" pattern="[0-9]{6,30}" required><small class="field-help">Se guarda como texto para conservar los ceros iniciales.</small></label><div class="form-grid"><label>Titular de la cuenta<input name="bank_holder" value="${esc(bank.holder || state.user.name)}" required maxlength="200"></label><label>Documento del titular<input name="bank_document" value="${esc(bank.document || state.user.document)}" inputmode="numeric" pattern="[0-9]{5,15}" required></label></div><div class="form-grid"><label>Tipo de persona<select name="person_type">${["Natural", "Jurídica"].map((v) => `<option ${previous.person_type === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><label>Régimen tributario<select name="tax_regime">${["Ordinario", "Simple"].map((v) => `<option ${previous.tax_regime === v ? "selected" : ""}>${v}</option>`).join("")}</select></label></div><div class="form-grid"><label>Documento a radicar<select name="document_type"><option ${previous.document_type !== "Factura electrónica" ? "selected" : ""}>Cuenta de cobro</option><option ${previous.document_type === "Factura electrónica" ? "selected" : ""}>Factura electrónica</option></select></label><label id="cufe-label">CUFE de la factura<input name="cufe" value="${esc(previous.cufe)}" maxlength="200"></label></div><div id="oath-block"><h3>Juramento tributario</h3><p class="field-help">Marca una respuesta para cada numeral. La revisión seguirá el instructivo de VIVIR.</p>${[
      ["q1", "Estoy obligado(a) a declarar renta por el año de referencia."],
      ["q2", "Mis ingresos brutos del año de referencia superaron 3.500 UVT."],
      [
        "q3",
        "Solicito la tabla del art. 383 con depuración y declaro que no tomaré costos ni deducciones.",
      ],
      ["q4", "Adjunto la declaración juramentada vigente para el periodo."],
      ["q5", "Efectué los aportes a salud, pensión y ARL."],
    ]
      .map(
        ([k, text], i) =>
          `<label class="oath-row"><span>${i + 1}. ${text}</span><select name="${k}" required><option value="">Selecciona</option><option value="SI" ${previous.oath?.[k] === "SI" ? "selected" : ""}>SI</option><option value="NO" ${previous.oath?.[k] === "NO" ? "selected" : ""}>NO</option></select></label>`,
      )
      .join(
        "",
      )}<p class="field-help" id="oath-year"></p></div><div class="form-section-label"><span>4</span> Soportes del periodo</div><p class="field-help">Un PDF por documento · Máximo 8 MB por archivo. Adjunta la cuenta firmada en PDF y el Excel original (.xlsx / .xlsm) si radicas una cuenta de cobro. ${existing ? "Vuelve a adjuntar los soportes vigentes al corregir." : ""}</p><div class="upload-list">${DOCS.map(([k, title]) => `<label class="upload-field" data-doc="${k}">${icon("upload")}<span><strong>${title}<span class="required-mark"></span></strong><small class="file-name">Selecciona un archivo</small></span><span class="upload-pick">Adjuntar</span><input type="file" name="${k}" accept="${k === "excel" ? ".xlsx,.xlsm" : ".pdf"}" aria-label="${title}"></label>`).join("")}</div><label class="checkbox-label"><input type="checkbox" name="confirm" required><span>Confirmo que los datos corresponden a mi contrato y que los documentos adjuntos pertenecen al periodo indicado.</span></label><div class="notice">${icon("shield")}<span>El equipo de VIVIR verificará soportes y retenciones. Al radicar se registra el valor bruto de la cuenta.</span></div><div class="dialog-actions"><button class="btn secondary" type="button" id="cancel-claim">Cancelar</button><button class="btn primary" type="submit">${existing ? "Volver a radicar" : "Radicar cuenta"} ${icon("arrow")}</button></div></form>`,
    true,
  );
  const form = $("#claim-form");
  function updateContract() {
    const c = contracts.find((c) => c.id === Number(form.contract_id.value));
    $("#contract-info").innerHTML =
      `<strong>${esc(c.object)}</strong><span>Responsable: ${esc(c.supervisor)} · Honorario de referencia: ${currency(c.monthly_amount)}</span>`;
    form.period.min = c.start.slice(0, 7);
    form.period.max =
      c.end.slice(0, 7) < monthNow() ? c.end.slice(0, 7) : monthNow();
  }
  updateContract();
  form.contract_id.addEventListener("change", updateContract);
  $("#cancel-claim").onclick = closeOverlay;
  function updateTotal() {
    let total = 0;
    form.querySelectorAll(".service-line").forEach((row) => {
      const subtotal = Math.round(
        Number(row.querySelector("[data-field=quantity]").value) *
          Number(row.querySelector("[data-field=unit_price]").value),
      );
      total += subtotal;
      row.querySelector(".subtotal").textContent = currency(subtotal);
    });
    form.amount.value = total;
    updateRequirements();
  }
  function updateRequirements() {
    const invoice = form.document_type.value === "Factura electrónica";
    const annual = state.policy.years[form.period.value.slice(0, 4)];
    $("#oath-block").hidden = invoice;
    $("#cufe-label").hidden = !invoice;
    form.cufe.required = invoice;
    for (const k of ["q1", "q2", "q3", "q4", "q5"])
      form.elements[k].required = !invoice;
    const required = [
      "cuenta",
      "informe",
      "banco",
      "rut",
      ...(!invoice ? ["excel", "identidad"] : []),
      ...(form.person_type.value === "Natural" &&
      Number(form.amount.value) > (annual?.smmlv ?? 0)
        ? ["seguridad"]
        : []),
      ...(!invoice && form.q3.value === "SI" && form.q4.value === "SI"
        ? ["declaracion"]
        : []),
    ];
    DOCS.forEach(([k]) => {
      form.elements[k].required = required.includes(k);
      form.querySelector(`[data-doc="${k}"] .required-mark`).textContent =
        required.includes(k) ? " *" : " · si aplica";
    });
    $("#oath-year").textContent = annual
      ? `Año gravable de referencia: ${annual.income_reference_year}. Para este periodo, PILA obligatoria en personas naturales con cuenta superior a ${currency(annual.smmlv)}.`
      : "Administración debe configurar los parámetros de este año.";
  }
  for (const k of ["document_type", "person_type", "period", "q3", "q4"])
    form.elements[k].addEventListener("change", updateRequirements);
  function bindLines() {
    form.querySelectorAll(".service-line").forEach((row) => {
      row.querySelectorAll("input").forEach((i) => (i.oninput = updateTotal));
      row.querySelector("[data-remove-line]").onclick = () => {
        if (form.querySelectorAll(".service-line").length === 1)
          return toast("La cuenta necesita al menos un servicio.", true);
        row.remove();
        form
          .querySelectorAll("legend")
          .forEach((l, i) => (l.textContent = `Servicio ${i + 1}`));
        updateTotal();
      };
    });
    updateTotal();
  }
  bindLines();
  $("#add-line").onclick = () => {
    const count = form.querySelectorAll(".service-line").length;
    if (count >= 30) return toast("Puedes agregar hasta 30 servicios.", true);
    $("#service-lines").insertAdjacentHTML("beforeend", lineForm({}, count));
    bindLines();
  };
  form.querySelectorAll("[type=file]").forEach(
    (input) =>
      (input.onchange = () => {
        const file = input.files[0];
        if (file && file.size > 8 * 1024 * 1024) {
          input.value = "";
          toast("El archivo supera los 8 MB permitidos.", true);
        }
        input.closest("label").querySelector(".file-name").textContent =
          input.files[0]?.name || "Selecciona un archivo";
        input
          .closest("label")
          .classList.toggle("attached", Boolean(input.files[0]));
      }),
  );
  form.onsubmit = async (e) => {
    e.preventDefault();
    busy = true;
    const button = form.querySelector("[type=submit]");
    button.disabled = true;
    button.textContent = "Enviando cuenta…";
    form
      .querySelectorAll("button[type=button]")
      .forEach((b) => (b.disabled = true));
    $("#overlay .close-dialog").disabled = true;
    try {
      const documents = await Promise.all(
        DOCS.map(([kind]) => ({ kind, file: form.elements[kind].files[0] }))
          .filter((d) => d.file)
          .map(async ({ kind, file }) => ({
            kind,
            name: file.name,
            content: await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve(String(reader.result).split(",")[1]);
              reader.onerror = () =>
                reject(new Error("No se pudo leer el archivo."));
              reader.readAsDataURL(file);
            }),
          })),
      );
      const lines = [...form.querySelectorAll(".service-line")].map((row) =>
        Object.fromEntries(
          [...row.querySelectorAll("[data-field]")].map((i) => [
            i.dataset.field,
            i.value,
          ]),
        ),
      );
      const metadata = {
        lines,
        profession: form.profession.value,
        bank: {
          name: form.bank_name.value,
          type: form.bank_type.value,
          number: form.bank_number.value,
          holder: form.bank_holder.value,
          document: form.bank_document.value,
        },
        person_type: form.person_type.value,
        tax_regime: form.tax_regime.value,
        requests_383: form.q3.value === "SI",
        document_type: form.document_type.value,
        cufe: form.cufe.value,
        oath: Object.fromEntries(
          ["q1", "q2", "q3", "q4", "q5"].map((k) => [
            k,
            form.elements[k].value,
          ]),
        ),
      };
      const d = await api(
        existing ? `/claims/${existing.id}` : "/claims",
        existing ? "PUT" : "POST",
        {
          contract_id: Number(form.contract_id.value),
          period: form.period.value,
          amount: Number(form.amount.value),
          description: form.description.value,
          metadata,
          documents,
        },
      );
      await refresh();
      state.page = "claims";
      state.search = "";
      state.filter = "Todas";
      render();
      closeOverlay();
      dialog(
        `<div class="success-icon">${icon("check")}</div><span class="eyebrow">CUENTA RECIBIDA</span><h2>Tu cuenta quedó radicada.</h2><p class="muted">Guarda este número para consultar el seguimiento.</p><div class="receipt-number">${esc(d.claim.radicado)}</div><div class="receipt-meta"><p>${period(d.claim.period)} · ${currency(d.claim.amount)}</p><small>${date(d.claim.updated, true)}</small></div><div class="notice">${icon("clock")}<span>Administración podrá consultar los soportes e iniciar la revisión de tu cuenta.</span></div><button class="btn primary full" id="view-receipt">Ver mi cuenta ${icon("arrow")}</button>`,
      );
      $("#view-receipt").onclick = () => showDetail(d.claim.id);
    } catch (err) {
      busy = false;
      formError(form, err);
      button.innerHTML = `${existing ? "Volver a radicar" : "Radicar cuenta"} ${icon("arrow")}`;
      form.querySelectorAll("button").forEach((b) => (b.disabled = false));
      $("#overlay .close-dialog").disabled = false;
    }
  };
}
function businessDetail(c) {
  const m = c.metadata || {};
  if (!m.lines?.length) return "";
  return `<h3>Servicios prestados</h3><div class="table-scroll services-detail"><table><thead><tr><th>MUNICIPIO / PROGRAMA</th><th>SERVICIO</th><th>CANT.</th><th>TARIFA</th><th>SUBTOTAL</th></tr></thead><tbody>${m.lines.map((l) => `<tr><td>${esc(l.city)}<small>${esc(l.department)} · ${esc(l.program)}<br>${esc(l.entity)} · ${esc(l.modality)}</small></td><td>${esc(l.service)}</td><td>${l.quantity}</td><td>${currency(l.unit_price)}</td><td>${currency(l.subtotal)}</td></tr>`).join("")}</tbody></table></div><h3>Datos bancarios y tributarios</h3><dl class="detail-person"><div><dt>Banco / cuenta</dt><dd>${esc(m.bank.name)} · ${esc(m.bank.type)}<br>${esc(m.bank.number)}</dd></div><div><dt>Titular</dt><dd>${esc(m.bank.holder)} · ${esc(m.bank.document)}</dd></div><div><dt>Profesión / tipo de persona</dt><dd>${esc(m.profession)} · ${esc(m.person_type)}</dd></div><div><dt>Régimen / declaraciones</dt><dd>${esc(m.tax_regime)} · ${m.declares_income ? "Declarante" : "No declarante"}<br>${m.requests_383 ? "Solicita revisión de tabla 383" : "Sin solicitud de tabla 383"}</dd></div></dl>${m.bank.document !== c.contractor_document ? '<div class="notice warning">' + icon("alert") + "<span>El documento del titular bancario difiere del contratista. Administración debe verificar esta diferencia.</span></div>" : ""}`;
}
function showUser() {
  dialog(
    `<span class="eyebrow">GESTIÓN DE ACCESOS</span><h2>Crear contratista</h2><p class="muted">Entrega estas credenciales al contratista por un canal privado.</p><form id="user-form"><label>Nombre completo<input name="name" required maxlength="200"></label><div class="form-grid"><label>Número de documento<input name="document" required pattern="[0-9]{5,15}" inputmode="numeric"></label><label>Correo electrónico<input name="email" type="email" required maxlength="200"></label></div><label>Contraseña inicial<input name="password" type="password" minlength="12" maxlength="200" autocomplete="new-password" required><small class="field-help">Mínimo 12 caracteres.</small></label><div class="dialog-actions"><button class="btn primary" type="submit">Crear acceso ${icon("arrow")}</button></div></form>`,
  );
  $("#user-form").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target,
      b = f.querySelector("button");
    b.disabled = true;
    try {
      await api("/users", "POST", Object.fromEntries(new FormData(f)));
      await refresh();
      render();
      closeOverlay();
      toast("Contratista creado. Ya puedes asignarle un contrato.");
    } catch (err) {
      formError(f, err);
      b.disabled = false;
    }
  };
}
function showContract() {
  if (!state.users.length)
    return toast(
      "Primero crea un contratista para asignarle el contrato.",
      true,
    );
  dialog(
    `<span class="eyebrow">INFORMACIÓN CONTRACTUAL</span><h2>Nuevo contrato OPS</h2><p class="muted">Este contrato habilitará al contratista para radicar cuentas.</p><form id="contract-form"><div class="form-grid"><label>Número de contrato<input name="number" placeholder="OPS-2026-001" required maxlength="200"></label><label>Contratista<select name="user_id">${state.users.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join("")}</select></label></div><label>Objeto contractual<textarea name="object" rows="3" required maxlength="2000"></textarea></label><label>Supervisor / responsable<input name="supervisor" required maxlength="200"></label><div class="form-grid"><label>Fecha de inicio<input name="start" type="date" required></label><label>Fecha de finalización<input name="end" type="date" required></label></div><label>Honorarios mensuales (COP)<input name="monthly_amount" type="number" min="1" max="1000000000" step="1" required></label><div class="dialog-actions"><button class="btn primary" type="submit">Crear contrato ${icon("arrow")}</button></div></form>`,
    true,
  );
  $("#contract-form").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target,
      b = f.querySelector("button");
    b.disabled = true;
    try {
      await api("/contracts", "POST", Object.fromEntries(new FormData(f)));
      await refresh();
      render();
      closeOverlay();
      toast("Contrato creado y asignado.");
    } catch (err) {
      formError(f, err);
      b.disabled = false;
    }
  };
}
async function init() {
  try {
    const config = await api("/config");
    state.demo = config.demo;
    state.policy = config.policy;
    state.user = (await api("/me")).user;
    await refresh();
    render();
  } catch (e) {
    if (state.user) toast(e.message, true);
    renderLogin();
  }
}
init();
