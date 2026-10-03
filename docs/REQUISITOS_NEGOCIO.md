# Requisitos de negocio — App OPS (VIVIR IPS)

Radicación de cuentas de cobro por contratistas OPS y revisión por el equipo de VIVIR.

- **Fecha de corte de la investigación:** 2026-10-03
- **Alcance:** este documento recoge requisitos de negocio. No define arquitectura ni código. La implementación (Node.js 24 + SQLite + web) la lleva otro agente en paralelo.
- **Privacidad:** no contiene datos personales reales. Todos los ejemplos usan marcadores (`CC12345678`, `NIT900000000`, etc.).

---

## 0. Convenciones

| Marca | Significado |
|---|---|
| **[C]** CONFIRMADO | Está en un documento oficial de VIVIR (instructivo o formato), en archivos propios del usuario, o el usuario lo pidió explícitamente. |
| **[C-M]** CONFIRMADO POR MEMORIA | Regla que sesiones anteriores atribuyen a una decisión del usuario, pero que no se vio dicha por el usuario en las transcripciones revisadas. Conviene ratificarla. |
| **[P]** PROPUESTA | La diseñó o sugirió Claude en sesiones anteriores, o se propone aquí. No está ratificada. |
| **[D]** DISCREPANCIA | Dos fuentes dicen cosas distintas. Hay que decidir. |

Regla de precedencia propuesta [P]: el **instructivo NA-CF-CTB-INS-560 v1 (02-10-2026)** prevalece sobre el formato v6 y sobre las planillas anteriores, porque es el documento oficial más reciente.

---

## 1. Fuentes

### 1.1 Fuentes consultadas

| # | Fuente | Tipo | Acceso |
|---|---|---|---|
| F1 | **NA-CF-CTB-INS-560 INSTRUCTIVO [RADICACIÓN CUENTA DE COBRO CONTRATISTAS]**, v1, 02-10-2026, Coordinación Financiera | Documento oficial (Drive) | Leído completo |
| F2 | **NA-CF-CTB-FT-1 FORMATO [CUENTA DE COBRO]**, versión 6, 12-05-2026 (plantilla .xlsx en Drive) | Formato oficial | Leído (estructura y listas desplegables) |
| F3 | Sesión «Revisión de ops agosto» | Sesión Claude Code | Leída completa. La sesión quedó **inconclusa** (se cortó por límite de uso) |
| F4 | Sesión «Excel de pago de ops julio» | Sesión Claude Code | Leída completa |
| F5 | Sesión «Procesamiento planilla OPS junio 2026 Vivir IPS» | Sesión Claude Code | Leída completa. Es el equivalente más cercano a «OPS JUNIO» |
| F6 | Sesión «Gasto de ops en junio» | Sesión Claude Code | Leída completa |
| F7 | Sesión «Organizar prompt para pagos de ops en Excel» | Sesión Claude Code | Leída completa. Contiene las columnas de la planilla propia del usuario `PLANI OPS MAYO` |
| F8 | Sesión «Análisis de retenciones fiscales en operaciones de pago» | Sesión Claude Code | Leída completa |
| F9 | Sesión «Excel auditoría de cuentas y pagos» (conductores, julio) | Sesión Claude Code | Leída completa |
| F10 | Sesión «Análisis nómina julio 2026» | Sesión Claude Code | Leída parcialmente. Es nómina de empleados; solo aporta la hoja «BD OPS» |
| F11 | Sesiones «Review June payroll» y «Revisar carpeta de junio» | Sesión Claude Code | Leídas. **No son de OPS**: son nómina y facturación a EPS. Solo dan contexto |

#### Identificadores de Drive de F1 y F2 (trazabilidad)

Son los archivos exactos que se leyeron el 2026-10-03. Para abrir los enlaces hace falta tener permiso sobre el archivo en Drive.

| Fuente | Nombre exacto del archivo | ID de Drive | Enlace | Última modificación (Drive) |
|---|---|---|---|---|
| F1 | `NA-CF-CTB-INS-560 INSTRUCTIVO [RADICACIÓN CUENTA DE COBRO CONTRATISTAS].docx` | `1HoucbaAP7Zyh2EMvC7AnqjShBAwP7YJ2` | https://drive.google.com/file/d/1HoucbaAP7Zyh2EMvC7AnqjShBAwP7YJ2/view | 2026-10-02T16:39:08Z |
| F2 | `NA-CF-CTB-FT-1 FORMATO [CUENTA DE COBRO].xlsx` (dentro dice «VERSIÓN: 6», «FECHA: 12/05/2026») | `1CPUk97X4kMNq7SjGqudrE76dzS71z07t` | https://drive.google.com/file/d/1CPUk97X4kMNq7SjGqudrE76dzS71z07t/view | 2026-05-12T15:35:48Z |

Si en Drive aparece una versión posterior de cualquiera de los dos archivos, hay que revisar este documento contra ella.

### 1.2 Fuentes que NO se pudieron consultar

