import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import {
  auditClaim,
  settle,
  validMonth,
  CHECKS,
  OATH_VERSION,
} from "./lib/liquidation.js";
import { bankFile, BANK_PROFILES, relationshipCsv } from "./lib/banks.js";
import { paymentWorkbook } from "./lib/workbook.js";
import {
  parseResults,
  planResults,
  resultsTemplate,
  summarizeResults,
} from "./lib/reconciliation.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const STATES = ["Radicada", "En revisión", "Devuelta", "Aprobada"];
const TYPES = [
  "cuenta",
  "excel",
  "informe",
  "seguridad",
  "banco",
  "identidad",
  "rut",
  "declaracion",
  "paz",
];
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const clean = (value, max = 200) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const hash = (password) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
};
const check = (password, stored) => {
  const [salt, digest] = stored.split(":");
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(digest, "hex"),
  );
};
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isoDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value;
};
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const periodForDate = (date) => date.slice(0, 7);
const safeUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  document: u.document,
  role: u.role,
});
const publicContract = (c) => ({ ...c, active: Boolean(c.active) });

export function createApp(options = {}) {
  const demo = options.demo ?? process.env.DEMO_MODE === "1";
  const policy = JSON.parse(
    readFileSync(
      resolve(process.env.POLICY_FILE ?? join(ROOT, "config", "policy.json")),
      "utf8",
    ),
  );
  const dataDir = resolve(
    options.dataDir ??
      process.env.DATA_DIR ??
      join(ROOT, "data", demo ? "demo" : "live"),
  );
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, "ops.sqlite"));
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, document TEXT NOT NULL, role TEXT NOT NULL, password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS contracts(id INTEGER PRIMARY KEY, number TEXT UNIQUE NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id), object TEXT NOT NULL, supervisor TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, monthly_amount INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS claims(id INTEGER PRIMARY KEY, radicado TEXT UNIQUE, user_id INTEGER NOT NULL REFERENCES users(id), contract_id INTEGER NOT NULL REFERENCES contracts(id), period TEXT NOT NULL, amount INTEGER NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Radicada', created TEXT NOT NULL, updated TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}');
    CREATE TABLE IF NOT EXISTS documents(id INTEGER PRIMARY KEY, claim_id INTEGER NOT NULL REFERENCES claims(id), kind TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, bytes BLOB NOT NULL, UNIQUE(claim_id, kind));
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, claim_id INTEGER NOT NULL REFERENCES claims(id), user_id INTEGER NOT NULL REFERENCES users(id), status TEXT NOT NULL, note TEXT NOT NULL, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audits(claim_id INTEGER PRIMARY KEY REFERENCES claims(id), body TEXT NOT NULL, reviewer_id INTEGER NOT NULL REFERENCES users(id), reviewed_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS lots(id TEXT PRIMARY KEY, period TEXT UNIQUE NOT NULL, created TEXT NOT NULL, creator_id INTEGER NOT NULL REFERENCES users(id), profile TEXT NOT NULL, payer TEXT NOT NULL, report TEXT NOT NULL, snapshot TEXT NOT NULL, hash TEXT NOT NULL, bank_text TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS lot_claims(claim_id INTEGER PRIMARY KEY REFERENCES claims(id), lot_id TEXT NOT NULL REFERENCES lots(id));
    CREATE TABLE IF NOT EXISTS integration_events(id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT UNIQUE NOT NULL, type TEXT NOT NULL, entity_id TEXT NOT NULL, payload TEXT NOT NULL, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS payment_imports(id TEXT PRIMARY KEY, lot_id TEXT NOT NULL REFERENCES lots(id), content_hash TEXT NOT NULL, source_hash TEXT NOT NULL, source_name TEXT NOT NULL, source_mime TEXT NOT NULL, source_bytes BLOB NOT NULL, reviewer_id INTEGER NOT NULL REFERENCES users(id), created TEXT NOT NULL, UNIQUE(lot_id,content_hash));
    CREATE TABLE IF NOT EXISTS payment_results(id INTEGER PRIMARY KEY AUTOINCREMENT, import_id TEXT NOT NULL REFERENCES payment_imports(id), lot_id TEXT NOT NULL REFERENCES lots(id), profile TEXT NOT NULL, document TEXT NOT NULL, amount INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('ACEPTADO','PAGADO','RECHAZADO')), reference TEXT NOT NULL, date TEXT NOT NULL, detail TEXT NOT NULL, UNIQUE(profile,reference,state));
  `);
  // Preserve data from the first local prototype when allowing multiple accounts per month.
  if (
    db
      .prepare("SELECT sql FROM sqlite_master WHERE name='claims'")
      .get()
      .sql.includes("UNIQUE(contract_id, period)")
  ) {
    db.exec(`PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;
      CREATE TABLE claims_new(id INTEGER PRIMARY KEY, radicado TEXT UNIQUE, user_id INTEGER NOT NULL REFERENCES users(id), contract_id INTEGER NOT NULL REFERENCES contracts(id), period TEXT NOT NULL, amount INTEGER NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Radicada', created TEXT NOT NULL, updated TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}');
      INSERT INTO claims_new(id,radicado,user_id,contract_id,period,amount,description,status,created,updated) SELECT id,radicado,user_id,contract_id,period,amount,description,status,created,updated FROM claims;
      DROP TABLE claims; ALTER TABLE claims_new RENAME TO claims; COMMIT; PRAGMA foreign_keys=ON;`);
  }
  const adminEmail = clean(
    options.adminEmail ?? process.env.ADMIN_EMAIL,
  ).toLowerCase();
  const adminPassword = options.adminPassword ?? process.env.ADMIN_PASSWORD;
  const addUser = (name, email, document, role, password) =>
    Number(
      db
        .prepare(
          "INSERT INTO users(name,email,document,role,password) VALUES(?,?,?,?,?)",
        )
        .run(name, email, document, role, hash(password)).lastInsertRowid,
    );
  if (!db.prepare("SELECT id FROM users WHERE role='admin'").get()) {
    if (
      !demo &&
      (!validEmail(adminEmail) ||
        !adminPassword ||
        adminPassword.length < 12 ||
        adminPassword === "replace-with-a-long-unique-password")
    )
      throw new Error(
        "Configura ADMIN_EMAIL y ADMIN_PASSWORD (mínimo 12 caracteres) en .env, o ejecuta npm run demo.",
      );
    addUser(
      "Administración VIVIR",
      demo ? "admin@demo.vivir.local" : adminEmail,
      "",
      "admin",
      demo ? "VivirDemo2026!" : adminPassword,
    );
  }
  if (
    demo &&
    !db
      .prepare(
        "SELECT id FROM users WHERE email='contratista@demo.vivir.local'",
      )
      .get()
  ) {
    const uid = addUser(
      "María Fernanda López",
      "contratista@demo.vivir.local",
      "1000000001",
      "contractor",
      "VivirDemo2026!",
    );
    const year = today().slice(0, 4);
    db.prepare(
      "INSERT INTO contracts(number,user_id,object,supervisor,start,end,monthly_amount) VALUES(?,?,?,?,?,?,?)",
    ).run(
      `OPS-${year}-024`,
      uid,
      "Apoyo a la gestión administrativa y al seguimiento de los programas de VIVIR.",
      "Laura Martínez",
      `${year}-01-01`,
      `${year}-12-31`,
      3500000,
    );
  }
  const attempts = new Map();
  const json = (res, status, obj) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(obj));
  };
  const readBody = async (req) => {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 105 * 1024 * 1024)
        fail(413, "La carga supera el límite permitido.");
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString() || "{}");
    } catch {
      fail(400, "Solicitud inválida.");
    }
  };
  const claimRow = (id) =>
    db
      .prepare(
        `SELECT c.*,u.name AS contractor_name,u.email AS contractor_email,u.document AS contractor_document,t.number AS contract_number,t.object AS contract_object,t.supervisor,t.monthly_amount FROM claims c JOIN users u ON u.id=c.user_id JOIN contracts t ON t.id=c.contract_id WHERE c.id=?`,
      )
      .get(id);
  const claimDetail = (id) => {
    const row = claimRow(id);
    const auditRow = db
      .prepare(
        "SELECT a.*,u.name AS reviewer FROM audits a JOIN users u ON u.id=a.reviewer_id WHERE claim_id=?",
      )
      .get(id);
    const account = db
      .prepare("SELECT bytes FROM documents WHERE claim_id=? AND kind='cuenta'")
      .get(id);
    return {
      ...row,
      metadata: JSON.parse(row.metadata),
      audit: auditRow
        ? {
            ...JSON.parse(auditRow.body),
            reviewer: auditRow.reviewer,
            reviewed_at: auditRow.reviewed_at,
          }
        : null,
      account_hash: account
        ? createHash("sha256").update(account.bytes).digest("hex")
        : null,
      lot_id:
        db.prepare("SELECT lot_id FROM lot_claims WHERE claim_id=?").get(id)
          ?.lot_id || null,
      payment: (() => {
        const result = db
          .prepare(
            "SELECT r.state,r.reference,r.date,r.detail,r.amount FROM payment_results r JOIN lot_claims lc ON lc.lot_id=r.lot_id WHERE lc.claim_id=? AND r.document=? ORDER BY r.id DESC LIMIT 1",
          )
          .get(id, row.contractor_document);
        return result
          ? { ...result, scope: "Consolidado de la persona en el lote" }
          : null;
      })(),
      documents: db
        .prepare(
          "SELECT id,kind,name,mime,length(bytes) AS size FROM documents WHERE claim_id=? ORDER BY id",
        )
        .all(id),
      events: db
        .prepare(
          "SELECT e.*,u.name AS author FROM events e JOIN users u ON u.id=e.user_id WHERE claim_id=? ORDER BY e.id DESC",
        )
        .all(id),
    };
  };
  const allClaims = () =>
    db
      .prepare("SELECT id FROM claims ORDER BY id")
      .all()
      .map((c) => claimDetail(c.id));
  const emit = (type, entityId, payload) =>
    db
      .prepare(
        "INSERT INTO integration_events(event_id,type,entity_id,payload,created) VALUES(?,?,?,?,?)",
      )
      .run(
        randomBytes(16).toString("hex"),
        type,
        String(entityId),
        JSON.stringify(payload),
        new Date().toISOString(),
      );
  const lots = () =>
    db
      .prepare("SELECT * FROM lots ORDER BY period")
      .all()
      .map((l) => ({
        ...l,
        payer: JSON.parse(l.payer),
        report: JSON.parse(l.report),
        snapshot: JSON.parse(l.snapshot),
      }));
  const reconciliation = (l) =>
    summarizeResults(
      l,
      db
        .prepare("SELECT * FROM payment_results WHERE lot_id=? ORDER BY id")
        .all(l.id),
      db
        .prepare("SELECT count(*) AS n FROM payment_imports WHERE lot_id=?")
        .get(l.id).n,
    );
  const publicLot = (l) => ({
    id: l.id,
    period: l.period,
    created: l.created,
    profile: l.profile,
    hash: l.hash,
    total: l.report.totals.net,
    count: l.report.rows.length,
    state: reconciliation(l).state,
  });
  const reconciliationPlan = (l, csv) => {
    const report = reconciliation(l);
    const plan = planResults(
      l,
      parseResults(csv),
      report.rows.filter((x) => x.state !== "PENDIENTE"),
      today(),
    );
    const references = new Set();
    for (const r of plan.records) {
      if (references.has(r.reference))
        plan.issues.push({
          document: r.document,
          message:
            "La referencia del movimiento está repetida para dos beneficiarios.",
        });
      references.add(r.reference);
      const prior = db
        .prepare(
          "SELECT lot_id,document,amount FROM payment_results WHERE profile=? AND reference=? LIMIT 1",
        )
        .get(BANK_PROFILES.find((p) => p.id === l.profile).bank, r.reference);
      if (
        prior &&
        (prior.lot_id !== l.id ||
          prior.document !== r.document ||
          prior.amount !== r.amount)
      )
        plan.issues.push({
          document: r.document,
          message:
            "La referencia bancaria ya corresponde a otro pago registrado.",
        });
    }
    return {
      ...plan,
      ready: plan.issues.length === 0,
      version: report.version,
      snapshot_hash: l.hash,
    };
  };
  const importsFor = (id) =>
    db
      .prepare(
        "SELECT p.id,p.source_name,p.source_hash,p.created,u.name AS reviewer FROM payment_imports p JOIN users u ON u.id=p.reviewer_id WHERE p.lot_id=? ORDER BY p.created,p.id",
      )
      .all(id);
  const paymentSource = (source) => {
    if (
      !source ||
      typeof source.content !== "string" ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(source.content) ||
      source.content.length > 12_000_000
    )
      fail(
        400,
        "Adjunta el resultado original del banco como PDF o CSV, hasta 8 MB.",
      );
    const bytes = Buffer.from(source.content, "base64");
    if (!bytes.length || bytes.length > 8 * 1024 * 1024)
      fail(400, "El soporte bancario debe pesar entre 1 byte y 8 MB.");
    // eslint-disable-next-line no-control-regex -- se sustituyen caracteres de control a propósito.
    const name = clean(source.name, 120).replace(/[\x00-\x1f/\\]/g, "_");
    const pdf =
      name.toLowerCase().endsWith(".pdf") &&
      bytes.subarray(0, 5).toString() === "%PDF-";
    const csv =
      name.toLowerCase().endsWith(".csv") &&
      !bytes.includes(0) &&
      Buffer.from(bytes.toString("utf8")).equals(bytes);
    if (!pdf && !csv)
      fail(400, "El soporte debe ser un PDF o CSV UTF-8 auténtico.");
    return {
      bytes,
      name,
      mime: pdf ? "application/pdf" : "text/csv; charset=utf-8",
      hash: createHash("sha256").update(bytes).digest("hex"),
    };
  };
  const download = (res, bytes, name, type) => {
    res.writeHead(200, {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    });
    res.end(bytes);
  };
  const reviewBody = (b) => {
    if (
      !b ||
      typeof b !== "object" ||
      Array.isArray(b) ||
      JSON.stringify(b).length > 40000
    )
      fail(400, "Auditoría inválida.");
    const number = (v, integer = false) => {
      if (v === null || v === undefined || v === "") return null;
      if (
        typeof v !== "number" ||
        !Number.isFinite(v) ||
        v < 0 ||
        v > 1e12 ||
        (integer && !Number.isSafeInteger(v))
      )
        fail(
          400,
          "Valores de auditoría deben ser números no negativos; importes en pesos enteros.",
        );
      return v;
    };
    if (b.tax_month && !validMonth(b.tax_month))
      fail(400, "Mes fiscal inválido.");
    const out = {
      tax_month: clean(b.tax_month, 7),
      tax_method: clean(b.tax_method, 30),
      general_rate: number(b.general_rate),
      bank_code: clean(b.bank_code, 9),
      checks: Object.fromEntries(
        Object.keys(CHECKS).map((k) => [k, b.checks?.[k] === true]),
      ),
      evidence: clean(b.evidence, 3000),
      tax_source: clean(b.tax_source, 2000),
      declaration_verified: b.declaration_verified === true,
      monthly_payment_verified: b.monthly_payment_verified === true,
      annual_exemption_opening: number(b.annual_exemption_opening, true),
      annual_relief_opening: number(b.annual_relief_opening, true),
      annual_source: clean(b.annual_source, 2000),
      iva_mode: clean(b.iva_mode, 30),
      iva_source: clean(b.iva_source, 2000),
      iva_rate: number(b.iva_rate),
      reteiva_rate: number(b.reteiva_rate),
      maintenance: number(b.maintenance, true) ?? 0,
      other_discount: number(b.other_discount, true) ?? 0,
      discount_source: clean(b.discount_source, 2000),
      other_deductions: number(b.other_deductions, true) ?? 0,
      deductions: {
        dependents: b.deductions?.dependents === true,
        housing_interest: number(b.deductions?.housing_interest, true) ?? 0,
        prepaid_health: number(b.deductions?.prepaid_health, true) ?? 0,
        verified: b.deductions?.verified === true,
        source: clean(b.deductions?.source, 2000),
      },
    };
    if (!Array.isArray(b.lines) || b.lines.length > 30)
      fail(400, "Incluye la revisión de los renglones de servicio.");
    out.lines = b.lines.map((l) => ({
      glosa: number(l.glosa, true) ?? 0,
      glosa_reason: clean(l.glosa_reason, 1000),
      ica_mode: clean(l.ica_mode, 30),
      ica_rate: number(l.ica_rate),
      minimum_base: number(l.minimum_base, true),
      minimum_scope: clean(l.minimum_scope, 30),
      agent_verified: l.agent_verified === true,
      activity: clean(l.activity, 1000),
      ica_source: clean(l.ica_source, 2000),
    }));
    if (b.pila?.reference)
      out.pila = {
        reference: clean(b.pila.reference, 100),
        period: clean(b.pila.period, 7),
        verified: b.pila.verified === true,
        paid: b.pila.paid === true,
        arl_verified: b.pila.arl_verified === true,
        ibc: number(b.pila.ibc, true),
        health: number(b.pila.health, true),
        pension: number(b.pila.pension, true),
      };
    return out;
  };
  const owns = (user, claim) => {
    if (!claim) fail(404, "Cuenta no encontrada.");
    if (user.role !== "admin" && user.id !== claim.user_id)
      fail(403, "No tienes acceso a esta cuenta.");
  };
  const validateDocuments = (docs) => {
    if (
      !Array.isArray(docs) ||
      docs.length < 4 ||
      docs.length > TYPES.length ||
      new Set(docs.map((d) => d.kind)).size !== docs.length ||
      !["cuenta", "informe", "banco", "rut"].every((kind) =>
        docs.some((d) => d.kind === kind),
      )
    )
      fail(
        400,
        "Adjunta el documento de cobro, la bitácora o listado, la certificación bancaria y el RUT.",
      );
    return docs.map((d) => {
      if (
        !TYPES.includes(d.kind) ||
        typeof d.content !== "string" ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(d.content)
      )
        fail(400, "Soporte inválido.");
      const bytes = Buffer.from(d.content, "base64");
      if (!bytes.length || bytes.length > 8 * 1024 * 1024)
        fail(400, "Cada archivo debe pesar entre 1 byte y 8 MB.");
      const pdf = bytes.subarray(0, 5).toString() === "%PDF-";
      const xlsx =
        bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4])) &&
        bytes.includes(Buffer.from("xl/workbook.xml")) &&
        bytes.includes(Buffer.from("[Content_Types].xml"));
      const macro = clean(d.name).toLowerCase().endsWith(".xlsm");
      const mime =
        d.kind === "excel"
          ? xlsx
            ? macro
              ? "application/vnd.ms-excel.sheet.macroEnabled.12"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : null
          : pdf
            ? "application/pdf"
            : null;
      if (!mime)
        fail(
          400,
          "Los soportes deben ser PDF. La cuenta en Excel debe ser .xlsx o .xlsm auténtico.",
        );
      return {
        kind: d.kind,
        // eslint-disable-next-line no-control-regex -- se sustituyen caracteres de control a propósito.
        name: clean(d.name, 120).replace(/[\x00-\x1f/\\]/g, "_") || "soporte",
        mime,
        bytes,
      };
    });
  };
  const handler = async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    try {
      const url = new URL(req.url, "http://localhost");
      const path = url.pathname;
      const method = req.method;
      if (!["GET", "HEAD"].includes(method)) {
        if (req.headers["x-ops-request"] !== "1")
          fail(403, "Solicitud no autorizada.");
        if (
          req.headers.origin &&
          new URL(req.headers.origin).host !== req.headers.host
        )
          fail(403, "Origen no autorizado.");
        if (!(req.headers["content-type"] || "").startsWith("application/json"))
          fail(415, "Se requiere JSON.");
      }
      if (path === "/api/config" && method === "GET")
        return json(res, 200, { demo, policy });
      if (path === "/api/login" && method === "POST") {
        const body = await readBody(req);
        const email = clean(body.email).toLowerCase();
        const key = `${req.socket.remoteAddress}:${email}`;
        const attempt = attempts.get(key) ?? {
          count: 0,
          until: Date.now() + 900000,
        };
        if (attempt.until < Date.now()) {
          attempt.count = 0;
          attempt.until = Date.now() + 900000;
        }
        if (attempt.count >= 10)
          fail(429, "Demasiados intentos. Intenta nuevamente en 15 minutos.");
        const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
        if (
          typeof body.password !== "string" ||
          body.password.length > 200 ||
          !user ||
          !check(body.password, user.password)
        ) {
          attempt.count++;
          attempts.set(key, attempt);
          fail(401, "Correo o contraseña incorrectos.");
        }
        attempts.delete(key);
        db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
        const token = randomBytes(32).toString("hex");
        db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
          token,
          user.id,
          Date.now() + 8 * 3600000,
        );
        res.setHeader(
          "Set-Cookie",
          `ops_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${process.env.COOKIE_SECURE === "1" ? "; Secure" : ""}`,
        );
        return json(res, 200, { user: safeUser(user) });
      }
      if (path.startsWith("/api/")) {
        const token =
          (req.headers.cookie ?? "")
            .split(";")
            .map((s) => s.trim())
            .find((s) => s.startsWith("ops_session="))
            ?.slice(12) ?? "";
        const user = db
          .prepare(
            "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?",
          )
          .get(token, Date.now());
        if (!user) fail(401, "Inicia sesión para continuar.");
        if (path === "/api/me" && method === "GET")
          return json(res, 200, { user: safeUser(user) });
        if (path === "/api/logout" && method === "POST") {
          db.prepare("DELETE FROM sessions WHERE token=?").run(token);
          res.setHeader(
            "Set-Cookie",
            "ops_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
          );
          return json(res, 200, { ok: true });
        }
        if (path === "/api/users" && method === "GET") {
          if (user.role !== "admin")
            fail(403, "Acceso reservado a administración.");
          return json(res, 200, {
            users: db
              .prepare(
                "SELECT id,name,email,document,role FROM users WHERE role='contractor' ORDER BY name",
              )
              .all(),
          });
        }
        if (path === "/api/users" && method === "POST") {
          if (user.role !== "admin")
            fail(403, "Acceso reservado a administración.");
          const b = await readBody(req);
          const email = clean(b.email).toLowerCase();
          if (
            !clean(b.name) ||
            !/^\d{5,15}$/.test(clean(b.document)) ||
            !validEmail(email) ||
            typeof b.password !== "string" ||
            b.password.length < 12 ||
            b.password.length > 200
          )
            fail(
              400,
              "Revisa nombre, documento, correo y contraseña (mínimo 12 caracteres).",
            );
          if (
            db
              .prepare("SELECT id FROM users WHERE email=? OR document=?")
              .get(email, clean(b.document))
          )
            fail(409, "Ya existe un contratista con ese correo o documento.");
          const id = addUser(
            clean(b.name),
            email,
            clean(b.document),
            "contractor",
            b.password,
          );
          return json(res, 201, {
            user: safeUser(
              db.prepare("SELECT * FROM users WHERE id=?").get(id),
            ),
          });
        }
        if (path === "/api/contracts" && method === "GET") {
          const rows = db
            .prepare(
              `SELECT t.*,u.name AS contractor_name FROM contracts t JOIN users u ON u.id=t.user_id ${user.role === "admin" ? "" : "WHERE t.user_id=?"} ORDER BY t.id DESC`,
            )
            .all(...(user.role === "admin" ? [] : [user.id]));
          return json(res, 200, { contracts: rows.map(publicContract) });
        }
        if (path === "/api/contracts" && method === "POST") {
          if (user.role !== "admin")
            fail(403, "Acceso reservado a administración.");
          const b = await readBody(req);
          const amount = Number(b.monthly_amount);
          if (
            !clean(b.number) ||
            !clean(b.object, 2000) ||
            !clean(b.supervisor) ||
            !db
              .prepare("SELECT id FROM users WHERE id=? AND role='contractor'")
              .get(Number(b.user_id)) ||
            !isoDate(b.start) ||
            !isoDate(b.end) ||
            b.start > b.end ||
            !Number.isSafeInteger(amount) ||
            amount <= 0 ||
            amount > 1000000000
          )
            fail(400, "Revisa los datos, fechas y valor del contrato.");
          if (
            db
              .prepare("SELECT id FROM contracts WHERE number=?")
              .get(clean(b.number))
          )
            fail(409, "Ese número de contrato ya existe.");
          const id = Number(
            db
              .prepare(
                "INSERT INTO contracts(number,user_id,object,supervisor,start,end,monthly_amount) VALUES(?,?,?,?,?,?,?)",
              )
              .run(
                clean(b.number),
                Number(b.user_id),
                clean(b.object, 2000),
                clean(b.supervisor),
                b.start,
                b.end,
                amount,
              ).lastInsertRowid,
          );
          return json(res, 201, {
            contract: publicContract(
              db.prepare("SELECT * FROM contracts WHERE id=?").get(id),
            ),
          });
        }
        if (path === "/api/claims" && method === "GET") {
          const ids = db
            .prepare(
              `SELECT id FROM claims ${user.role === "admin" ? "" : "WHERE user_id=?"} ORDER BY id DESC`,
            )
            .all(...(user.role === "admin" ? [] : [user.id]));
          return json(res, 200, { claims: ids.map((c) => claimDetail(c.id)) });
        }
        if (path === "/api/integration/events" && method === "GET") {
          if (user.role !== "admin")
            fail(403, "Integración reservada a administración.");
          const after = Number(url.searchParams.get("after") || 0),
            limit = Number(url.searchParams.get("limit") || 100);
          if (
            !Number.isSafeInteger(after) ||
            after < 0 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 500
          )
            fail(400, "Cursor o límite inválido.");
          const events = db
            .prepare(
              "SELECT * FROM integration_events WHERE id>? ORDER BY id LIMIT ?",
            )
            .all(after, limit)
            .map((e) => ({
              cursor: e.id,
              id: e.event_id,
              module: "guia.ops",
              schema_version: 1,
              type: e.type,
              entity_id: e.entity_id,
              payload: JSON.parse(e.payload),
              occurred_at: e.created,
            }));
          return json(res, 200, {
            events,
            next_cursor: events.at(-1)?.cursor || after,
          });
        }
        if (
          path.startsWith("/api/settlements") ||
          path.startsWith("/api/lots") ||
          path === "/api/bank-profiles" ||
          /^\/api\/claims\/\d+\/audit$/.test(path)
        ) {
          if (user.role !== "admin")
            fail(403, "Acceso reservado a contabilidad y tesorería.");
          if (path === "/api/bank-profiles" && method === "GET")
            return json(res, 200, {
              profiles: BANK_PROFILES,
              checks: CHECKS,
              module: {
                id: "guia.ops",
                api_version: "v1",
                integration: "docs/INTEGRACION_RCM.md",
              },
            });
          const auditMatch = path.match(/^\/api\/claims\/(\d+)\/audit$/);
          if (auditMatch && method === "PUT") {
            owns(user, claimRow(Number(auditMatch[1])));
            const c = claimDetail(Number(auditMatch[1]));
            if (!["Radicada", "En revisión"].includes(c.status) || c.lot_id)
              fail(
                409,
                "La auditoría solo puede editarse antes de aprobar o reservar para pago.",
              );
            const audit = reviewBody(await readBody(req));
            if (
              db
                .prepare("SELECT id FROM lots WHERE period=?")
                .get(audit.tax_month)
            )
              fail(
                409,
                "El mes fiscal ya está reservado en un lote. Requiere conciliación; no se agregan cuentas después del cierre.",
              );
            db.exec("BEGIN IMMEDIATE");
            try {
              db.prepare(
                "INSERT INTO audits(claim_id,body,reviewer_id,reviewed_at) VALUES(?,?,?,?) ON CONFLICT(claim_id) DO UPDATE SET body=excluded.body,reviewer_id=excluded.reviewer_id,reviewed_at=excluded.reviewed_at",
              ).run(
                c.id,
                JSON.stringify(audit),
                user.id,
                new Date().toISOString(),
              );
              emit("ops.audit.updated", c.id, {
                claim_id: c.id,
                tax_month: audit.tax_month,
                reviewer_id: user.id,
              });
              db.exec("COMMIT");
            } catch (e) {
              db.exec("ROLLBACK");
              throw e;
            }
            const updated = claimDetail(c.id);
            return json(res, 200, {
              claim: updated,
              validation: auditClaim(updated, policy),
            });
          }
          if (path === "/api/lots" && method === "GET")
            return json(res, 200, { lots: lots().map(publicLot) });
          const reconciliationMatch = path.match(
            /^\/api\/lots\/([A-Za-z0-9-]+)\/reconciliation(?:\/(preview|template|imports\/([a-f0-9-]+)\/source))?$/,
          );
          if (reconciliationMatch) {
            const l = lots().find((x) => x.id === reconciliationMatch[1]);
            if (!l) fail(404, "Lote no encontrado.");
            const action = reconciliationMatch[2];
            if (!action && method === "GET")
              return json(res, 200, {
                report: reconciliation(l),
                imports: importsFor(l.id),
              });
            if (action === "template" && method === "GET")
              return download(
                res,
                resultsTemplate(l),
                `${l.id}-CONCILIACION.csv`,
                "text/csv; charset=utf-8",
              );
            if (action?.startsWith("imports/") && method === "GET") {
              const source = db
                .prepare(
                  "SELECT * FROM payment_imports WHERE id=? AND lot_id=?",
                )
                .get(reconciliationMatch[3], l.id);
              if (!source) fail(404, "Soporte bancario no encontrado.");
              res.writeHead(200, {
                "Content-Type": source.source_mime,
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(source.source_name)}`,
                "Cache-Control": "no-store",
              });
              return res.end(Buffer.from(source.source_bytes));
            }
            if (method === "POST" && (!action || action === "preview")) {
              const b = await readBody(req);
              if (!b || typeof b !== "object" || Array.isArray(b))
                fail(400, "Solicitud de conciliación inválida.");
              if (action === "preview")
                return json(res, 200, { plan: reconciliationPlan(l, b.csv) });
              if (
                b.confirmed !== true ||
                !Number.isSafeInteger(b.expected_version) ||
                b.expected_version < 0 ||
                typeof b.import_id !== "string" ||
                !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
                  b.import_id,
                )
              )
                fail(
                  400,
                  "Revisa la vista previa y confirma el resultado contrastado con el banco.",
                );
              const source = paymentSource(b.source);
              // Stable ordering gives identical retries the same fingerprint without storing duplicate results.
              const records = parseResults(b.csv);
              const canonical = planResults(
                l,
                records,
                [],
                today(),
              ).records.sort((a, b) => a.document.localeCompare(b.document));
              const contentHash = createHash("sha256")
                .update(
                  JSON.stringify({
                    records: canonical,
                    source_hash: source.hash,
                  }),
                )
                .digest("hex");
              db.exec("BEGIN IMMEDIATE");
              try {
                const previous = db
                  .prepare(
                    "SELECT id,lot_id,content_hash FROM payment_imports WHERE id=? OR (lot_id=? AND content_hash=?) ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END LIMIT 1",
                  )
                  .get(b.import_id, l.id, contentHash, b.import_id);
                if (previous) {
                  if (
                    previous.lot_id !== l.id ||
                    previous.content_hash !== contentHash
                  )
                    fail(
                      409,
                      "Esta clave de importación ya se usó con otro resultado.",
                    );
                  db.exec("COMMIT");
                  return json(res, 200, {
                    report: reconciliation(l),
                    imports: importsFor(l.id),
                    replayed: true,
                  });
                }
                const plan = reconciliationPlan(l, b.csv);
                if (plan.version !== b.expected_version)
                  fail(
                    409,
                    "Otro usuario registró resultados. Recarga la conciliación y revisa una nueva vista previa.",
                  );
                if (!plan.ready)
                  fail(
                    409,
                    plan.issues
                      .map((x) => `${x.document}: ${x.message}`)
                      .join(" "),
                  );
                if (!plan.changes.length) {
                  db.exec("COMMIT");
                  return json(res, 200, {
                    report: reconciliation(l),
                    imports: importsFor(l.id),
                    replayed: true,
                  });
                }
                const created = new Date().toISOString();
                db.prepare(
                  "INSERT INTO payment_imports VALUES(?,?,?,?,?,?,?,?,?)",
                ).run(
                  b.import_id,
                  l.id,
                  contentHash,
                  source.hash,
                  source.name,
                  source.mime,
                  source.bytes,
                  user.id,
                  created,
                );
                for (const r of plan.changes) {
                  db.prepare(
                    "INSERT INTO payment_results(import_id,lot_id,profile,document,amount,state,reference,date,detail) VALUES(?,?,?,?,?,?,?,?,?)",
                  ).run(
                    b.import_id,
                    l.id,
                    BANK_PROFILES.find((p) => p.id === l.profile).bank,
                    r.document,
                    r.amount,
                    r.state,
                    r.reference,
                    r.date,
                    r.detail,
                  );
                  emit("ops.payment.result_recorded", l.id, {
                    lot_id: l.id,
                    document: r.document,
                    claim_ids: r.claim_ids,
                    amount: r.amount,
                    state: r.state,
                    previous_state: r.previous_state,
                    reference: r.reference,
                    date: r.date,
                    import_id: b.import_id,
                    source_hash: source.hash,
                    snapshot_hash: l.hash,
                    reviewer_id: user.id,
                  });
                }
                db.exec("COMMIT");
                return json(res, 201, {
                  report: reconciliation(l),
                  imports: importsFor(l.id),
                  replayed: false,
                });
              } catch (e) {
                db.exec("ROLLBACK");
                throw e;
              }
            }
          }
          if (
            (path === "/api/settlements" && method === "GET") ||
            (path === "/api/settlements/workbook" && method === "GET")
          ) {
            const period = url.searchParams.get("period");
            if (!validMonth(period))
              fail(400, "Selecciona el mes del pago o abono en cuenta.");
            const prior = lots(),
              existing = prior.find((l) => l.period === period),
              accounts = allClaims();
            const report =
              existing?.report || settle(accounts, period, policy, prior);
            if (path.endsWith("/workbook"))
              return download(
                res,
                await paymentWorkbook(
                  report,
                  existing?.snapshot || accounts,
                  existing,
                ),
                `GUIA-OPS-${period}${existing ? "-LOTE" : "-PREVIA"}.xlsx`,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              );
            return json(res, 200, {
              report,
              lot: existing ? publicLot(existing) : null,
            });
          }
          if (path === "/api/lots" && method === "POST") {
            const b = await readBody(req);
            if (!validMonth(b.period) || b.confirmed !== true)
              fail(400, "Confirma el cierre mensual y sus cuentas revisadas.");
            if (db.prepare("SELECT id FROM lots WHERE period=?").get(b.period))
              fail(
                409,
                "El mes ya tiene un lote. Descarga el mismo archivo para evitar generar un segundo pago.",
              );
            const accounts = allClaims(),
              prior = lots(),
              report = settle(accounts, b.period, policy, prior);
            if (!report.ready)
              fail(
                409,
                "Resuelve los hallazgos de auditoría y liquidación de todas las personas del mes.",
              );
            const payer = b.payer || {};
            if (payer.transmission_date !== today())
              fail(400, "La fecha de transmisión debe ser hoy en Colombia.");
            const file = bankFile(report, b.profile, payer);
            const snapshot = accounts.filter((c) =>
              report.rows.some((r) => r.claim_ids.includes(c.id)),
            );
            const id = `OPS-${b.period}-${randomBytes(4).toString("hex")}`,
              created = new Date().toISOString();
            const frozen = {
              id,
              period: b.period,
              created,
              profile: b.profile,
              payer,
              report,
              snapshot,
            };
            const digest = createHash("sha256")
              .update(JSON.stringify(frozen))
              .update(file.text)
              .digest("hex");
            db.exec("BEGIN IMMEDIATE");
            try {
              db.prepare("INSERT INTO lots VALUES(?,?,?,?,?,?,?,?,?,?)").run(
                id,
                b.period,
                created,
                user.id,
                b.profile,
                JSON.stringify(payer),
                JSON.stringify(report),
                JSON.stringify(snapshot),
                digest,
                file.text,
              );
              // Unique claim IDs guarantee that the same account cannot be reserved twice.
              for (const c of snapshot)
                db.prepare("INSERT INTO lot_claims VALUES(?,?)").run(c.id, id);
              emit("ops.payment_batch.prepared", id, {
                lot_id: id,
                tax_month: b.period,
                claim_ids: snapshot.map((c) => c.id),
                amount: report.totals.net,
                snapshot_hash: digest,
              });
              db.exec("COMMIT");
            } catch (e) {
              db.exec("ROLLBACK");
              throw e;
            }
            return json(res, 201, {
              lot: publicLot({ ...frozen, hash: digest }),
              report,
            });
          }
          const lotMatch = path.match(
            /^\/api\/lots\/([A-Za-z0-9-]+)\/(bank|package)$/,
          );
          if (lotMatch && method === "GET") {
            const l = lots().find((x) => x.id === lotMatch[1]);
            if (!l) fail(404, "Lote no encontrado.");
            if (lotMatch[2] === "bank")
              return download(
                res,
                l.bank_text,
                `${l.id}-${l.profile}.txt`,
                "text/plain; charset=us-ascii",
              );
            const zip = new JSZip();
            zip.file(
              "01-CUADRO-AUDITADO.xlsx",
              await paymentWorkbook(l.report, l.snapshot, l),
            );
            zip.file(`02-${l.profile}.txt`, l.bank_text);
            zip.file(
              "03-DISPERSION-CONTROL.csv",
              relationshipCsv(l.report.rows),
            );
            const groups = new Map();
            for (const row of l.report.rows) {
              if (!groups.has(row.bank.name)) groups.set(row.bank.name, []);
              groups.get(row.bank.name).push(row);
            }
            let i = 0;
            for (const [name, rows] of groups)
              zip.file(
                `BANCOS-DESTINO/${++i}-${name.replace(/[^\p{L}\p{N} ]/gu, "").slice(0, 50)}-RELACION.csv`,
                relationshipCsv(rows),
              );
            zip.file(
              "04-AUDITORIA.json",
              JSON.stringify(
                { module: "guia.ops", version: 1, ...l, bank_text: undefined },
                null,
                2,
              ),
            );
            zip.file("05-PLANTILLA-CONCILIACION.csv", resultsTemplate(l));
            zip.file(
              "06-ESTADO-CONCILIACION.json",
              JSON.stringify(
                {
                  module: "guia.ops",
                  version: 1,
                  as_of: new Date().toISOString(),
                  report: reconciliation(l),
                  imports: importsFor(l.id),
                },
                null,
                2,
              ),
            );
            zip.file(
              "LEEME.txt",
              (demo
                ? "DEMOSTRACIÓN FICTICIA: verificaciones simuladas, sin soportes reales. NO CARGAR ESTOS ARCHIVOS AL BANCO.\n\n"
                : "") +
                "Lote reservado para preparar pago; no confirma giro. El plano nativo corresponde al banco PAGADOR, incluye transferencias a otros bancos. Las relaciones por banco DESTINO son controles, no planos nativos. Transmitir una sola vez; verificar fecha, convenio, beneficiarios y resultado del banco. Datos y fórmulas son una fotografía del cierre. No se recalculan los lotes históricos.",
            );
            return download(
              res,
              await zip.generateAsync({
                type: "nodebuffer",
                compression: "DEFLATE",
              }),
              `${l.id}.zip`,
              "application/zip",
            );
          }
        }
        const claimMatch = path.match(/^\/api\/claims\/(\d+)$/);
        if (claimMatch && method === "GET") {
          const c = claimRow(Number(claimMatch[1]));
          owns(user, c);
          return json(res, 200, { claim: claimDetail(c.id) });
        }
        if (
          (path === "/api/claims" && method === "POST") ||
          (claimMatch && method === "PUT")
        ) {
          if (user.role !== "contractor")
            fail(403, "Solo un contratista puede radicar cuentas.");
          const b = await readBody(req);
          const existing = claimMatch ? claimRow(Number(claimMatch[1])) : null;
          if (claimMatch) {
            owns(user, existing);
            if (existing.status !== "Devuelta")
              fail(409, "Solo se pueden corregir cuentas devueltas.");
          }
          const c = db
            .prepare(
              "SELECT * FROM contracts WHERE id=? AND user_id=? AND active=1",
            )
            .get(Number(b.contract_id), user.id);
          const amount = Number(b.amount),
            period = clean(b.period);
          if (
            !c ||
            !/^\d{4}-(0[1-9]|1[0-2])$/.test(period) ||
            period < periodForDate(c.start) ||
            period > periodForDate(c.end) ||
            period > periodForDate(today()) ||
            !Number.isSafeInteger(amount) ||
            amount <= 0 ||
            amount > 1000000000 ||
            clean(b.description, 3000).length < 10
          )
            fail(400, "Revisa contrato, periodo, actividades y valor.");
          if (
            existing &&
            (existing.contract_id !== c.id || existing.period !== period)
          )
            fail(
              400,
              "La corrección debe conservar el contrato y periodo originales.",
            );
          const info = b.metadata;
          if (
            !info ||
            !Array.isArray(info.lines) ||
            !info.lines.length ||
            info.lines.length > 30
          )
            fail(400, "Agrega al menos un servicio a la cuenta (máximo 30).");
          const lines = info.lines.map((l) => ({
            department: clean(l.department),
            city: clean(l.city),
            entity: clean(l.entity),
            modality: clean(l.modality),
            program: clean(l.program),
            service: clean(l.service),
            quantity: Number(l.quantity),
            unit_price: Number(l.unit_price),
          }));
          if (
            lines.some(
              (l) =>
                !l.department ||
                !l.city ||
                !l.entity ||
                !l.program ||
                !l.service ||
                ![
                  "Presencial",
                  "Teleconsulta",
                  "Domiciliaria",
                  "Otra",
                ].includes(l.modality) ||
                !Number.isFinite(l.quantity) ||
                l.quantity <= 0 ||
                l.quantity > 100000 ||
                !Number.isSafeInteger(l.unit_price) ||
                l.unit_price <= 0 ||
                l.unit_price > 1000000000,
            )
          )
            fail(
              400,
              "Completa los datos, cantidad y tarifa de cada servicio.",
            );
          lines.forEach(
            (l) => (l.subtotal = Math.round(l.quantity * l.unit_price)),
          );
          if (lines.reduce((sum, l) => sum + l.subtotal, 0) !== amount)
            fail(
              400,
              "El valor de la cuenta debe coincidir con la suma de los servicios.",
            );
          const bank = {
            name: clean(info.bank?.name),
            type: clean(info.bank?.type),
            number: clean(info.bank?.number),
            holder: clean(info.bank?.holder),
            document: clean(info.bank?.document),
          };
          if (
            !bank.name ||
            !["Ahorros", "Corriente", "Depósito electrónico"].includes(
              bank.type,
            ) ||
            !/^\d{6,30}$/.test(bank.number) ||
            !bank.holder ||
            !/^\d{5,15}$/.test(bank.document) ||
            !clean(info.profession)
          )
            fail(
              400,
              "Completa profesión y datos bancarios. Conserva los ceros del número de cuenta.",
            );
          if (
            !["Natural", "Jurídica"].includes(info.person_type) ||
            !["Ordinario", "Simple"].includes(info.tax_regime)
          )
            fail(400, "Selecciona tipo de persona y régimen tributario.");
          if (
            !["Cuenta de cobro", "Factura electrónica"].includes(
              info.document_type,
            )
          )
            fail(400, "Selecciona cuenta de cobro o factura electrónica.");
          const annual = policy.years[period.slice(0, 4)];
          if (
            !annual ||
            !Number.isSafeInteger(annual.smmlv) ||
            annual.smmlv <= 0
          )
            fail(
              400,
              "Administración debe configurar los parámetros del año del periodo cobrado.",
            );
          // Oath v2: answered by every natural person (cuenta de cobro or
          // factura), because it defines the withholding method: table 383 by
          // default, 25 % only with the sworn manifestation (q3), general rate
          // only with the written option for costs (q4). No defaults.
          const natural = info.person_type === "Natural";
          const oath = natural
            ? Object.fromEntries(
                ["q1", "q2", "q3", "q4", "q5"].map((k) => [k, info.oath?.[k]]),
              )
            : {};
          if (
            natural &&
            !Object.values(oath).every((v) => ["SI", "NO"].includes(v))
          )
            fail(
              400,
              "Responde SI o NO en los cinco numerales del juramento tributario.",
            );
          if (
            info.document_type === "Cuenta de cobro" &&
            (info.person_type === "Jurídica" || oath.q2 === "SI")
          )
            fail(
              400,
              "Con la información declarada debes seleccionar factura electrónica, según el instructivo de VIVIR.",
            );
          if (oath.q3 === "SI" && oath.q4 === "SI")
            fail(
              400,
              "Los numerales 3 y 4 son excluyentes: la renta exenta del 25 % exige no restar costos ni gastos. Responde SI solo en uno de ellos.",
            );
          if (info.document_type === "Factura electrónica" && !clean(info.cufe))
            fail(400, "Registra el CUFE de la factura electrónica.");
          const metadata = {
            lines,
            bank,
            profession: clean(info.profession),
            person_type: info.person_type,
            tax_regime: info.tax_regime,
            document_type: info.document_type,
            cufe: clean(info.cufe),
            oath,
            oath_version: OATH_VERSION,
            declares_income: oath.q1 === "SI",
            sworn_exemption: oath.q3 === "SI",
            costs_option: oath.q4 === "SI",
          };
          const normalize = (s) =>
            s
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
              .trim();
          const footprint = (rows) =>
            [...new Set(rows.map((l) => normalize(l.city)))].sort().join("|");
          if (
            !existing &&
            db
              .prepare(
                "SELECT metadata,amount FROM claims WHERE user_id=? AND period=?",
              )
              .all(user.id, period)
              .some(
                (previous) =>
                  previous.amount === amount &&
                  footprint(JSON.parse(previous.metadata).lines ?? []) ===
                    footprint(lines),
              )
          )
            fail(
              409,
              "Posible duplicado: ya existe una cuenta de este periodo con el mismo contratista, municipio y valor. Revisa tus radicaciones.",
            );
          const documents = validateDocuments(b.documents);
          if (
            metadata.document_type === "Cuenta de cobro" &&
            !["excel", "identidad"].every((kind) =>
              documents.some((d) => d.kind === kind),
            )
          )
            fail(
              400,
              "Adjunta la cuenta firmada en PDF, el Excel diligenciado y el documento de identidad.",
            );
          if (
            metadata.person_type === "Natural" &&
            amount > annual.smmlv &&
            !documents.some((d) => d.kind === "seguridad")
          )
            fail(
              400,
              "El instructivo exige PILA para una cuenta de persona natural superior a un SMMLV.",
            );
          if (
            metadata.sworn_exemption &&
            !documents.some((d) => d.kind === "declaracion")
          )
            fail(
              400,
              "Elegiste la renta exenta del 25 % (numeral 3): adjunta la declaración juramentada (Anexo 1) firmada en PDF.",
            );
          const names = {
            cuenta:
              metadata.document_type === "Factura electrónica"
                ? "FACTURA ELECTRONICA"
                : "CUENTA DE COBRO",
            excel: "CUENTA DE COBRO",
            informe: "BITACORAS O LISTADO",
            seguridad: "PILA",
            banco: "CERTIFICADO BANCARIO",
            identidad: "CEDULA",
            rut: "RUT",
            declaracion: "DECLARACION JURAMENTADA",
            paz: "PAZ Y SALVO",
          };
          documents.forEach((d) => {
            const extension =
              d.kind === "excel"
                ? d.mime.includes("macroEnabled")
                  ? "xlsm"
                  : "xlsx"
                : "pdf";
            d.name = `${metadata.document_type === "Factura electrónica" ? "NIT" : "CC"}${user.document} ${names[d.kind]}.${extension}`;
          });
          const now = new Date().toISOString();
          let id;
          db.exec("BEGIN IMMEDIATE");
          try {
            if (existing) {
              id = existing.id;
              db.prepare(
                "UPDATE claims SET amount=?,description=?,metadata=?,status='Radicada',updated=? WHERE id=?",
              ).run(
                amount,
                clean(b.description, 3000),
                JSON.stringify(metadata),
                now,
                id,
              );
              db.prepare("DELETE FROM documents WHERE claim_id=?").run(id);
              db.prepare("DELETE FROM audits WHERE claim_id=?").run(id);
            } else {
              id = Number(
                db
                  .prepare(
                    "INSERT INTO claims(user_id,contract_id,period,amount,description,metadata,created,updated) VALUES(?,?,?,?,?,?,?,?)",
                  )
                  .run(
                    user.id,
                    c.id,
                    period,
                    amount,
                    clean(b.description, 3000),
                    JSON.stringify(metadata),
                    now,
                    now,
                  ).lastInsertRowid,
              );
              db.prepare("UPDATE claims SET radicado=? WHERE id=?").run(
                `VIVIR-${today().slice(0, 4)}-${String(id).padStart(5, "0")}`,
                id,
              );
            }
            const insert = db.prepare(
              "INSERT INTO documents(claim_id,kind,name,mime,bytes) VALUES(?,?,?,?,?)",
            );
            documents.forEach((d) =>
              insert.run(id, d.kind, d.name, d.mime, d.bytes),
            );
            emit(existing ? "ops.claim.corrected" : "ops.claim.submitted", id, {
              claim_id: id,
              contractor_id: user.id,
              contract_id: c.id,
              service_period: period,
              gross: amount,
              status: "Radicada",
            });
            db.prepare(
              "INSERT INTO events(claim_id,user_id,status,note,created) VALUES(?,?,?,?,?)",
            ).run(
              id,
              user.id,
              "Radicada",
              existing
                ? "Cuenta corregida y radicada nuevamente."
                : "Cuenta recibida con sus soportes.",
              now,
            );
            db.exec("COMMIT");
          } catch (error) {
            db.exec("ROLLBACK");
            throw error;
          }
          return json(res, existing ? 200 : 201, { claim: claimDetail(id) });
        }
        const statusMatch = path.match(/^\/api\/claims\/(\d+)\/status$/);
        if (statusMatch && method === "POST") {
          if (user.role !== "admin")
            fail(403, "Acceso reservado a administración.");
          const b = await readBody(req);
          const c = claimRow(Number(statusMatch[1]));
          owns(user, c);
          const transitions = {
            Radicada: ["En revisión"],
            "En revisión": ["Devuelta", "Aprobada"],
          };
          if (
            !STATES.includes(b.status) ||
            !transitions[c.status]?.includes(b.status)
          )
            fail(409, "Cambio de estado no permitido.");
          if (b.status === "Aprobada" && b.review_confirmed !== true)
            fail(
              400,
              "Confirma la revisión de documentos y consistencia antes de aprobar.",
            );
          if (b.status === "Aprobada") {
            const validation = auditClaim(claimDetail(c.id), policy);
            if (validation.issues.length)
              fail(
                409,
                "Completa la auditoría estructurada antes de aprobar: " +
                  validation.issues
                    .slice(0, 3)
                    .map((x) => x.message)
                    .join(" / "),
              );
          }
          if (b.status === "Devuelta" && clean(b.note, 2000).length < 10)
            fail(
              400,
              "Explica qué debe corregir el contratista (mínimo 10 caracteres).",
            );
          const now = new Date().toISOString();
          db.exec("BEGIN IMMEDIATE");
          try {
            db.prepare("UPDATE claims SET status=?,updated=? WHERE id=?").run(
              b.status,
              now,
              c.id,
            );
            emit("ops.claim.status_changed", c.id, {
              claim_id: c.id,
              previous: c.status,
              status: b.status,
              reviewer_id: user.id,
            });
            db.prepare(
              "INSERT INTO events(claim_id,user_id,status,note,created) VALUES(?,?,?,?,?)",
            ).run(
              c.id,
              user.id,
              b.status,
              clean(b.note, 2000) ||
                (b.status === "En revisión"
                  ? "Administración inició la revisión."
                  : "Cuenta y soportes aprobados."),
              now,
            );
            db.exec("COMMIT");
          } catch (e) {
            db.exec("ROLLBACK");
            throw e;
          }
          return json(res, 200, { claim: claimDetail(c.id) });
        }
        const documentMatch = path.match(/^\/api\/documents\/(\d+)$/);
        if (documentMatch && method === "GET") {
          const d = db
            .prepare("SELECT * FROM documents WHERE id=?")
            .get(Number(documentMatch[1]));
          if (!d) fail(404, "Soporte no encontrado.");
          owns(user, claimRow(d.claim_id));
          res.writeHead(200, {
            "Content-Type": d.mime,
            "Content-Length": d.bytes.length,
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(d.name)}`,
            "Cache-Control": "no-store",
          });
          return res.end(Buffer.from(d.bytes));
        }
        fail(404, "Ruta no encontrada.");
      }
      if (!["GET", "HEAD"].includes(method)) fail(405, "Método no permitido.");
      const assets = {
        "/": "index.html",
        "/app.js": "app.js",
        "/payments.js": "payments.js",
        "/reconciliation.js": "reconciliation.js",
        "/styles.css": "styles.css",
        "/favicon.png": "favicon.png",
        "/logo-vivir.png": "logo-vivir.png",
        "/logo-vivir-blanco.png": "logo-vivir-blanco.png",
      };
      if (!assets[path]) fail(404, "Página no encontrada.");
      const file = join(ROOT, "public", assets[path]);
      const mime = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
      }[extname(file)];
      res.writeHead(200, {
        "Content-Type": mime.startsWith("image/")
          ? mime
          : `${mime}; charset=utf-8`,
        "Cache-Control": "no-cache",
      });
      res.end(method === "HEAD" ? undefined : readFileSync(file));
    } catch (error) {
      if (!error.status) console.error(error);
      json(res, error.status ?? 500, {
        error: error.status
          ? error.message
          : "No fue posible completar la solicitud.",
      });
    }
  };
  const server = createServer(handler);
  server.on("close", () => db.close());
  return { server, db };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { server } = createApp();
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "127.0.0.1";
  server.listen(port, host, () =>
    console.log(
      `VIVIR · OPS disponible en http://${host}:${port}${process.env.DEMO_MODE === "1" ? " (demostración con datos ficticios)" : ""}`,
    ),
  );
}
