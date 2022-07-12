

# BookBuilder
An automatic practical Chess opening repertoire builder.


If you want to understand why this exists, how it works, or get example repertoires, check here:

https://www.alexcrompton.com/blog/automatically-creating-a-practical-opening-repertoire-or-why-your-chess-openings-suck


## Bugs, requests, contact
If you need something, contact alex@alexcrompton.com.

Then:

<!-- INSTALLATION -->
### Using BookBuilder if you dont want to touch any code.
I've made a desktop application which means you won't have to install anything. It's a lot clunkier than the Code version, but it will work without you having to touch any code. For programmers FYI, it's just a pyinstaller --onefile of BookBuilder.py.

1. Getting the app.
You can download the application here: https://drive.google.com/drive/folders/1YUJO0usd5vdGP4HapiL_R_j18bdDDUEu?usp=sharing
In it you'll find:
- the BookBuilder application
- Stockfish 15 for Mac and Windows
- config.yaml

2. Editing the settings.
Download the files above, and then open config.yaml. Edit the settings to whatever you want. This Config.yaml file is also where you put the PGN for whatever openings you want to generate a repertoire for. The repertoire will always be generated from the perspective of the last player to move (eg "1.e4" creates a White repertoire, "1.e4 e5" creates a Black repertoire).

Importantly, if you want to use the engine, is to update the filepath for the engine to match that on your computer. You can do this by opening the BookBuilder folder on your computer and finding the engine file. For Windows you can find the file like this: https://www.wikihow.com/Find-a-File%27s-Path-on-Windows or https://setapp.com/how-to/how-to-find-the-path-of-a-file-in-mac.

3. Creating a repertoire.
Run the BookBuilder application. You might have to wait a few seconds. You'll be asked for the file path of your config.yaml file. Paste it in and press enter. Sometimes it can take a while for things to happen on screen.

4. The application will create PGN files for each of the openings you put in your config file. BookBuilder tells you where it's storing the files at the beginning, when it's running.

5. Take your PGN files and upload them to your favourite place like Chessable, Chess Tempo, Chess Madra etc.




<!-- INSTALLATION -->
### Using BookBuilder if you dont mind installing python.

This can seem difficult if you're not a programmer, but don't worry. It should only take about 5-10 minutes to get going.

1. To get it working, you'll need to install an IDE (try VSCode) and Python. You can find them here: https://code.visualstudio.com/ and https://www.python.org/downloads/ 

#### From here, I recored a Loom video so you can watch me set it up and create a repertoire in under 2 minutes: https://www.loom.com/share/57e269a1a7bc43d389f1a79eeb161f09

If you get other error messages during this process (because you don't have Git or Pip etc), follow the instructions on the error messages or copy and paste the error into Google. Ususally you just have to install something by typing in a command in Terminal. It'll be fine.



2. Open a Terminal, Clone the repo in VSCode.
   ```sh
   git clone https://github.com/raccrompton/BookBuilder.git
   cd BookBuilder
   ```
   OR
   download the files manually and open them in VSCode as I do in the loom video.
   
3. Pip install requirements (inside a virtual environment/IDE like VSCode)
   ```sh
   pip3 install -r requirements.txt
   ```
   or
      ```sh
   pip install -r requirements.txt
   ```
   
4. If you want to use the engine features, download the latest version of whatever engine you want to use, and update the engine filepath in the Config.yaml file with the filepath for where you've saved the engine on your computer. I recommend Stockfish https://stockfishchess.org/ which is strong and free, and to just put it in the BookBuilder folder.


5. Creating a repertoire

Edit and save the Config.yaml file with whatever settings you want. The settings are explained in the Config.yaml file. You can also update config.py so you dont have to do that in future.

The Config.yaml file is also where you put the PGN for whatever openings you want to generate a repertoire for. The repertoire will always be generated from the perspective of the last player to move (eg "1.e4" creates a White repertoire, "1.e4 e5" creates a Black repertoire).

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
If you know how to turn this into a web or desktop app more easily used by non programmers, please do.
