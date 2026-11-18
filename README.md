# Guía · Módulo OPS para VIVIR

Módulo de Guía para radicación, auditoría, liquidación mensual y preparación de pagos OPS de VIVIR, con API y eventos para integración con RCM. **Este repositorio conserva el prototipo Node/SQLite** y su demostración local con datos ficticios. El módulo integrado se desarrolla en [jcastano17/Guia](https://github.com/jcastano17/Guia), un monolito modular FastAPI/PostgreSQL con interfaz React y arquitectura de despliegue en Azure; ver [Arquitectura actual](#arquitectura-actual-revisión-2026-11-18). Las funciones descritas abajo son las del prototipo; su paridad en Guía debe verificarse contra ese repositorio y no se asume por estar listadas aquí. Los puntos de conexión y diferencias están en [docs/INTEGRACION_RCM.md](docs/INTEGRACION_RCM.md).

## Iniciar

Requiere **Node.js 24 o posterior**. Instala las dependencias fijadas en `package-lock.json`.

```sh
npm ci
npm run demo
```

Abre `http://127.0.0.1:3000`. Los botones de demostración permiten ingresar como contratista o administración. Los accesos ficticios son `contratista@demo.vivir.local` y `admin@demo.vivir.local`, ambos con contraseña `VivirDemo2026!`. La base nueva comienza con un contrato ficticio y sin radicaciones; las pruebas manuales pueden agregar cuentas de ejemplo.

Para iniciar con accesos propios:

```sh
cp .env.example .env
# Configura ADMIN_EMAIL y ADMIN_PASSWORD (mínimo 12 caracteres).
npm start
```

Las credenciales iniciales de administración se usan solo al crear la base. Administración crea los accesos de los contratistas y sus contratos desde la interfaz. La app escucha únicamente en localhost por defecto.

Para probar la liquidación y el paquete bancario, inicia `npm run demo:finance` en lugar de `npm run demo`. Utiliza una base separada en `data/demo-finance/` con tres cuentas ficticias, dos contratistas y dos bancos destino. Las auditorías están simuladas y no certifican documentos reales. Todo archivo de esta demostración es para pruebas y no debe cargarse al banco.

## Funciones del prototipo

Todo lo siguiente está implementado en el servidor Node/SQLite de este repositorio. No describe lo que ya existe en el módulo `ops` de Guía ni en su despliegue.

- Acceso por contraseña, perfiles de contratista y administración. Cada contratista solo ve sus propios contratos, cuentas y documentos.
- Contratos con vigencia, supervisor y honorario mensual de referencia.
- Periodo, profesión, múltiples servicios por departamento, municipio, entidad, programa y modalidad; cantidad, tarifa y suma automática de subtotales.
- Datos bancarios, conservando el número de cuenta como texto.
- Cuenta de cobro o factura electrónica; CUFE para facturas y cinco respuestas explícitas SI/NO en el juramento de las cuentas.
- Adjuntos independientes, comprobación básica de formato, hasta 8 MB por archivo y nombres normalizados al guardar.
- Radicado único, fecha del primer envío, seguimiento e historial con autor y fecha de cada cambio.
- Revisión, devolución con observaciones y corrección manteniendo contrato, periodo y radicado.
- Motivos de devolución tomados del instructivo y confirmación de revisión documental antes de aprobar.
- Búsqueda por radicado, contrato, contratista, municipio, programa o entidad; filtros de estado y exportación CSV del resultado filtrado.
- Interfaz adaptable a escritorio y celular.
- Auditoría estructurada por soporte, revisor, fecha y evidencia; renta, IVA, banco, glosas y tratamiento ICA por municipio/actividad.
- Consolidación por persona y mes fiscal, separado del periodo del servicio; tabla 383 y control de exención anual, aportes reales sin duplicar PILA, deducciones comunes con sus límites y tarifa general sustentada.
- Neto con glosas adicionales, IVA, retefuente, ICA, reteIVA, mantenimiento y descuentos contractuales; pendientes impiden preparar el pago.
- Cuadro Excel con fórmulas y valores del cierre, servicios, soportes, auditoría, pendientes, parámetros y relaciones por banco destino.
- Lote mensual reservado una sola vez, copia inmutable y SHA256; paquete ZIP con cuadro, plano PAB/SAP, relaciones por banco y auditoría JSON.
- Conciliación por beneficiario: plantilla CSV, vista previa, soporte original del banco, resultados aceptados/pagados/rechazados e importaciones idempotentes. Consulta [docs/CONCILIACION.md](docs/CONCILIACION.md).
- Eventos de integración consultables y persistentes para Guía/RCM. Detalles en [docs/INTEGRACION_RCM.md](docs/INTEGRACION_RCM.md).

**Aprobada** significa revisión administrativa completada. **PAGADO** en la conciliación es un registro manual del resultado efectivo contrastado por el revisor; la app no realiza transferencias ni verifica directamente con el banco.

## Requisitos y fuentes

Claude recopiló las revisiones históricas y los cuadros de OPS en [docs/REQUISITOS_NEGOCIO.md](docs/REQUISITOS_NEGOCIO.md), con enlaces de Drive, marcas de confirmación y discrepancias. La rama de implementación parte de sus commits `08938a8` y `1a87bf9` para conservar su aporte.

Se tomó como referencia documental el instructivo **NA-CF-CTB-INS-560 v1 del 02-10-2026**, frente al formato v6 anterior. Esta primera versión recibe los archivos que exige el proceso; no reemplaza el formato oficial con un PDF generado por la app.

Reglas implementadas:

- Cuenta firmada en PDF, Excel original (.xlsx o .xlsm), identidad, RUT, certificación bancaria y bitácoras/listado para cuenta de cobro.
- Factura en PDF, CUFE, RUT, certificación bancaria y bitácoras/listado para facturadores.
- PILA para personas naturales cuando el valor supera el SMMLV del año configurado.
- Declaración adjunta cuando se solicita la tabla 383 y se declara que se anexa. Solicitarla sin anexar la declaración permite enviar para revisión general, conforme al instructivo.
- Una cuenta de cobro con el numeral 2 en SI se devuelve como error de formulario para que se seleccione factura electrónica, según el instructivo. No se determina de forma independiente la obligación fiscal.
- El total debe coincidir con la suma de cantidad × tarifa de cada servicio. Los pesos se redondean por renglón.
- Detección provisional de posibles duplicados por contratista + periodo + conjunto de municipios + valor. Permite otras cuentas del mismo mes con municipios o valores distintos. La regla histórica debe ratificarse; la comparación no resuelve por sí sola el caso de programas distintos con municipio y valor iguales.
- Las correcciones solo están habilitadas para cuentas devueltas. El historial de estados se conserva; los archivos vigentes reemplazan a los anteriores.

Los parámetros por año están en [config/policy.json](config/policy.json), con fuentes oficiales para SMMLV y UVT. Se pueden editar o usar otro archivo mediante `POLICY_FILE`. No hay valores predeterminados para otros años: deben configurarse antes de radicar periodos de esas vigencias.

## Arquitectura actual (revisión 2026-11-18)

Revisión de código y documentación de la rama `main` de `jcastano17/Guia`, realizada mediante GitHub el 2026-11-18 sobre el commit [6c5fe5b](https://github.com/jcastano17/Guia/commit/6c5fe5b06e09459b965481703e8b761c209782f6). Esta revisión describe la arquitectura y el código consultados; la configuración efectiva y la versión desplegada en Azure requieren su propia verificación.

| Componente | Estado en la revisión de Guía | Fuente |
|---|---|---|
| API OPS | `main.py` registra `guia.ops.router` y `router_world_office` con prefijo `/api`; `ops/router.py` declara `APIRouter(prefix="/ops")`, por lo que las rutas nativas cuelgan de `/api/ops`. | [backend/src/guia/main.py](https://github.com/jcastano17/Guia/blob/6c5fe5b06e09459b965481703e8b761c209782f6/backend/src/guia/main.py), [backend/src/guia/ops/router.py](https://github.com/jcastano17/Guia/blob/6c5fe5b06e09459b965481703e8b761c209782f6/backend/src/guia/ops/router.py) |
| Base de datos | PostgreSQL configurado en `config.py`; en despliegue, Azure Database for PostgreSQL Flexible Server. | [backend/src/guia/config.py](https://github.com/jcastano17/Guia/blob/6c5fe5b06e09459b965481703e8b761c209782f6/backend/src/guia/config.py), [docs/13-despliegue-azure.md](https://github.com/jcastano17/Guia/blob/6c5fe5b06e09459b965481703e8b761c209782f6/docs/13-despliegue-azure.md) |
| Documentos | `documentos_backend` con opciones `local` o `azure_blob`; en despliegue, Azure Blob Storage. | `config.py`, `docs/13-despliegue-azure.md` |
| Identidad | Proveedores Google y Microsoft Entra declarados en `config.py`. | `config.py` |
| Secretos | Azure Key Vault. | `config.py`, `docs/13-despliegue-azure.md` |
| Cómputo y borde | Azure Container Apps (API y web) detrás de Azure Front Door. | `docs/13-despliegue-azure.md` |
| Este repositorio | Prototipo Node/SQLite, demostración local y vectores de prueba. Su arranque local es independiente del módulo integrado de Guía. | Este README |

Supabase fue el PostgreSQL candidato en la revisión de octubre de 2026; la arquitectura de Guía usa PostgreSQL Flexible Server en Azure. **La conexión a Supabase no es un pendiente de la arquitectura actual.** El antecedente, incluida la inspección de solo lectura del 2026-10-03 y sus herramientas, se conserva en [docs/SUPABASE.md](docs/SUPABASE.md) como documento histórico. Esta demostración sigue usando SQLite.

## Datos y controles

SQLite almacena usuarios, contratos, cuentas, archivos y eventos. Las bases predeterminadas están en `data/demo/` y `data/live/`; `DATA_DIR` permite otra ubicación. `.env` y `data/` se excluyen de Git. No reutilices una base de demostración para cuentas reales.

Las contraseñas se guardan con scrypt y sal única. Las sesiones duran ocho horas, usan cookies HttpOnly y requieren validación de origen en las escrituras. Los permisos se verifican en el servidor, incluida la descarga de archivos. Los documentos se descargan como adjuntos; no se ejecutan macros ni se convierte contenido de Excel.

## Pruebas

```sh
npm test
```

Las pruebas usan datos ficticios y bases temporales. Cubren el flujo y permisos, límites de los siete tramos 383, control anual, glosas y descuentos, deducciones, consolidación de ICA y PILA, formatos bancarios y ceros iniciales, fórmulas Excel, cierre único, ZIP, eventos para RCM, importación bancaria con evidencia, reintentos sin duplicados, estados de pago, vista previa sin escrituras y persistencia de lotes y conciliación tras reiniciar.

## Límites y pendientes del prototipo

- Completar la matriz tributaria municipal/actividad con las normas y situaciones reales de VIVIR. ICA no se excluye ni se retiene universalmente por ser IPS. El tratamiento debe sustentarse por operación; se documenta en [docs/CRITERIOS_LIQUIDACION.md](docs/CRITERIOS_LIQUIDACION.md).
- Validar el convenio bancario y aceptación de PAB/SAP con el banco pagador. Otros bancos tienen relaciones por destino y perfiles pendientes de especificación del canal; aún no todos tienen plano nativo implementado.
- Verificar la paridad entre las reglas y funciones de este prototipo y el módulo `ops` de Guía (identidad compartida, maestros corporativos, lectores de respuesta propios de cada banco, reversión/reintentos de giros y separación de permisos por rol). Ofrecer API/eventos en el prototipo no establece esa conexión.
- AFC/pensión voluntaria, pagos acumulados o mensualización especial y otros tratamientos fiscales particulares requieren ampliar el motor; no se liquidan como cero.
- Ratificar el flujo de aprobación y roles de jefe, auditoría, contabilidad y tesorería. Los cuatro estados actuales son una propuesta de primera versión.
- Calendario de días hábiles, marca de entrega tardía y fecha efectiva de radicación corregida. No se calculan plazos ni fechas de pago todavía.
- Revisión de contenido: firma, página única, CUFE, casilla 61 del RUT, fecha de la declaración, PILA pagada/IBC/periodo, cantidades de bitácoras y glosas son verificaciones del revisor. La app comprueba presencia y encabezados de archivos, no autenticidad ni contenido.
- Catálogos oficiales DIVIPOLA y entidad-servicio; hoy se capturan los datos como texto.
- Retención de versiones anteriores de documentos y ajuste del cuadro al formato de Contabilidad definitivo. Los snapshots de lotes sí preservan sus datos y cálculos originales.
- Hosting HTTPS, respaldos y retención, recuperación/cambio de contraseñas y controles operativos para acceso de usuarios reales.

Este prototipo no tiene despliegue público, correos ni procesamiento de pagos. El despliegue en Azure corresponde al repositorio de Guía y no se certifica desde aquí.
