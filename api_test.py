import requests

body = {
    "book": [{"Name": "London Countergambit", "pgn": "1. d4 d5 2. Bf4 c5"}]
}

response = requests.post("http://127.0.0.1:5000/sendpgn", json=body)
print(response.status_code)
print(response.json())

