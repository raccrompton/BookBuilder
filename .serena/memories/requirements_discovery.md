# Requirements Discovery Results

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

## Success Criteria
- Adult chess players can generate repertoires without technical setup
- Clear cost/time savings vs buying repertoires
- Self-service with educational config explanations