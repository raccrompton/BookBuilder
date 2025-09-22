# BookBuilder Test Suite

Comprehensive testing framework for the BookBuilder chess opening repertoire generator.

## Overview

This test suite provides complete coverage of BookBuilder's functionality with a focus on:
- **Chess-specific edge cases** and boundary conditions
- **Production readiness** through realistic scenarios
- **Quality assurance** with systematic testing approaches
- **Performance validation** under various load conditions

## Test Structure

### Core Test Files

- **`test_flask_app.py`** - Flask web interface testing
  - Route testing (`/`, `/health`, `/generate`, `/download`)
  - Request/response validation
  - Error handling and edge cases
  - Security measures (path traversal, file validation)

- **`test_chess_logic.py`** - Chess-specific functionality
  - PGN parsing and validation
  - Chess position handling
  - Lichess API integration
  - Statistical calculations
  - Engine integration (mocked)

- **`test_integration.py`** - Full workflow integration
  - End-to-end repertoire generation
  - File system operations
  - Subprocess execution
  - Network integration
  - Error recovery

- **`test_edge_cases.py`** - Boundary condition testing
  - Extreme configuration values
  - Malformed input handling
  - Resource limit testing
  - Unicode and encoding issues
  - Data corruption scenarios

- **`test_performance.py`** - Performance and scalability
  - Generation timing benchmarks
  - Memory usage patterns
  - Concurrent request handling
  - Resource utilization efficiency

### Configuration Files

- **`conftest.py`** - Pytest fixtures and test utilities
- **`pytest.ini`** - Test execution configuration
- **`test_requirements.txt`** - Additional testing dependencies
- **`test_runner.py`** - Comprehensive test execution script

## Running Tests

### Quick Start

```bash
# Install test dependencies
pip install -r test_requirements.txt

# Run quick development tests
python tests/test_runner.py --quick

# Run comprehensive test suite
python tests/test_runner.py --all
```

### Test Categories

```bash
# Unit tests (fast, isolated)
python tests/test_runner.py --unit

# Integration tests (realistic workflows)
python tests/test_runner.py --integration

# Chess-specific tests
python tests/test_runner.py --chess

# Edge case and boundary testing
python tests/test_runner.py --edge-cases

# Performance and load testing
python tests/test_runner.py --performance

# Security testing
python tests/test_runner.py --security

# Code quality checks
python tests/test_runner.py --quality
```

### Test Execution Options

```bash
# Verbose output
python tests/test_runner.py --all --verbose

# Exclude slow tests
python tests/test_runner.py --all --exclude-slow

# Clean reports before running
python tests/test_runner.py --all --cleanup

# Run with pytest directly
pytest tests/ -v --tb=short
```

## Chess-Specific Test Scenarios

### Opening Validation Tests
- Valid PGN parsing for common openings
- Invalid move detection and rejection
- Complex opening variation handling
- Transposition and move order validation

### Statistical Edge Cases
- Extreme win/loss/draw distributions
- Zero and negative game counts
- Confidence interval boundary conditions
- Minimum game threshold validation

### Engine Integration Tests
- Stockfish evaluation mocking
- Centipawn calculation accuracy
- Soundness and loss limit enforcement
- Engine timeout and error handling

### API Integration Tests
- Lichess API response parsing
- Rate limiting and retry logic
- Network error resilience
- Malformed response handling

## Performance Testing Strategy

### Benchmarks
- Small repertoire: <60 seconds (no engine)
- Medium repertoire: <300 seconds (with engine)
- Large repertoire: <1200 seconds (complex analysis)

### Resource Limits
- Memory usage: <500MB for typical repertoires
- File descriptors: No leaks in concurrent operations
- CPU utilization: Efficient multi-core usage when applicable

### Load Testing
- Concurrent request handling (3-5 simultaneous)
- Memory pressure resistance
- Filesystem contention management
- Timeout behavior validation

## Quality Assurance Features

### Automated Validation
- PGN structure verification
- Chess move legality checking
- Configuration completeness testing
- File system integrity validation

### Error Recovery Testing
- Graceful degradation scenarios
- Corruption resistance
- Resource exhaustion handling
- Process failure recovery