- **«OPS JUNIO»** y **«VIVIR IPS OPS payroll June 2026»**. No aparecen entre las sesiones de Claude Code de la cuenta; se revisaron unas 200 sesiones. Parecen conversaciones de claude.ai, y desde este entorno **no hay acceso al historial de chats de claude.ai**. Se usaron como equivalentes F5 y F6, que tratan el mismo mes y el mismo tema.
- **Formato v7** (`NA-CF-CTB-FT-1 FORMATO (CUENTA DE COBRO 2026) V7.xlsm`, con macros FIRMAR / GUARDAR PDF). El instructivo F1 lo cita, pero no apareció en Drive; solo se encontró la v6. Los campos del v7 que se describen aquí salen del instructivo.
- **Planillas originales del usuario** (`PLANI OPS MAYO OK 1.xlsx`, `PLANI OPS JUNIO*.xlsx`, `RELACION CUENTAS DE COBRO VCIO 2026.xlsx`, maestro `BUN.xlsx`). No se abrieron directamente. Sus columnas se tomaron de lo que registraron las transcripciones F3 a F10.

---

## 2. Actores y responsabilidades

- **[C]** **Contratista** (persona natural; también persona jurídica o facturador electrónico): diligencia, verifica, firma y radica la cuenta con todos los soportes (F1 §3).
- **[C]** **Coordinación Financiera / Contabilidad**: recibe, valida y tramita. **Devuelve** las cuentas con inconsistencias o documentación incompleta (F1 §3).
- **[C]** Firmas que exige el formato v6 (F2), que en la práctica equivalen a la cadena de revisión:
  1. Profesional.
  2. **Jefe que autoriza**.
  3. **Contabilidad**, con **fecha de radicado**.
  4. **Tesorería**.
  5. **Auditoría**.
- **[C]** **Talento Humano**: tramita las solicitudes escritas de cambio de la tarifa de retención por honorarios (10 % / 11 %), que queda en el contrato (F1 §5.1).
- **[C]** Paz y salvo por área (formato NA-CTH-C-FT-13, visto en F8):
  - Talento Humano: vacunas.
  - Auditoría: bitácora completa y sin tachones; evoluciones.
  - Farmacia: entrega de insumos.
  - Formato de glosa.
  - Contable: cuenta sin tachones, seguridad social, certificación bancaria, cédula y RUT.
  - **[P]** Decidir si la app debe modelarlo.

---

## 3. Campos de radicación

### 3.1 Datos del contratista (maestro)

| Campo | Fuente | Notas |
|---|---|---|
| Tipo de documento | [C] F2 | Valores de la lista del formato: CC, CE, PEP, PPT, NIT |
| Número de documento | [C] F2 | Se guarda **solo con dígitos**, sin puntos [C] F1 §5.7 |
| Tipo de persona (natural / jurídica) | [C] F1 §4, F8 | Determina si radica cuenta de cobro o factura electrónica |
| Nombre profesional (completo, como en la cédula) | [C] F1 §5.3, F2 | En F7 se desagrega en primer y segundo nombre y primer y segundo apellido |
| Profesión / cargo | [C] F2 | |
| Dirección, ciudad, celular, e-mail | [C] F2 | |
| Ciudad de expedición de la cédula | [C] F1 §5.3 | Solo para la declaración del art. 383 |
| Banco, tipo de cuenta, número de cuenta, titular (a nombre de), documento del titular | [C] F2 | Tipos de cuenta en F2: AHORRO, CORRIENTE, DIGITAL. En F3 se usan además NEQUI y DAVIPLATA. El número se guarda **como texto** para conservar ceros a la izquierda [P] |
| Contrato: centro de costo, cargo, programa, ciudad, departamento, zona, fecha de inicio, fecha de terminación, **valor pactado**, agregados, banco | [C] hoja «BD OPS» del maestro `BUN.xlsx` (F10) | Sirve para validar el valor cobrado contra el valor pactado y el 40 % del valor mensual del contrato para la PILA |
| Tarifa de retención por honorarios del contrato (10 % / 11 %) | [C] F1 §5.1 | Ya no se pregunta en la cuenta; vive en el contrato |
| Régimen Simple (responsabilidad 47 en el RUT), responsable de IVA, responsabilidad 52 (facturador electrónico), beneficiario ZESE | [C] F1 §5.6 para la 52 y el IVA; [C-M]/[P] para la 47 y ZESE (F3–F5) | Cambian la retención o la obligación de facturar |

### 3.2 Encabezado de la cuenta de cobro (por periodo)

Campos [C] F2 v6:

- `DEBE A` (VIVIR IPS SAS)
- `DOCUMENTO EQUIVALENTE No` (consecutivo)
- `PERÍODO PROCESADO` (mes cobrado)
- `FECHA DE COBRO`
- `NOTA: describe brevemente los servicios prestados`
- `TOTAL CUENTA COBRO`
- `RETEFUENTE`
- `RETEICA`
- `VALOR TOTAL A PAGAR`

Campos adicionales:

- **[C]** Consecutivo interno: `WO` en la planilla del usuario (formato `V26-xxxx`) y consecutivo `DSV`. El documento soporte que emite VIVIR usa el rango DSV 10001–20000 (F7, F8).
- **[P]** Sede o departamento de radicación y rol/área. Así se organizan las carpetas de Drive, según F3 y F4.

### 3.3 Renglones de servicios (1..N por cuenta)

Una cuenta puede traer **varios renglones** con tarifas y ciudades distintas [C] (F5).

