#!/usr/bin/env bash
cd "$(dirname "$0")"
./scripts/update.sh "$@"
UPDATE_EXIT_CODE=$?
if [ $UPDATE_EXIT_CODE -ne 0 ]; then
  echo ""
  echo "[ERROR] Update process failed. Please check error messages above."
fi
echo ""
read -p "按回车键退出..." -r
exit $UPDATE_EXIT_CODE
