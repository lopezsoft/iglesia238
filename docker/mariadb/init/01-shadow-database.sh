#!/bin/sh
# Solo desarrollo. `prisma migrate dev` necesita una base auxiliar, y el usuario de la aplicación no puede crearla.
# Este script se ejecuta una vez, cuando el volumen de datos está vacío.
set -e

mariadb --protocol=socket -uroot -p"${MARIADB_ROOT_PASSWORD}" <<SQL
CREATE DATABASE IF NOT EXISTS \`${MARIADB_DATABASE}_shadow\`;
GRANT ALL PRIVILEGES ON \`${MARIADB_DATABASE}_shadow\`.* TO '${MARIADB_USER}'@'%';
FLUSH PRIVILEGES;
SQL
