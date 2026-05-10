#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Required env (sane defaults):
TV_HOST="${TV_HOST:-10.0.0.238}"
TV_PORT="${TV_PORT:-9922}"
TV_USER="${TV_USER:-prisoner}"
TV_KEY="${TV_KEY:-$HOME/.ssh/webos_rsa_dec}"
APP_ID="com.duane.stremio"

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
ares-package dist -o ipk

IPK=$(ls -t ipk/*.ipk | head -1)
echo "→ uploading $IPK to $TV_USER@$TV_HOST:/tmp/duane.ipk"
# We bypass `ares-install` because the prisoner user (post-FaultManager root) lacks
# write access to /media/developer/temp. Standard dev-mode flow assumes a `developer`
# user. We use the public Luna bus's appInstallService/dev/install instead.
scp "${SCP_OPTS[@]}" "$IPK" "$TV_USER@$TV_HOST:/tmp/duane.ipk"

echo "→ installing via luna://com.webos.appInstallService/dev/install"
ssh "${SSH_OPTS[@]}" "$TV_USER@$TV_HOST" \
  "luna-send-pub -n 1 -t 5 'luna://com.webos.appInstallService/dev/install' '{\"id\":\"$APP_ID\",\"ipkUrl\":\"/tmp/duane.ipk\"}'" \
  > /dev/null

echo "→ verifying install"
if ! ares-install --device tv --list 2>/dev/null | grep -q "^$APP_ID$"; then
  echo "✗ $APP_ID not in installed app list — install may have failed"
  exit 1
fi

echo "→ launching $APP_ID"
ares-launch --device tv "$APP_ID"

echo "✓ done"
