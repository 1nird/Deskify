#!/usr/bin/env bash

# Deskify macOS quarantine removal script
# This script attempts to remove the com.apple.quarantine attribute from the Deskify.app bundle
# in common installation locations. If the app is not found, it prints an error message.

APP_PATHS=(
  "/Applications/Deskify.app"
  "/Applications/deskify.app"
  "$HOME/Downloads/Deskify.app"
  "$HOME/Downloads/deskify.app"
)

FOUND=0
for p in "${APP_PATHS[@]}"; do
  if [ -d "$p" ]; then
    echo "Removing quarantine from $p..."
    # The quarantine attribute may not exist; suppress errors.
    xattr -r -d com.apple.quarantine "$p" 2>/dev/null || true
    FOUND=1
  fi
done

if [ $FOUND -eq 0 ]; then
  echo "Error: Deskify.app not found in Applications or Downloads folder. Please drag it from the DMG to Applications first."
  exit 1
fi

# Ensure the script is executable (chmod may be required when running).
