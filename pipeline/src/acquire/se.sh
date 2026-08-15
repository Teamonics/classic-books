#!/bin/bash
# Snapshot a Standard Ebooks repo into raw/se/<slug>.
# Usage: se.sh <repo-name> <local-slug> <translator> <translator-died> <published> [license-note]
set -euo pipefail

REPO="$1"
SLUG="$2"
TRANSLATOR="${3:-}"
DIED="${4:-}"
PUBLISHED="${5:-}"
NOTE="${6:-}"

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DEST="$ROOT/raw/se/$SLUG"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git clone --depth 1 "https://github.com/standardebooks/$REPO.git" "$TMP/repo" 2>/dev/null
SHA="$(git -C "$TMP/repo" rev-parse HEAD)"

rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$TMP/repo/src/epub" "$DEST/epub"

if [ -n "$TRANSLATOR" ]; then
  TRANS_JSON="\"$TRANSLATOR\""
  LICENSE="SE CC0; translation US PD + translator d. $DIED"
else
  TRANS_JSON="null"
  LICENSE="SE CC0; original English work"
fi
[ -n "$NOTE" ] && LICENSE="$LICENSE; $NOTE"

cat > "$DEST/SNAPSHOT.json" <<EOF
{
  "source": "standard-ebooks",
  "repo": "https://github.com/standardebooks/$REPO",
  "commit": "$SHA",
  "retrieved": "$(date +%Y-%m-%d)",
  "translator": $TRANS_JSON,
  "translatorDied": ${DIED:-null},
  "translationPublished": ${PUBLISHED:-null},
  "licenseBasis": "$LICENSE"
}
EOF

echo "$SLUG <- $REPO @ ${SHA:0:7}"
