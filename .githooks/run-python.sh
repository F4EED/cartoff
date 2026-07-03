# Invocation Python portable (Git Bash / MSYS sur Windows).
run_cartoff_python() {
  if command -v py >/dev/null 2>&1; then
    py -3 "$@"
  elif command -v python >/dev/null 2>&1; then
    python "$@"
  elif command -v python3 >/dev/null 2>&1; then
    python3 "$@"
  elif [ -x ".git-hook-bin/python.exe" ]; then
    .git-hook-bin/python.exe "$@"
  elif [ -x ".git-hook-bin/python3.exe" ]; then
    .git-hook-bin/python3.exe "$@"
  else
    echo "Cartoff: Python introuvable pour bump_version.py" >&2
    echo "  Installez Python (py -3) ou copiez python.exe dans .git-hook-bin/" >&2
    return 127
  fi
}
