from cgitb import strong
from pstats import Stats
from re import M
import chess.svg
import requests
import scipy.stats as st
import numpy as np
import time

import config

import chess
import chess.engine
import re

if (config.CAREABOUTENGINE == 1):
    engine = chess.engine.SimpleEngine.popen_uci(config.ENGINEPATH) #WHERE THE ENGINE IS ON YOUR COMPUTER
    engine.configure({"Hash": config.ENGINEHASH})
    engine.configure({"Threads": config.ENGINETHREADS})

#function to calculate percentage win rates for each colour, if more than 0 games
def calc_percs(white, black, draws):

    n = white + black + draws #wins + draws after move was played

    if ((n > 0) and (config.DRAWSAREWINS)) == 0:
        total_games = n
        white_perc = white / n
        black_perc = black / n
        draw_perc = draws / n
        return white_perc, black_perc, draw_perc, total_games
    
    else:
        if ((n > 0) and (config.DRAWSAREWINS)) == 1:
                total_games = n
                white_perc = (white + draws) / n
                black_perc = (black + draws) / n
                draw_perc = draws / n
                return white_perc, black_perc, draw_perc, total_games
    
        else:
                return None, None, None, 0




def calc_value(winRate, gamesPlayed, playRate, san, board): # p = white/black win rate and n = total games p was played, this function calculates values used in the potentcy score of each potential move. It do

    if (gamesPlayed > config.MINGAMES) and (playRate >config.MINPLAYRATE): #total games move was played must be more than min games and min perc play rate (otherwise data is bad)
        # print("check this", np.sqrt(winRate * (1-winRate) / gamesPlayed))
        # print ("check this",st.norm.ppf(1 - config.ALPHA/2))
        # print ("check this",winRate - st.norm.ppf(1 - config.ALPHA/2) * np.sqrt(winRate * (1-winRate) / gamesPlayed))
        lb_value = max(0, winRate - st.norm.ppf(1 - config.ALPHA/2) * np.sqrt(winRate * (1-winRate) / gamesPlayed)) #lower bound wr at 95% confidence interval
        ub_value = max(0, winRate + st.norm.ppf(1 - config.ALPHA/2) * np.sqrt(winRate * (1-winRate) / gamesPlayed)) #upper bound wr at
    else:
        winRate = 0
        lb_value = 0
        ub_value = 0



    return winRate, lb_value, ub_value, gamesPlayed


class WorkerPlay():
    def __init__(self, fen, lastmove = '', san = '', ):
        self.fen = fen #fen is the game moves format needed to feed lichess api
        self.short_fen = fen[:-4]
        self.lastmove = lastmove
        self.san = san #san is the human written format for chess moves like 'Bc4'
        self.terminal = '#' in san
        self.explored = False
        self.best_move = None
        
        self.board = chess.Board(fen)
        
        self.stats = self.call_api()
        self.parse_stats()
           
    def show(self):
        try:
            print('')
            display(chess.svg.board(self.board, lastmove = self.lastmove, size = 400))
            print('')
        except:
            pass

    def play(self, san):
        board = chess.Board(self.fen)
        move = board.push_san(san)
        workerPlay = workerPlay(board.fen(), lastmove = move, san = san)
        return workerPlay
       