| Columna (F2 v6) | Notas |
|---|---|
| ENTIDAD | Lista [C] F2: Armada Nacional, Asmet Salud, Capital Salud, Capresoca, Coosalud, Enterritorio, Cajacopi, Familiar de Colombia, Famisanar, Ejército, FOMAG, Fuerza Aérea, Nueva EPS, Policía, PPL, VIVIR IPS SAS |
| CIUDAD DE PRESTACIÓN DEL SERVICIO | Lista DIVIPOLA de municipios [C] F2. Es la base del ReteICA |
| MODALIDAD DE ATENCIÓN | [C] F2: PRESENCIAL, TELECONSULTA. En F8 también aparece DOMICILIARIO |
| PROGRAMA | [C] F2: B24X, DOMICILIARIO, HEMATOLOGÍA, HVC, INFECTOLOGÍA, NEFROLOGÍA, REUMATOLOGÍA, TB, OTRO. En las carpetas se usan además PPL/TBC, Búsqueda Activa y PAD |
| SERVICIO | Catálogo [C] F2 **dependiente de la entidad** (hoja ENTIDAD-SERVICIO). Ejemplos: auxiliar de enfermería 6/8/12/24 h, cuidador, procedimientos, médico general, especialistas, terapias, conductor, «pico y placa» |
| CANTIDAD/SERVICIO | Turnos o atenciones. **[C]** En conductores se factura por **horas y minutos** (tarifa por minuto = tarifa por hora / 60), según F9 |
| VALOR UNITARIO | |
| TOTAL | Se calcula: cantidad × valor unitario |

Campos de control del lado de VIVIR [C] (planilla del usuario, F7):

- `COD INV` (código de servicio S00001…S00038).
- `MTTO EQUIPO BIOMEDICO` (descuento).
- `PX GLOSADO` y motivo de glosa.
- `AUDITO` (quién auditó).
- `OBS`.
- `ENTREGA TARDIA` (SI/NO) y `FECHA ENTREGA TARDIA`.

### 3.4 Bloque del juramento tributario (formato v7, 5 numerales) [C] F1 §5.2

| N° | Afirmación | Respuesta |
|---|---|---|
| 1 | Obligado a declarar renta por el año gravable 2025 | SI/NO |
| 2 | Ingresos brutos de 2025 superiores a 3.500 UVT ($174.296.500) | SI/NO. **SI implica que debe facturar electrónicamente y la cuenta se devuelve** |
| 3 | Solicita retención por la tabla del art. 383 con depuración (y no tomará costos ni deducciones) | SI/NO |
| 4 | Adjunta la declaración juramentada vigente para el periodo | SI/NO |
| 5 | Efectuó los aportes a salud, pensión y ARL | SI/NO |

- **[D]** El formato v6 (F2) tiene **6 numerales**: incluye la «retención por honorarios 10–11 %» y separa «solicita 383» de «depuración». Según F1, la versión vigente es la de 5 numerales.
- **[P]** La app debe usar el bloque de 5 numerales.

### 3.5 Declaración juramentada art. 383 (Anexo 1) [C] F1 §5.3

Campos:

- Nombre completo.
- Cédula y ciudad de expedición.
- Profesión, ciudad, periodo, fecha de cobro, valor y contacto (se toman de la cuenta).
- Deducciones solicitadas, cada una SI/NO con su soporte:
  - Intereses de vivienda.
  - Medicina prepagada o seguros de salud (hasta 16 UVT/mes).
  - Dependientes (10 %, hasta 32 UVT/mes).
  - Aportes voluntarios a pensión o AFC.
- Ciudad y fecha de firma, y firma.

### 3.6 Firma [C] F1 §5.5

- La firma lleva **fecha y hora**. Puede ser imagen PNG/JPG o nombre escrito.
- **Si cambia cualquier dato después de firmar, la firma se retira** y hay que volver a firmar.
- **[P]** En la app esto equivale a invalidar la firma cuando se edita una cuenta ya firmada.

---

## 4. Soportes obligatorios

### 4.1 Tabla de soportes [C] F1 §5.4

| Documento | Nombre de archivo | Cuándo aplica | Reglas |
|---|---|---|---|
| Cuenta de cobro firmada (PDF, **1 sola hoja**) | `CC<doc> CUENTA DE COBRO.pdf` | Siempre (si no es facturador) | Generada desde el mismo Excel. No sirven las conversiones desde el celular ni «imprimir a PDF» desde el navegador |
| Cuenta de cobro en Excel | `CC<doc> CUENTA DE COBRO.xlsm` | Siempre | El formato v7 diligenciado. **No** sirve un Excel convertido desde el PDF (hoja «Table 1») ni un Excel renombrado como .pdf |
| Copia de la cédula | `CC<doc> CEDULA.pdf` | Siempre | Ambas caras, legible |
| RUT | `CC<doc> RUT.pdf` | Siempre | La fecha de la **casilla 61 no puede superar un año** |
| Certificación bancaria | `CC<doc> CERTIFICADO BANCARIO.pdf` | Siempre | Reciente y a nombre del contratista. Banco, tipo y número deben coincidir con la cuenta |
| PILA | `CC<doc> PILA.pdf` | Si la cuenta supera **1 SMMLV ($1.750.905 en 2026)** | Del **mes anterior o del mes que cobra**. **PAGADA** (no sirve «sin pagar»). IBC ≥ **max(1 SMMLV; 40 % del valor mensual del contrato)** |
| Declaración juramentada art. 383 | `CC<doc> DECLARACION JURAMENTADA.pdf` | Solo si numerales 3 y 4 = SI | Firmada **dentro del mes que cobra** |
| Bitácoras de atención domiciliaria | `CC<doc> BITACORAS.pdf` | Domiciliarios: auxiliares, cuidadores, terapeutas | Fecha y hora de inicio y fin del turno, firma y huella del paciente o cuidador. **Todas las del mes en un solo PDF** |
| Bitácora de ruta | `CC<doc> BITACORA DE RUTA.pdf` | Solo conductores | Fecha, paciente, hora de salida y de llegada |
| Listado o agenda de pacientes | `CC<doc> LISTADO DE PACIENTES.pdf` | Consulta, teleconsulta, PPL | Debe coincidir con las cantidades cobradas. Si atiende varias sedes, filtrado por la sede |
| Factura electrónica (en lugar de la cuenta) | `NIT<num> FACTURA ELECTRONICA.pdf` | Facturadores (ver §4.3) | Representación gráfica con CUFE |

