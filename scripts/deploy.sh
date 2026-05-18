#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Required env (sane defaults):
TV_HOST="${TV_HOST:-10.0.0.238}"
TV_PORT="${TV_PORT:-9922}"
TV_USER="${TV_USER:-prisoner}"
TV_KEY="${TV_KEY:-$HOME/.ssh/webos_rsa_dec}"
APP_ID="com.flixly.tv"
IPK_REMOTE_NAME="flixly.ipk"

SSH_OPTS=(
  -p "$TV_PORT"
  -i "$TV_KEY"
  -o HostKeyAlgorithms=+ssh-rsa
  -o PubkeyAcceptedAlgorithms=+ssh-rsa
  -o StrictHostKeyChecking=accept-new
)
SCP_OPTS=(
  -P "$TV_PORT"
  -i "$TV_KEY"
  -o HostKeyAlgorithms=+ssh-rsa
  -o PubkeyAcceptedAlgorithms=+ssh-rsa
  -o StrictHostKeyChecking=accept-new
)

echo "→ build"
npm run build

echo "→ package"
mkdir -p ipk
# Package both the app (dist/) and the localhost-proxy service so they ship
# together. The service runs in the background as a JS service on the webOS
# Luna bus and listens on 127.0.0.1:11470 for the renderer to proxy through.
ares-package dist services/com.flixly.tv.service -o ipk

IPK=$(ls -t ipk/*.ipk | head -1)
echo "→ uploading $IPK to $TV_USER@$TV_HOST:/tmp/$IPK_REMOTE_NAME"
# We bypass `ares-install` because the prisoner user (post-FaultManager root) lacks
# write access to /media/developer/temp. Standard dev-mode flow assumes a `developer`
# user. We use the public Luna bus's appInstallService/dev/install instead.
scp "${SCP_OPTS[@]}" "$IPK" "$TV_USER@$TV_HOST:/tmp/$IPK_REMOTE_NAME"

echo "→ installing via luna://com.webos.appInstallService/dev/install"
ssh "${SSH_OPTS[@]}" "$TV_USER@$TV_HOST" \
  "luna-send-pub -n 1 -t 5 'luna://com.webos.appInstallService/dev/install' '{\"id\":\"$APP_ID\",\"ipkUrl\":\"/tmp/$IPK_REMOTE_NAME\"}'" \
  > /dev/null

echo "→ verifying install"
if ! ares-install --device tv --list 2>/dev/null | grep -q "^$APP_ID$"; then
  echo "✗ $APP_ID not in installed app list — install may have failed"
  exit 1
fi

echo "→ launching $APP_ID"
ares-launch --device tv "$APP_ID"

echo "✓ done"
