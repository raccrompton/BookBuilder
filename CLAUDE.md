# BookBuilder - Project Memory

> Living document for project context, decisions, and progress.

---

## Overview

BookBuilder is a chess opening repertoire builder that uses Lichess statistics and Stockfish analysis to help players develop personalized opening lines.

**Stack:**
- Frontend: React/TypeScript
- Backend: Node.js
- Chess Engine: Stockfish (via node-stockfish-threading)
- Data Source: Lichess API
- Integration: MCP Server for Claude Desktop/Code

---

## File Structure

```
/
├── client/src/          # React frontend application
├── mcp-server/          # MCP server for Claude integration
│   ├── src/
│   │   ├── index.js                  # Main MCPServer class
│   │   ├── lichess-api.js            # Lichess API wrapper (stub)
│   │   ├── stockfish-engine.js       # Stockfish wrapper (stub)
│   │   ├── move-selector.js          # Move selection wrapper (stub)
│   │   └── repertoire-generator.js   # Repertoire generation wrapper (stub)
│   └── tests/
│       └── mcp-server.test.js        # Comprehensive test suite (56 tests)
```

---

## Architecture Decisions

### MCP Server Integration (2026-01-09)

**Decision:** Created standalone MCP server to expose BookBuilder chess analysis tools to Claude Desktop/Code.

**Rationale:**
- Enables Claude to analyze positions, evaluate moves, and generate repertoires during conversations
- Uses stdio transport (standard for Claude Desktop/Code)
- Stub architecture allows incremental implementation of wrappers around existing services

**Implementation:**
- 4 tools exposed: `analyze_position`, `select_best_move`, `evaluate_position`, `generate_repertoire`
- Stub files will be replaced with wrappers around LichessClient, MoveSelector, NodeStockfishEngine
- Test-first approach with mocked dependencies (56 tests)

**Future work:**
- Implement real wrappers around existing BookBuilder services
- Add rate limiting for Lichess API calls
- Use chess.js for proper FEN/PGN validation
- Fix PGN validation regex to allow `#` and `$` characters

---

## Dependencies

- `@modelcontextprotocol/sdk` - MCP server SDK for tool registration and stdio transport
- `node-stockfish-threading` - Stockfish chess engine integration
- `chess.js` - Chess validation and move generation (planned for MCP server)

---

## API Endpoints

### MCP Server Tools

| Tool | Input | Output | Status |
|------|-------|--------|--------|
| `analyze_position` | FEN, player color, ratings, speeds | Lichess opening statistics | Stub |
| `select_best_move` | FEN, player color, ratings, speeds, algorithm | Best move recommendation | Stub |
| `evaluate_position` | FEN, depth | Stockfish evaluation (score, best move, PV) | Stub |
| `generate_repertoire` | Base PGN, player color, ratings, speeds, depth | Complete repertoire PGN | Stub |

---

## Plan & Progress

### Completed
- [x] MCP server scaffolding with 4 tools
- [x] Stub implementations for all wrappers
- [x] Comprehensive test suite (56 tests passing)
- [x] Package configuration for npm installation

### In Progress
- [ ] Implement LichessAPI wrapper around existing LichessClient
- [ ] Implement StockfishEngine wrapper around NodeStockfishEngine
- [ ] Implement MoveSelector wrapper around existing MoveSelector
- [ ] Implement RepertoireGenerator wrapper
- [ ] Add rate limiting for Lichess API
- [ ] Replace regex validation with chess.js
- [ ] Configure MCP server in Claude Desktop

---

## Help

### Testing MCP Server Locally

```bash
cd mcp-server
npm test                    # Run test suite
node src/index.js           # Start server (stdio mode)
```

### Installing in Claude Desktop

Add to Claude Desktop config:
```json
{
  "mcpServers": {
    "bookbuilder": {
      "command": "node",
      "args": ["/path/to/BookBuilder/mcp-server/src/index.js"]
    }
  }
}
```
