import chess.svg
import requests
import scipy.stats as st
import numpy as np
import time
import copy

import chess
import chess.engine
import re
import logging


class WorkerPlay:
    def __init__(self, settings, status, engine, fen):
        self.settings = settings
        self.status = status
        self.engine = engine
        self.fen = fen #fen is the game moves format needed to feed lichess api
        self.short_fen = fen[:-4]
        self.explored = False
        self.best_move = None
        
        self.board = chess.Board(fen)
        
        self.stats = self.call_api()
        self.parse_stats()
       
    #generate the Lichess API URL from config file
    def call_api(self):
        db = self.settings.database
        variant = db.variant.value
        speeds = [speed.value for speed in db.speeds]
        ratings = [rating.value for rating in db.ratings]
        moves = db.moves
        recentGames = 0
        topGames = 0
        play = ""
        
        url = 'https://explorer.lichess.ovh/lichess?'
        url += f'variant={variant}&'
        url += f'speeds={",".join(speeds)}&'
        url += f'ratings={",".join(ratings)}&'
        url += f'recentGames={recentGames}&'
        url += f'topGames={topGames}&'
        url += f'moves={moves}&'
        url += f'play={play}&'
        url += f'fen={self.fen}'

        self.status.info2(f"Looking for a move at FEN {self.fen}")
        self.opening_url = url
        #logging.debug(f"url of position {url}") #uncomment for debugging
        while True:
            r = requests.get(url)
            if r.status_code == 429:
                self.status.info2(f"Hit Lichess API rate limit, waiting for 60 seconds")
                print('Rate limited - waiting 60s...')
                time.sleep(60)
            else:
                response = r.json()
                break

        return response

    def parse_stats(self, move = None): #parse the stats returned by the API

        stats = self.stats #self.stats is what the api call returns
        stats['white_perc'], stats['black_perc'], stats['draw_perc'], stats['total_games'] = self.calc_percs(stats['white'], stats['black'], stats['draws']) # base rate?? sends the whiteWin / blackWin / draw / total games move was played numbers to calculate win percentages function, and define stats
        #print(stats) #uncomment for debugging
        for m in self.stats['moves']:
            m['white_perc'], m['black_perc'], m['draw_perc'], m['total_games'] = self.calc_percs(m['white'], m['black'], m['draws']) #each position iterate through all the moves to get win rate stats
            m['playrate'] = m['total_games'] / stats['total_games']
            #print(m) #uncomment for debugging
            #TO DO call api for each move to get real percentages and total game numbers for transposition



    def pick_candidate(self): #how the next best move is picked

        moves = {}
        best_lb_value = -np.inf
        best_move = None
        for move in self.stats['moves']: #array of all moves returned from the API as next moves in a given position.
            if self.board.turn == chess.WHITE: #if it's white to play
                value, lb_value, ub_value, n = self.calc_value(move['white_perc'], move['total_games'], move['playrate'], move['san'], self.board) #sends move white win percentage and total games move was played to calculate 'potency' on confidence intervals
                for_printing= ''.join([str(i) for i in ["candidate move is ", move['san'], ' win rate is ', "{:+.2%}".format(move['white_perc']), ' playrate ', "{:+.2%}".format(move['playrate'])," lb value ", lb_value]])
                logging.debug(for_printing)
            else: #if it's not white it's black to play
                value, lb_value, ub_value, n = self.calc_value(move['black_perc'], move['total_games'], move['playrate'], move['san'], self.board) #sends move black win percentage and total games move was played to calculate 'potency' on confidence intervals
                for_printing= ''.join([str(i) for i in ["candidate move is ", move['san'], ' win rate is ', "{:+.2%}".format(move['black_perc']), ' playrate' , "{:+.2%}".format(move['playrate']), " lb value ", lb_value]])
                logging.debug(for_printing)
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
                
        if self.settings.engine.enabled and (potency > 0):

            engineChecked = 0
            bestEval = None
            
            while engineChecked == 0:
                board = self.board
                
                lb_potencies = {k:v['lb_value'] for k,v in moves.items()}
                best_move = max(lb_potencies, key=lb_potencies.get) #best move is the move with the highest lower bound win rate (based on 95% confidence interval)
                potency = moves[best_move]['value'] #basic win rate
                lb_potency = moves[best_move]['lb_value']
                ub_potency = moves[best_move]['ub_value']
                n = moves[best_move]['n']
                gamesPlayed = n
                
                if moves[best_move]['lb_value'] == 0: #if there is no best move candidate with a potency > 0 we dont ask engine, we go straight to return no best move
                    engineChecked = 1
                    print("no engine approved move found by statistics")
                
                else: #we ask engine for eval after move
               
                    # if we don't already have the top engine move and eval
                    if bestEval == None:
                    
                        #we ask engine for best move. If candidate move is best move, we approve, otherwise we calc difference.
                        depth = self.settings.engine.depth
                        self.status.info2(f"Looking for best engine move at '{board.fen()}', depth {depth}, this can take a while")
                        logging.debug(f"engine working...")
                        PlayResult = self.engine.play(board, chess.engine.Limit(depth=depth)) #we get the engine to play
                        
                        engineMoveSan = board.san(PlayResult.move)
                        board.push(PlayResult.move)
                        
                        engineMoveBoard = copy.copy(board)
                        board.pop () #undo engine move to keep board state                    
                        
                        
                    #If candidate move is best move, we approve, otherwise we calc difference.
                    san = best_move
                    board.push_san(san) # push our candidate move                    
                    ourMoveBoard = copy.copy(board)
                    board.pop () #undo our move to keep board state          
                    
                    
                    logging.debug (f"engine move {engineMoveSan}")                      
                    # logging.debug(engineMoveBoard)
                    
                    logging.debug (f"our candidate move {san}")                      
                    # logging.debug(ourMoveBoard)               
                    
                    #if our move is the top engine move, we just approve it. Bug note: We can get loss limit / soundness limit slip in some scenarios (eg if move goes out of soundness limits and engine can't see, but unlikely)
                    if ourMoveBoard == engineMoveBoard:
                        logging.debug("our move is top engine move so we approve")
                        lb_value = max(0, potency - st.norm.ppf(1 - self.settings.moveSelection.alpha/2) * np.sqrt(potency * (1-potency) / gamesPlayed)) #lower bound wr at 95% confidence interval
                        ub_value = max(0, potency + st.norm.ppf(1 - self.settings.moveSelection.alpha/2) * np.sqrt(potency * (1-potency) / gamesPlayed)) #upper bound wr at
                        engineChecked = 1
                        logging.debug(f"move is top engine move {san}")                    
                    
                    #if our move is not top engine move, we compare the CP after our move with the centipawns after engine move. Bug note: Not checking after opponent's response could cause slip in some scenarios (eg if move goes out of soundness limits and engine can't see, but unlikely)
                    else:
                        logging.debug (f"our move is not top engine move. engine working...")
                        
                        if bestEval == None:
                            #we get engine move eval
                            # engineMoveReply = engine.play(engineMoveBoard, chess.engine.Limit(depth=settings.engine.depth)) #we play one more move after engine move, to avoid slipping out of soundness limits
                            # engineMoveBoard.push(engineMoveReply.move)
                            depth = self.settings.engine.depth
                            self.status.info2(f"Looking for best engine move at '{board.fen()}', depth {depth}, this can take a while")
                            engineMoveScore = self.engine.analyse(engineMoveBoard, chess.engine.Limit(depth=depth)) #we get engine's eval from opponent's perspective

                            #we convert the engine move score to a string so we can parse it
                            engineMoveScoreString = str(engineMoveScore["score"])
                            logging.debug (f"Eval from perspective after Engine move {engineMoveSan} {engineMoveScore['score']}") 
                                                                        
                            #we switch to our perspective            
                            goodForThem = not ('-' in engineMoveScoreString) # check if it's good for them
                            # print("good for them", goodForThem)
                            mateForThem = (goodForThem) and ('Mate' in engineMoveScoreString) #if it's mate for us
                            # print("mate for us", mateForUs)
                            mateForUs = (not goodForThem) and ('Mate' in engineMoveScoreString) #if it's mate for them
                            # print("mate for them", mateForThem)
                            afterEngineMoveScore = [int(s) for s in re.findall(r'\b\d+\b',engineMoveScoreString)]
                            afterEngineMoveScore = afterEngineMoveScore[0]
                            # print("raw centipawn score", afterEngineReply)
                            if goodForThem:
                                afterEngineMoveScore = -afterEngineMoveScore
                            if mateForThem:
                                afterEngineMoveScore = -9999999999
                            if mateForUs:
                                afterEngineMoveScore = 9999999999      
                                                   
                            
                            bestEval = afterEngineMoveScore
                        logging.debug (f"centipawn eval from our perspective after engine move {engineMoveSan}  {bestEval}") 
                        
                        if bestEval < self.settings.engine.soundness_limit:
                            # engine checked = 1 leaves the checking loop and setting values to 0 triggers bookbuilder to finish with engine.    
                            logging.debug (f"failed best engine move {engineMoveSan} on soundness limit - we may have slipped outside soundness limit. We will check other moves, but maybe move selection this move is left to engine finishing if available. eval: {bestEval}")
                            # potency = 0
                            # lb_value = 0
                            # ub_value = 0
                            # n = 0    
                            # engineChecked = 1 
                        
                        logging.debug (f"analysing our move eval. engine working...")
                        #we get our move eval
                        # ourMoveReply = engine.play(ourMoveBoard, chess.engine.Limit(depth=settings.engine.depth)) #we play one more move after our move
                        # ourMoveBoard.push(ourMoveReply.move)
                        depth = self.settings.engine.depth
                        self.status.info2(f"Evaluating board after best human move, {ourMoveBoard.fen()}, depth {depth}, this can take a while")
                        ourMoveScore = self.engine.analyse(ourMoveBoard, chess.engine.Limit(depth=depth)) #we get engine's eval from opponent's perspective
                        
                        logging.debug (f"Eval from perspective after our move {ourMoveScore['score']}") 
                        
                        #we convert our move score to a string so we can parse it
                        ourMoveScoreString = str(ourMoveScore["score"])
                    
                        #we switch to our perspective            
                        goodForThem = not ('-' in ourMoveScoreString) # check if it's good for us
                        # print("good for them", goodForThem)
                        mateForThem = (goodForThem) and ('Mate' in ourMoveScoreString) #if it's mate for us
                        # print("mate for us", mateForUs)
                        mateForUs = (not goodForThem) and ('Mate' in ourMoveScoreString) #if it's mate for them
                        # print("mate for them", mateForThem)
                        afterOurMoveScore = [int(s) for s in re.findall(r'\b\d+\b',ourMoveScoreString)]
                        afterOurMoveScore = afterOurMoveScore[0]
                        # print("raw centipawn score", afterEngineReply)
                        if goodForThem:
                            afterOurMoveScore = -afterOurMoveScore
                        if mateForThem:
                            afterOurMoveScore = -9999999999
                        if mateForUs:
                            afterOurMoveScore = 9999999999    
                        logging.debug (f"centipawn eval from our perspective after our move {san} {afterOurMoveScore}")                      

                        if (afterOurMoveScore == 9999999999): #if move is mate we give lb winrate as 1 and approve the move
                            potency = 1
                            lb_value = 1
                            ub_value = 1      
                            engineChecked = 1
                            logging.debug(f"move is approved - engine checked as mate {moves[san]}")


                        #if not, we check it doesn't break soundness and move loss limits
                        else:
                            
                            #we calculated the CP loss between best move and our move
                            if bestEval >= afterOurMoveScore:
                                moveLoss = afterOurMoveScore - bestEval
                                logging.debug(f'moveloss implies our move worse than engine move')                            
                            #sometimes the engine actually prefers the user move once there is a reply
                            else:
                                moveLoss = afterOurMoveScore - bestEval
                                logging.debug(f'moveloss implies our move better than engine move')  
                            
                            logging.debug(f'our move centipawns vs engine move {moveLoss}')
                    
                            #we approve the move if it meets soundness limits + loss limits, or passes our ignorelosslimit, or is evaluated stronger than top engine move after playing
                            if ( (afterOurMoveScore > self.settings.engine.soundness_limit)  and  (moveLoss > self.settings.engine.move_loss_limit)) or (afterOurMoveScore > (self.settings.engine.ignore_loss_limit)) or (moveLoss >= 0):
                                lb_value = max(0, potency - st.norm.ppf(1 - self.settings.moveSelection.alpha/2) * np.sqrt(potency * (1-potency) / gamesPlayed)) #lower bound wr at 95% confidence interval
                                ub_value = max(0, potency + st.norm.ppf(1 - self.settings.moveSelection.alpha/2) * np.sqrt(potency * (1-potency) / gamesPlayed)) #upper bound wr at
                                engineChecked = 1
                                logging.debug([str(i) for i in ["move is engine checked and passes soundness + moveloss limits, passes the ignoreloss limit or is better than engine move", best_move, moves[san], "eval:", afterOurMoveScore, "loss:", moveLoss]])

                            else:

                                logging.debug ([str(i) for i in ["engine failed move on soundness or move loss limits", best_move, moves[san], "eval:", afterOurMoveScore, "loss:", moveLoss]])
                                moves[san] = {
                                    'value': 0  #raw winrate
                                    , 'lb_value': 0 #lower bound potency value
                                    , 'ub_value': 0 #upper bound potency value
                                    , 'n': n #total games played
                                }

        logging.debug(f'best move is - {best_move} & win rate is - {potency} & lower bound win rate is - {lb_potency}')
        return moves, best_move, potency, (lb_potency, ub_potency), n

    def find_opponent_move(self, move):
        if move.uci() == 'e8g8': #Change the values for castling in Universal Chess Interface codes, can ignore
            move_uci = 'e8h8'
        elif move.uci() == 'e1g1':
            move_uci = 'e1h1'
        else:
            move_uci = move.uci()

        try: # find the odds of the pgn opponent move in the opening stats from the API.
            move_stats = next(item for item in self.stats['moves'] if item["uci"] == move_uci) #move stats is the next move in self stats moves which matches the move fed into function
        except:
            self.status.error(f"Failed to find move {move_uci} in the Opening Explorer API response", f"FEN: {self.fen}")
            raise Exception(f'Cannot find move {move_uci} in opening explorer API response')

        chance = move_stats['total_games'] / self.stats['total_games'] #total games for next move overf total games for current move
        #print("move opponent played =",move, " & percent chance of them playing it =", chance) #prints move opponent played from each position
        #print (move_stats)
        return move_stats, chance

    def find_move_tree(self): #how we return possible opponent continuations
        return self.stats['moves']

    def find_potency(self): #how we return possible opponent continuations
        stats = self.stats
        stats['white_perc'], stats['black_perc'], stats['draw_perc'], stats['total_games'] = self.calc_percs(stats['white'], stats['black'], stats['draws'])
        if self.board.turn == chess.WHITE: #if we are white
            potency = stats['black_perc']
            draws = stats['draw_perc']
        else:
            potency = stats['white_perc']
            draws = stats['draw_perc']
        return potency, stats ['total_games'], draws

    # function to calculate percentage win rates for each colour, if more than 0 games
    def calc_percs(self, white, black, draws):
        n = white + black + draws  # wins + draws after move was played

        if (n > 0) and not self.settings.moveSelection.draws_are_half:
            total_games = n
            white_perc = white / n
            black_perc = black / n
            draw_perc = draws / n
            return white_perc, black_perc, draw_perc, total_games
        else:
            if (n > 0) and self.settings.moveSelection.draws_are_half:
                total_games = n
                white_perc = (white + (0.5 * draws)) / n
                black_perc = (black + (0.5 * draws)) / n
                draw_perc = draws / n
                return white_perc, black_perc, draw_perc, total_games
            else:
                return None, None, None, 0

    # p = white/black win rate and n = total games p was played, this function calculates values used in the potentcy score of each potential move. It do
    def calc_value(self, winRate, gamesPlayed, playRate, san, board):

        if (gamesPlayed > self.settings.moveSelection.min_games) and (
                playRate > self.settings.moveSelection.min_play_rate):  # total games move was played must be more than min games and min perc play rate (otherwise data is bad)
            # print("check this", np.sqrt(winRate * (1-winRate) / gamesPlayed))
            # print ("check this",st.norm.ppf(1 - settings.moveSelection.alpha/2))
            # print ("check this",winRate - st.norm.ppf(1 - settings.moveSelection.alpha/2) * np.sqrt(winRate * (1-winRate) / gamesPlayed))
            lb_value = max(0, winRate - st.norm.ppf(1 - self.settings.moveSelection.alpha / 2) * np.sqrt(
                winRate * (1 - winRate) / gamesPlayed))  # lower bound wr at 95% confidence interval
            ub_value = max(0, winRate + st.norm.ppf(1 - self.settings.moveSelection.alpha / 2) * np.sqrt(
                winRate * (1 - winRate) / gamesPlayed))  # upper bound wr at
        else:
            winRate = 0
            lb_value = 0
            ub_value = 0

        return winRate, lb_value, ub_value, gamesPlayed