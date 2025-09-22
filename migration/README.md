# Migration Tooling and Validation

This directory contains tools and procedures for the Python → JavaScript migration.

## Structure
- `scripts/` - Migration and validation scripts
- `test-suites/` - Reference and regression test suites
- `docs/` - Migration documentation

## Key Migration Tools (To Be Developed)

### Validation Scripts
- `validate-parity.py` - Compare Python vs JavaScript output
- `benchmark.py` - Performance comparison testing
- `engine-comparison.py` - Stockfish.js vs Python-Stockfish validation

### Data Migration
- `migrate-data.js` - User preference migration
- `config-converter.js` - Configuration format conversion

### Test Suites
- `reference-suite/` - Golden test cases from Python version
- `regression-tests/` - Automated validation tests

## Usage During Migration

1. **Phase 0**: Create reference test suite
2. **Phase 1-2**: Continuous validation during development
3. **Phase 3**: Production validation and rollout

See CLIENT_SIDE_MIGRATION_PLAN.md for complete migration strategy.