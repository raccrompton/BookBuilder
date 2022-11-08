from config import config

import io
import os
import logging
import chess
import chess.pgn

from workerEngineReduce import WorkerPlay, quitEngine
import chess.engine


log_level = logging.INFO
if config.PRINT_INFO_TO_CONSOLE:
    log_level = logging.DEBUG
logging.basicConfig(level=log_level)

working_dir = os.getcwd()
logging.info(f'Starting BookBuilder. Your current dir is {working_dir}. Files will be saved to this location.')

engine = None
if (config.CAREABOUTENGINE == 1):
    engine = chess.engine.SimpleEngine.popen_uci(config.ENGINEPATH)  #WHERE THE ENGINE IS ON YOUR COMPUTER
    engine.configure({"Hash": config.ENGINEHASH})
    engine.configure({"Threads": config.ENGINETHREADS})
    logging.getLogger('chess.engine').setLevel(logging.INFO)

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
                logging.debug(f"likelihoods to get here: {self.likelihood_path}")
                logging.debug(f"cumulative likelihood {'{:+.2%}'.format(self.likelihood)}", )
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
        logging.debug (f'valid continuations: {validContinuations}')
        
        
        
        #now we iterate through each valid continuation, and find our best response
        for move in validContinuations:
            board.push_san(move['san']) #we play each valid continuation
            
            self.likelihood_path.append((move['san'], move['playrate'])) #we add the continuation to the likelihood path
            
                                    
            #we look for the best move for us to play
            self.workerPlay = WorkerPlay(board.fen(), lastmove = move)
            _, self.best_move, self.potency, self.potency_range, self.total_games = self.workerPlay.pick_candidate() #list best candidate move, win rate,
            print_playrate = '{:+.2%}'.format(move['playrate'])
            print_cumulativelikelihood = '{:+.2%}'.format(move['cumulativeLikelihood'])
            print_winrate = "{:+.2%}".format(self.potency)
            print_potency_range = ["{:.2%}".format(x) for x in self.potency_range]
            logging.debug(f"against {move['san']} played {print_playrate} cumulative playrate {print_cumulativelikelihood} our best move {self.best_move} win rate is {print_winrate} with a range of {print_potency_range} over {self.total_games} games")
            
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
                if (config.CAREABOUTENGINE == 1) and (config.ENGINEFINISH ==1): #if we want engine to finish lines where no good move data exists
                    
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
                    logging.debug(f"full new pgn after our move is {newpgn}")        
                    
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
                    logging.debug (f'saving no reply line {self.pgn} {self.likelihood} {self.likelihood_path} {lineWinRate} {totalLineGames}')
                    line = (self.pgn, self.likelihood, self.likelihood_path,lineWinRate, totalLineGames)
                    finalLine.append(line) #we add line to final line list                                 
                
                
        global pgnsreturned #we make a globally accessible variable for the new pgns returned for each continuation
        pgnsreturned = pgnList #we define the variable as the completely made list of continuations and responses and send it to be extended to second list

        #if there are no valid continuations we save the line to a file
        if not validContinuations:
            
            logging.debug (f'no valid continuations to {self.pgn}')
            
            #we find potency and other stats
            self.workerPlay = WorkerPlay(board.fen(), move) #we call the api to get the stats in the final position
            lineWinRate, totalLineGames, throwawayDraws = self.workerPlay.find_potency() #we get the win rate and games played in the final position            
            

            if (totalLineGames == 0) and (lineWinRate == None): #if the line ends in mate there are no games played from the position so we need to populate games number from last move
                board.pop()
                self.workerPlay = WorkerPlay(board.fen(), move) #we call the api to get the stats in the final position
                throwawayWinRate, totalLineGames, throwawayDraws = self.workerPlay.find_potency() #we get the games played in the pre Mate position
                lineWinRate = 1 #we make line win rate 1
                logging.debug(f'line ends in mate')
            
            else:
                if (totalLineGames < config.MINGAMES) : #if our response is an engine 'novelty' there is no reliable lineWinRate or total games
                    board.pop() #we go back to opponent's move
                    self.workerPlay = WorkerPlay(board.fen(), move)
                    lineWinRate, totalLineGames, draws = self.workerPlay.find_potency()


                    if config.DRAWSAREHALF == 1: #if draws are half we inverse the winrate on the last move, and add half the draws
                        lineWinRate = 1 - lineWinRate + (0.5 * draws)
                        logging.debug(f"total games on previous move: {totalLineGames}, draws are wins and our move is engine 'almost novelty' so win rate based on previous move is {lineWinRate}")  
                    else:
                        
                        lineWinRate = 1 - lineWinRate - draws #if draws aren't half we inverse the winrate and remove minus the draws
                        logging.debug(f"total games on previous move: {totalLineGames}, draws aren't wins and our move is engine 'almost novelty' so win rate based on prev move is {lineWinRate}")                  
                    

            line = (self.pgn, self.likelihood, self.likelihood_path, lineWinRate, totalLineGames)
            finalLine.append(line) #we add line to final line list 
                
            
            
            
