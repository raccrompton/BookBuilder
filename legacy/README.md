# Legacy Python Implementation

This directory contains the original Python-based BookBuilder implementation.

## Structure
- `core/` - Main chess logic and engine integration
- `web/` - Flask web application
- `config/` - Configuration files
- `tests/` - Test suite

## Files
- `core/BookBuilder.py` - Main chess opening analysis engine
- `core/workerEngineReduce.py` - Stockfish engine worker
- `core/config.py` - Configuration loader
- `web/app.py` - Flask web server
- `config/config.yaml` - Main configuration file

## Running the Legacy System

### Install Dependencies
```bash
pip3 install -r ../deployment/legacy/requirements.txt
```

### Run the Web Application
```bash
python3 web/app.py
```

### Run the Command Line Tool
```bash
python3 core/BookBuilder.py
# When prompted, enter: config/config.yaml
```

### Run Tests
```bash
# Set config path and run tests
python3 -c "
import sys
sys.argv = ['test', 'config/config.yaml']
exec(open('tests/test_chess_logic.py').read())
"
```

**Note**: The config.py module requires a config file path. Always provide `config/config.yaml` as the path when prompted or as a command line argument.

## Migration Status
This implementation will be maintained in parallel during client-side migration. All existing functionality works as before after reorganization - just use the paths above.