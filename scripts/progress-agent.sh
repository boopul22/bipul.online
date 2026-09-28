#!/usr/bin/env bash
# Keep bipul.online's project progress in sync with the local OpenSEO, hands-off.
#
# Installs a macOS launchd agent that runs `sync-progress.mjs --auto` every
# 5 minutes. That's a cheap no-op while OpenSEO (OrbStack) is down; as soon as
# it's up the agent syncs, then re-collects every 30 minutes and pushes to
# Cloudflare KV only when something changed.
#
#   npm run sync:agent -- install     install (or reinstall) and start
#   npm run sync:agent -- status      is it loaded, last result, last sync
#   npm run sync:agent -- logs        follow the log
#   npm run sync:agent -- run         trigger a check right now
#   npm run sync:agent -- uninstall   stop and remove
set -euo pipefail

LABEL="com.bipul.progress-sync"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/$LABEL.log"
STATE="$ROOT/.wrangler/progress-sync-state.json"
DOMAIN="gui/$(id -u)"

install() {
  local node
  node="$(command -v node)" || { echo "✖ node not found on PATH"; exit 1; }
  mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"

  cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$node</string>
    <string>$ROOT/scripts/sync-progress.mjs</string>
    <string>--auto</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(dirname "$node"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>300</integer>
  <key>ProcessType</key><string>Background</string>
  <key>LowPriorityIO</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF

  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  launchctl bootstrap "$DOMAIN" "$PLIST"
  echo "✅ Installed $LABEL (checks every 5 min; log: $LOG)"
}

uninstall() {
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "✅ Removed $LABEL"
}

status() {
  if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
    echo "● $LABEL is loaded"
    launchctl print "$DOMAIN/$LABEL" | grep -E "^	(state|runs|last exit code) =" | tr -d '\t' | sed 's/^/  /'
  else
    echo "○ $LABEL is not installed (npm run sync:agent -- install)"
  fi
  if curl -sf -o /dev/null --max-time 3 http://localhost:8741/; then
    echo "  OpenSEO: up"
  else
    echo "  OpenSEO: down"
  fi
  if [[ -f "$STATE" ]]; then
    node -e '
      const s = require(process.argv[1]);
      const ago = (t) => t ? `${Math.round((Date.now() - t) / 60000)} min ago` : "never";
      console.log(`  last collect: ${ago(s.lastCollectAt)}`);
      console.log(`  last push:    ${ago(s.lastPushAt)}`);
    ' "$STATE"
  fi
  [[ -f "$LOG" ]] && { echo "  recent log:"; tail -n 5 "$LOG" | sed 's/^/    /'; }
  return 0
}

case "${1:-status}" in
  install) install ;;
  uninstall) uninstall ;;
  status) status ;;
  logs) touch "$LOG"; tail -n 50 -f "$LOG" ;;
  run) launchctl kickstart -p "$DOMAIN/$LABEL" >/dev/null && echo "▶ Triggered; see: npm run sync:agent -- logs" ;;
  *) echo "usage: npm run sync:agent -- install|status|logs|run|uninstall"; exit 1 ;;
esac
