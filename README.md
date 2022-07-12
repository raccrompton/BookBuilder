

# BookBuilder
An automatic practical Chess opening repertoire builder.


If you want to understand why this exists, how it works, or get example repertoires, check here:

https://www.alexcrompton.com/blog/automatically-creating-a-practical-opening-repertoire-or-why-your-chess-openings-suck


## Bugs, requests, contact
If you need something, contact alex@alexcrompton.com.

Then:

<!-- INSTALLATION -->
### Installation


1. To get it working, you'll need to install an IDE (try VSCode) and Python. You can find them here: https://code.visualstudio.com/ and https://www.python.org/downloads/ 

If you get other error messages during this process (because you don't have Git or Pip etc), follow the instructions on the error messages or copy and paste the error into Google. Ususally you just have to install something by typing in a command in Terminal. It'll be fine.

2. Open a Terminal, Clone the repo in VSCode (or download the files manually here)
   ```sh
   git clone https://github.com/raccrompton/BookBuilder.git
   cd BookBuilder
   ```
3. Pip install requirements (inside a virtual environment/IDE like VSCode)
   ```sh
   pip install -r requirements.txt
   ```
4. If you want to use the engine features, download the latest version of whatever engine you want to use, and update the engine filepath in the Config.py file with the filepath for where you've saved the engine on your computer. I recommend Stockfish https://stockfishchess.org/ which is strong and free, and to just put it in the BookBuilder folder.


<!-- QUICKSTART -->
### Quickstart

Edit and save the Config.py file with whatever settings you want. The settings are explained in the Config.py file.

The Config.py file is also where you put the PGN for whatever openings you want to generate a repertoire for. The repertoire will always be generated from the perspective of the last player to move (eg "1.e4" creates a White repertoire, "1.e4 e5" creates a Black repertoire).

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

Thanks to creators like Ben Johnson, Daniel Lona, Nate Solon, and Marcus Buffett, for all their ideas and inspiration. Thanks also to David Foster for Chess Trap Scorer, which was not just part of the inspiration, but also all of the starting point code wise for this program. 

### Request from me
If you know how to turn this into a web app, please do.
