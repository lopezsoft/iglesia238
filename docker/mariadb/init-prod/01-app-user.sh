#!/bin/sh
# Producción. Crea el usuario de la API con permisos de datos, sin DDL: si la API fuera comprometida,
# no podría alterar ni borrar tablas. El usuario dueño del esquema solo lo usa el migrador.
# Se ejecuta una vez, cuando el volumen de datos está vacío.
set -e

mariadb --protocol=socket -uroot -p"${MARIADB_ROOT_PASSWORD}" <<SQL
CREATE USER IF NOT EXISTS '${APP_DB_USER}'@'%' IDENTIFIED BY '${APP_DB_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`${MARIADB_DATABASE}\`.* TO '${APP_DB_USER}'@'%';
FLUSH PRIVILEGES;
SQL
