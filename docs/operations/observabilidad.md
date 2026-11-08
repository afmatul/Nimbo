# Observabilidad: métricas, tablero de operación y alertas

> Spec 022 (CA-9, CA-10, CA-11, CA-18) y 022d (grupos de los módulos) · ADR-0040. Público: Operador (custodia el administrador de Grafana, S-6) y
> Administrador (solo lectura). Cliente y Soporte no tienen cuenta (P-6).

## 1. Servicios y puertos

| Servicio | Dónde escucha | Publicado | Notas |
|---|---|---|---|
| `grafana` | `3000` del contenedor | solo `127.0.0.1:${GRAFANA_PORT}` (local `3030`) | Sin Traefik. En staging se entra por túnel SSH |
| `prometheus` | `9090` | no | Recolecta cada 15 s; retiene 15 días o 1 GB |
| `cadvisor` | `8080` | no | CPU, memoria y disco por contenedor; montajes de solo lectura |
| `api` `/metrics` | `METRICS_PORT` (`9464`) | no | Servidor aparte, fuera de `/api/v1` |
| `worker` / `worker-optimizer` `/metrics` | `WORKER_PORT` (`3001`) / `WORKER_OPTIMIZER_PORT` (`3003`) | no | Mismo puerto interno de salud |

Límites de memoria: Prometheus 256 MiB, Grafana 256 MiB, cAdvisor 128 MiB. Cada proceso se distingue por el `job` de
Prometheus (`api`, `worker`, `worker-optimizer`, `cadvisor`).

## 2. Levantar la observabilidad

En local las apps corren en el anfitrión y Prometheus las alcanza por `host-gateway` (override del compose). Solo ve
procesos que escuchan en todas las interfaces, que es lo que hace `pnpm dev`. Con el perfil `apps` no se recolectan (S-8).

```bash
cp .env.example .env                 # si aún no existe; sin el perfil onlyoffice, deja ONLYOFFICE_INTERNAL_URL vacía (S-7)
docker compose up -d                 # dependencias + prometheus, grafana, cadvisor y mailpit
pnpm dev                             # api (3000 y 9464), worker (3001), worker-optimizer (3003)
```

Abre `http://localhost:3030` e inicia sesión. El tablero es **Operación** (uid `nimbo-operacion`, carpeta General):
`http://localhost:3030/d/nimbo-operacion`.

**Staging:** `ssh -L 3030:127.0.0.1:3030 <usuario>@<servidor>` y la misma URL en el navegador.

### Arranque desde volúmenes vacíos (CA-10)

La fuente de datos, el tablero, las seis reglas, el punto de contacto `correo-equipo` y su política se cargan desde
`infra/grafana/` al arrancar. No hay pasos manuales salvo las cuentas de personas (§3). Para repetirlo desde cero:

```bash
docker compose rm -sf grafana prometheus
docker volume rm nimbo_grafana_data nimbo_prometheus_data
docker compose up -d grafana prometheus
```

Comprobación con la cuenta de administrador de Grafana (pide la contraseña sin dejarla en el historial):

```bash
G=http://localhost:3030; read -r -p 'Usuario admin: ' GU; read -r -s -p 'Contraseña: ' GP; echo
curl -fsS -u "$GU:$GP" "$G/api/dashboards/uid/nimbo-operacion" | grep -o '"provisioned":true'
curl -fsS -u "$GU:$GP" "$G/api/v1/provisioning/alert-rules" | grep -o '"provenance":"file"' | wc -l   # 6
curl -fsS -u "$GU:$GP" "$G/api/v1/provisioning/contact-points" | grep -o '"name":"correo-equipo"'
```

`GF_SECURITY_ADMIN_PASSWORD` solo se aplica la primera vez que Grafana arranca con el volumen vacío. En staging se fija
una contraseña propia en el `.env` del servidor antes del primer arranque; nunca la de `.env.example`.

