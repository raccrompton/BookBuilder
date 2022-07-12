

# BookBuilder
An automatic practical Chess opening repertoire builder.


If you want to understand why this exists and how it works, check here:

https://www.alexcrompton.com/blog/automatically-creating-a-practical-opening-repertoire-or-why-your-chess-openings-suck


## Bugs, requests, contact
If you need something, contact alex@alexcrompton.com.

Then:

<!-- INSTALLATION -->
### Installation


1. To get it working, you'll need to install an IDE (try VSCode), and Python. You can find them here: https://code.visualstudio.com/ and https://www.python.org/downloads/

2. Clone the repo
   ```sh
   git clone https://github.com/raccrompton/BookBuilder.git
   cd BookBuilder
   ```
3. Pip install requirements (inside a virtual environment/IDE)
   ```sh
   pip install -r requirements.txt
   ```
4. Download the latest version of whatever engine you want to use, and update the engine filepath in Both BookBuilder.py and workerEngineReduce.py files (around line 20) with the filepath for you've saved the engine on your computer. I recommend Stockfish https://stockfishchess.org/ which is strong and free.


<!-- QUICKSTART -->
### Quickstart

Edit and save the Config.py file with whatever settings you want. The settings are explained in the Config file.

The Config file is also where you put the PGN for whatever openings you want to generate a repertoire for. The repertoire will always be generated from the perspective of the last player to move (eg 1.e4 = White repertoire, 1.e4 e5 = Black repertoire).

To generate a repertoire, navigate to the directory BookBuilder is in in a Terminal window (eg YourComputer/Bookbuilder). Then use the following command:

   ```sh
   python3 BookBuilder.py
   ```
Or, depending on your python version:

   ```sh
   python BookBuilder.py
   ```


The [lichess opening API](https://lichess.org/api) is used to gather data for the analysis. No token is required.



### Output
You will get printed explanations of what's happening in the Terminal window. Once a repertoire has been completed for a PGN you inputted, a PGN file will be created in the BookBuilder folder. If you input multiple PGN starting points, a separate file will be created for each PGN.

---
<!-- ACKNOWLEDGEMENTS -->
### Acknowledgements

Thanks to David Foster for Chess Trap Scorer, which was a big inspiration and starting point for this code.
