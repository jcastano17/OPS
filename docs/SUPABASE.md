# Supabase y el módulo OPS de Guía

Proyecto elegido por el usuario: `zghnxmwahzbyqpetldfv`, nombre **OPS**, organización **Vivri IPS**, región `us-east-2`.

El 3 de octubre de 2026 se accedió al panel autenticado y se ejecutó una consulta de metadatos de SOLO LECTURA. No devolvió tablas de aplicación fuera de esquemas internos ni roles `guia%`. No se crearon tablas, roles, contraseñas ni permisos. El proyecto aún no contiene el esquema de Guía o del prototipo OPS.

## Conexión verificada en el panel

- Directa: `db.zghnxmwahzbyqpetldfv.supabase.co:5432`, base `postgres`; requiere conectividad IPv6 por defecto.
- Pooler en sesión: `aws-0-us-east-2.pooler.supabase.com:5432`, base `postgres`, usuario con sufijo `.zghnxmwahzbyqpetldfv`; alternativa IPv4 disponible sin activar un complemento de pago.
- El panel muestra `[YOUR-PASSWORD]`, no la contraseña existente. Una sesión abierta en el panel no proporciona automáticamente una credencial de PostgreSQL al backend.

Supabase aloja PostgreSQL y es compatible con la persistencia de Guía. Debe usarse desde el backend FastAPI/SQLAlchemy existente. La identidad y el aislamiento de Guía no se sustituyen por instalar un SDK en la página de demostración. Fuente: [conexiones PostgreSQL de Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres) y [SQLAlchemy con Supabase](https://supabase.com/docs/guides/troubleshooting/using-sqlalchemy-with-supabase-FUqebT).

## Configuración preparada y pendiente

`integrations/supabase/guia.env.example` contiene el host y método confirmados, sin secretos. Se copia a `.env.supabase`, excluido de Git, para completar localmente la contraseña existente, codificada como parte de una URL. `probe.py` comprueba exclusivamente la conexión y metadatos en una transacción de lectura; se ejecuta con el entorno Python de Guía. No migra ni cambia la aplicación.

Para operar faltan: credencial privada de conexión; bootstrap de roles propios de Guía y adaptación de su arranque al PostgreSQL administrado (no crear otra base como hace su script local); migraciones del sistema y del dominio OPS; integración nativa de OPS con contexto, permisos y transacciones; y pruebas de aislamiento y del recorrido completo. `GUIA_DATABASE_URL` debe usar un rol de aplicación sujeto a RLS, separado del rol de migración. No se configurará la aplicación con `postgres`, ni se publicarán claves privilegiadas en el frontend.

La verificación desde el backend no se ha ejecutado contra el proyecto porque falta la credencial privada. El servidor Node/SQLite y su demostración aún funcionan localmente. Crear este archivo de configuración o consultar el panel no significa que las cuentas ya se guarden en Supabase.