#generate the Lichess API URL from config file               
    def call_api(self):
        variant = config.VARIANT
        speeds = config.SPEEDS
        ratings = config.RATINGS
        moves = config.MOVES
        recentGames = 0
        topGames = 0
        play = ""
        
        url = 'https://explorer.lichess.ovh/lichess?'
        url += f'variant={variant}&'
        for speed in speeds:
            url += f'speeds={speed}&'

        for rating in ratings:
            url += f'ratings={rating}&'

        url += f'recentGames={recentGames}&'
        url += f'topGames={topGames}&'
        url += f'moves={moves}&'
        url += f'play={play}&'
        url += f'fen={self.fen}'
        
        self.opening_url = url
        print("url of position",url) #uncomment for debugging
        while True:
            r = requests.get(url)
            if r.status_code == 429:
                print('Rate limited - waiting 60s...')
                time.sleep(60)
            else:
                response = r.json()
                break

        return response



    def parse_stats(self, move = None): #parse the stats returned by the API

        stats = self.stats #self.stats is what the api call returns
        stats['white_perc'], stats['black_perc'], stats['draw_perc'], stats['total_games'] = calc_percs(stats['white'], stats['black'], stats['draws']) # base rate?? sends the whiteWin / blackWin / draw / total games move was played numbers to calculate win percentages function, and define stats
        #print(stats) #uncomment for debugging
        for m in self.stats['moves']:
            m['white_perc'], m['black_perc'], m['draw_perc'], m['total_games'] = calc_percs(m['white'], m['black'], m['draws']) #each position iterate through all the moves to get win rate stats
            m['playrate'] = m['total_games'] / stats['total_games']
            #print(m) #uncomment for debugging
            #TO DO call api for each move to get real percentages and total game numbers for transposition



    def pick_candidate(self): #how the next best move is picked

        moves = {}
        best_lb_value = -np.inf
        best_move = None
        for move in self.stats['moves']: #array of all moves returned from the API as next moves in a given position.
            if self.board.turn == chess.WHITE: #if it's white to play
                value, lb_value, ub_value, n = calc_value(move['white_perc'], move['total_games'], move['playrate'], move['san'], self.board) #sends move white win percentage and total games move was played to calculate 'potency' on confidence intervals
                print ("candidate move is", move['san'], 'lb win rate is', "{:+.2%}".format(move['white_perc']), 'playrate', "{:+.2%}".format(move['playrate']),"lb value", lb_value)
            else: #if it's not white it's black to play
                value, lb_value, ub_value, n = calc_value(move['black_perc'], move['total_games'], move['playrate'], move['san'], self.board) #sends move black win percentage and total games move was played to calculate 'potency' on confidence intervals
                print ("candidate move is", move['san'], 'lb win rate is', "{:+.2%}".format(move['black_perc']), 'playrate', "{:+.2%}".format(move['playrate']), "lb value", lb_value)
            key = move['san']
            moves[key] = {
                'value': value #raw winrate
                , 'lb_value': lb_value #lower bound potency value
                , 'ub_value': ub_value #upper bound potency value
                , 'n': n #total games played
            }
        lb_potencies = {k:v['lb_value'] for k,v in moves.items()} #makes a set of lb values from potential moves picked
        #print ('continuation options and winrates - ',lb_potencies)#prints list of continuations with lower bound winrates
        
                   
        best_move = max(lb_potencies, key=lb_potencies.get) #best move is the move with the highest lower bound win rate (based on 95% confidence interval)
        potency = moves[best_move]['value'] #basic win rate
        lb_potency = moves[best_move]['lb_value']
        ub_potency = moves[best_move]['ub_value']
        n = moves[best_move]['n']
                
        if (config.CAREABOUTENGINE == 1) and (potency > 0) :

            engineChecked = 0
            baseEval = []
            
            while engineChecked == 0:
                board = self.board
                
                lb_potencies = {k:v['lb_value'] for k,v in moves.items()}
                best_move = max(lb_potencies, key=lb_potencies.get) #best move is the move with the highest lower bound win rate (based on 95% confidence interval)
                potency = moves[best_move]['value'] #basic win rate
                lb_potency = moves[best_move]['lb_value']
                ub_potency = moves[best_move]['ub_value']
                n = moves[best_move]['n']
                gamesPlayed = n
                
                if moves[best_move]['lb_value'] == 0: #if there is no best move candidate we dont ask engine as error will be caught later
                    engineChecked = 1
                    print("no engine approved move found by statistics")
                else: #we ask engine for eval after move
                    san = best_move
                    board.push_san(san) # push our candidate move
                    # print("after push")
                    # print(board)
                    print("engine evaluating...")
                    score = engine.analyse(board, chess.engine.Limit(depth = config.ENGINEDEPTH)) #we get engine's eval from their perspective
                    # print("Their Score:", score["score"])
                    scoreString = str(score["score"])
                    # print ("Eval for them after our move", scoreString) 
                    
                    #we switch to our perspective            
                    goodForUs = ('-' in scoreString) # check if it's good for us
                    # print("good for us", goodForUs)
                    mateForUs = (goodForUs) and ('Mate' in scoreString) #if it's mate for us
                    # print("mate for us", mateForUs)
                    mateForThem = (not goodForUs) and ('Mate' in scoreString) #if it's mate for them
                    # print("mate for them", mateForThem)
                    afterMoveScore = [int(s) for s in re.findall(r'\b\d+\b',scoreString)]
                    afterMoveScore = afterMoveScore[0]
                    # print("raw centipawn score", centipawnScore)
                    if not goodForUs:
                        afterMoveScore = -afterMoveScore
                    if mateForThem:
                        afterMoveScore = -9999999999
                    if mateForUs:
                        afterMoveScore = 9999999999        
                    print ("final centipawn eval for us post move",san, afterMoveScore)  
                    
                    board.pop () #undo our move to keep board state
                    
                    if (afterMoveScore == 9999999999): #if move is mate we give lb winrate as 1
                        potency = 1
                        lb_value = 1
                        ub_value = 1      
                        engineChecked = 1
                        print("move is engine checked", moves[san])  
                    else:      
                        if (afterMoveScore < config.SOUNDNESSLIMIT): #we throw out moves lower than our soundness limit
                            # print ("check using san as variable works", moves[san])
                            print ("engine failed",best_move, moves[san], "eval", afterMoveScore)
                            moves[san] = {
                                'value': 0  #raw winrate
                                , 'lb_value': 0 #lower bound potency value
                                , 'ub_value': 0 #upper bound potency value
                                , 'n': n #total games played
                            }                            

                      
                        
                        else:
                            #if the move is not junk, we check further with the engine
                            
                            if not baseEval: #if we already have a base eval, we just use that one
                                print("engine evaluating...")
                                score = engine.analyse(board, chess.engine.Limit(depth = config.ENGINEDEPTH)) #we get engine's eval before our move from their perspective
                                # print("Their Score:", score["score"])
                                scoreString = str(score["score"])
                                # print ("Eval for them,", scoreString) 
                                
                                goodForThem = ('-' in scoreString) # check if it's good for us
                                # print("good for them", goodForThem)
                                mateForThem = (goodForThem) and ('Mate' in scoreString) #if it's mate for us
                                # print("mate for us", mateForThem)
                                mateForUs = (not goodForThem) and ('Mate' in scoreString) #if it's mate for them
                                # print("mate for them", mateForUs)
                                baseEval = [int(s) for s in re.findall(r'\b\d+\b',scoreString)]
                                baseEval = baseEval[0]

                                if goodForThem:
                                    baseEval = -baseEval
                                if mateForThem:
                                    baseEval = -9999999999
                                if mateForUs:
                                    baseEval = 9999999999
                            print("Base Eval of position", baseEval)       
                            
                            if (baseEval == 9999999999): #we fail any move that missed a mate
                                # print ("check using san as variable works", moves[san])
                                print ("engine failed for missed mate",best_move, moves[san], "eval", afterMoveScore)
                                moves[san] = {
                                    'value': 0  #raw winrate
                                    , 'lb_value': 0 #lower bound potency value
                                    , 'ub_value': 0 #upper bound potency value
                                    , 'n': n #total games played
                                }  

                            else:    
                            
                            
                                #we check if the aftermove score is winning enough to ignore centipawns lost, or the centipawns lost is not too much. We throw out moves that are not winning enough and lose too many centipawns
                                if (   (afterMoveScore > config.IGNORELOSSLIMIT)    or   ((afterMoveScore - baseEval) > config.MOVELOSSLIMIT)   ): 

                                    if(afterMoveScore > (config.IGNORELOSSLIMIT + 100)): #we don't both to double check our opponents move if the eval is 100 over our ignore loss limit
                                        lb_value = max(0, potency - st.norm.ppf(1 - config.ALPHA/2) * np.sqrt(potency * (1-potency) / gamesPlayed)) #lower bound wr at 95% confidence interval
                                        ub_value = max(0, potency + st.norm.ppf(1 - config.ALPHA/2) * np.sqrt(potency * (1-potency) / gamesPlayed)) #upper bound wr at
                                        engineChecked = 1
                                        print("move is engine checked and far over winning margin", moves[san])                                        
                                        
                                        
                                    else: #if our move is within 100 CP of our ignore loss limit we double check with eval after engine reply:    
                                        # print(board)
                                        board.push_san(san) # push our candidate move
                                        # print("after push")
                                        # print(board)
                                        
                                        #then we get the engine to reply, and check again the eval hasn't changed too much. This avoids bugs later.
                                        #print((engine.play(board, chess.engine.Limit(depth = config.ENGINEDEPTH))))
                                        PlayResult = engine.play(board, chess.engine.Limit(depth = config.ENGINEDEPTH)) #we get the engine to play
                                        board.push(PlayResult.move) #we get engine to reply to our move, then check eval
                                        # print(board)
                                        
                                        print("engine evaluating...")
                                        score = engine.analyse(board, chess.engine.Limit(depth = config.ENGINEDEPTH)) #we get engine's eval
                                        # print("After their move pur Score:", score["score"])
                                        scoreString = str(score["score"])
                                        # print ("Eval for us,", scoreString)  
                                        
                                        goodForThem = ('-' in scoreString) # check if it's good for us
                                        # print("good for them", goodForThem)
                                        mateForThem = (goodForThem) and ('Mate' in scoreString) #if it's mate for us
                                        # print("mate for us", mateForUs)
                                        mateForUs = (not goodForThem) and ('Mate' in scoreString) #if it's mate for them
                                        # print("mate for them", mateForThem)
                                        afterEngineReply = [int(s) for s in re.findall(r'\b\d+\b',scoreString)]
                                        afterEngineReply = afterEngineReply[0]
                                        # print("raw centipawn score", afterEngineReply)
                                        if goodForThem:
                                            afterEngineReply = -afterEngineReply
                                        if mateForThem:
                                            afterEngineReply = -9999999999
                                        if mateForUs:
                                            afterEngineReply = 9999999999
                                    
                                        print ("final centipawn eval after engine reply", afterEngineReply)

                                        board.pop()#we undo engine reply
                                        board.pop()#we undo our move, so on next loop board is back to base state
                                        
                                        if (afterEngineReply == 9999999999): #if move is mate we give lb winrate as 1
                                            potency = 1
                                            lb_value = 1
                                            ub_value = 1   
                                            engineChecked = 1 
                                            print("move is engine checked", moves[san])                   
                                        else:      
                                            #now we check that the engine reply centipawn score was not too unsound, and either we are winning by enough to ignore losing centipawns, or that the move doesn't lose too many centipawns
                                            if (afterEngineReply > config.SOUNDNESSLIMIT)  and     (   (afterEngineReply > config.IGNORELOSSLIMIT)    or   ((afterEngineReply - baseEval) > config.MOVELOSSLIMIT)   ): 
                                                lb_value = max(0, potency - st.norm.ppf(1 - config.ALPHA/2) * np.sqrt(potency * (1-potency) / gamesPlayed)) #lower bound wr at 95% confidence interval
                                                ub_value = max(0, potency + st.norm.ppf(1 - config.ALPHA/2) * np.sqrt(potency * (1-potency) / gamesPlayed)) #upper bound wr at
                                                engineChecked = 1
                                                print("move is engine checked", moves[san])
                                            else:
                                                # print ("check using san as variable works", moves[san])
                                                print ("engine failed", best_move, moves[san], "eval", afterMoveScore)
                                                moves[san] = {
                                                    'value': 0  #raw winrate
                                                    , 'lb_value': 0 #lower bound potency value
                                                    , 'ub_value': 0 #upper bound potency value
                                                    , 'n': n #total games played
                                                }                            


                                else:
                                    # print ("check using san as variable works", moves[san])
                                    print ("engine failed on soundness or loss limit", best_move, moves[san], "eval", afterMoveScore)
                                    moves[san] = {
                                        'value': 0  #raw winrate
                                        , 'lb_value': 0 #lower bound potency value
                                        , 'ub_value': 0 #upper bound potency value
                                        , 'n': n #total games played
                                    }                            


        print('best move is -', best_move, ', & win rate is -', potency, ', & lower bound win rate is -', lb_potency)
        return moves, best_move, potency, (lb_potency, ub_potency), n

    def find_opponent_move(self, move):
        try: # find the odds of the pgn opponent move in the opening stats from the API.
            if move.uci() == 'e8g8': #Change the values for castling in Universal Chess Interface codes, can ignore
                move_uci = 'e8h8'
            elif move.uci() == 'e1g1':
                move_uci = 'e1h1'
            else:
                move_uci = move.uci()

            move_stats = next(item for item in self.stats['moves'] if item["uci"] == move_uci) #move stats is the next move in self stats moves which matches the move fed into function
        except:
            raise Exception(f'Cannot find move {move_uci} in opening explorer API response') 

        chance = move_stats['total_games'] / self.stats['total_games'] #total games for next move overf total games for current move
        #print("move opponent played =",move, " & percent chance of them playing it =", chance) #prints move opponent played from each position
        #print (move_stats)
        return move_stats, chance


    def create_children(self):

        children = []
        for i, m in enumerate(self.stats['moves']):
            worker = self.play(m['san'])
            children.append(worker)
        return children
    
    


    def find_move_tree(self): #how we return possible opponent continuations

        return self.stats['moves']

    def find_potency(self): #how we return possible opponent continuations
        stats = self.stats
        stats['white_perc'], stats['black_perc'], stats['draw_perc'], stats['total_games'] = calc_percs(stats['white'], stats['black'], stats['draws'])        
        if self.board.turn == chess.WHITE: #if we are white
            potency = stats['black_perc']
            draws = stats['draw_perc']
        else:
            potency = stats['white_perc']
            draws = stats['draw_perc']
        return potency, stats ['total_games'], draws
    

def quitEngine():
    engine.quit()