### 4.2 Reglas de archivos [C] F1 §5.4 y §5.7

- **Un archivo por documento**. No se unen cédula, RUT, certificación, PILA ni declaración. La única excepción son las bitácoras del mes, que van en un solo PDF.
- Un .pdf que en realidad es un Excel renombrado **se considera no radicado**.
- Carpeta: `CC` + número sin puntos, sin orden ni nombre. Ejemplo: `CC12345678`.
- Archivo: `CC<doc> <TIPO>`, en MAYÚSCULA SOSTENIDA, sin tildes, sin caracteres especiales (`# / \ * ? "`), sin el mes y sin el nombre.
- Personas jurídicas o facturadores: prefijo `NIT<num>`.
- **[D]** El ejemplo de carpeta de F1 muestra `CUENTA DE COBRO.xlsx`, pero la tabla exige `.xlsm`. **[P]** Aceptar ambos.
- **[D]** En la práctica de julio y agosto (F3, F4) muchas carpetas traían `3. DOCUMENTOS.pdf` con todo junto, además de .zip y nombres libres. El instructivo nuevo lo prohíbe. **[P]** La app debe exigir un adjunto por tipo de documento, lo que vuelve innecesaria la convención de nombres para el contratista: la app puede renombrar al exportar.
- **[P]** No aceptar .zip. En F3 se marcaban `ZIP_NO_LEGIBLE`.

### 4.3 Facturadores electrónicos [C] F1 §5.6

**Quién debe facturar.** Está obligado quien cumpla cualquiera de estas condiciones:

- Ingresos brutos de 2025 superiores a $174.296.500.
- Responsable de IVA.
- Responsabilidad 52 en el RUT.

**Qué radica.** El facturador **no** radica cuenta de cobro. Radica:

- La factura electrónica.
- El listado o las bitácoras.
- RUT y certificación bancaria.
- Si es persona natural, la PILA cuando el valor supere 1 SMMLV.

**Requisitos de la factura.**

- Debe venir desglosada por cantidad y valor unitario por servicio.
- Si presta servicios en varias sedes, una factura por sede, o que la factura indique qué corresponde a cada sede.

**Retención y duplicidad.**

- La retención se practica según la factura y el RUT, no según el juramento.
- Si radica factura y cuenta de cobro por el mismo servicio, **vale la factura y la cuenta se retira**.

**Régimen Simple.** [C-M] Las personas naturales del Régimen Simple también facturan, con la leyenda «no aplicar ningún tipo de retención» (F5).

### 4.4 Cédula y RUT para el personal antiguo

- **[D]** El formato v6 (F2) decía «COPIA CÉDULA PERSONAL NUEVO» y «RUT SOLO PARA PERSONAL NUEVO».
- El instructivo v1 (F1) los exige **siempre**.
- **[P]** Seguir el instructivo. Una alternativa es reutilizar el documento ya cargado si sigue vigente (RUT con menos de un año), lo que exigiría confirmarlo con Contabilidad.

---

## 5. Validaciones

### 5.1 Validaciones de radicación, automatizables al enviar

