#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export PATH="/Users/philipmadu/.nvm/versions/node/v22.22.1/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
cd /Users/philipmadu/antigravity
echo "Node: $(which node)" >&2
echo "PATH: $PATH" >&2
exec node node_modules/.bin/next dev --webpack
