# BookBuilder - Project Memory

> Living document for project context, decisions, and progress.

---

## Overview

BookBuilder is a chess opening repertoire builder that uses Lichess statistics and Stockfish analysis to help players develop personalized opening lines.

**Stack:**
- Frontend: React/TypeScript
- Backend: Node.js
- Chess Engine: Stockfish (via node-stockfish-threading + standalone stockfish)
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
│   │   ├── lichess-api.js            # Lichess API wrapper (real API calls)
│   │   ├── stockfish-engine.js       # Stockfish wrapper (standalone engine)
│   │   ├── move-selector.js          # Move selection wrapper (Wilson confidence)
│   │   └── repertoire-generator.js   # Repertoire generation wrapper (minimal stub)
│   └── tests/
│       └── mcp-server.test.js        # Comprehensive test suite (127 tests)
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
- LichessAPI wrapper calls real Lichess Opening Explorer API
- StockfishEngine wrapper uses standalone stockfish package (v17.0.0)
- MoveSelector wrapper implements Wilson confidence interval algorithm
- RepertoireGenerator wrapper is minimal stub (returns input PGN)
- Uses chess.js for UCI to SAN conversion with board context
- PGN validation allows `#` (checkmate) and `$` (NAG annotations)
- Test-first approach with 127 tests (56 original + 71 wrapper tests)

**Known issues:**
- Hardcoded Stockfish path may break on version update
- No rate limiting for Lichess API calls
- RepertoireGenerator not fully implemented yet

---

## Dependencies

- `@modelcontextprotocol/sdk` - MCP server SDK for tool registration and stdio transport
- `node-stockfish-threading` - Stockfish chess engine integration (main app)
- `stockfish` (v17.0.0) - Standalone Stockfish engine for MCP server
- `chess.js` (v1.0.0-beta.8) - Chess validation and UCI to SAN conversion in MCP server

---

## API Endpoints

### MCP Server Tools

| Tool | Input | Output | Status |
|------|-------|--------|--------|
| `analyze_position` | FEN, player color, ratings, speeds | Lichess opening statistics | Implemented |
| `select_best_move` | FEN, player color, ratings, speeds, algorithm | Best move recommendation | Implemented |
| `evaluate_position` | FEN, depth | Stockfish evaluation (score, best move, PV) | Implemented |
| `generate_repertoire` | Base PGN, player color, ratings, speeds, depth | Complete repertoire PGN | Minimal stub |

---

## Plan & Progress

### Completed
- [x] MCP server scaffolding with 4 tools
- [x] Stub implementations for all wrappers
- [x] LichessAPI wrapper (calls real Lichess Opening Explorer API)
- [x] StockfishEngine wrapper (standalone stockfish v17.0.0)
- [x] MoveSelector wrapper (Wilson confidence intervals)
- [x] UCI to SAN conversion using chess.js
- [x] PGN validation supports `#` and `$` characters
- [x] Comprehensive test suite (127 tests passing)
- [x] Package configuration with stockfish and chess.js dependencies

### In Progress
- [ ] Implement full RepertoireGenerator logic (currently minimal stub)
- [ ] Add rate limiting for Lichess API
- [ ] Fix hardcoded Stockfish path (version-dependent)
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
