#!/usr/bin/env bash
# Build the local-dev fixture scores.pmtiles from cells.geojson (ADR 0002).
#
# Flags mirror what tile-builder is specified to use in production
# (CLAUDE.md Section 7): explicit zoom range, no feature/tile-size limits,
# and deliberately NOT --drop-densest-as-needed (forbidden for score
# layers -- it drops cells arbitrarily).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/.fixture-build"
OUT_DIR="$SCRIPT_DIR/../public/dev-tiles"

if [ ! -f "$BUILD_DIR/cells.geojson" ]; then
  echo "cells.geojson not found -- run generate_fixture_data.py first" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

tippecanoe \
  --output="$OUT_DIR/scores.pmtiles" \
  --layer=cells \
  --minimum-zoom=8 \
  --maximum-zoom=13 \
  --no-feature-limit \
  --no-tile-size-limit \
  --simplification=4 \
  --force \
  "$BUILD_DIR/cells.geojson"

echo "Built $OUT_DIR/scores.pmtiles"
