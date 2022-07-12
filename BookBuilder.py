from collections import Counter
from audioop import reverse
from typing import final
from venv import create
from numpy import append
from pyparsing import line
            
from config import config 

import io
import os
import logging
import argparse
import chess
import chess.pgn

from workerEngineReduce import WorkerPlay
from workerEngineReduce import quitEngine
import chess.engine

logging.basicConfig(level=logging.INFO)

working_dir = os.getcwd()
logging.info(f'Starting BookBuilder. Your current dir is {working_dir}. Files will be saved to this location.')

if (config.CAREABOUTENGINE == 1):
    engine = chess.engine.SimpleEngine.popen_uci(config.ENGINEPATH)  #WHERE THE ENGINE IS ON YOUR COMPUTER
    engine.configure({"Hash": config.ENGINEHASH})
    engine.configure({"Threads": config.ENGINETHREADS})

class Rooter():
    def __init__(self, pgn):
        self.pgn = pgn
        pgnList = self._calculate_pgns()

    def _calculate_pgns(self):
        
        try:
            game = chess.pgn.read_game(io.StringIO(self.pgn)) #reads the PGN submitted by the user
        except:
            raise Exception(f'Invalid PGN {self.pgn}') #error if user submitted PGN is invalid

        board = game.board()
        moves = list(game.mainline_moves()) #we create a list of pgn moves in UCI
        logging.debug(moves)
        

        if len(moves) % 2 == 0: #if even moves in pgn, we are black. if odd, white.
            perspective = chess.BLACK
            self.perspective_str = 'Black'
        else:
            perspective = chess.WHITE
            self.perspective_str = 'White'
        

        self.likelihood = 1 #likelihood of oppoonent playing moves starts at 100%
        self.likelihood_path = []
        validContinuations = [] 
        pgnList = []

        for move in moves: #we iterate through each move in the PGN/UCI generated
            
            if board.turn != perspective: #if it's not our move we check the likelihood the move in the PGN was played
                workerPlay = WorkerPlay(board.fen()) #we are calling the API each time
                move_stats, chance = workerPlay.find_opponent_move(move) #we look for the PGN move in the API response, and return the odds of it being played
                self.likelihood *= chance #we are creating a cumulative likelihood from each played move in the PGN
                self.likelihood_path.append((move_stats['san'], chance)) #we are creating a list of PGN moves with the chance of each of them being played 0-1
                print ("likelihoods to get here: ",self.likelihood_path)
                print ("cumulative likelihood", "{:+.2%}".format(self.likelihood))
            board.push(move) #play each move in the PGN
        
        #now we have the likelihood path and cumulative likelihood of each opponent move in the PGN, so pgn can go to leafer
        
        pgnPlus = self.pgn, self.likelihood, self.likelihood_path
        

        pgnsreturned.append(pgnPlus)
        logging.debug(f"sent from rooter: {pgnsreturned}")
         

