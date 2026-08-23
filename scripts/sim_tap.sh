#!/bin/zsh
#
# Tap the booted iOS simulator at DEVICE POINT coordinates.
#
# ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
# Two defects in `3791d9c` were invisible to lint, tsc, 1,296 tests and both
# bundles, and both were found by looking at a screenshot. The next class down
# — a control that renders correctly and does nothing when pressed — needs a
# TAP, and `xcrun simctl` has no tap verb. Neither does Xcode's MCP bridge.
#
# Three things that do not work, so nobody re-derives them:
#   - `osascript ... click at {x, y}` fails with -25204 even with accessibility
#     granted. Keystrokes work; clicks do not.
#   - The Simulator does not expose the app's accessibility tree to macOS, so
#     `every UI element whose description contains "..."` finds nothing. Only
#     the Simulator's own chrome (Home, Volume, Sleep/Wake) is enumerable.
#   - `idb` is not installed and is a much heavier dependency than this.
#
# So: `brew install cliclick`, and convert device points to screen points here.
#
# ── THE GEOMETRY ─────────────────────────────────────────────────────────────
# Read from the live window rather than hardcoded, because the window moves.
# The horizontal bezel is symmetric, so `OX = (windowWidth - deviceWidth) / 2`;
# the vertical offset is whatever is left after the device and the BOTTOM bezel
# (which equals OX), i.e. the title bar plus the top bezel. Measured on an
# iPhone 17 at 450x959: OX=24, OY=61.
#
# Device points are the screenshot's pixels divided by the scale — 3 on every
# current iPhone. `xcrun simctl io <udid> screenshot` gives pixels.
#
# ── TWO TRAPS WORTH KNOWING ──────────────────────────────────────────────────
# Activate the Simulator BEFORE reading the window, or the geometry read fails
# with "Invalid index" and the arithmetic silently produces a NEGATIVE screen
# coordinate rather than an error.
#
# And if React Native's element inspector is on, every tap INSPECTS instead of
# pressing, which looks exactly like a dead control. Cmd+D, then tap "Toggle
# Element Inspector" (device point 200 419 on a 402x874 screen).
#
# Usage:  scripts/sim_tap.sh <x> <y>          # device points
#         DW=440 DH=956 scripts/sim_tap.sh …  # a different device size
#
set -e
export PATH=/opt/homebrew/bin:$PATH

if ! command -v cliclick > /dev/null; then
  echo "sim_tap: cliclick is not installed. brew install cliclick" >&2
  exit 1
fi
if [[ -z "$1" || -z "$2" ]]; then
  echo "usage: sim_tap.sh <x> <y>   (device points)" >&2
  exit 1
fi

osascript -e 'tell application "Simulator" to activate' > /dev/null 2>&1
sleep 0.6

WIN=$(osascript -e 'tell application "System Events" to tell process "Simulator" to get {position, size} of window 1' 2>/dev/null)
# "could not determine", never a plausible-looking number. CLAUDE.md's rule
# about `|| echo "no"`: a failed read here would otherwise tap a negative
# coordinate, which is silent and looks like the app ignoring the press.
if [[ -z "$WIN" ]]; then
  echo "sim_tap: COULD NOT READ the Simulator window. Is it open?" >&2
  exit 1
fi

WX=${${(s:,:)WIN}[1]// /}; WY=${${(s:,:)WIN}[2]// /}
WW=${${(s:,:)WIN}[3]// /}; WH=${${(s:,:)WIN}[4]// /}

DW=${DW:-402}; DH=${DH:-874}
OX=$(( (WW - DW) / 2 ))
OY=${OFFY:-$(( WH - DH - OX ))}

if (( OX < 0 || OY < 0 )); then
  echo "sim_tap: COULD NOT DERIVE the screen inset (window ${WW}x${WH}, device ${DW}x${DH}). Set DW/DH." >&2
  exit 1
fi

cliclick c:$(( WX + OX + $1 )),$(( WY + OY + $2 ))
echo "tapped device($1,$2) -> screen($(( WX + OX + $1 )),$(( WY + OY + $2 )))"
