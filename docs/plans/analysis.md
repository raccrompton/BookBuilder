🏗️ Architecture Analysis Report

  Current Architecture

  Your project follows a Subprocess Wrapper Pattern with sophisticated chess domain logic:

  Web UI → Flask → Temp Config → subprocess(BookBuilder.py) → PGN Files

  🔴 Critical Architecture Issues

  1. Blocking Synchronous Design
  - Single Flask worker blocks on 5-30min subprocess calls
  - No concurrent user support (shared working directory)
  - Current 5min timeout insufficient for complex repertoires

  2. Resource Management
  - Global Stockfish engine instance (concurrency bottleneck)
  - Shared /tmp directories with race conditions
  - Temp file cleanup relies on try/finally (resource leaks possible)

  3. API Rate Limiting Exposure
  - No coordination between concurrent Lichess API calls
  - Will hit rate limits with multiple users
  - No circuit breaker or backoff coordination

  🟢 Architecture Strengths

  1. Domain Logic Excellence
  - Clean separation: chess logic in Python, web UI in Flask
  - Sophisticated statistical analysis (confidence intervals, move selection)
  - Robust external API integration with backoff handling

  2. Configuration Architecture
  - Comprehensive parameter exposure through web form
  - Good defaults with educational explanations
  - Flexible JSON-based opening book format

  🎯 Critical Path Recommendations

  Phase 1: Async Foundation (3-4 days)

  # Architecture: Flask + Celery + Redis
  app.py → Celery.delay(config) → BookBuilder Worker → Email Delivery

  Key Changes:
  - Replace subprocess.run() with Celery task queue
  - UUID-based work directories for isolation
  - Email integration for result delivery
  - Job status tracking for progress updates

  Phase 2: Production Polish (1-2 days)

  - Error translation for chess players
  - File cleanup automation
  - Railway deployment configuration

  Result: Production-ready chess repertoire generator preserving all existing sophisticated analysis while supporting multiple concurrent users.

  The architecture analysis shows you need async processing as the critical blocker, but your chess domain logic is excellent and should be preserved
  exactly as-is.