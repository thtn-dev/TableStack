#!/bin/bash
# Install go-wails skill into Claude Code
# Usage: bash install.sh [--project] [--global]
# Default: installs to ~/.claude/skills/ (global, all projects)

set -e

SKILL_NAME="go-wails"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$1" == "--project" ]]; then
    DEST=".claude/skills/$SKILL_NAME"
    echo "Installing to project: $DEST"
    mkdir -p ".claude/skills"
else
    DEST="$HOME/.claude/skills/$SKILL_NAME"
    echo "Installing globally: $DEST"
    mkdir -p "$HOME/.claude/skills"
fi

# Copy skill files
cp -r "$SCRIPT_DIR" "$DEST"

echo ""
echo "✓ Skill '$SKILL_NAME' installed!"
echo ""
echo "Usage in Claude Code:"
echo "  /go-wails                 → invoke manually"
echo "  Auto-invoked when working on .go files in Wails project"
echo ""
echo "To verify: run 'claude' and type /go-wails"