class Printer():
    def __init__(self, filepath):
        self.filepath = filepath
        with open(self.filepath, 'w') as f:
            f.write('')
        logging.info(f"Created new file at: {self.filepath}")



    def print(self, pgn, cumulative, likelyPath, winRate, Games, lineNumber, openingName):
        with open(self.filepath, 'a') as file:
            pgnEvent = '[Event "' + openingName + " Line " + str(lineNumber) + '"]' #we name the event whatever you put in config
            # annotation = "{likelihoods to get here:" + str(self.likelihood_path) + ". Cumulative likelihood" + str("{:+.2%}".format(self.likelihood)) + " }" #we create annotation with opponent move likelihoods and our win rate
            
            file.write('\n' + '\n' + '\n' + pgnEvent + '\n' ) #write name of pgn
            file.write ('\n' + pgn) #write pgn
            
            file.write('\n' + "{Move playrates:") #start annotations
            
            for move, chance in likelyPath:
                moveAnnotation = str("{:+.2%}".format(chance)) + '\t' + move
                file.write ('\n' + moveAnnotation)
            
            
            #we write them in as annotations
            if config.DRAWSAREHALF == 1:
                lineAnnotations = "Line cumulative playrate: " + str("{:+.2%}".format(cumulative)) + '\n' + "Line winrate (draws are half): " + str("{:+.2%}".format(winRate)) + ' over ' + str(Games) + ' games'
            if config.DRAWSAREHALF == 0:
                lineAnnotations = "Line cumulative playrate: " + str("{:+.2%}".format(cumulative)) + '\n' + "Line winrate (excluding draws): " + str("{:+.2%}".format(winRate)) + ' over ' + str(Games) + ' games'
            file.write('\n' + lineAnnotations)

            
            file.write("}") #end annotations                
        logging.info(f"Wrote data to {self.filepath}")


class Grower():
    
    def run(self):
        for chapter, opening in enumerate(config.OPENINGBOOK, 1):
            self.pgn = opening['pgn']
            self.iterator(chapter, opening['Name'])

        if config.CAREABOUTENGINE == 1:
            quitEngine()  # quit worker engine
            engine.quit()  # quit bb engine
        
    def iterator(self, chapter, openingName):
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
        # logging.debug(f"unique lines with subsets {uniqueFinalLine}")     
        
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
            logging.debug(f"final line count { lineCount+1 } for line {lineString}")
        
        
        logging.debug (f'we sort the lines by consecutive move probabilities')        
        def extract_key(printerFinalLine):
            return [v for _, v in printerFinalLine[2]]

        printerFinalLine = sorted(printerFinalLine, key=extract_key)
        
        for line in printerFinalLine:
            logging.debug (line[0])        


        
        
        logging.debug (f'we reverse the sort to make long to short')        
        if config.LONGTOSHORT == 1:
            printerFinalLine.reverse() #we make the longest (main lines) first
            
        
        for line in printerFinalLine:
            logging.debug (line[0])
            
            
        
        
        #we print the final list of lines
        logging.debug(f'number of final lines {len(printerFinalLine)}')
        logging.debug(f'final line sorted {printerFinalLine}')
        printer = Printer( f"{working_dir}/Chapter_{chapter}_{openingName}.pgn")

        lineNumber = 1        
        for pgn, cumulative, likelyPath, winRate, Games in printerFinalLine:
            printer.print(pgn, cumulative, likelyPath, winRate, Games, lineNumber, openingName)
            lineNumber += 1