### Security Testing
- Input sanitization validation
- Path traversal prevention
- File type restrictions
- Configuration injection protection

## Test Reports and Analysis

### Generated Reports
- **HTML Reports**: `test_reports/all_tests.html`
- **Coverage Reports**: `test_reports/coverage/index.html`
- **XML Reports**: `test_reports/*.xml` (CI/CD compatible)
- **Performance Data**: Benchmark results and timing analysis

### Report Analysis
- Test execution summaries
- Coverage percentage tracking
- Performance regression detection
- Failure pattern analysis

## Continuous Integration Setup

### GitHub Actions Example

```yaml
name: BookBuilder Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.9'
    - name: Install dependencies
      run: |
        pip install -r requirements.txt
        pip install -r test_requirements.txt
    - name: Run tests
      run: python tests/test_runner.py --all --exclude-slow
    - name: Upload coverage
      uses: codecov/codecov-action@v3
```

### Railway Deployment Testing

```bash
# Test Railway-specific functionality
python tests/test_runner.py --integration --verbose

# Validate health endpoint
curl -f http://localhost:5000/health || exit 1

# Test file download security
python tests/test_runner.py --security
```

## Development Workflow

### Pre-commit Testing
```bash
# Quick validation before commits
python tests/test_runner.py --quick

# Full validation before push
python tests/test_runner.py --all --exclude-slow
```

### Test-Driven Development
1. Write failing tests for new features
2. Implement minimal functionality
3. Refactor with test coverage
4. Validate with comprehensive test suite

### Regression Testing
```bash
# Test specific functionality after changes
pytest tests/test_chess_logic.py::TestChessPositionHandling -v

# Validate performance hasn't degraded
python tests/test_runner.py --performance
```

## Extending the Test Suite

### Adding New Tests

1. **Choose appropriate test file** based on functionality
2. **Use existing fixtures** from `conftest.py`
3. **Follow naming conventions** (`test_*` functions)
4. **Add appropriate markers** for categorization
5. **Include edge cases** and error scenarios

### Chess-Specific Test Guidelines

- **Always validate move legality** in chess position tests
- **Test both perspectives** (White and Black to move)
- **Include complex openings** with multiple variations
- **Validate statistical calculations** with known data
- **Mock external APIs** for reliable testing

### Performance Test Guidelines

- **Set realistic benchmarks** based on hardware constraints
- **Test resource cleanup** to prevent leaks
- **Validate concurrent behavior** with multiple threads
- **Monitor system resources** during execution
- **Include timeout handling** for long operations

## Troubleshooting

### Common Issues

1. **Import Errors**: Ensure project root is in Python path
2. **Permission Errors**: Check temporary directory access
3. **Network Timeouts**: Use mocked APIs for offline testing
4. **Resource Limits**: Adjust test parameters for CI environments

### Debug Commands

```bash
# Run single test with debug output
pytest tests/test_flask_app.py::TestFlaskRoutes::test_home_route_renders_html -v -s

# Run with PDB debugger
pytest tests/test_chess_logic.py --pdb

# Generate detailed failure reports
pytest tests/ --tb=long --verbose
```

### Test Environment Setup

```bash
# Create isolated test environment
python -m venv test_env
source test_env/bin/activate  # On Windows: test_env\Scripts\activate
pip install -r requirements.txt
pip install -r test_requirements.txt

# Verify test environment
python tests/test_runner.py --unit --verbose
```

## Contributing

### Test Contribution Guidelines

1. **Comprehensive Coverage**: New features must include tests
2. **Edge Case Focus**: Prioritize boundary and error conditions
3. **Chess Domain Knowledge**: Validate chess-specific logic thoroughly
4. **Performance Awareness**: Include performance impact assessment
5. **Documentation**: Update test documentation for new scenarios

### Code Review Checklist

- [ ] Tests cover happy path and edge cases
- [ ] Chess logic is validated for correctness
- [ ] Error handling is tested comprehensively
- [ ] Performance implications are considered
- [ ] Security aspects are validated
- [ ] Documentation is updated appropriately

---

**Note**: This test suite is designed to ensure BookBuilder's reliability in production chess environments. The emphasis on chess-specific edge cases and comprehensive validation reflects the critical nature of accurate chess analysis and repertoire generation.