## 3. Acceso y cuentas (CA-9, P-6, S-6)

- Sin acceso anónimo, sin registro, sin tableros públicos y sin publicar instantáneas fuera de Nimbo
  (`compose.yml`). Un anónimo recibe `401` en la API y la redirección al inicio de sesión en la interfaz.
- El tablero, la fuente de datos, las reglas, el punto de contacto y la política están aprovisionados por archivo: nadie
  los cambia ni borra desde la interfaz, ni siquiera el administrador. Se cambian por PR en `infra/grafana/`.
- Cuentas: **Operador** con rol *Editor*; **Administrador** con rol *Viewer* (ve el tablero, no guarda tableros ni
  reglas y no usa Explore). El administrador de servidor (`GRAFANA_ADMIN_*`) es del Operador y solo sirve para crear
  cuentas. El Operador no crea reglas nuevas desde la interfaz: son exactamente seis (RN-1).

Alta por interfaz: *Administration → Users and access → Users → New user*; después, en la organización, el rol.
Alta por API (cada usuario nuevo entra como *Viewer*):

```bash
read -r -s -p 'Contraseña inicial de la cuenta: ' NP; echo
curl -fsS -u "$GU:$GP" -H 'Content-Type: application/json' "$G/api/admin/users" \
  -d "{\"name\":\"Operador\",\"login\":\"operador\",\"email\":\"operador@nimbo.local\",\"password\":\"$NP\"}"
# Responde {"id":N,...}. Solo para el Operador, sube el rol a Editor:
curl -fsS -u "$GU:$GP" -X PATCH -H 'Content-Type: application/json' "$G/api/org/users/N" -d '{"role":"Editor"}'
```

Repite el alta con `administrador` sin el `PATCH`. Entrega cada contraseña inicial por un canal privado; cada persona
la cambia en *Profile → Change password*.

## 4. Tráfico para la demo

Con `pnpm dev` en marcha. Sin `pnpm seed` (PD-135): solo datos sintéticos.

```bash
# HTTP: peticiones, latencia y rutas (incluida «<sin patrón>» por el 404)
for i in $(seq 1 300); do
  curl -s -o /dev/null http://localhost:3000/api/v1/health/ready
  curl -s -o /dev/null http://localhost:3000/api/v1/no-existe
done

# Colas: cada registro encola un correo de verificación (cola mail; llega a Mailpit). Máximo 10 por hora e IP.
for i in $(seq 1 5); do
  curl -s -o /dev/null -w '%{http_code}\n' -H 'Content-Type: application/json' \
    http://localhost:3000/api/v1/auth/register \
    -d "{\"fullName\":\"Demo $i\",\"email\":\"demo-$i-$(date +%s)@nimbo.local\",\"password\":\"Demo-2026-$(openssl rand -hex 6)\",\"acceptTerms\":true}"
done
```

### Tráfico de los grupos de los módulos (022d)

Los grupos «Identidad», «Almacenamiento», «Indexación», «Optimizador» y «Agente» (paneles 16 a 35) solo leen las
series HTTP y de colas de arriba: se llenan con tráfico real del `api` y de los `worker`.

```bash
# «Identidad»: inicios de sesión fallidos (401) hasta el bloqueo (429). 5 fallos en 15 min bloquean el correo;
# 20 intentos en 15 min por IP también responden 429. Los dos 429 salen juntos en el panel 18 (022d S-1).
for i in $(seq 1 8); do
  curl -s -o /dev/null -w '%{http_code}\n' -H 'Content-Type: application/json' \
    http://localhost:3000/api/v1/auth/login \
    -d "{\"email\":\"demo-bloqueo@nimbo.local\",\"password\":\"Incorrecta-$(openssl rand -hex 6)\"}"
done
```

Los registros del bucle de arriba también suman en el panel 17. Para el resto, desde la web (`http://localhost:3002`)
con una cuenta de Cliente verificada (el correo llega a Mailpit):

