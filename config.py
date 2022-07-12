#BOOK SETTINGS
OPENINGBOOK = [{"Name": "e4 for White", "pgn": "1. e4"},{"Name": "e4 e5 for Black", "pgn": "1. e4 e5"}] 
#add the books you want to create, with starting point pgns, eg [{"Name": "Book A", "pgn": "1. e4 e5"},{"Name": "Book B", "pgn": "1. e4 e5 2. f4"}]
LONGTOSHORT = 0
#if you want the book ordered from long lines to short lines, change to "1". Else 0.


#DATABASE SETTINGS
VARIANT = 'standard' 
#Variants to include in the analysis
SPEEDS = ['blitz,rapid,classical,correspondence'] 
#comma separated Formats to include in the analysis
RATINGS = ['1600,1800,2000,2200,2500'] 
#Ratings of the players to include in the analysis
MOVES = 10
#The number of most played moves to search over for the best move (minimum 5)

#MOVE SELECTION SETTINGS
DEPTHLIKELIHOOD = 0.05
#once cumulative line likelihood reaches this threshold, no futher continuations will be added (in percentage so 0.0025 = 0.25%)
ALPHA = 0.001
# The confidence interval alpha (EG 0.05 = 95% CI), for deciding the lower bounds of how good a move's winrate is.
MINPLAYRATE = 0.001
#minimum frequency for a move to be played in a position to be considered as a 'best move' candidate (0.05= 5%)
MINGAMES = 19 
#games where moves played this or less than this will be discarded (unless top engine move) (25 = 25 games)
CONTINUATIONGAMES = 10 
# games where moves played this or less than this will not be considered a valid continuation (ie we don't want to be inferring cumulative probability or likely lines from tiny amounts of games/1 game)

#ENGINE SETTINGS
ENGINEPATH = r"/Users/AM/Downloads/BookBuilder/Stockfish"
#the filepath where the engine is stored on your computer, so it can be accessed. Keep the 'r' character
CAREABOUTENGINE = 1
#care about engine eval of position or engine finishing = 1, dont care = 0
ENGINEDEPTH = 5
#how deep engine should evaluate best moves
ENGINEFINISH = 1
#if we want the engine to complete lines to cumulative likelihood where data is insufficient, 1. Otherwise 0, and lines will end where there's no good human data
SOUNDNESSLIMIT = -99
#maximum centipawns we are willing to be down in engine eval, provided the winrate is better (-300 = losing by 3 pawns in eval). We never give up a forced mate, however.
MOVELOSSLIMIT = -99
#maximum centipawns we are willing to lose vs engine analysis pre move to play a higher winrate move
IGNORELOSSLIMIT = 300
#centipawns advantage above which we won't care if we play a move that hits our loss limit, if it has a higher win rate (is easier to win)
ENGINETHREADS = 10 #max 20
#how many threads you want the engine to use (check your comp and set 1 if unsure)
ENGINEHASH = 8192 #4096 #max 10240
#how much hash you want the engine to use (check your comp and set to 16 if unsure)

