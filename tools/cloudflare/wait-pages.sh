#!/usr/bin/env bash
# Waits until GitHub Pages has published the given commit (or a newer build
# that already includes it). Usage: wait-pages.sh owner/repo <sha>
set -euo pipefail
repo="$1"; sha="$2"
for i in $(seq 1 60); do
  status=$(gh api "repos/$repo/pages/builds?per_page=20" --jq ".[] | select(.commit == \"$sha\") | .status" | head -1 || true)
  case "$status" in
    built) echo "Pages published $sha"; exit 0 ;;
    errored) echo "::error::Pages build for $sha errored"; exit 1 ;;
  esac
  # A newer commit's build already covers this one.
  latest=$(gh api "repos/$repo/pages/builds/latest" --jq '.status + " " + .commit' || true)
  if [ "${latest%% *}" = "built" ] && git merge-base --is-ancestor "$sha" "${latest#* }" 2>/dev/null; then
    echo "Pages published a newer build containing $sha"; exit 0
  fi
  echo "waiting for Pages (${status:-queued})…"; sleep 15
done
echo "::error::Timed out waiting for Pages to publish $sha"; exit 1
