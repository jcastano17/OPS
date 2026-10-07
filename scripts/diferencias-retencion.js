// Informe interno "Diferencia de retención". Uso:
//   node scripts/diferencias-retencion.js entrada.csv [salida.csv]
// Sin salida, escribe el CSV en la consola. Datos internos: no se muestran a los
// contratistas. Guarda archivos reales en data/ (excluida de Git).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseReviewCsv,
  reviewCsv,
  reviewWithholding,
} from "../lib/withholdingReview.js";

const [input, output] = process.argv.slice(2);
if (!input || input === "--help" || input === "-h") {
  console.error(
    "Uso: node scripts/diferencias-retencion.js entrada.csv [salida.csv]",
  );
  process.exit(input ? 0 : 2);
}
try {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const policy = JSON.parse(
    readFileSync(
      resolve(process.env.POLICY_FILE ?? join(root, "config", "policy.json")),
      "utf8",
    ),
  );
  const rows = reviewWithholding(
    parseReviewCsv(readFileSync(input, "utf8")),
    policy,
  );
  const csv = reviewCsv(rows);
  if (output) writeFileSync(output, csv);
  else process.stdout.write(csv);
  const people = new Set(rows.map((r) => r.documento)).size;
  const excess = rows.reduce((s, r) => s + Math.max(0, r.diferencia ?? 0), 0);
  const shortfall = rows.reduce(
    (s, r) => s + Math.max(0, -(r.diferencia ?? 0)),
    0,
  );
  const fmt = (x) => x.toLocaleString("es-CO");
  console.error(
    `${rows.length} filas, ${people} personas. Retenido en exceso: $${fmt(excess)}; retenido de menos: $${fmt(shortfall)}.${output ? ` Informe: ${output}` : ""}`,
  );
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
