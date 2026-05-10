#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ build"
npm run build

echo "→ package"
mkdir -p ipk
ares-package dist -o ipk

IPK=$(ls -t ipk/*.ipk | head -1)
echo "→ installing $IPK on tv"
ares-install -d tv "$IPK"

echo "→ launching"
ares-launch -d tv com.duane.stremio
echo "✓ done"
