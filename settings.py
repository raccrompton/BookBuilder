import io
import logging
import os
import pickle
from enum import Enum
from typing import List

import chess
import chess.pgn
import psutil


class BookSettings:
    class Order(Enum):
        LONG_TO_SHORT = "Long lines to short lines"
        SHORT_TO_LONG = "Short lines to long lines"

    class Book:
        def __init__(self, name: str, pgn: str):
            self.name = name
            self.pgn = pgn

        def __str__(self) -> str:
            return f"Name: {self.name}\nPGN: {self.pgn}"

        def is_valid_pgn(self) -> bool:
            # poor man's validation: if chess.pgn throws when parsing a PGN, the PGN is not valid
            game = chess.pgn.read_game(io.StringIO(self.pgn))
            return len(game.errors) == 0

    order: Order = Order.SHORT_TO_LONG
    books_string: str = "Book A\n1. e4 e5\n\nBook B\n1. e4 e5 2. f4"

    def order_callback(self, _, order_value):
        self.order = self.Order(order_value)

    def books_string_callback(self, _, books_string):
        self.books_string = books_string

    def create_books_from_string(self) -> List[Book]:
        books = list()
        lines = self.books_string.splitlines()
        non_empty_lines = iter([line.strip() for line in lines if line and line.strip()])
        for book_name in non_empty_lines:
            books.append(self.Book(book_name, next(non_empty_lines)))
        return books


class DatabaseSettings:
    class Variant(Enum):
        STANDARD = "standard"
        CHESS960 = "chess960"
        CRAZYHOUSE = "crazyhouse"
        ANTICHESS = "antichess"
        ATOMIC = "atomic"
        HORDE = "horde"
        KING_OF_THE_HILL = "kingOfTheHill"
        RACING_KINGS = "racingKings"
        THREE_CHECK = "threeCheck"

    class Speed(Enum):
        ULTRA_BULLET = "ultraBullet"
        BULLET = "bullet"
        BLITZ = "blitz"
        RAPID = "rapid"
        CLASSICAL = "classical"
        CORRESPONDENCE = "correspondence"

    class Rating(Enum):
        ELO_1600 = "1600"
        ELO_1800 = "1800"
        ELO_2000 = "2000"
        ELO_2200 = "2200"
        ELO_2500 = "2500"

    variant: Variant = Variant.STANDARD
    speeds: List[Speed] = [Speed.RAPID, Speed.CLASSICAL]
    ratings: List[Rating] = [Rating.ELO_1800, Rating.ELO_2000, Rating.ELO_2200]
    moves: int = 10

    def __getstate__(self):
        state = self.__dict__.copy()
        # for whatever reason those two properties are not part of __dict__
        state["speeds"] = self.speeds
        state["ratings"] = self.ratings
        return state

    def variant_callback(self, _, variant_name):
        self.variant = self.Variant[variant_name]

    def speed_callback(self, _, is_selected, speed_name):
        speed = self.Speed[speed_name]
        if is_selected:
            self.speeds.append(speed)
        else:
            self.speeds.remove(speed)

    def rating_callback(self, _, is_selected, rating_name):
        rating = self.Rating[rating_name]
        if is_selected:
            self.ratings.append(rating)
        else:
            self.ratings.remove(rating)

    def moves_callback(self, _, moves):
        if moves > 5:
            self.moves = moves


class MoveSelectionSettings:
    depth_likelihood: float = 0.01
    alpha: float = 0.001
    min_play_rate: float = 0.001
    min_games: int = 20
    continuation_games: int = 10
    draws_are_half: bool = False

    def depth_callback(self, _, depth):
        if depth >= 0:
            self.depth_likelihood = depth / 100

    def alpha_callback(self, _, alpha):
        if alpha >= 0:
            self.alpha = alpha / 100

    def min_play_rate_callback(self, _, min_play_rate):
        if min_play_rate >= 0:
            self.min_play_rate = min_play_rate / 100

    def min_games_callback(self, _, min_games):
        if min_games >= 0:
            self.min_games = min_games

    def continuation_games_callback(self, _, continuation_games):
        if continuation_games >= 0:
            self.continuation_games = continuation_games

    def draws_are_half_callback(self, _, draws_are_half):
        self.draws_are_half = draws_are_half


class EngineSettings:
    NO_FILE_SELECTED = "No engine file selected"

    enabled: bool = False
    path: str = NO_FILE_SELECTED
    finish: bool = True
    depth: int = 20
    threads: int = int(psutil.cpu_count(logical=True) / 2)  # half of logical CPU cores
    hash: int = int(psutil.virtual_memory().available / 1024 / 1024 / 2)  # half of available RAM
    soundness_limit: int = -99
    move_loss_limit: int = -99
    ignore_loss_limit: int = 300

    def enabled_callback(self, _, enabled):
        self.enabled = enabled

    def path_callback(self, file_selections):
        full_file_paths = list(file_selections['selections'].values())
        # currently there is no way to force a single file selection in dearpygui
        # we grab the first selected file as a workaround
        self.path = full_file_paths[0]

    def finish_callback(self, _, finish):
        self.finish = finish

    def depth_callback(self, _, depth):
        if depth > 0:
            self.depth = depth

    def threads_callback(self, _, threads):
        if threads > 0:
            self.threads = threads

    def hash_callback(self, _, hash):
        if hash > 0:
            self.hash = hash

    def soundness_limit_callback(self, _, soundness_limit):
        self.soundness_limit = soundness_limit

    def move_loss_limit_callback(self, _, move_loss_limit):
        self.move_loss_limit = move_loss_limit

    def ignore_loss_limit_callback(self, _, ignore_loss_limit):
        self.ignore_loss_limit = ignore_loss_limit


class Settings:
    _settings_file = 'settings.pickle'

    book = BookSettings()
    database = DatabaseSettings()
    moveSelection = MoveSelectionSettings()
    engine = EngineSettings()

    def __init__(self):
        self.load_from_file()

    def save_to_file(self):
        with open(self._settings_file, 'wb') as file:
            pickle.dump(self, file, protocol=pickle.HIGHEST_PROTOCOL)
            logging.info(f"Saved settings to {self._settings_file}")

    def load_from_file(self):
        if not os.path.exists(self._settings_file):
            logging.info(f"No settings file {self._settings_file} found, skipping loading settings")
            return

        with open(self._settings_file, 'rb') as file:
            from_file = pickle.load(file)

            self.book = from_file.book
            self.database = from_file.database
            self.moveSelection = from_file.moveSelection
            self.engine = from_file.engine
            logging.info(f"Loaded settings from {self._settings_file}")