- **«Almacenamiento»:** subir un archivo (carga completa, `2xx` en `POST /api/v1/uploads` y `…/complete`), subir uno
  que supere el tamaño o el tipo permitido (rechazada, `4xx`) y descargar un archivo o una versión (panel 22).
- **«Indexación»:** cada carga de un tipo que el extractor soporta (por ejemplo `.docx` o PDF) encola su indexación
  (`indexing`); `index-reconcile` corre solo, por calendario. Sin la clave de Gemini (`GEMINI_API_KEY`) la indexación
  no termina bien y lo que ocurra se ve en los paneles 25 a 27.
- **«Optimizador»:** en un JPEG o PNG, *Optimizar* pide la estimación y después la optimización (cola `optimization`
  en `worker-optimizer`).
- **«Agente»:** preguntar en el agente. Sin clave de Gemini o sin corpus indexado (no hay `pnpm seed`, PD-135) responde
  `503` o `422`, que el panel 35 muestra como error: también sirve de evidencia.

**Errores 5xx (opcional):** `docker compose stop postgres` hace que `GET /api/v1/health/ready` responda `503`. Repite
el primer bucle durante 6 minutos para ver la tasa de 5xx y la regla 1; luego `docker compose start postgres`.

## 5. Qué muestra el tablero «Operación»

Los paneles 1 a 15 son de 022. Desde el 16 van los grupos de los módulos de 022d, cada uno bajo su fila, que se puede
plegar en la vista sin guardar (el tablero está aprovisionado). Las rutas aparecen por su plantilla, nunca con ids.

| # | Panel | Lectura |
|---|---|---|
| 1 | CPU por contenedor | Núcleos usados por contenedor (cAdvisor) |
| 2 | Memoria por contenedor | Memoria en uso frente al `mem_limit` |
| 3 | Tasa de errores 5xx (api) | Proporción de respuestas 5xx (0 % si no hay errores); la regla 1 dispara sobre 2 % |
| 4 | Latencia HTTP del api (p50, p95, p99) | Todas las rutas; la regla 2 excluye las de transferencia (S-5) |
| 5 | Peticiones por ruta (api) | Por plantilla de ruta, sin ids ni consulta |
| 6 | Procesos arriba (up por job) | 1 si Prometheus recolecta `api`, `worker`, `worker-optimizer` y `cadvisor` |
| 7 | Profundidad por cola y estado | `waiting`, `prioritized`, `active`, `delayed`, `failed`… por cola |
| 8 | Espera hasta el primer intento por cola (p95) | Desde que el trabajo queda listo hasta que empieza |
| 9 | Ejecución de cada intento por cola (p95) | Duración de cada intento, termine bien o mal |
| 10 | Trabajos completados por cola | Ritmo de trabajos terminados |
| 11 | Intentos fallidos por cola e intentos hechos | `attempts_made` = `1`, `2` o `3+` |
| 12 | Fallos de la renovación de suscripciones (15 min) | Lo que vigila la regla 6 |
| 13 | Disponibilidad de dependencias (1 arriba, 0 caída) | Postgres, Redis, MinIO y ONLYOFFICE (si está configurado) |
| 14 | Uso del disco del anfitrión (por dispositivo) | Fracción usada de cada disco de bloque; la regla 4 solo mira el de mayor capacidad y dispara sobre 80 % |
| 15 | Disco usado por contenedor | Bytes escritos por cada contenedor en su capa (`container_fs_usage_bytes` por `name`); sin regla, sirve para ver quién llena el disco del panel 14 |
| 16 | Identidad | Fila del grupo de identidad (022d CA-1) |
| 17 | Identidad: respuestas por ruta y código | Registro, reenvío y verificación del correo, inicio, renovación y cierre de sesión, contraseña y cierre de las otras sesiones, por código |
| 18 | Inicios de sesión por resultado (2xx, 401, 429) | `POST /api/v1/auth/login` por código: exitosos, credenciales inválidas (`401`), bloqueo por correo o límite por IP (`429`, juntos) |
| 19 | Accesos denegados (403) por ruta | Todo `403` del `api`: roles internos en rutas de cliente y cuentas en solo lectura, por ruta y no por motivo |
| 20 | Almacenamiento | Fila del grupo de almacenamiento (022d CA-2) |
| 21 | Cargas por ruta y código | Inicio, reanudación y cierre: `2xx` completadas; `4xx` rechazadas (`422` límites, tipo o cuota; `409` partes faltantes; `410` vencida) |
| 22 | Enlaces de descarga emitidos | Enlaces `2xx` de archivos y de versiones, por ruta |
| 23 | Límite de frecuencia (429) por ruta | `429` de las rutas de los paneles 21 y 22 |
| 24 | Indexación | Fila del grupo de indexación (022d CA-7) |
| 25 | Indexación: completados y fallidos por intento | Colas `indexing` e `index-reconcile`: completados y fallidos con `attempts_made` |
| 26 | Indexación: profundidad por estado | Trabajos de esas colas en cada estado |
| 27 | Indexación: ejecución p95 | Duración de cada intento por cola |
| 28 | Optimizador | Fila del grupo del optimizador (022d CA-8) |
| 29 | Optimizador: solicitudes por ruta y código | Estimar (`…/optimization/estimate`) y optimizar (`…/optimization/run`) por código |
| 30 | Cola optimization: completados y fallidos por intento | Como el panel 25 para la cola `optimization` |
| 31 | Cola optimization: ejecución p95 | Como el panel 27 para la cola `optimization` |
| 32 | Agente | Fila del grupo del agente (022d CA-11) |
| 33 | Agente: consultas por minuto | Preguntas por minuto, todas las cuentas juntas (sin desglose por plan, PD-192) |
| 34 | Agente: latencia total (p50, p95) | Hasta el final de la respuesta en flujo; se satura en 10 s (§8) |
| 35 | Agente: proporción de respuestas con error | Todo lo que no es `2xx`, incluido el `429` del límite del plan; 0 % sin errores |

