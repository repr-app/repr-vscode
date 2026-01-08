#!/bin/bash

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in a git repo
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}Error: Not in a git repository${NC}"
    exit 1
fi

# Check for uncommitted changes
if [[ -n $(git status -s) ]]; then
    echo -e "${RED}Error: You have uncommitted changes. Please commit or stash them first.${NC}"
    git status -s
    exit 1
fi

# Parse version bump type (default: patch)
BUMP_TYPE=${1:-patch}

if [[ ! "$BUMP_TYPE" =~ ^(major|minor|patch)$ ]]; then
    echo -e "${RED}Error: Invalid version bump type. Use: major, minor, or patch${NC}"
    echo "Usage: ./publish.sh [major|minor|patch]"
    exit 1
fi

echo -e "${YELLOW}Current version:${NC}"
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "v$CURRENT_VERSION"

# Bump version using npm
echo -e "\n${YELLOW}Bumping $BUMP_TYPE version...${NC}"
npm version $BUMP_TYPE --no-git-tag-version

NEW_VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}New version: v$NEW_VERSION${NC}"

# Compile TypeScript
echo -e "\n${YELLOW}Compiling TypeScript...${NC}"
npm run compile

# Package extension
echo -e "\n${YELLOW}Packaging extension...${NC}"
npx vsce package

# Commit changes
echo -e "\n${YELLOW}Committing version bump...${NC}"
git add package.json package-lock.json
git commit -m "Bump version to v$NEW_VERSION"

# Create git tag
echo -e "\n${YELLOW}Creating git tag v$NEW_VERSION...${NC}"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

# Push to remote
echo -e "\n${YELLOW}Pushing to remote...${NC}"
git push origin main
git push origin "v$NEW_VERSION"

# Create GitHub release if gh CLI is available
if command -v gh &> /dev/null; then
    echo -e "\n${YELLOW}Creating GitHub Release...${NC}"
    gh release create "v$NEW_VERSION" \
        --title "v$NEW_VERSION" \
        --notes "Release v$NEW_VERSION" \
        --latest \
        "./repr-$NEW_VERSION.vsix"
    
    echo -e "\n${GREEN}✓ Successfully published v$NEW_VERSION${NC}"
    echo -e "\nThe GitHub Action will automatically publish to:"
    echo "  - VS Code Marketplace"
    echo "  - Open VSX (Cursor)"
else
    echo -e "\n${GREEN}✓ Successfully published v$NEW_VERSION${NC}"
    echo -e "\n${YELLOW}Note: GitHub CLI (gh) not found${NC}"
    echo "Install it with: brew install gh"
    echo ""
    echo "Next steps:"
    echo "1. Create a GitHub Release at: https://github.com/repr-app/repr-vscode/releases/new?tag=v$NEW_VERSION"
    echo "2. The GitHub Action will automatically publish to VS Code Marketplace and Open VSX"
    echo ""
    echo "Or publish manually now:"
    echo "  npx vsce publish"
    echo "  npx ovsx publish"
fi

