# Project Development Guidelines

> This file contains project-specific rules and coding standards. Claude reads this automatically.

---

## Documentation Standards

> **MANDATORY**: All code must follow educational documentation standards.

**Reference**: `.claude/skills/educational-documentation.md`

### Requirements
- **Line-by-line comments** explaining purpose and reasoning in plain English
- **File-level documentation** explaining the file's role and dependencies
- **Function-level documentation** with parameters, returns, and examples
- **Explain programming concepts** that beginners might not know
- Comments should teach the "why", not just restate the code

Write code as if teaching a friend who is learning to program.

---

## Core Principles

### 1. Verification Before Action
- **Never assume** - Always verify current state before making changes
- **Read before writing** - Understand existing code patterns before modifying
- **Test after changes** - Verify changes work as expected

### 2. Minimal Changes
- Make the smallest change that solves the problem
- Avoid refactoring code unrelated to the current task
- Don't add features or "improvements" unless explicitly requested

### 3. Consistency Over Preference
- Follow existing patterns in the codebase
- Match the style of surrounding code
- Use established project conventions, not personal preferences

---

## Mandatory Workflows

### After Every Code Change
Claude **MUST** invoke the `code-standards-reviewer` agent to verify:
- Code follows project style guidelines
- No regressions introduced
- Patterns match existing codebase

### For Architecture Decisions
Claude **MUST** invoke the `architect` agent when:
- Adding new files or modules
- Changing project structure
- Implementing new features
- Making security-related changes

---

## Project Structure

```
BookBuilder/
├── client/
│   ├── src/
│   │   ├── BookBuilder.js      # Main orchestrator class
│   │   ├── MoveSelector.js     # Move selection with weighted random
│   │   ├── engine/             # Chess engine integration
│   │   ├── pgn/                # PGN processing (chessops)
│   │   ├── ui/                 # UI components and file generation
│   │   └── utils/              # Utilities (Logger, PgnProcessor)
│   ├── tests/                  # Jest test files
│   └── package.json
├── legacy/                     # Python legacy code
│   └── core/
│       └── BookBuilder.py
├── .claude/
│   ├── agents/                 # Subagent definitions
│   ├── hooks/                  # Automation scripts
│   ├── skills/                 # Domain knowledge files
│   └── settings.json
└── CLAUDE.md
```

---

## File Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `BookBuilder.js` |
| Utilities | camelCase | `PgnProcessor.js` |
| Constants | SCREAMING_SNAKE_CASE | `DEFAULT_CONFIG.js` |
| Test files | *.test.* | `bookbuilder.test.js` |
| Config files | lowercase with dots | `jest.config.js` |

---

## Code Quality Standards

### General Rules
- **No magic numbers** - Use named constants
- **No commented-out code** - Delete it; use git history
- **No console.log in production** - Use the Logger utility
- **Handle errors explicitly** - Don't swallow exceptions

### Type Safety (JavaScript)
- Use JSDoc for type annotations
- Validate function parameters
- Handle null/undefined explicitly

### Functions
- Single responsibility - One function, one job
- Keep functions small - Under 50 lines ideally
- Descriptive names that indicate behavior
- Return early for edge cases (guard clauses)

### Comments
- Follow educational documentation standards (see Documentation Standards above)
- Every line should have a comment explaining purpose and reasoning
- No TODO comments in production code
- JSDoc for public APIs

---

## Testing Requirements

### Before Submitting Changes
1. All existing tests must pass
2. New functionality requires new tests
3. Bug fixes should include regression tests

### Test Organization
- Tests are in `client/tests/` directory
- Name tests descriptively: `should_return_null_when_input_is_empty`
- One assertion concept per test

---

## Development Commands

```bash
# Run all tests
npm test

# Run specific test file
npx jest client/tests/bookbuilder.test.js

# Run tests with coverage
npm run test:coverage

# Start development server (browser GUI)
npm run dev
```

---

## Git Workflow

### Commit Messages
- Use conventional commits: `type(scope): description`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
- Keep subject line under 72 characters
- Use imperative mood: "Add feature" not "Added feature"

