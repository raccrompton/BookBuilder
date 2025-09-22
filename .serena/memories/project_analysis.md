# BookBuilder Project Analysis

## Current State
- **Core Python Engine**: BookBuilder.py - Complex chess opening repertoire generator
- **Web Interface**: Flask app.py - Basic web wrapper around Python engine
- **Architecture**: 4 main classes (Rooter, Leafer, Printer, Grower) handling chess analysis
- **Data Source**: Lichess API for opening statistics
- **Engine Integration**: Stockfish for position evaluation
- **Output**: PGN files for chess study platforms

## Key Components
- **Rooter**: Calculates opening probabilities and player perspectives
- **Leafer**: Processes opening moves and variations
- **Printer**: Handles PGN output formatting
- **Grower**: Expands repertoire based on engine analysis
- **Flask Routes**: /generate endpoint wraps Python script execution

## Technical Stack
- Backend: Python + Flask
- Chess Engine: Stockfish
- Data: Lichess API
- Config: YAML-based settings
- Output: PGN format files

## Current Limitations
- Flask wrapper creates subprocess calls to Python script
- No real-time progress feedback
- Limited error handling in web interface
- Lichess API rate limiting concerns
- Complex config file management