| # | Validación | Fuente |
|---|---|---|
| V1 | Los 5 numerales del juramento están marcados, con **una sola** respuesta por fila. Una tabla en blanco se devuelve sin trámite | [C] F1 §5.2 |
| V2 | Numeral 2 = SI → **rechazar**: debe facturar electrónicamente | [C] F1 §5.2 |
| V3 | Numeral 3 = SI y numeral 4 = SI → exigir la declaración 383 firmada en el mes que cobra. Si 3 = SI y 4 = NO → **se acepta, pero se aplica la retención general** | [C] F1 §5.2 |
| V4 | Numeral 5 = NO → advertencia fuerte: declara omisión de aportes, con riesgo ante la UGPP | [C] F1 §5.2 |
| V5 | Total de la cuenta > 1 SMMLV → exigir PILA pagada, del mes anterior o del que cobra, con IBC ≥ max(1 SMMLV; 40 % del valor mensual del contrato) | [C] F1 §5.4 |
| V6 | Soportes obligatorios presentes según el tipo de servicio (bitácoras / ruta / listado) | [C] F1 §5.4 |
| V7 | RUT con casilla 61 de no más de un año | [C] F1 §5.4 |
| V8 | Datos bancarios de la cuenta = datos de la certificación (banco, tipo, número). **Si difieren, manda la certificación** y se anota la diferencia | [C] F1 §5.4; regla «el certificado manda» [P] F4 |
| V9 | Titular de la cuenta bancaria = contratista. Si es un tercero → alerta crítica (interposición de personas) | [P] F5, F9 |
| V10 | Por renglón: `cantidad × valor_unitario = total`. Suma de renglones = TOTAL CUENTA COBRO. Bruto = neto + retefuente + reteICA. Tolerancia de ±1 peso | [C] fórmulas de la planilla del usuario (F7); tolerancia [P] F3 |
| V11 | Periodo cobrado = periodo de la convocatoria. Si es otro mes → marcar, no sumar automáticamente, y que decida el revisor (riesgo de doble pago) | [C-M] F4, F5 |
| V12 | **Duplicado** = misma cédula + mismo municipio + mismo valor (y mismo periodo). Mismo documento en otro municipio o programa = cuentas distintas que **se suman** | [C-M] (regla atribuida al usuario) F4, F5 |
| V13 | Declaración 383 del periodo correcto | [C] F1 §5.4 |
| V14 | Fecha de radicación ≤ **3er día hábil** del mes siguiente a la prestación; si no, **radicación tardía** (ver §5.3) | [C] F1 §5.8, F2 |
| V15 | Cantidades cobradas = bitácoras o listado, **ya descontadas las glosas** | [C] F1 §5.4 |
| V16 | Si hay glosas previas de auditoría, la cuenta debe venir por el **valor neto después de glosas** | [C] F1 §5.4 |
| V17 | Facturador: no puede tener cuenta de cobro y factura por el mismo servicio y periodo | [C] F1 §5.6 |
| V18 | Documento consistente entre la cuenta, la cédula, la certificación y el nombre de la carpeta | [P] F3, F9 |
| V19 | Certificación bancaria «reciente». **[P]** Vigencia ≤ 90 días (F9); F1 no define un plazo | [C]/[P] |
| V20 | PILA de un operador autorizado, que incluya ARL, pagada por el propio contratista y no por un «asesor» o agregador | [P] F9 |
| V21 | Valor cobrado coherente con el **valor pactado** del contrato (maestro «BD OPS») | [P] F10 |
| V22 | Plausibilidad: auxiliar, terapeuta o conductor rara vez supera $4–5 M al mes → alerta | [P] F5, F8 |
| V23 | Conductores: quien cobra = quien firma las bitácoras; minutos < 60; fecha de la cuenta ≥ fecha del servicio | [P] F9 |
| V24 | PDF duplicado dentro de la misma radicación (hash) | [P] F9 |
| V25 | Valor en letras = valor en números (si se captura en letras) | [P] F4 |
| V26 | Firma presente. Toda edición posterior invalida la firma | [C] F1 §5.5 |

### 5.2 Cálculos de liquidación (lado VIVIR)

#### Planilla real del usuario (mayo 2026) [C] F7

```
TOTAL           = PX × VALOR UNITARIO TURNO
TOTAL (neto)    = TOTAL − MTTO EQUIPO BIOMEDICO
R/FTE           = 11 % × TOTAL   (tarifa plana; a veces en 0 manual)
R/ICA           = TOTAL × tarifa_ICA(SEDE) / 1000
TT              = PX − PX GLOSADO
TOTAL GLOSADO   = PX GLOSADO × VALOR UNITARIO (con su propia R/FTE y R/ICA)
TOTAL A PAGAR   = TOTAL − TOTAL GLOSADO
NETO A PAGAR    = Σ TOTAL A PAGAR de las filas de la misma persona
$ DE PSS        = 0                si TOTAL ≤ 1.750.000
                  1.750.905        si 1.750.000 < TOTAL ≤ 3.558.749
                  TOTAL × 0,4      si TOTAL > 3.558.749
```

#### Retención en la fuente

**[C] F1, reglas vigentes.**

- Numerales 3 y 4 = SI más la declaración → **tabla del art. 383** con depuración y renta exenta del 25 %.
- En cualquier otro caso → **retención general de honorarios o servicios**, con la tarifa del contrato (10 % / 11 %).
- Facturadores → según la factura y el RUT.

**[C-M]/[P] Doctrina aplicada en las planillas de junio a agosto** (F4, F5, F8).

Para personas naturales, el art. 383 se **consolida por persona y por mes** (art. 388):

```
UVT 2026 = 52.374
aportes  = bruto × 11,4 %                       (solo si hay PILA)
exenta   = min((bruto − aportes) × 25 %, 3.447.955)   (solo si hay declaración 383)
base     = bruto − aportes − exenta  → convertida a UVT
```

| Rango (UVT) | Retención |
|---|---|
| 0–95 | 0 % |
| 95–150 | 19 % sobre el exceso de 95 |
| 150–360 | 28 % sobre el exceso de 150, + 10 UVT |
| 360–640 | 33 % sobre el exceso de 360, + 69 UVT |
| 640–945 | 35 % sobre el exceso de 640, + 162 UVT |
| 945–2300 | 37 % sobre el exceso de 945, + 268 UVT |
| > 2300 | 39 % sobre el exceso de 2300, + 770 UVT |

Otros casos:

- Personas jurídicas: art. 392, 11 %.
- Régimen Simple (responsabilidad 47): sin retefuente y sin reteICA.
- ZESE con certificado: retefuente 0 % y reteICA sí.
- ReteIVA: no aplica a servicios de salud.

