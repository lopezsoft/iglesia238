# Política de Seguridad (Security Policy)

## Versiones soportadas

El soporte de actualizaciones de seguridad se aplica sobre la rama principal (`main`) y la última versión etiquetada del proyecto:

| Versión | Soporte de seguridad |
| --- | --- |
| `0.15.x` (vigente) | ✅ Activo |
| `< 0.15.0` | ❌ No soportada (actualizar a la última versión) |

## Principios de seguridad de la arquitectura

Iglesia 238 implementa *Security by Design* en todas sus capas:

- **Aislamiento multi-tenant estricto:** cada petición autenticada se resuelve contra el alcance (`P`, `D:<denominaciónId>`, `C:<congregaciónId>`) autorizado por los roles activos del usuario.
- **Protección de datos personales (Habeas Data):** los logs de aplicación (`SmartLogger` en backend y `DebugService` en frontend) redactan automáticamente contraseñas, tokens, documentos de identidad, correos, teléfonos, direcciones y notas pastorales/disciplinarias antes de emitir cualquier salida.
- **Autenticación y sesiones:** contraseñas con `scrypt`, tokens de acceso de corta duración en memoria, refresh tokens rotativos en cookies `HttpOnly` + `Secure` + `SameSite` y revocación inmediata en base de datos.
- **Protección contra abuso:** límites de tasa (*rate limiting*) respaldados por Redis por dirección IP y por cuenta, y cabeceras estrictas de seguridad (`Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`).

## Cómo reportar una vulnerabilidad

Si descubres una vulnerabilidad de seguridad en **Iglesia 238**, **por favor NO abras un Issue público en GitHub**.

Envía el reporte de forma privada a:

- **Correo de seguridad:** `contact@lewislopez.io`
- **Asunto sugerido:** `[SECURITY] Iglesia 238 — Descripción breve`

Incluye en tu reporte:

1. Descripción técnica del hallazgo y el componente afectado (`backend/`, `frontend/`, `landing/` o `docker/`).
2. Pasos detallados para reproducir el problema (o prueba de concepto mínima).
3. Impacto potencial (por ejemplo, escalamiento de privilegios entre sedes/denominaciones, exposición de datos sensibles, etc.).

Confirmaremos la recepción del reporte en un plazo máximo de **48 horas hábiles** y coordinaremos la publicación del parche antes de divulgar públicamente los detalles.
