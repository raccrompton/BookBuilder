

# BookBuilder
An automatic practical Chess opening repertoire builder.


If you want to understand why this exists, how it works, or get example repertoires, check here:

https://www.alexcrompton.com/blog/automatically-creating-a-practical-opening-repertoire-or-why-your-chess-openings-suck


## GUI Update
The awesome @drauf has built an interface so lots of the below doesn't apply. It should however be much more self explanatory now!

## Bugs, requests, contact
If you need something, contact alex@alexcrompton.com.

Then:

<!-- INSTALLATION -->
## Option 1: Using BookBuilder if you dont want to touch any code.


I've made a Windows/Mac desktop application which means you won't have to install anything. It's slower/clunkier than the code version, and might not be as up to date as the version on GitHub. but it will work without you having to touch any code. If you think you can, try the code version (Option 2 section below).

Here is a Loom video with how to get going: https://www.loom.com/share/62969969f7c043e5a2db6a1393d54c07


#### 1. Get the app.


You can download the app here: https://www.dropbox.com/sh/34yo6it36v7mhqi/AACdMLa0yIVJavHZtEVrVn_xa?dl=0


In it you'll find:
- the BookBuilder application for Mac and Windows
- Stockfish 15 for Mac and Windows
- config.yaml

#### 2. Edit your settings.


Download the files above, and then open config.yaml. Edit the settings to whatever you want. This Config.yaml file is also where you put the PGN for whatever openings you want to generate a repertoire for. The repertoire will always be generated from the perspective of the last player to move (eg "1.e4" creates a White repertoire, "1.e4 e5" creates a Black repertoire).


Importantly, if you want to use the engine, is to update the filepath for the engine to match that on your computer. You can do this by opening the BookBuilder folder on your computer and finding the engine file. For Windows you can find the file like this: https://www.wikihow.com/Find-a-File%27s-Path-on-Windows or https://setapp.com/how-to/how-to-find-the-path-of-a-file-in-mac.
The engine path should include the actual engine program, not just the folder that the engine program might be in. The full path will therefore end in something like /stockfish.exe on Windows or /stockfish on Mac. No underscores are allowed in the path or file name or it won't work.


#### 3. Generate your repertoire.


Run the BookBuilder application. You might have to wait a few seconds. You'll be asked for the file path of your config.yaml file. The full file path should include the actual file, so it will end in 'yourfilepath/config.yaml'.Paste it in and press enter. Sometimes it can take a while for things to happen on screen.

#### 4. Find your repertoire files.


The application will create PGN files for each of the openings you put in your config file. On Mac, BookBuilder tells you where it's storing the files at the beginning, when it's running. You can change where it stores the files by using terminal commands like 'cd' to navigate, but it might take some Googling to figure out. On Windows, Bookbuilder puts the PGN files in the same folder as the BookBuilder app, and closes itself when it's finished running.


#### 5. Off you go!

Take your PGN files and upload them to your favourite place like Chessable, Chess Tempo, Chess Madra etc.




<!-- INSTALLATION -->
## Option 2: Using BookBuilder if you dont mind installing programming tools like IDEs or Python.

This is the fast/most customisable/up to date version and works on all platforms (Windows / Mac / Linux)

This can seem difficult if you're not a programmer, but don't worry. It should only take about 5-10 minutes to get going.

#### 1. Install an IDE and Python

To run the program, you'll need to install an IDE (try VSCode) and Python. You can find the IDE VSCode here https://code.visualstudio.com/, and VSCode has a python installer extension which you can install from within VSCode. You can usually  install everything you need from within VSCode's extensions or from the VSCode Terminal.

From here, I recored a Loom video so you can watch me set it up and create a repertoire in under 2 minutes: https://www.loom.com/share/57e269a1a7bc43d389f1a79eeb161f09

If you get other error messages during this process (because you don't have Git or Pip etc), follow the instructions on the error messages or copy and paste the error into Google. Ususally you just have to install something by typing in a command in Terminal. It'll be fine.



#### 2. Open a Terminal and Clone the repo (eg in VSCode)


   ```sh
   git clone https://github.com/raccrompton/BookBuilder.git
   cd BookBuilder
   ```
   OR
   download the files manually and open them in VSCode as I do in the loom video.
   
   

#### 3. Open a Terminal and Pip install the requirements to run the program (inside a virtual environment/IDE like VSCode)

   ```sh
   pip3 install -r requirements.txt
   ```
   
   or
   
   ```sh
   pip install -r requirements.txt
   ```


#### 4. Add the Engine

If you want to use the engine features, download the latest version of whatever engine you want to use, and update the engine filepath in the Config.yaml file with the filepath for where you've saved the engine on your computer. I recommend Stockfish https://stockfishchess.org/ which is strong and free, and to just put it in the BookBuilder folder.
The engine path should include the actual engine program, not just the folder that the engine program might be in. The full path will therefore end in something like /stockfish.exe on Windows or /stockfish on Mac.
No underscores are allowed in the engine file path or engine file name. Make sure if you are on Mac you are using the Stockfish or other engine itself, not the Mac app. To be sure, use the command 'brew install stockfish'


#### 5. Customise the settings and input your PGNs


Edit and save the Config.yaml file with whatever settings you want. The settings are explained in the Config.yaml file. The Config.yaml file is where you put the PGN for whatever openings you want to generate a repertoire for. The repertoire will always be generated from the perspective of the last player to move (eg "1.e4" creates a White repertoire, "1.e4 e5" creates a Black repertoire).


#### 6. Generate your repertoire


To generate a repertoire, navigate in a Terminal window to the directory where BookBuilder is installed (eg YourComputer/Bookbuilder). Then use the following command:

   ```sh
   python3 BookBuilder.py
   ```
Or, depending on your python version:

   ```sh
   python BookBuilder.py
   ```
You'll be asked for the file path of your config.yaml file. The full file path should include the actual file, so it will end in 'yourfilepath/config.yaml'.Paste it in and press enter. You can also update config.py with this filepath so you dont have to do that in future.


#### 7. Off you go
BookBuilder will put your repertoire files in the folder it runs in. So you can edit the annotations etc, and then upload to your favourite place like Chessable, Chess Tempo, Chess Madra etc.




### Output
You will get printed explanations of what's happening in the Terminal window. Once a repertoire has been completed for a PGN you inputted, a PGN file will be created in the BookBuilder folder if you're running the Code from an IDE, or in the folder stated when you start BookBuilder if you're running the desktop app. If you input multiple PGN starting points, a separate file will be created for each PGN.

FYI:
The [lichess opening API](https://lichess.org/api) is used to gather data for the analysis. No token is required.

---
<!-- ACKNOWLEDGEMENTS -->
### Acknowledgements

Thanks to creators like Ben Johnson, Daniel Lona, Nate Solon, and Marcus Buffett, for all their ideas and inspiration. Thanks also to David Foster for Chess Trap Scorer, which was not just part of the inspiration, but also all of the starting point code wise for this program. 

### Help out
If you know how to turn this into a web or desktop app more easily used by non programmers, please do.

RajjSinghh has done some great work on turning this into an API, so help him here: https://github.com/RajjSinghh/BookBuilder
The main limitation right now would be that the Lichess API rate limits when even one user runs lots of queries, but perhaps this can be avoided. There may also be engine limitations. Other users have suggested that a rewrite with everything running in JS in the browser would get around both issues.
