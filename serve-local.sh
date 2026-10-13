#!/bin/sh
set -eu

script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)
port=${1:-${PORT:-8000}}

exec python3 -m http.server "$port" --bind 127.0.0.1 --directory "$script_dir"
