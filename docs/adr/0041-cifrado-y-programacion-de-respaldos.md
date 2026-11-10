# ADR-0041 — Respaldos cifrados con `gpg` asimétrico, programados por un contenedor del compose y versiones de MinIO con una regla ILM

| Campo | Valor |
|---|---|
| Estado | Aceptado (2026-11-04, Adrián) |
| Fecha | 2026-11-02 |
| Decisores | Adrián (acepta), Abel (dueño de 022c); redactó `architect` |
| Specs relacionadas | 022c (RNF-21), 000 (compose, `minio-init`) |

## Contexto
RNF-21 pide respaldo diario de la base, versionado de objetos y restauración probada por fase. Adrián fijó el
2026-11-02 (PR #78, P-5 de la spec 022c): `pg_dump` *custom* diario, 7 copias en un volumen distinto del de Postgres,
**cifradas** con una herramienta que fija este ADR y clave del Operador fuera del repositorio; versiones no vigentes de
MinIO 7 días con **una sola** regla ILM; ejecutor = contenedor programado del compose (no systemd); un fallo no borra
copias y queda en bitácora con `code`; demostración en local. Quedan tres preguntas técnicas:

1. **Cifrado.** Qué herramienta cifra el flujo de `pg_dump`.
2. **Ejecutor.** Cómo se programa la corrida diaria dentro del compose.
3. **ILM.** Cómo se aplica la regla con el fork de MinIO (`pgsty/silo` + `pgsty/mc`, ADR-0025) sin duplicarla.

Fuerzas: equipo de 4, Fase 3 con pocas semanas; un servidor de 8 GB donde ONLYOFFICE usa ~4 GB; RNF-15 (CI, staging y
producción desde la misma imagen), con la publicación de imágenes y staging pospuestas a una fase posterior; el
servicio `postgres` usa `pgvector/pgvector:pg17` (`compose.yml`), y `pg_dump`/`pg_restore` deben ser de la misma versión
mayor que el servidor, así que el servicio de respaldos parte de esa imagen; el Operador trabaja en Windows o Linux;
`pgsty/mc` es mínima (sin `sed`, `grep` ni `awk`, ADR-0025).

Criterios para el cifrado: (a) disponible en la imagen fijada o costo de traerla; (b) si obliga a un Dockerfile propio y
cómo afecta a RNF-15 y a staging; (c) que el servidor **no necesite la clave privada** para cifrar (si el servidor se
compromete, las copias siguen ilegibles); (d) cifrado **autenticado** (un archivo alterado o truncado no se restaura en
silencio); (e) igual en Windows y Linux; (f) custodia y rotación de la clave.

## Opciones consideradas

### 1. Cifrado
1. **`gpg` asimétrico (clave pública en el servidor, privada con el Operador)** —
   (a) **evidencia documental (2026-11-02):** el `Dockerfile` de `pgvector/pgvector` parte de
   `postgres:$PG_MAJOR-$DEBIAN_CODENAME` y solo instala y retira `build-essential` y `postgresql-server-dev-*`, con un
   `autoremove` al final. Los `Dockerfile` de `docker-library/postgres` `17/bookworm` y `17/trixie` instalan `gnupg` como
   paquete manual, y su bloque de `gosu` restaura las marcas manuales (`savedAptMark`) antes de `apt-get purge
   --auto-remove`, así que `gnupg` sigue en la imagen sea cual sea la base de la etiqueta `pg17`. Por eso tampoco lo
   quita el `autoremove` de pgvector. **No está verificado en ejecución** (Docker apagado en esta máquina). Antes de
   aceptar se comprueba con
   `docker run --rm pgvector/pgvector:pg17 sh -c 'command -v gpg pg_dump pg_restore && gpg --version | head -1'`;
   (b) si está, no hay Dockerfile ni `build`: el servicio usa la imagen ya fijada y RNF-15 no cambia;
   (c) sí: `--encrypt --recipient` solo necesita la pública, importada en un `GNUPGHOME` temporal con
   `--trust-model always`; (d) sí, con la protección de integridad (MDC) de OpenPGP: `gpg` termina con error si el
   mensaje fue modificado o está incompleto. Es una construcción más antigua que un AEAD moderno, pero suficiente para
   detectar alteración; (e) igual: corre dentro del contenedor en ambos sistemas, y el par de claves se genera también
   dentro (`docker compose run --rm backup gpg …`), sin instalar Gpg4win; (f) rotación: par nuevo, se cambia el archivo
   de la pública y la privada anterior se guarda hasta que rote la última copia que cifró (7 días); admite varios
   destinatarios en la transición. Contras: el manejo de llaveros es verboso y fácil de equivocar (`GNUPGHOME`,
   confianza, `--batch`); hay que fijarlo bien en el script.
2. **`age` asimétrico (destinatario X25519)** — (a) **no** viene en la imagen de `postgres`; está en los repositorios de
   Debian como paquete `age`; (b) obliga a `infra/backup/Dockerfile` (imagen fijada + `apt-get install age`) y, en
   staging, a construirla en el Droplet o publicarla desde CI, que hoy está pospuesto (RNF-15); (c) sí, `-r`/`-R` solo
   con la pública; (d) sí, cifrado autenticado por trozos (ChaCha20-Poly1305) que detecta alteración y truncado; (e) igual,
   dentro del contenedor; (f) la más simple: una línea por destinatario en un archivo, rotación agregando la nueva y
   quitando la vieja. Contras: una imagen propia más que mantener y publicar.
3. **`gpg` simétrico (frase de paso)** — (a) y (b) como la opción 1; (c) **no**: la frase vive en el servidor para cifrar
   cada noche, así que quien compromete el servidor también descifra las copias; (d) sí (MDC); (f) rotar implica
   volver a cifrar o recordar varias frases. Se descarta por (c).
4. **`openssl enc`** — (a) la imagen trae la biblioteca, no está claro que traiga el binario `openssl`; (c) **no**:
   solo simétrico; (d) **no**: `enc` no ofrece modos autenticados, un archivo alterado puede descifrarse a basura que
   `pg_restore` intenta leer; (f) la clave derivada de una frase vive en el servidor. Se descarta por (c) y (d).
5. **Posponer (copias sin cifrar)** — contradice la decisión P-5 de Adrián y deja todos los datos de todas las cuentas en
   claro en un volumen del servidor. Se descarta.

### 2. Ejecutor programado
1. **Bucle de espera en el propio script del contenedor `backup`** (plan D-1) — sin otro proceso ni paquete; la hora sale
   de `BACKUP_TIME` en `TZ`; igual en Windows y Linux; `restart: unless-stopped` lo mantiene vivo. Contras: si el
   contenedor está apagado a la hora, ese día no hay copia (spec S-2), y el cálculo de la próxima hora es código propio
   que hay que probar (CA-1).
2. **`cron` (o un cron para contenedores) dentro de una imagen propia** — formato conocido. Contras: obliga a un
   Dockerfile aunque la herramienta de cifrado venga en la imagen, y `cron` no hereda el entorno del contenedor sin
   trucos.
3. **Un programador que lanza contenedores por el socket de Docker** — Contras: otra imagen de terceros y acceso al
   socket de Docker, que equivale a privilegios de administrador sobre el host. Desproporcionado.
4. **`cron`/systemd/Programador de tareas del host** — descartado por Adrián (P-5): distinto en Windows y Linux y fuera
   del compose.

### 3. Regla ILM en el fork de MinIO
1. **`mc ilm import` de la configuración completa (una regla `NoncurrentVersionExpiration`, 7 días) desde un *heredoc*
   en `infra/minio/init.sh`** — idempotente porque reemplaza la configuración entera; no necesita `sed`/`grep`; no agrega
   archivos. Riesgo R-4: que `pgsty/silo` o `pgsty/mc` no respeten el subcomando o la regla; CA-7 lo prueba con las
   mismas imágenes de ADR-0025.
2. **`mc ilm rule add` condicionado a que no exista** — necesita leer y filtrar la salida, sin herramientas en la imagen;
   repetirlo puede duplicar la regla (contradice CA-7).
3. **Aplicar la regla desde el `api` al arrancar con el SDK de S3** — mezcla infraestructura con la aplicación y exige que
   el `api` tenga permisos de administración del bucket, que hoy no tiene. Se descarta.
4. **Posponer** — RNF-21 queda sin cumplir para objetos.

## Decisión
**Aceptada** por Adrián el 2026-11-04. Comprobación del contexto hecha ese día: `pgvector/pgvector:pg17` trae
`gpg` (GnuPG 2.2.40), `pg_dump`/`pg_restore` 17.11 y los datos de zona (`America/Guatemala`); se queda `gpg` y no hay
`infra/backup/Dockerfile`.

1. **Cifrado: `gpg` asimétrico (opción 1.1), con la imagen fijada `pgvector/pgvector:pg17`**, condicionado a la
   comprobación del contexto. Es la opción que cumple los seis criterios **sin** imagen propia, y eso pesa más en este
   proyecto que la elegancia de `age`: no agrega `build` a staging ni una imagen a publicar mientras CI de imágenes
   está pospuesto (RNF-15). Reglas: cifrar solo con la clave pública, `GNUPGHOME` temporal por corrida, `--batch`,
   AES-256; el script exige el código de salida de `pg_dump` **y** de `gpg` (`set -o pipefail`, la imagen trae `bash`).
   **Si la comprobación muestra que `gpg` no está, se elige `age` (opción 1.2)** con `infra/backup/Dockerfile` mínimo
   (la fila condicional del plan 022c), sin otro ADR.
2. **Restauración en dos pasadas**: primero descifrar completo hacia `/dev/null` (clave equivocada o archivo alterado →
   `RESTORE_KEY_INVALID` sin tocar la base); después descifrar en flujo hacia `pg_restore --single-transaction
   --exit-on-error`. Así un corte a mitad del flujo nunca deja una base a medias, con cualquiera de las dos herramientas.
3. **Clave**: el servidor guarda solo la pública (secreto de compose desde `BACKUP_PUBLIC_KEY_FILE`, fuera del
   repositorio). La privada la custodia el Operador fuera del servidor (gestor de contraseñas o medio sin conexión) y
   entra con `-v` solo en la corrida de `restore`. Nunca en el repositorio, en `.env.example` ni en bitácoras.
4. **Ejecutor: bucle de espera en el script del contenedor `backup`** (opción 2.1), perfil `backups`, sin `ports:` ni
   `env_file`.
5. **ILM: `mc ilm import` de la configuración completa desde un *heredoc*** (opción 3.1). Si CA-7 muestra que el fork no
   la soporta, se detiene la 022c y se reabre ADR-0025 (sus opciones 2 y 3), no se busca un rodeo.

## Consecuencias
- Positivas: ninguna imagen nueva ni dependencia de terceros adicional si `gpg` está en la imagen; el servidor
  comprometido no puede leer las copias; la restauración es todo o nada; la regla ILM es una sola y reproducible.
- Negativas / deuda aceptada: `gpg` es más verboso que `age` y su integridad usa MDC en lugar de un AEAD moderno;
  dependemos de que la imagen de Postgres siga trayendo `gnupg` (si una versión futura lo quita, CA-1 falla y se pasa
  a `age`). La restauración descifra dos veces (aceptable con una base de prueba de pocos MB). El bucle propio no
  recupera corridas perdidas (S-2; la alerta es PD-167). Las versiones de MinIO no protegen ante la pérdida del volumen
  `minio_data` (spec 022c §7).
- Cómo sabremos si fue un error: la comprobación de la imagen o CA-1 fallan por falta de `gpg`; CA-4 restaura un archivo
  alterado; el ensayo T-08 tarda más que lo razonable por la doble pasada; CA-7 falla con el fork de MinIO.