**[D]** La planilla real de mayo aplica un **11 % plano**, y F1 dice «retención general» sin dar la tarifa. Las planillas de junio a agosto aplicaron el art. 383 consolidado. **Contabilidad debe confirmar el algoritmo y la tarifa general** (¿10 %, 11 % o la del contrato?).

#### ReteICA

- **[C]** Se calcula por mil sobre el bruto, según una tabla. En la planilla del usuario la tabla se cruza por **SEDE** (F7).
- **[C-M]/[P]** En junio a agosto se calculó por **municipio de ejecución** de cada renglón, con prorrateo si la cuenta abarca varios municipios, con base mínima de 4 UVT por pago y con un tope legal de 10 ‰ (F4, F5).

**[D] Tarifas en conflicto (‰):**

| Municipio | Planilla del usuario (F7) | Tabla validada por Claude (F4/F5) |
|---|---|---|
| Pereira | 12,5 | 7 |
| Yopal | 10 | 4 |
| Soacha | 9,66 | 10 |

Tarifas coincidentes: Bogotá 9,66; Medellín 10; Tunja 10; Armenia 5,8; Bucaramanga 8,4; Manizales 5; Ibagué 5; Villavicencio 6; Neiva 3,5; Cúcuta 4,8.

Solo en una de las dos fuentes:

- Solo en F7: Barranquilla 8; Girardot 5; Florencia 6; Pasto 6; Cali 6,6.
- Solo en F4/F5: Pitalito 6; Puerto López 8; Vista Hermosa 6; Acacías 5; San Martín 7.

**[P]** La app debe guardar la tabla de tarifas ICA como **parámetro editable con vigencia**, no en el código.

#### Parámetros 2026 [C] F1/F2

| Parámetro | Valor |
|---|---|
| SMMLV 2026 | $1.750.905 |
| UVT 2026 | $52.374 |
| Tope de facturación electrónica | 3.500 UVT de 2025 = $174.296.500 |
| PILA | IBC ≥ max(1 SMMLV; 40 % del valor mensual del contrato) |

**[P]** Todos los parámetros deben ser configurables por año.

### 5.3 Fecha límite y radicación tardía [C] F1 §5.8, F2

- Plazo: radicada **completa y legible** a más tardar el **3er día hábil del mes siguiente** a la prestación.
- Si se radica después, el **pago se hace 30 días hábiles después de la radicación**, sin excepción.
- Una cuenta **devuelta se entiende radicada solo cuando se recibe corregida**. Es decir, la fecha de radicación efectiva es la de la última corrección.
- **[C]** La planilla del usuario separa las hojas «A TIEMPO» y «FUERA DE FECHA» (F7).
- **[P]** La app necesita un calendario de días hábiles de Colombia (festivos) para calcular el plazo y la fecha estimada de pago.

---

## 6. Estados

### 6.1 Lo que existe hoy

- **[C]** Ninguna fuente define un flujo formal de estados. Solo existen:
  - Las firmas del formato: jefe que autoriza → contabilidad (fecha de radicado) → tesorería → auditoría.
  - La «devolución» (F1).
  - La marca de entrega tardía (F7).
- **[C-M]** Lo que está ilegible o por confirmar se resalta **en amarillo**, y la decisión queda en manos del usuario o revisor (F4, F5).
- **[P]** Vocabularios que usaron las planillas de Claude:
  - Confianza: alta / media / baja.
  - Cuadre: CUADRA / DESCUADRE / NO_VERIFICABLE.
  - Duplicados: ELIMINADA / SE SUMAN.
  - Estado ICA: aplicada / bajo base mínima / sin tarifa validada / Régimen Simple / prorrateada / excede tope.
  - Semáforo de conductores: ROJO = no girar; NARANJA = seguridad social irregular; AMARILLO = subsanable.
  - Severidad de hallazgos: CRÍTICO / ALTO / MEDIO / BAJO / OBSERVACIÓN / OK.

### 6.2 Flujo propuesto [P] (por confirmar con el usuario)

```
BORRADOR → RADICADA → EN REVISIÓN → APROBADA (contabilidad) → AUTORIZADA (tesorería) → PAGADA
                         │
                         └→ DEVUELTA → (el contratista corrige) → RADICADA (nueva fecha efectiva)
          RETIRADA / ANULADA (p. ej. duplicada, o hay factura por el mismo servicio)
```

Atributos ortogonales [P]:

- `radicacion_tardia` (sí/no).
- `fecha_radicacion_efectiva`.
- `fecha_pago_estimada`.
- `requiere_visto_jefe` (sí/no).

Validación por soporte [P]: `PENDIENTE` / `VALIDO` / `RECHAZADO` / `NO APLICA`, con observación.

---

## 7. Observaciones frecuentes / motivos de devolución

### 7.1 Oficiales [C] (F1 §5.4, «Motivos recurrentes de devolución»)

1. Se envía como «Excel» una conversión del PDF (hoja «Table 1», cifras corruptas) en vez del formato diligenciado.
2. Bloque del juramento en blanco, con dos casillas en una fila, o distinto entre el Excel y el PDF firmado.
3. Se pide el art. 383 sin anexar la declaración juramentada, o con la de otro periodo.
4. Cuentas sobre 1 SMMLV sin PILA, con la PILA liquidada pero **sin pagar**, o de un mes que no corresponde.
5. RUT de 2025 o anterior.
6. Cuenta sin firma.
7. Datos bancarios distintos a los de la certificación.
8. Bitácoras ilegibles (fotos borrosas o cortadas), o cantidades que no coinciden con las bitácoras o el listado.
9. Se cobran sesiones ya glosadas por la auditoría interna: la cuenta debe venir por el valor neto.
10. Numeral 2 = SI (facturador) presentado como cuenta de cobro.
11. PDF de la cuenta partido en varias páginas, por conversión desde el celular o el navegador.

