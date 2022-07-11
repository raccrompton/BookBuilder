

# BookBuilder
An automatic practical Chess opening repertoire builder.


If you want to understand why this exists and how it works, check here:


Then:

<!-- INSTALLATION -->
### Installation


0. To get it working, you'll need to install an IDE (try VSCode), and Python. You can find them here: https://code.visualstudio.com/ and https://www.python.org/downloads/

1. Clone the repo
   ```sh
   git clone 
   cd chess-trap-scorer
   ```
2. Pip install requirements (inside a virtual environment/IDE)
   ```sh
   pip install -r requirements.txt
   ```

<!-- QUICKSTART -->
### Quickstart

Edit and save the Config file with whatever settings you want. The settings are explained in the Config file.

The Config file is also where you put the PGN for whatever openings you want to generate a repertoire for. The repertoire will always be generated from the perspective of the last player to move (eg 1.e4 = White repertoire, 1.e4 e5 = Black repertoire).

To generate a repertoire, navigate to the directory BookBuilder is in in a Terminal window (eg YourComputer/Bookbuilder). Then use the following command, with the pgn of your choice.

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
## Acknowledgements

Thanks to David Foster for Chess Trap Scorer, which was a big inspiration and starting point for this code.
