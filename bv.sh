#!/bin/sh
set -eu

branch=$(git branch --show-current)
if [ "$branch" != "main" ]; then
  echo "bv.sh must be run from the main branch." >&2
  exit 1
fi

version=$(bun ./scripts/bump-version.js)
[ -n "$version" ] || exit 1

git add -A

commit_message=${1-}
if [ -z "$commit_message" ]; then
  updated_files=$(git diff --cached --name-only -- \
    . \
    ':(exclude)package.json' \
    ':(exclude)src-tauri/Cargo.toml' \
    ':(exclude)src-tauri/tauri.conf.json')

  if [ -z "$updated_files" ]; then
    commit_message="Update to version $version"
  else
    # ponytail: Git's line-based names keep this POSIX-compatible; upgrade to a
    # NUL-aware helper only if the repository starts using newlines in filenames.
    summary=$(printf '%s\n' "$updated_files" | awk '
      {
        count++
        if (count <= 3) {
          name = $0
          sub(/^.*\//, "", name)
          files = files (files ? ", " : "") name
        }
      }
      END {
        if (count > 3) files = files " + " count - 3 " more"
        print files
      }
    ')
    commit_message="Update $summary for version $version"
  fi
fi

git commit -m "$commit_message"
git tag "app-v$version"
git push origin main "app-v$version"
