# Contributing to BookBuilder

Thank you for your interest in contributing to BookBuilder! This document provides guidelines and instructions for contributing.

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm 9 or higher

### Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/BookBuilder.git
   cd BookBuilder/client
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run tests to verify setup:
   ```bash
   npm test
   ```

## Development Workflow

### Running the Application

```bash
npm run dev
# Open http://localhost:3000/app.html
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npx jest tests/bookbuilder.test.js

# Run tests with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

### Linting

```bash
npm run lint
npm run format
```

## Code Style

### Documentation Standards

All code must follow educational documentation standards:

- **Line-by-line comments** explaining purpose and reasoning in plain English
- **File-level documentation** explaining the file's role and dependencies
- **Function-level documentation** with parameters, returns, and examples
- Comments should teach the "why", not just restate the code

Write code as if teaching a friend who is learning to program.

### JavaScript Conventions

- Use ES6 modules (`import`/`export`)
- Use `async`/`await` for asynchronous code
- Use the centralized Logger utility (not `console.log`)
- Follow existing patterns in the codebase

### Chess Library Usage

This project uses specific libraries for chess operations:

- **chess.js**: PGN parsing, move validation, FEN handling
- **chessops**: PGN tree merging with variations

Never use manual string manipulation for PGN operations. See the project README for detailed guidelines.

## Pull Request Process

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following the code style guidelines

3. Add or update tests as needed

4. Ensure all tests pass:
   ```bash
   npm test
   ```

5. Ensure linting passes:
   ```bash
   npm run lint
   ```

6. Commit with a descriptive message following conventional commits:
   ```bash
   git commit -m "feat(scope): add new feature"
   ```

   Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

7. Push and open a Pull Request

### PR Requirements

- All tests must pass
- Code must follow documentation standards
- New features should include tests
- Bug fixes should include regression tests

## Reporting Issues

### Bug Reports

Please include:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Browser/Node.js version
- Any relevant PGN input that triggers the issue

### Feature Requests

Please describe:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## Questions?

Open an issue with the `question` label or start a discussion.

## License

By contributing, you agree that your contributions will be licensed under the GPL-3.0-or-later license.