### 7.2 Observados en las revisiones de junio a agosto [C] (hechos en los datos; la redacción es generalizada)

- La carpeta trae solo soportes y no la cuenta, o la cuenta está en un .zip o en .xlsx.
- Escaneo ilegible (valores, cantidades o número de cuenta). Hay reincidentes de un mes a otro.
- Descuadre entre renglones y total, entre letras y números, o fórmulas rotas en el Excel.
- PILA ausente aunque el checklist diga SI, PILA de otro periodo, o PILA pagada vía «asesor» y sin ARL.
- Certificación bancaria ausente, ilegible, protegida con clave o vencida. Número de cuenta incompleto (falta el prefijo).
- Titular de la cuenta ≠ prestador. Cuenta emitida o firmada por un tercero. Archivo de otra persona en la carpeta. En conductores, quien cobra no es quien condujo.
- Mismo prestador con dos cuentas (posible fraccionamiento).
- Casillas SI/NO del juramento sin diligenciar.
- Periodo en blanco o cuenta de otro mes, con riesgo de doble pago.
- Tipo de documento mal etiquetado (por ejemplo, PPT cuando es CC).
- Misma cuenta subida en dos carpetas. Cuentas corregidas que se vuelven a subir.
- Persona jurídica ZESE sin certificado. Régimen Simple sin verificar en el RUT.
- Municipio sin tarifa ICA validada. Cuentas de varios municipios sin prorrateo del ICA.
- Sin autorización del jefe ni radicado de contabilidad (conductores, julio).
- Departamentos o sedes sin ninguna cuenta a la fecha de corte.

**[P]** Convertir estos motivos en un **catálogo de observaciones predefinidas**, seleccionables por el revisor y con texto libre adicional.

---

## 8. Columnas de los cuadros existentes (para reportes y exportaciones)

### 8.1 Planilla del usuario — `PLANI OPS MAYO` [C] (F7)

Hojas «OPS <MES> A TIEMPO», «OPS <MES> FUERA DE FECHA» y «TOTAL OPS <MES>». Columnas:

`#`, `WO`, `# ID`, `PRIMER NOMBRE`, `SEGUNDO NOMBRE`, `PRIMER APELLIDO`, `SEGUNDO APELLIDO`, `NOMBRE COMPLETO`, `NOMBRE`, `PROGRAMA`, `EPS`, `CIUDAD MPCIO DPTO`, `SEDE`, `PROFESION`, `CONCATENAR`, `TIPO DE TURNO`, `COD INV`, `PX`, `VALOR UNITARIO TURNO`, `TOTAL`, `MTTO EQUIPO BIOMEDICO`, `TOTAL`, `R/FTE`, `R/ICA`, `TOTAL`, `PX GLOSADO`, `TT`, `TOTAL`, `R/FTE`, `R/ICA`, `TOTAL GLOSADO`, `TOTAL A PAGAR`, `NETO A PAGAR`, `BANCO`, `# CTA`, `$ DE PSS`, `PSS`, `DECLARA`, `383`, `AUDITO`, `OBS`, `GLOSAS`, `ENTREGA TARDIA`, `FECHA ENTREGA TARDIA`, `CORREO`, `DIRECCION`, `TELEFONO`

Otras hojas:

- `DATOS FX`: tabla ICA (`CIUDAD | TARIFA X1000`), tabla de servicios (`Descripción | Código` S00001–S00038) y umbrales de PSS.
- Hojas dinámicas.
- «RELACION PARA PAGOS OPS MES DE <MES>»: `PROFESION | C TURNOS | TOTAL A PAGAR`.

### 8.2 Planilla OPS de junio, julio y agosto 2026 (8–10 hojas) — [P] diseñada por Claude, recibida y usada por el usuario

| Hoja | Columnas |
|---|---|
| RESUMEN | Personas, con valor, cuentas, BRUTO, RETEFUENTE, RETEICA, NETO A PAGAR, duplicados eliminados, ilegibles, Régimen Simple, etc. |
| PLANILLA <MES> | `Departamento(s) · Nombre · CC/NIT · Tipo · Profesion · Ciudad · Programa · Turnos · #ctas · Bruto · (-)Aportes · (-)25% · Retef. · ReteICA · NETO · PILA · Decl.383 · Conf. · Flags · Notas` |
| DETALLE POR CUENTA | `CC/NIT · Nombre · Dep · Rol/sede · Municipio ejecucion · Programa · Periodo · Turnos · Vr unit · Bruto cuenta · Glosa (informativa) · Tarifa ICA x1000 · ReteICA · Estado ICA · PILA · Decl.383 · Conf. · Flags · Notas · Archivo` |
| DISPERSION BANCARIA | `# · Tipo doc · Documento · Nombre · Banco · Tipo cuenta · Numero cuenta · Titular · NETO A PAGAR · Conf. · Alerta` (alertas: TITULAR != PRESTADOR / SIN DATOS BANCARIOS / VERIFICAR VS CERTIFICACION). Fue **pedida por el usuario** [C] |
| RETEICA MUNICIPIOS | `Municipio · Tarifa x1000 · Cod. actividad · Norma · Vigente 2026 · Base minima · Agente retenedor (regla) · Conf. · Fuentes · Nota` |
| DESGLOSE TURNOS | `CC/NIT · Nombre · Dep · Municipio · Programa · Concepto / entidad · Cantidad · Vr. unitario · Total renglon · Bruto de la cuenta · Cuadre · Fuente` |
| AUDITORIA DUPLICADOS | `Persona · CC · Decision · Valor · Municipio · Detalle · Ruta` |
| PENDIENTES | `Departamento(s) · Nombre · CC/NIT · Profesion · Programa · Valor/Banco · Nota`, más «departamentos vacíos» y «correcciones aplicadas» |
| COMPARATIVO <MES ANTERIOR> (agosto) | `CC/NIT · Nombre · Departamento(s) · Bruto mes anterior · Bruto mes · Diferencia · Var % · Situación` |
| CRUCE RELACION <SEDE> (agosto) | `Nombre · Documento · Cargo/concepto · Total relación · Bruto extraído · Diferencia · Observación` |

