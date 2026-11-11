#!/bin/bash
# Started at Windows logon by the "JarvisPcHelper" scheduled task.
cd "$(dirname "$0")/.." || exit 1
set -a; . ./.env; set +a
export PATH="$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" | sort -V | tail -1)/bin:$PATH"
while true; do node scripts/pc-helper.mjs; sleep 5; done
