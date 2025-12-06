#!/bin/bash

# =============================================================================
# ON-STOP HOOK
# =============================================================================
# This script runs automatically when Claude finishes a task.
# It performs quality checks to ensure code meets project standards.
#
# Exit Codes:
#   0 - All checks passed
#   2 - One or more checks failed
#
# Customize the CHECK_* variables below to match your project's tooling.
# =============================================================================

# -----------------------------------------------------------------------------
# CONFIGURATION - Customize these for your project
# -----------------------------------------------------------------------------

# Set to "true" to enable each check, "false" to disable
CHECK_TYPES="true"      # TypeScript/type checking
CHECK_LINT="true"       # ESLint/linting
CHECK_FORMAT="true"     # Prettier/formatting
CHECK_TESTS="true"      # Unit tests

# Commands for each check (customize for your project)
CMD_TYPES="npm run typecheck"           # or: tsc --noEmit, npx tsc
CMD_LINT="npm run lint"                 # or: npx eslint . --fix
CMD_FORMAT="npm run format:check"       # or: npx prettier --check .
CMD_TESTS="npm test"                    # or: npx vitest run, pytest

# -----------------------------------------------------------------------------
# SCRIPT LOGIC - Generally no need to modify below this line
# -----------------------------------------------------------------------------

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track if any checks fail
HAS_ERRORS=0

# Print header
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}                    CODE QUALITY CHECKS                      ${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Function to run a check
run_check() {
    local name="$1"
    local enabled="$2"
    local cmd="$3"

    if [ "$enabled" != "true" ]; then
        echo -e "${YELLOW}⏭️  $name: SKIPPED${NC}"
        return 0
    fi

    echo -e "${BLUE}▶ Running $name...${NC}"

    local start_time=$(date +%s)
    local output
    local exit_code

    # Run command and capture output
    output=$(eval "$cmd" 2>&1)
    exit_code=$?

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}✅ $name: PASSED${NC} (${duration}s)"
    else
        echo -e "${RED}❌ $name: FAILED${NC} (${duration}s)"
        echo ""
        echo -e "${YELLOW}Output:${NC}"
        echo "$output" | head -50  # Limit output to 50 lines
        if [ $(echo "$output" | wc -l) -gt 50 ]; then
            echo -e "${YELLOW}... (output truncated)${NC}"
        fi
        echo ""
        HAS_ERRORS=1
    fi

    return $exit_code
}

# -----------------------------------------------------------------------------
# DETECT PROJECT TYPE - Skip checks if tools aren't available
# -----------------------------------------------------------------------------

has_npm_script() {
    [ -f "package.json" ] && npm run 2>/dev/null | grep -q "^  $1$"
}

has_command() {
    command -v "$1" >/dev/null 2>&1
}

# Run checks only if the tooling exists
if has_npm_script "typecheck" || has_command "tsc"; then
    run_check "Type Check" "$CHECK_TYPES" "$CMD_TYPES"
else
    echo -e "${YELLOW}⏭️  Type Check: SKIPPED (no typecheck script or tsc found)${NC}"
fi

if has_npm_script "lint" || has_command "eslint"; then
    run_check "Lint" "$CHECK_LINT" "$CMD_LINT"
else
    echo -e "${YELLOW}⏭️  Lint: SKIPPED (no lint script or eslint found)${NC}"
fi

if has_npm_script "format:check" || has_command "prettier"; then
    run_check "Format" "$CHECK_FORMAT" "$CMD_FORMAT"
else
    echo -e "${YELLOW}⏭️  Format: SKIPPED (no format:check script or prettier found)${NC}"
fi

if has_npm_script "test" || has_command "pytest" || has_command "vitest"; then
    run_check "Tests" "$CHECK_TESTS" "$CMD_TESTS"
else
    echo -e "${YELLOW}⏭️  Tests: SKIPPED (no test script found)${NC}"
fi

# Print summary
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [ $HAS_ERRORS -eq 0 ]; then
    echo -e "${GREEN}✨ All checks passed!${NC}"
else
    echo -e "${RED}⚠️  Some checks failed. Please review and fix issues.${NC}"
fi
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Agent invocation reminder
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}📋 AGENT REVIEW REMINDER${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "If you modified code, invoke the review agents:"
echo ""
echo "  • code-standards-reviewer - For code quality, documentation, naming"
echo "  • architect - For new files, features, security changes"
echo ""
echo "Use Task tool with subagent_type='general-purpose' and reference"
echo "the agent definitions in .claude/agents/"
echo ""

# Exit with appropriate code
if [ $HAS_ERRORS -eq 0 ]; then
    exit 0
else
    exit 2
fi
