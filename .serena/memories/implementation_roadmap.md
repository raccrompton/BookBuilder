# Chess Repertoire Website Implementation Roadmap

## Phase 1: Core Async Processing (1-2 days)
### Critical Issues to Fix
1. **Timeout Solution**: Replace subprocess with async task queue
   - Implement Celery/Redis or simple background jobs
   - Add job status tracking endpoint
   - Update frontend for async polling

2. **Email Integration**: Setup delivery system
   - Add SendGrid (easiest Railway integration)
   - Email template for repertoire delivery
   - Privacy notice for email usage

3. **File Management**: Cleanup automation
   - Auto-delete temporary configs after use
   - PGN file cleanup after email sent
   - Railway storage optimization

## Phase 2: User Experience Polish (1 day)
### UX Improvements
4. **Error Translation**: Chess-friendly messages
   - Map Python errors to user-friendly explanations
   - PGN validation with specific feedback
   - Config validation before processing

5. **Progress Feedback**: Real-time status
   - "Your repertoire is being generated..." messages
   - Estimated completion time
   - Queue position if multiple users

## Phase 3: Railway Deployment (1 day)
### Infrastructure Setup
6. **Railway Configuration**: 
   - Environment variables for email API keys
   - Stockfish engine installation
   - File storage and cleanup policies

7. **Production Testing**:
   - End-to-end generation test
   - Email delivery verification
   - Error handling validation

## Quick Wins Available
- ✅ UI is production-ready
- ✅ Core Python logic preserved
- ✅ Config system comprehensive
- ✅ Form validation exists

## Estimated Timeline: 3-4 days to production-ready