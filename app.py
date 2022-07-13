from flask import Flask
from flask import request
from BookBuilder import *

app = Flask(__name__)

@app.route("/sendpgn", methods=["POST"])
def generate_pgn():
    book = request.json["book"]
    grower = Grower()
    output = grower.run(book)

    response = {
        "book": output
    }
    return response


if __name__ == "__main__":
    app.run()