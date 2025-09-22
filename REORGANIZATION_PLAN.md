# Codebase Reorganization for Migration

## Current Structure Analysis

### Core Components Identified:
- **Python Engine**: `BookBuilder.py` (main chess logic)
- **Web Interface**: `app.py` (Flask server)
- **Configuration**: `config.py`, `config.yaml`
- **Engine Worker**: `workerEngineReduce.py`
- **Tests**: `tests/` directory
- **Documentation**: Various `.md` files
- **Temp/Legacy**: `temp_clone/` (should be cleaned)

## Proposed Migration-Friendly Structure

```
BookBuilder/
├── legacy/                          # Phase 1: Current Python implementation
│   ├── core/
│   │   ├── BookBuilder.py          # Main chess engine logic
│   │   ├── workerEngineReduce.py   # Stockfish engine worker
│   │   └── config.py               # Configuration loader
│   ├── web/
│   │   └── app.py                  # Flask web server
│   ├── config/
│   │   └── config.yaml             # Configuration file
│   └── tests/                      # All existing tests
│       ├── test_chess_logic.py
│       ├── test_flask_app.py
│       └── ...
├── client/                         # Phase 2: New JavaScript implementation
│   ├── src/
│   │   ├── core/                   # Core chess logic (JS)
│   │   ├── engine/                 # Stockfish.js integration
│   │   ├── ui/                     # Web interface components
│   │   └── config/                 # Configuration management
│   ├── public/
│   │   ├── index.html
│   │   ├── stockfish.wasm
│   │   └── assets/
│   └── tests/                      # Client-side tests
│       ├── unit/
│       ├── integration/
│       └── e2e/
├── shared/                         # Phase 3: Common resources
│   ├── config/
│   │   ├── default.yaml            # Shared configuration
│   │   └── validation.schema.json  # Config validation
│   ├── docs/
│   │   ├── api/                    # API documentation
│   │   └── migration/              # Migration guides
│   └── test-data/
│       ├── golden-pgns/            # Reference test cases
│       └── sample-configs/         # Test configurations
├── deployment/                     # Phase 4: Deployment configs
│   ├── legacy/
│   │   ├── railway.json            # Current Railway config
│   │   ├── requirements.txt
│   │   └── Procfile
│   ├── client/
│   │   ├── netlify.toml           # Static site config
│   │   ├── vercel.json            # Alternative hosting
│   │   └── package.json
│   └── docker/                    # Optional containerization
├── migration/                     # Phase 5: Migration tooling
│   ├── scripts/
│   │   ├── validate-parity.py     # Compare outputs
│   │   ├── benchmark.py           # Performance testing
│   │   └── migrate-data.js        # User data migration
│   ├── test-suites/
│   │   ├── reference-suite/       # Golden test cases
│   │   └── regression-tests/      # Validation tests
│   └── docs/
│       ├── migration-guide.md
│       └── rollback-procedures.md
└── docs/                          # Documentation
    ├── README.md                  # Main project readme
    ├── CLIENT_SIDE_MIGRATION_PLAN.md
    ├── TESTING_STRATEGY.md
    └── architecture/
        ├── legacy-system.md
        ├── client-system.md
        └── comparison.md
```

## Migration Benefits

### 1. **Clear Separation of Concerns**
- Legacy code isolated in `legacy/` (including critical test suite)
- New implementation in `client/` (with new JS test suite)
- Shared resources easily accessible
- Migration tooling organized

### Test Strategy
- **Legacy Tests** (`legacy/tests/`) - Keep existing Python test suite for validation
- **Client Tests** (`client/tests/`) - New JavaScript test suite with identical coverage
- **Migration Tests** (`migration/test-suites/`) - Cross-platform validation scripts
- **Golden Tests** (`shared/test-data/`) - Reference outputs for comparison

### 2. **Parallel Development**
- Teams can work on legacy and client simultaneously
- Clear boundaries prevent conflicts
- Shared test data ensures consistency

### 3. **Easy Validation**
- Migration scripts in dedicated folder
- Reference test suites for comparison
- Clear rollback procedures

### 4. **Deployment Flexibility**
- Separate deployment configs
- Can deploy both versions simultaneously
- Easy A/B testing setup

## Implementation Phases

### Phase 1: Reorganize Current Code (1 day)
```bash
# Move current code to legacy structure
mkdir -p legacy/{core,web,config,tests}
mv BookBuilder.py legacy/core/
mv app.py legacy/web/
mv config.py legacy/core/
mv config.yaml legacy/config/
mv tests/* legacy/tests/
```

### Phase 2: Create Client Structure (30 minutes)
```bash
# Create client-side structure
mkdir -p client/{src/{core,engine,ui,config},public,tests/{unit,integration,e2e}}
mkdir -p shared/{config,docs,test-data}
mkdir -p deployment/{legacy,client}
```

### Phase 3: Setup Migration Tooling (1 day)
```bash
# Create migration infrastructure
mkdir -p migration/{scripts,test-suites,docs}
# Copy reference configurations and test data
```

### Phase 4: Update Documentation (2 hours)
- Update all documentation paths
- Create architecture diagrams
- Document migration procedures

## File Movement Plan

### Immediate Moves:
- `BookBuilder.py` → `legacy/core/BookBuilder.py`
- `app.py` → `legacy/web/app.py`
- `workerEngineReduce.py` → `legacy/core/workerEngineReduce.py`
- `config.py` → `legacy/core/config.py`
- `config.yaml` → `legacy/config/config.yaml`
- `tests/` → `legacy/tests/`
- `railway.json` → `deployment/legacy/railway.json`
- `requirements.txt` → `deployment/legacy/requirements.txt`

### Archive/Clean:
- `temp_clone/` → DELETE (temporary development artifacts)
- `__pycache__/` → DELETE (Python cache)
- Generated PGN files → Move to `shared/test-data/samples/`

### Keep in Root:
- `README.md`
- `LICENSE`
- `.gitignore`
- `CLIENT_SIDE_MIGRATION_PLAN.md`
- `.git/`