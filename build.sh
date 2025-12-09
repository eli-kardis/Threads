#!/bin/bash

# Threads to Notion Sync - Build Script for Chrome Web Store
# Usage: ./build.sh

set -e

VERSION=$(grep '"version"' manifest.json | sed 's/.*"version": "\(.*\)".*/\1/')
OUTPUT_FILE="threads-to-notion-sync-v${VERSION}.zip"

echo "Building Threads to Notion Sync v${VERSION}..."

# Remove old build
rm -f "$OUTPUT_FILE"

# Create ZIP excluding unnecessary files
zip -r "$OUTPUT_FILE" \
  manifest.json \
  icons/ \
  src/ \
  -x "*.DS_Store" \
  -x "*__MACOSX*" \
  -x "*.git*" \
  -x "src/*.test.js"

echo ""
echo "Build complete: $OUTPUT_FILE"
echo ""
echo "File size: $(du -h "$OUTPUT_FILE" | cut -f1)"
echo ""
echo "Next steps:"
echo "1. Go to: https://chrome.google.com/webstore/devconsole"
echo "2. Click 'New Item' and upload $OUTPUT_FILE"
echo "3. Fill in the store listing from store-assets/STORE_LISTING.md"
echo "4. Add screenshots (at least 1 required)"
echo "5. Submit for review"