## 6. Las seis alertas

Evaluadas cada minuto (grupo `operacion`, carpeta `Nimbo`). Sin datos no avisan. Todas van al punto de contacto
`correo-equipo` (`ALERT_EMAIL_TO`); en local, a Mailpit.

| Regla | Condición | `for` | Qué hacer |
|---|---|---|---|
| Tasa de errores 5xx del api | Más del 2 % de respuestas 5xx | 5m | Panel 3 y 5 para la ruta; bitácoras del `api` por `correlationId`; panel 13 por si cayó una dependencia |
| Latencia p95 del api | p95 > 300 ms, sin `POST /api/v1/agent/ask` ni `GET /api/v1/editing/content/:token` | 10m | Panel 5 para la ruta lenta; paneles 1 y 2 por saturación; Postgres |
| Cola con trabajos pendientes o reintentados | Una cola con más de 50 pendientes, o un trabajo con su tercer intento fallido en 5 min | 1m | Paneles 7 a 11; ¿está arriba el proceso que consume la cola (panel 6)?; bitácoras de ese `worker` |
| Uso del disco del anfitrión | El disco de bloque de mayor capacidad > 80 % (en WSL2 es el de datos de Docker); no cuentan `/dev/loop*`, imágenes de solo lectura siempre al 100 %, ni `/dev/shm` | 1m | Panel 14; `docker system df`; liberar imágenes y volúmenes que ya no se usan o bajar la retención de Prometheus |
| Dependencia caída | Una dependencia en 0 | 1m | Panel 13; `docker compose ps`; levantar el contenedor y revisar sus bitácoras |
| Fallo del proceso de renovación | Cualquier fallo de `subscription-renewal` en 15 min | 0s | Bitácoras del `worker` y panel 12; se resuelve sola tras 15 min sin fallos nuevos |

