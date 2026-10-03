"""Comprueba el proyecto elegido con una transacción de SOLO LECTURA.

Ejecutar con psycopg del entorno del backend Guía:
    uv run python /ruta/OPS/integrations/supabase/probe.py --env-file /ruta/OPS/.env.supabase
No crea tablas, roles, credenciales ni usuarios. No imprime la URL ni contraseña.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

PROJECT = "zghnxmwahzbyqpetldfv"
DIRECT = f"db.{PROJECT}.supabase.co"
POOLER = "aws-0-us-east-2.pooler.supabase.com"


def read_environment(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or not key.strip().replace("_", "").isalnum():
            raise ValueError("Formato inválido en el archivo de entorno.")
        values[key.strip()] = value.strip().strip("\"'")
    return values


def validate_url(value: str) -> str:
    value = value.replace("postgresql+psycopg://", "postgresql://", 1)
    url = urlsplit(value)
    if url.scheme not in {"postgresql", "postgres"}:
        raise ValueError("Falta una URL PostgreSQL válida.")
    if url.hostname not in {DIRECT, POOLER} or url.port != 5432:
        raise ValueError("El host o puerto no corresponden al proyecto y método revisados.")
    if url.hostname == POOLER and not (url.username or "").endswith(f".{PROJECT}"):
        raise ValueError("El usuario del pooler no corresponde al proyecto OPS.")
    if url.path != "/postgres":
        raise ValueError("La base del proyecto revisado es postgres.")
    password = unquote(url.password or "")
    if not password or password in {"REEMPLAZAR", "[YOUR-PASSWORD]"}:
        raise ValueError("Falta la contraseña privada en el archivo local.")
    if parse_qs(url.query).get("sslmode", [""])[0] not in {"require", "verify-ca", "verify-full"}:
        raise ValueError("La conexión debe exigir TLS.")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, required=True)
    args = parser.parse_args()
    try:
        values = read_environment(args.env_file)
        dsn = validate_url(os.environ.get("SUPABASE_ADMIN_DATABASE_URL") or values.get("SUPABASE_ADMIN_DATABASE_URL", ""))
    except (OSError, ValueError) as error:
        print(str(error))
        return 2
    try:
        import psycopg
    except ImportError:
        print("Ejecuta esta prueba en el entorno Python del backend Guía, que incluye psycopg.")
        return 2
    try:
        with psycopg.connect(dsn, connect_timeout=10, autocommit=True) as connection:
            with connection.transaction():
                connection.execute("SET TRANSACTION READ ONLY")
                tables = connection.execute(
                    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
                ).fetchall()
                roles = connection.execute(
                    "SELECT rolname, rolcanlogin, rolbypassrls FROM pg_roles WHERE rolname IN ('guia_app','guia_owner') ORDER BY rolname"
                ).fetchall()
                print(json.dumps({"project": PROJECT, "connected": True, "read_only": True,
                                  "application_tables": [row[0] for row in tables],
                                  "guia_roles": [{"name": row[0], "login": row[1], "bypass_rls": row[2]} for row in roles],
                                  "ops_runtime_connected": False}, ensure_ascii=False, indent=2))
    except Exception as error:
        # El texto de una excepción de conexión puede incluir credenciales: no se imprime.
        print(f"No se pudo verificar la conexión ({type(error).__name__}). Revisa credenciales, TLS y acceso de red.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
