# ONLYOFFICE Docs 9.3.1 para Deploya (docs/operations/deploya.md §3.9): la misma versión que `compose.yml`, armada
# para correr con las reglas de Deploya, donde la imagen oficial no arranca:
#   - `--cap-drop ALL` y `no-new-privileges`: todo corre como el usuario `ds`, sin `su`, `chown` ni `supervisord`;
#   - sin volúmenes: la caché de documentos es efímera (el documento vive en Nimbo; ONLYOFFICE solo edita);
#   - `PORT` inyectado: nginx escucha ahí y Deploya da por sana la app con `GET /`;
#   - sin Docker Hub (429): base `ubuntu:24.04` desde `mirror.gcr.io` y el paquete oficial desde
#     `download.onlyoffice.com`, verificado con su SHA-256;
#   - PostgreSQL de Deploya (variables `PG*`) en su propio esquema; RabbitMQ va dentro del contenedor.
# Contexto = raíz del repositorio.
ARG UBUNTU_IMAGE=mirror.gcr.io/library/ubuntu:24.04

FROM ${UBUNTU_IMAGE}
ARG DS_VERSION=9.3.1
ARG DS_DEB_SHA256=b206c7eefcf3750605d6d3f61a95f81c2ecaf931f4855f004bfd1d4d05269817
ENV DEBIAN_FRONTEND=noninteractive \
  LANG=C.UTF-8

# Dependencias del paquete (su `Depends`) sin `ttf-mscorefonts-installer` ni `certbot`; fuentes libres métricamente
# compatibles con las de Office (Carlito ≈ Calibri, Caladea ≈ Cambria, Liberation ≈ Arial/Times/Courier).
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates curl openssl xxd adduser procps \
    libasound2t64 libcairo2 libcurl4 libcurl3-gnutls libgtk-3-0t64 libstdc++6 libxml2 libxss1 libxtst6 zlib1g \
    nginx-extras postgresql-client rabbitmq-server \
    fonts-dejavu-core fonts-liberation fonts-crosextra-carlito fonts-crosextra-caladea \
  && rm -rf /var/lib/apt/lists/*

# `dpkg --unpack`: sin el `postinst`, que exige una base de datos al instalar y arranca servicios con systemd. Sin
# configurar, dpkg deja los archivos de configuración como `*.dpkg-new`: se ponen en su lugar a mano.
# Lo que el `postinst` deja listo se hace aquí abajo, ya pensado para un solo usuario sin privilegios.
RUN curl -fsSL -o /tmp/ds.deb \
    "https://download.onlyoffice.com/repo/debian/pool/main/o/onlyoffice-documentserver/onlyoffice-documentserver_${DS_VERSION}_amd64.deb" \
  && echo "${DS_DEB_SHA256}  /tmp/ds.deb" | sha256sum -c - \
  && dpkg --unpack /tmp/ds.deb \
  && find /etc/onlyoffice -name '*.dpkg-new' -exec sh -c 'mv "$1" "${1%.dpkg-new}"' _ {} \; \
  && rm -f /tmp/ds.deb /var/lib/dpkg/info/onlyoffice-documentserver.postinst /etc/sudoers.d/documentserver*

ARG DS=/var/www/onlyoffice/documentserver
# Fuentes, temas y cachés JS: se generan al construir (en el arranque costarían minutos de CPU) y el tag de caché de
# nginx queda fijo en la imagen.
RUN adduser --quiet --system --group --home ${DS} --no-create-home ds \
  && mkdir -p ${DS}/fonts ${DS}/../Data /var/log/onlyoffice/documentserver/docservice /var/log/onlyoffice/documentserver/converter \
    /var/lib/onlyoffice/documentserver/App_Data/cache/files /var/lib/onlyoffice/documentserver/App_Data/docbuilder \
  && documentserver-generate-allfonts.sh true \
  && documentserver-flush-cache.sh -r false \
  && rm -f /etc/nginx/includes/ds-example.conf /etc/nginx/includes/ds-letsencrypt.conf /etc/nginx/sites-enabled/default \
  # Deploya publica todo por HTTPS, pero ONLYOFFICE armaba las URLs de /cache/files con http:// y el navegador las
  # bloqueaba (contenido mixto, «Error de descarga»): solo el encabezado X-Forwarded-Proto hacia docservice queda fijo
  # en https. Las redirecciones de nginx siguen con $the_scheme: la salud de Deploya (GET /) las sigue por HTTP interno.
  && sed -i -E 's/(proxy_set_header[[:space:]]+X-Forwarded-Proto[[:space:]]+)\$the_scheme/\1https/' /etc/nginx/includes/ds-*.conf \
  && grep -Eq 'X-Forwarded-Proto[[:space:]]+https;' /etc/nginx/includes/ds-*.conf \
  && echo '{}' > /etc/onlyoffice/documentserver/local.json \
  && chown -R ds:ds /etc/onlyoffice/documentserver /var/log/onlyoffice /var/lib/onlyoffice ${DS}/../Data \
    /var/lib/rabbitmq /var/log/rabbitmq /etc/rabbitmq

COPY infra/deploya/onlyoffice/nginx.conf /etc/onlyoffice/deploya/nginx.conf
COPY infra/deploya/onlyoffice/entrypoint.sh /etc/onlyoffice/deploya/entrypoint.sh

USER ds
ENV PORT=8080 \
  HOME=/var/lib/rabbitmq \
  NODE_ENV=production-linux \
  NODE_CONFIG_DIR=/etc/onlyoffice/documentserver \
  NODE_DISABLE_COLORS=1 \
  APPLICATION_NAME=ONLYOFFICE
EXPOSE 8080
ENTRYPOINT ["bash", "/etc/onlyoffice/deploya/entrypoint.sh"]
