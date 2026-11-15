# Nightly backup job (006 research D4). Alpine 3.24 packages PostgreSQL 17 tools, matching the
# database (Render PostgreSQL 17), age and rclone. Pinned to an exact tag: bump it on purpose.
FROM alpine:3.24.4

RUN apk add --no-cache bash postgresql17-client age rclone ca-certificates \
  && adduser -D -u 10001 backup

COPY backup.sh /usr/local/bin/backup.sh
RUN chmod 0755 /usr/local/bin/backup.sh

USER backup
ENTRYPOINT ["/usr/local/bin/backup.sh"]