class Leafer():
    def __init__(self, pgn, cumulative, likelyPath):
        self.pgn = pgn
        self.cumulative = cumulative
        self.likelyPath = likelyPath
        pgnList = self._calculate_pgns()

    def _calculate_pgns(self):
        
        try:
            game = chess.pgn.read_game(io.StringIO(self.pgn)) #reads the PGN submitted by the user
        except:
            raise Exception(f'Invalid PGN {self.pgn}') #error if user submitted PGN is invalid

        board = game.board()
        moves = list(game.mainline_moves()) #we create a list of pgn moves in UCI
        logging.debug(moves)
        
        if len(moves) % 2 == 0: #if even moves in pgn, we are black. if odd, white.
            perspective = chess.BLACK
            self.perspective_str = 'Black'
        else:
            perspective = chess.WHITE
            self.perspective_str = 'White'
        

        self.likelihood = self.cumulative #likelihood of oppoonent playing moves starts at 100%
        self.likelihood_path = self.likelyPath
        validContinuations = [] 
        pgnList = []

        for move in moves: #we iterate through each move in the PGN/UCI generated 
            board.push(move) #play each move in the PGN
            
        #we find all continuations
        self.workerPlay = WorkerPlay(board.fen(), move) #we call the api to get the stats in the position
        continuations = self.workerPlay.find_move_tree() #list all continuations
        #logging.debug(continuations)       
        
        
        for move in continuations:
            continuationLikelihood = float(move['playrate']) * float(self.likelihood)
            if (continuationLikelihood >= (float(config.DEPTHLIKELIHOOD))) and (move['total_games'] > config.CONTINUATIONGAMES): #we eliminate continuations that don't meet depth likelihood or minimum games
                move ['cumulativeLikelihood'] = (continuationLikelihood)
                validContinuations.append(move)
                #print (float(move['playrate']),float(self.likelihood),float(config.DEPTHLIKELIHOOD))
                #logging.debug(continuationLikelihood)
        print ('valid continuations:', validContinuations)
        
        
        
        #now we iterate through each valid continuation, and find our best response
        for move in validContinuations:
            board.push_san(move['san']) #we play each valid continuation
            
            self.likelihood_path.append((move['san'], move['playrate'])) #we add the continuation to the likelihood path
            
                                    
            #we look for the best move for us to play
            self.workerPlay = WorkerPlay(board.fen(), lastmove = move)
            _, self.best_move, self.potency, self.potency_range, self.total_games = self.workerPlay.pick_candidate() #list best candidate move, win rate,
            print('against ', move['san'], '   played', "{:+.2%}".format(move['playrate']), '   cumulative playrate', "{:+.2%}".format(move['cumulativeLikelihood']), '   our best move', self.best_move, '   win rate is', "{:+.2%}".format(self.potency), '   with a range of ', ["{:.2%}".format(x) for x in self.potency_range], '   over games', self.total_games)
            
            #we check our response playrate and minimum played games meet threshold. if so we pass the pgn. if not we add pgn to final list
            
            if (move['playrate'] > config.MINPLAYRATE) and (self.total_games >config.MINGAMES) and (self.potency != 0):
                
                #we add the pgn of the continuation and our best move to a list
                if  self.perspective_str == 'Black':
                    newpgn = self.pgn + " " + str(board.fullmove_number) + ". " + str(move['san']) #we add opponent's continuations first
                    newpgn = newpgn + " " + str(self.best_move) #then our best response
                    pgnPlus = [newpgn, move ['cumulativeLikelihood'], self.likelihood_path[:]]
                    #need to return a pgn as well as moves + chance + cumulative likelihood
                        

                if  self.perspective_str == 'White':
                    newpgn = self.pgn + " " + move['san'] #we add opponent's continuations first
                    newpgn = newpgn + " " + str(board.fullmove_number) + ". " + str(self.best_move) #then our best response
                    pgnPlus = [newpgn, move ['cumulativeLikelihood'], self.likelihood_path[:]]          
                logging.debug(f"full new pgn after our move is {newpgn}")        
                
                #we make a list of pgns that we want to feed back into the algorithm, along with cumulative winrates
                pgnList.append(pgnPlus)
                #logging.debug(pgnList)
                del self.likelihood_path [-1] #we remove the continuation from the likelihood path                         
                board.pop() #we go back a move to undo the continuation
            else:
                if config.ENGINEFINISH ==1: #if we want engine to finish lines where no good move data exists
                    
                    #we ask the engine the best move
                    PlayResult = engine.play(board, chess.engine.Limit(depth = config.ENGINEDEPTH)) #we get the engine to finish the line
                    board.push(PlayResult.move)
                    logging.debug(f"engine finished {PlayResult.move}")
                    board.pop() #we go back a move to undo the engine
                    
                    engineMove = board.san(PlayResult.move)
                    
                    #we add the pgn of the continuation and our best move to a list
                    if  self.perspective_str == 'Black':
                        newpgn = self.pgn + " " + str(board.fullmove_number) + ". " + str(move['san']) #we add opponent's continuations first
                        newpgn = newpgn + " " + str(engineMove) #then our best response
                        pgnPlus = [newpgn, move ['cumulativeLikelihood'], self.likelihood_path[:]]
                        #need to return a pgn as well as moves + chance + cumulative likelihood
                            

                    if  self.perspective_str == 'White':
                        newpgn = self.pgn + " " + move['san'] #we add opponent's continuations first
                        newpgn = newpgn + " " + str(board.fullmove_number) + ". " + str(engineMove) #then our best response
                        pgnPlus = [newpgn, move ['cumulativeLikelihood'], self.likelihood_path[:]]          
                    logging.debug("full new pgn after our move is {newpgn}")        
                    
                    #we make a list of pgns that we want to feed back into the algorithm, along with cumulative winrates
                    pgnList.append(pgnPlus)
                    #logging.debug(pgnList)
                    del self.likelihood_path [-1] #we remove the continuation from the likelihood path                         
                    board.pop() #we go back a move to undo the continuation
                        
                                   
                
                else:
                    logging.debug(f"we find no good reply to {self.pgn} {move['san']}")
                    board.pop() #we go back a move to undo the continuation
                    del self.likelihood_path [-1] #we remove the continuation from the likelihood path    
                    #we find potency and other stats
                    self.workerPlay = WorkerPlay(board.fen(), move) #we call the api to get the stats in the final position
                    lineWinRate, totalLineGames, throwawayDraws = self.workerPlay.find_potency() #we get the win rate and games played in the final position            
                    print ('saving no reply line', self.pgn, self.likelihood, self.likelihood_path,lineWinRate, totalLineGames)
                    line = (self.pgn, self.likelihood, self.likelihood_path,lineWinRate, totalLineGames)
                    finalLine.append(line) #we add line to final line list                                 
                
                
        global pgnsreturned #we make a globally accessible variable for the new pgns returned for each continuation
        pgnsreturned = pgnList #we define the variable as the completely made list of continuations and responses and send it to be extended to second list

        #if there are no valid continuations we save the line to a file
        if not validContinuations:
            
            #we find potency and other stats
            self.workerPlay = WorkerPlay(board.fen(), move) #we call the api to get the stats in the final position
            lineWinRate, totalLineGames, throwawayDraws = self.workerPlay.find_potency() #we get the win rate and games played in the final position            
            

            if (totalLineGames == 0) and (lineWinRate == 1): #if the line ends in mate  there are no games played from the position so we need to populate games number from last move
                board.pop()
                self.workerPlay = WorkerPlay(board.fen(), move) #we call the api to get the stats in the final position
                throwawayWinRate, totalLineGames, throwawayDraws = self.workerPlay.find_potency() #we get the win rate and games played in the pre Mate position
            
            if (totalLineGames < config.MINGAMES) : #if our response is an engine 'novelty' there is no reliable lineWinRate or total games
                board.pop() #we go back to opponent's move
                self.workerPlay = WorkerPlay(board.fen(), move)
                lineWinRate, totalLineGames, draws = self.workerPlay.find_potency()
                lineWinRate = 1 - lineWinRate - draws
                
                

            line = (self.pgn, self.likelihood, self.likelihood_path, lineWinRate, totalLineGames)
            finalLine.append(line) #we add line to final line list 
            
            
            
            