### 8.3 Pago y auditoría de conductores (julio) [C]/[P] (F9)

- **[C]** El usuario pidió columnas mínimas: nombre, CC, banco y valor a pagar, más **horas**.
- **[P]** Columnas resultantes: `# · Conductor · CC declarada · CC verificada · Banco · Tipo de cuenta · No. de cuenta · Período · Horas · Minutos · Tiempo facturado · Tarifa hora · Tarifa minuto · Valor a pagar (bruto) · Semáforo · Observaciones`.
- **[P]** Matriz de 14 chequeos (SÍ / NO / PARCIAL / NO VERIF):
  1. Firma del contratista.
  2. Autorización del jefe.
  3. Radicado de contabilidad.
  4. Copia de la cédula.
  5. Cédulas consistentes.
  6. Certificación bancaria anexa.
  7. Certificación vigente (≤ 90 días).
  8. Titular = quien cobra.
  9. Quien cobra = quien condujo.
  10. PILA válida.
  11. ARL acreditada.
  12. RUT anexo.
  13. Aritmética.
  14. Cantidades = bitácoras.

### 8.4 Relación por sede (Meta / Villavicencio) [C] (F3)

- Columnas base: `NOMBRES · APELLIDOS · N DE DOCUMENTO · TELEFONO · CORREO ELECTRONICO · CARGO`.
- Bloques por pagador o programa, cada uno con `VALOR · CANTIDAD · TOTAL`. Ejemplos: DOMI CAPITAL SALUD, DOMI EJERCITO, B24X POLICIA, B24X CAJACOPI, NEFRO.
- Columna `OBSERVACION`.
- Una hoja por mes.

### 8.5 Exportaciones mínimas sugeridas para la app [P]

1. Planilla de pago con la estructura del §8.1. Es la que usa hoy Contabilidad.
2. Dispersión bancaria del §8.2.
3. Pendientes y devoluciones con su motivo.
4. Resumen por profesión, programa, entidad y sede.

---

## 9. Organización actual (contexto para migración) [C] (F3, F4, F5)

Hoy la radicación se hace en carpetas de Drive organizadas así:

- `2026/<N. MES>/<N.DEPARTAMENTO>/…`
- Bogotá se divide por sede (Country Sur, Castellana) y por rol (TL/TO, TF/TR, auxiliares, T.S., psicología, conductores).
- Fiduprevisora se divide por programa (Búsqueda Activa, B24X, TBC).
- Cundinamarca se divide por municipio (Soacha, Girardot).

En la app [P], esto equivale a los atributos de la cuenta **departamento**, **sede** y **rol/área**, y a la entidad o programa de cada renglón.

---

## 10. Decisiones pendientes (para el usuario o Contabilidad)

1. **Flujo de estados** y quién aprueba en cada paso: jefe inmediato, contabilidad, tesorería, auditoría (§6.2).
2. **Algoritmo de retención**: el art. 383 consolidado por persona y mes, o la tarifa general del contrato. Y cuál es la tarifa general (§5.2).
3. **Tabla de tarifas ICA**: cuál de las dos fuentes vale, y si la retención se calcula por sede o por municipio de ejecución (§5.2).
4. **Glosas**: el instructivo exige radicar el neto después de glosas, mientras que las planillas de julio y agosto las trataban como «informativas». ¿La app debe registrar las glosas de auditoría y bloquear la radicación si el valor no las descuenta?
5. **Cédula y RUT en cada radicación**, o reutilizar los documentos vigentes del maestro (§4.4).
6. **Vigencia de la certificación bancaria** (¿90 días?) (V19).
7. Si se modela el **paz y salvo** por área (§2).
8. Si la app **genera** el PDF de la cuenta y la declaración 383 a partir de los datos (reemplazando el .xlsm con macros) o si solo recibe los archivos. **[P]** Recomendado generarlos, porque elimina la mayoría de los motivos de devolución del §7.1 (1, 2, 6 y 11).
9. Regla del usuario para **médicos con bruto mensual > $11 M**: son candidatos a pasar a nómina [C-M] (F5). ¿Debe salir como alerta?
10. Ratificar las reglas marcadas [C-M]: duplicado = cédula + municipio + valor; amarillo para lo pendiente; las cuentas de otro mes las decide el revisor.
