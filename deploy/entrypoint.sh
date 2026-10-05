#!/bin/sh
# Starts as root only to make the mounted storage folder writable (Fly volumes and some
# Docker volumes mount as root), then runs the app as the unprivileged "app" user.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p "${STORAGE_DIR:-/data/storage}"
  chown -R app:app "$(dirname "${STORAGE_DIR:-/data/storage}")"
  HOME=/app exec setpriv --reuid=app --regid=app --init-groups "$@"
fi
exec "$@"