## 7. Alerta de prueba y correo en Mailpit (CA-18)

Solo en local, nunca en producción.

```bash
docker compose stop redis      # la regla «Dependencia caída» dispara tras 1 min sostenido (2 a 3 min en total)
# Mailpit: http://localhost:8025 → correo «[FIRING:1] Dependencia caída …» para ALERT_EMAIL_TO
docker compose start redis     # el correo «[RESOLVED] …» llega en unos 5 min
```

Anota la hora de ambos correos y toma la captura para el PR. Para probar solo el canal sin provocar una condición:
*Alerting → Contact points → correo-equipo → Test* (Operador).

**Cascada esperada.** Una dependencia caída arrastra a otras reglas, y no es un fallo de las alertas. Con Postgres
detenido (demo T-09, CA-11) dispararon, además de la tasa de 5xx, «Dependencia caída (postgres)», «Fallo del proceso
de renovación» (la pasada de renovación falla sin base de datos) y «Cola con trabajos pendientes o reintentados» (los
trabajos que usan la base agotan su tercer intento). Se atiende primero la dependencia caída; las demás se resuelven
solas al recuperarla, y la de renovación 15 min después del último fallo.

## 8. Pendiente

- **Spike de cAdvisor en Docker Desktop/WSL2 (ADR-0040, R-1):** solo se verificó en Docker Engine nativo con cAdvisor
  v0.55.1. Falta confirmar en la máquina del equipo que salen CPU y memoria por contenedor, el disco del anfitrión
  (`container_fs_*{id="/"}`) y el `host-gateway` hacia las apps de `pnpm dev`. Si no salen, la demo de CPU, memoria y
  disco (CA-3, CA-14) se hace con Docker Engine en WSL2 o en el runner Linux de CI.
- La imagen fijada `ghcr.io/google/cadvisor:v0.60.6` no se pudo descargar en la sesión de desarrollo (403 del proxy).
- El panel 15 (disco por contenedor, CA-3) queda sin datos en Docker Desktop/WSL2 (demo T-09, 2026-11-04) y en la sesión de
  desarrollo: con el almacenamiento de containerd, cAdvisor no lee la capa de cada contenedor. Se comprueba en staging
  (Linux) y, si tampoco hay datos, se retira el panel (PD-173).
- Los enlaces de los correos de alerta usan `GF_SERVER_ROOT_URL` (`http://localhost:${GRAFANA_PORT}/`); en staging
  funcionan con el túnel SSH de §2.
- Tras restaurar Redis, el `api` puede tardar en responder unos instantes sin reiniciarse (demo T-09, PD-196).
- Candidata a regla futura «caída de un proceso propio o de Prometheus» (`up == 0`), fuera de las seis (PD-167 (a)).
- **Grupos de los módulos (022d).** Solo ven lo que dan las series HTTP y de colas de 022; el resto exige instrumentar
  código (PD-190):
  - El panel 18 no distingue el bloqueo por correo (`IDENTITY_LOGIN_LOCKED`) del límite por IP: ambos son `429`. El
    reúso de un token de refresco es un `401` más de `session/refresh` (022d S-1).
  - El panel 19 cuenta todo `403` del `api` por ruta, no por motivo (S-2).
  - En el panel 21, «rechazada» es cualquier `4xx` al iniciar o completar; el motivo exacto no se ve (S-3).
  - Los paneles 34 y 35 miden la respuesta completa del agente. El histograma HTTP llega a 10 s: una respuesta más larga
    satura el p95 en 10 s. Un error dentro del flujo, después del primer evento, sale como `200` y no cuenta (S-4).
  - Si se renombra una ruta, el panel queda en 0 sin error en Grafana; la prueba `scripts/observability.spec.ts` falla
    porque cruza cada ruta citada con los controladores del `api` (022d R-2).