### Before Committing
1. Run linter and fix issues
2. Run tests
3. Review changes with `git diff`

### Commit Attribution
- Do not include "Generated with Claude Code" or "Co-Authored-By: Claude" lines
- Commits should have clean messages with no AI attribution

---

## Security Checklist

- [ ] No secrets in code (use environment variables)
- [ ] Input validation on all user data
- [ ] Output encoding to prevent XSS
- [ ] No sensitive data in logs

---

## Skills Reference

For detailed coding standards, Claude should reference:
- `.claude/skills/typescript-standards.md` - TypeScript/JavaScript patterns
- `.claude/skills/python-standards.md` - Python patterns (legacy code)
- `.claude/skills/testing-standards.md` - Testing best practices
- `.claude/skills/educational-documentation.md` - **Required** educational comment standards

---

## On-Stop Hook

When Claude finishes a task, the `on-stop.sh` hook automatically runs to verify:
- Type checking passes
- All tests pass
- Linting rules satisfied
- Code is properly formatted

**Claude must address any failures** before considering the task complete.

---

# BookBuilder Project-Specific Instructions

## PGN Handling Guidelines

This project uses two chess libraries for PGN (Portable Game Notation) operations. **Always use these libraries instead of manual string manipulation.**

### When to Use chess.js

Use `chess.js` for:
- **Parsing PGN strings**: `chess.loadPgn(pgnString)`
- **Extracting move lists**: `chess.history()` returns clean SAN array
- **Validating moves**: `chess.move(san)` returns null if invalid
- **Generating PGN output**: `chess.pgn()` produces properly formatted PGN
- **Position management**: FEN handling, turn tracking, move validation

```javascript
// CORRECT: Use chess.js for PGN parsing
const { Chess } = await import('chess.js');
const chess = new Chess();
chess.loadPgn(pgnString);
const moves = chess.history(); // ['e4', 'e5', 'Nf3', 'Nc6']

// WRONG: Manual string splitting
const moves = pgnString.split(' ').filter(m => !m.includes('.')); // Fragile!
```

### When to Use chessops

Use `chessops` for:
- **PGN tree operations**: Merging multiple lines into variation trees
- **Complex PGN structures**: Nested variations, annotations
- **PGN generation with variations**: `makePgn()` handles variation parentheses

```javascript
// CORRECT: Use chessops for tree merging
import { parsePgn, makePgn } from 'chessops/pgn';
const games = parsePgn(pgnString);
// ... tree manipulation
const output = makePgn(game);
```

### What NOT to Do

Never use these patterns for PGN operations:

```javascript
// BAD: String concatenation for PGN building
const newPgn = currentPgn + ' ' + move; // Can produce invalid PGN

// BAD: Regex for move extraction
const moves = pgn.match(/[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8]/g); // Misses edge cases

// BAD: Split by space for move parsing
const tokens = pgn.split(' '); // Breaks with annotations, variations

// BAD: Manual move number formatting
const formatted = `${moveNum}. ${whiteMove} ${blackMove}`; // Use chess.pgn()
```

### Error Handling

- **Throw errors** instead of silently falling back to string concatenation
- Log warnings with context when parsing fails
- Return empty arrays for invalid input, not malformed data

```javascript
// CORRECT: Throw on failure
try {
    chess.loadPgn(pgn);
    return chess.history().map(san => ({ san }));
} catch (error) {
    throw new Error(`PGN parsing failed: ${error.message}`);
}

// WRONG: Silent fallback
try {
    chess.loadPgn(pgn);
} catch {
    return pgn.split(' '); // Silent degradation produces bad data
}
```

### Key Files

- `client/src/BookBuilder.js` - Uses chess.js for move extraction and PGN updates
- `client/src/ui/FileGenerator.js` - Uses chess.js for PGN parsing in annotations
- `client/src/pgn/PgnTreeMerger.js` - Uses chessops for variation tree merging
- `client/src/utils/PgnProcessor.js` - Uses chess.js for input normalization
