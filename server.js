import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

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
        `SELECT c.*,u.name AS contractor_name,u.email AS contractor_email,u.document AS contractor_document,t.number AS contract_number,t.object AS contract_object,t.supervisor FROM claims c JOIN users u ON u.id=c.user_id JOIN contracts t ON t.id=c.contract_id WHERE c.id=?`,
      )
      .get(id);
  const claimDetail = (id) => {
    const row = claimRow(id);
    return {
      ...row,
      metadata: JSON.parse(row.metadata),
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
        name: clean(d.name, 120).replace(/[\x00-\x1f\/\\]/g, "_") || "soporte",
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
          const oath = info.oath ?? {};
          if (
            info.document_type === "Cuenta de cobro" &&
            !["q1", "q2", "q3", "q4", "q5"].every((k) =>
              ["SI", "NO"].includes(oath[k]),
            )
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
            declares_income: oath.q1 === "SI",
            requests_383: oath.q3 === "SI",
            declaration_attached: oath.q4 === "SI",
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
            metadata.requests_383 &&
            metadata.declaration_attached &&
            !documents.some((d) => d.kind === "declaracion")
          )
            fail(
              400,
              "Indicaste que anexas la declaración: adjunta el PDF del periodo cobrado.",
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
        "/styles.css": "styles.css",
        "/favicon.svg": "favicon.svg",
      };
      if (!assets[path]) fail(404, "Página no encontrada.");
      const file = join(ROOT, "public", assets[path]);
      const mime = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
      }[extname(file)];
      res.writeHead(200, {
        "Content-Type": `${mime}; charset=utf-8`,
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
