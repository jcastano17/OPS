// Deliberately fictitious demo; stored separately from both live and the original demo.
import { createApp } from "../server.js";
import { claim, exampleAudit } from "../tests/fixtures.js";
import { scryptSync, randomBytes } from "node:crypto";
const app = createApp({
  demo: true,
  dataDir: process.env.DATA_DIR || "./data/demo-finance",
});
const month = new Date()
  .toLocaleDateString("en-CA", { timeZone: "America/Bogota" })
  .slice(0, 7);
if (!app.db.prepare("SELECT id FROM claims LIMIT 1").get()) {
  const stamp = new Date().toISOString(),
    salt = randomBytes(16).toString("hex");
  const password = `${salt}:${scryptSync("VivirDemo2026!", salt, 64).toString("hex")}`;
  const user = Number(
    app.db
      .prepare(
        "INSERT INTO users(name,email,document,role,password) VALUES(?,?,?,?,?)",
      )
      .run(
        "Carlos Duarte FICTICIO",
        "carlos@demo.vivir.local",
        "1000000002",
        "contractor",
        password,
      ).lastInsertRowid,
  );
  const contract = Number(
    app.db
      .prepare(
        "INSERT INTO contracts(number,user_id,object,supervisor,start,end,monthly_amount) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        "DEMO-OPS-025",
        user,
        "Servicio ficticio de pruebas; sin ejecución real.",
        "Supervisor ficticio",
        `${month.slice(0, 4)}-01-01`,
        `${month.slice(0, 4)}-12-31`,
        3000000,
      ).lastInsertRowid,
  );
  for (const [id, gross] of [
    [1, 3500000],
    [2, 500000],
    [3, 3000000],
  ]) {
    const c = claim(id, gross),
      a = exampleAudit(month);
    c.period = month;
    c.metadata.lines[0].program = `PROGRAMA FICTICIO ${id}`;
    c.metadata.bank.name = "Bancolombia (PRUEBA)";
    if (id === 2) {
      a.lines[0].glosa = 50000;
      a.lines[0].glosa_reason =
        "PRUEBA: glosa adicional por una actividad no respaldada";
    }
    if (id === 3) {
      c.metadata.bank = {
        ...c.metadata.bank,
        name: "Davivienda (PRUEBA)",
        holder: "Carlos Duarte FICTICIO",
        document: "1000000002",
        number: "000987654321",
      };
      a.bank_code = "51";
      a.pila.reference = "PILA-FICTICIA-002";
    }
    const contractor = id === 3 ? user : 2,
      contractId = id === 3 ? contract : 1;
    app.db
      .prepare(
        "INSERT INTO claims(id,radicado,user_id,contract_id,period,amount,description,status,created,updated,metadata) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        `DEMO-FICTICIO-${id}`,
        contractor,
        contractId,
        month,
        gross,
        "PRUEBA FICTICIA DEL MOTOR DE LIQUIDACIÓN; NO ES UNA CUENTA REAL.",
        "Aprobada",
        stamp,
        stamp,
        JSON.stringify(c.metadata),
      );
    app.db
      .prepare("INSERT INTO audits VALUES(?,?,?,?)")
      .run(id, JSON.stringify(a), 1, stamp);
    app.db
      .prepare(
        "INSERT INTO events(claim_id,user_id,status,note,created) VALUES(?,?,?,?,?)",
      )
      .run(
        id,
        1,
        "Aprobada",
        "Datos y verificación simulados para prueba; no certifica soportes reales.",
        stamp,
      );
  }
}
const port = Number(process.env.PORT || 3000);
app.server.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(`Guía · OPS · DEMOSTRACIÓN FICTICIA en http://127.0.0.1:${port}`),
);