class Printer():
    def __init__(self, pgn, cumulative, likelyPath, winRate, Games, lineNumber):
        
        with open(f"{working_dir}/Chapter_{chapter}_{openingName}.pgn", 'a') as file:
            pgnEvent = '[Event "' + openingName + " Line " + str(lineNumber) + '"]' #we name the event whatever you put in config
            # annotation = "{likelihoods to get here:" + str(self.likelihood_path) + ". Cumulative likelihood" + str("{:+.2%}".format(self.likelihood)) + " }" #we create annotation with opponent move likelihoods and our win rate
            
            file.write('\n' + '\n' + '\n' + pgnEvent + '\n' ) #write name of pgn
            file.write ('\n' + pgn) #write pgn
            
            file.write('\n' + "{Move playrates:") #start annotations
            
            for move, chance in likelyPath:
                moveAnnotation = str("{:+.2%}".format(chance)) + '\t' + move
                file.write ('\n' + moveAnnotation)
            
            
            #we write them in as annotations
            lineAnnotations = "Line cumulative playrate: " + str("{:+.2%}".format(cumulative)) + '\n' + "Line winrate: " + str("{:+.2%}".format(winRate)) + ' over ' + str(Games) + ' games'
            
            file.write('\n' + lineAnnotations)
            
            file.write("}") #end annotations                 


class Grower():
    
    def __init__(self):
        i = 1
        for opening in config.OPENINGBOOK:
            global openingName
            openingName = opening['Name']
            global chapter
            chapter = i
            pgn = opening['pgn']
            self.pgn = pgn
            self.iterator()
            i += 1
        
    def iterator(self):
        global finalLine
        finalLine = []
        global pgnsreturned #we make a globally accessible variable for the new pgns returned by Rooter
        pgnsreturned = []
        
        Rooter(self.pgn)
         
        secondList = []
        secondList.extend(pgnsreturned) #we create list of pgns and cumulative probabilities returned by starter, calling the api each move 
        # print ("second list",secondList)

        
        # #we iterate through these with leafer, calling the api only for new moves.
        i = 0
        while i < len(secondList):
            for pgn, cumulative, likelyPath in secondList:
                self.pgn = pgn
                self.cumulative = cumulative
                self.likelyPath = likelyPath
                Leafer(self.pgn, self.cumulative, self.likelyPath)
                secondList.extend(pgnsreturned)
                i += 1
                # logging.debug("iterative",secondList)
           
        #print ("final line list: ", finalLine)
        

        #we remove duplicate lines
        uniqueFinalLine = []
        for line in finalLine:
            if line not in uniqueFinalLine:
                uniqueFinalLine.append(line)
        logging.debug("unique lines with subsets ", uniqueFinalLine)     
        
        printerFinalLine = [] #we prepare a list ready for printing
        
        # we remove lines that are subsets of other lines because no valid repsonse was found
        for line in uniqueFinalLine:
            uniqueFinalLinestring = str(uniqueFinalLine)
            lineString = str(line[0]) + " "
            lineCount = uniqueFinalLinestring.count(lineString)
            if lineCount == 0:
                printerFinalLine.append(line) #we add line to go to print
            else:
                logging.debug("duplicate line ", line)
            logging.debug("final line count ", lineCount+1, "for line ", lineString)
        
        
        if config.LONGTOSHORT == 1:
            printerFinalLine.reverse() #we make the longest (main lines) first
        

        
        #we print the final list of lines
        logging.debug('number of final lines', len(printerFinalLine))
        logging.debug('final line sorted',printerFinalLine)
        lineNumber = 1        
        for pgn, cumulative, likelyPath, winRate, Games in printerFinalLine:
            Printer (pgn, cumulative, likelyPath, winRate, Games, lineNumber)
            lineNumber += 1


def main():

    Grower()

main()

if (config.CAREABOUTENGINE == 1):    
    quitEngine() # quit worker engine

    engine.quit() # quit bb engine
