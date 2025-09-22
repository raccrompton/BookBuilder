# Chess Repertoire Website - Brainstorm Results

## Target User Profile
- **Adult chess improvers** (understand chess, PGN format)
- **Pain Point**: Current solutions expensive or manually painful
- **Technical Comfort**: Understands chess concepts, can handle file uploads

## MVP Web Interface Requirements
- **PGN Input**: Upload files OR paste text box
- **Config UI**: Dropdowns with explanations, smart defaults
- **Processing**: Async with email delivery (privacy statement needed)
- **Queue System**: Handle concurrent users gracefully
- **No Accounts**: Stateless generation tool

## Technical Constraints
- **Preserve Python Logic**: Keep existing BookBuilder.py intact
- **Railway Deployment**: Target platform already planned
- **Lichess API**: Queue processing to avoid rate limits
- **Scale**: 1-5 concurrent users maximum expected

## Feature Priority
1. **Core MVP**: PGN upload + config dropdowns + email delivery
2. **Nice-to-Have**: Multiple PGN batch processing
3. **Future**: Potential JS rewrite for performance

## Current Implementation Status ✅
- **Complete Web UI**: Sophisticated form with all config options
- **Backend Integration**: Flask routes handling config generation
- **File Processing**: Subprocess execution of Python engine
- **Error Handling**: Basic Flask error responses
- **Frontend JS**: Form validation and submission logic

## Key Technical Challenges 🚨

### 1. Timeout Issues (5min limit insufficient)
- Complex repertoires can take 30+ minutes
- Need async processing with email delivery
- Current subprocess approach blocks server

### 2. Error Translation Needed
- Python errors too technical for chess users
- Need chess-friendly error messages
- Missing validation for PGN format

### 3. Missing Email Infrastructure
- No email service integration
- Need SMTP/SendGrid setup for Railway
- Privacy policy needed for email collection

### 4. File Management Concerns
- Temporary config files need cleanup
- PGN output files accumulate
- Railway storage limitations unknown

### 5. Queue System Missing
- No Lichess API rate limiting protection
- Concurrent user processing will fail
- Need simple queue with status updates

## Architecture Strengths 💪
- **Preserves Python Logic**: Subprocess maintains existing engine
- **Good UI Design**: Clear form with explanations
- **Flexible Config**: All engine parameters exposed
- **Railway Ready**: Basic Flask structure suitable for deployment

## Implementation Roadmap

### Phase 1: Core Async Processing (1-2 days)
#### Critical Issues to Fix
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

### Phase 2: User Experience Polish (1 day)
#### UX Improvements
4. **Error Translation**: Chess-friendly messages
   - Map Python errors to user-friendly explanations
   - PGN validation with specific feedback
   - Config validation before processing

5. **Progress Feedback**: Real-time status
   - "Your repertoire is being generated..." messages
   - Estimated completion time
   - Queue position if multiple users

### Phase 3: Railway Deployment (1 day)
#### Infrastructure Setup
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

## Success Criteria
- Adult chess players can generate repertoires without technical setup
- Clear cost/time savings vs buying repertoires
- Self-service with educational config explanations

**Estimated Timeline: 3-4 days to production-ready**