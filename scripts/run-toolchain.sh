#!/usr/bin/env bash

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
mkdir -p .artifacts/toolchain-logs
stamp="$(date +%Y%m%d-%H%M%S)"
log_file=".artifacts/toolchain-logs/${stamp}.log"
exec > >(tee -a "$log_file") 2>&1

. "$HOME/.x-cmd.root/X"
set -e
x env use node=v22.22.0
set -euo pipefail

if (($# == 0)) || [[ "$1" != "--" ]]; then
  echo 'usage: scripts/run-toolchain.sh -- <node|pnpm command> [args...]' >&2
  exit 2
fi
shift
if (($# == 0)); then
  echo 'run-toolchain: missing command' >&2
  exit 2
fi
for argument in "$@"; do
  case "$argument" in
    npm|npx|*/npm|*/npx)
      echo "run-toolchain: forbidden command: $argument" >&2
      exit 2
      ;;
  esac
done

node_version="$(node --version)"
pnpm_version="$(pnpm --version)"
[[ "$node_version" == 'v22.22.0' ]] || { echo "run-toolchain: expected Node v22.22.0, got $node_version" >&2; exit 2; }
[[ "$pnpm_version" == '11.22.0' ]] || { echo "run-toolchain: expected pnpm 11.22.0, got $pnpm_version" >&2; exit 2; }
printf 'toolchain: node=%s pnpm=%s\n' "$node_version" "$pnpm_version"
printf 'command:'
printf ' %q' "$@"
printf '\nlog: %s\n' "$log_file"
"$@"
