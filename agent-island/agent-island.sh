#!/usr/bin/env bash
# agent-island.sh — wraps a command, flipping ~/.agent_island_status.json to
# "running" (with a label) before it runs and back to "idle" once it exits,
# so the AgentIsland HUD can reflect it. Exit code of the wrapped command is
# preserved.
#
# Usage:
#   ./agent-island.sh <command> [args...]
#   AGENT_ISLAND_LABEL="Running tests" ./agent-island.sh npm test

set -uo pipefail

STATUS_FILE="$HOME/.agent_island_status.json"

if [ "$#" -eq 0 ]; then
  echo "usage: agent-island.sh <command> [args...]" >&2
  exit 1
fi

LABEL="${AGENT_ISLAND_LABEL:-$*}"

write_status() {
  local status="$1"
  local label="$2"
  local escaped_label
  escaped_label=$(printf '%s' "$label" | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf '{"status":"%s","label":"%s"}\n' "$status" "$escaped_label" > "$STATUS_FILE"
}

write_status "running" "$LABEL"
"$@"
exit_code=$?
write_status "idle" ""
exit "$exit_code"
