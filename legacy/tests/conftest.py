"""
BookBuilder Test Configuration
Pytest fixtures and configuration for comprehensive chess application testing
"""

import pytest
import tempfile
import os
import yaml
import chess
import chess.pgn
from unittest.mock import Mock, patch
from flask import Flask
import io
import json

# Import application modules
import sys
legacy_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(legacy_root)
sys.path.append(os.path.join(legacy_root, 'core'))
sys.path.append(os.path.join(legacy_root, 'web'))

from web.app import app as flask_app
from core.config import config


@pytest.fixture
def app():
    """Flask application fixture for testing"""
    flask_app.config.update({
        'TESTING': True,
        'SECRET_KEY': 'test-secret-key',
        'WTF_CSRF_ENABLED': False
    })
    yield flask_app


@pytest.fixture
def client(app):
    """Flask test client fixture"""
    return app.test_client()


@pytest.fixture
def temp_dirs():
    """Create temporary directories for testing file operations"""
    with tempfile.TemporaryDirectory() as upload_dir:
        with tempfile.TemporaryDirectory() as output_dir:
            yield {
                'upload': upload_dir,
                'output': output_dir
            }


@pytest.fixture
def sample_config():
    """Sample configuration for testing"""
    return {
        'OPENINGBOOK': [
            {"Name": "King's Pawn", "pgn": "1. e4 e5"},
            {"Name": "Queen's Gambit", "pgn": "1. d4 d5 2. c4"}
        ],
        'LONGTOSHORT': 0,
        'VARIANT': 'standard',
        'SPEEDS': ['blitz,rapid'],
        'RATINGS': ['1600,2000'],
        'MOVES': 10,
        'DEPTHLIKELIHOOD': 0.03,
        'ALPHA': 0.001,
        'MINPLAYRATE': 0.001,
        'MINGAMES': 19,
        'CONTINUATIONGAMES': 10,
        'DRAWSAREHALF': 0,
        'CAREABOUTENGINE': 0,
        'ENGINEDEPTH': 20,
        'ENGINEFINISH': 1,
        'SOUNDNESSLIMIT': -99,
        'MOVELOSSLIMIT': -99,
        'IGNORELOSSLIMIT': 300,
        'ENGINETHREADS': 1,
        'ENGINEHASH': 320,
        'PRINT_INFO_TO_CONSOLE': True
    }


@pytest.fixture
def valid_pgn_games():
    """Valid PGN game strings for testing"""
    return [
        "1. e4 e5 2. Nf3 Nc6 3. Bb5",
        "1. d4 d5 2. c4 dxc4 3. Nf3",
        "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4",
        "1. Nf3 Nf6 2. c4 g6 3. Nc3 Bg7"
    ]


@pytest.fixture
def invalid_pgn_games():
    """Invalid PGN game strings for testing edge cases"""
    return [
        "1. e4 e9",  # Invalid move
        "1. Kxe4",  # Illegal move
        "",  # Empty string
        "not a chess move",  # Non-chess string
        "1. e4 e5 2.",  # Incomplete move
        "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 O-O",  # Too long
    ]


@pytest.fixture
def mock_lichess_api_response():
    """Mock Lichess API response for testing"""
    return {
        "white": 1000,
        "black": 800,
        "draws": 200,
        "moves": [
            {
                "uci": "e2e4",
                "san": "e4",
                "white": 500,
                "black": 400,
                "draws": 100,
                "averageRating": 1800
            },
            {
                "uci": "d2d4", 
                "san": "d4",
                "white": 300,
                "black": 250,
                "draws": 50,
                "averageRating": 1750
            }
        ]
    }


@pytest.fixture
def mock_stockfish_engine():
    """Mock Stockfish engine for testing"""
    mock_engine = Mock()
    mock_engine.play.return_value = Mock()
    mock_engine.play.return_value.move = chess.Move.from_uci("e2e4")
    mock_engine.analyse.return_value = {"score": chess.engine.PovScore(chess.engine.Cp(50), chess.WHITE)}
    mock_engine.quit.return_value = None
    return mock_engine


@pytest.fixture
def chess_position_fixtures():
    """Various chess positions for testing"""
    return {
        'starting_position': chess.Board(),
        'sicilian_dragon': chess.Board('rnbqkb1r/pp2pppp/3p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R b KQkq - 0 5'),
        'endgame_position': chess.Board('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1'),
        'tactical_position': chess.Board('r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3'),
        'castling_position': chess.Board('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'),
        'promotion_position': chess.Board('8/1P6/8/8/8/8/6p1/4k3 w - - 0 1'),
    }


@pytest.fixture
def edge_case_configurations():
    """Edge case configurations for stress testing"""
    return {
        'minimal_config': {
            'MINGAMES': 1,
            'MOVES': 5,
            'DEPTHLIKELIHOOD': 0.5,
            'CAREABOUTENGINE': 0
        },
        'maximal_config': {
            'MINGAMES': 100,
            'MOVES': 50,
            'DEPTHLIKELIHOOD': 0.001,
            'ENGINEDEPTH': 40,
            'CAREABOUTENGINE': 1
        },
        'engine_heavy_config': {
            'CAREABOUTENGINE': 1,
            'ENGINEDEPTH': 30,
            'SOUNDNESSLIMIT': -300,
            'MOVELOSSLIMIT': -100
        }
    }


@pytest.fixture(autouse=True)
def cleanup_temp_files():
    """Automatically cleanup temporary files after each test"""
    yield
    # Cleanup any temporary files that might have been created
    temp_dirs = ['/tmp/bookbuilder_uploads', '/tmp/bookbuilder_outputs']
    for temp_dir in temp_dirs:
        if os.path.exists(temp_dir):
            for file in os.listdir(temp_dir):
                if file.startswith('config_') or file.startswith('Chapter_'):
                    try:
                        os.remove(os.path.join(temp_dir, file))
                    except FileNotFoundError:
                        pass


@pytest.fixture
def performance_test_data():
    """Data for performance testing"""
    return {
        'small_repertoire': {
            'opening_count': 2,
            'max_depth': 5,
            'expected_time': 60  # seconds
        },
        'medium_repertoire': {
            'opening_count': 5,
            'max_depth': 10,
            'expected_time': 300  # seconds
        },
        'large_repertoire': {
            'opening_count': 10,
            'max_depth': 15,
            'expected_time': 1200  # seconds
        }
    }


# Utility functions for tests
def create_test_config_file(config_data, temp_dir):
    """Helper to create temporary config files for testing"""
    config_path = os.path.join(temp_dir, 'test_config.yaml')
    with open(config_path, 'w') as f:
        yaml.dump(config_data, f)
    return config_path


def create_sample_pgn_file(pgn_content, temp_dir, filename='test.pgn'):
    """Helper to create temporary PGN files for testing"""
    pgn_path = os.path.join(temp_dir, filename)
    with open(pgn_path, 'w') as f:
        f.write(pgn_content)
    return pgn_path


def validate_pgn_structure(pgn_content):
    """Helper to validate PGN structure"""
    try:
        game = chess.pgn.read_game(io.StringIO(pgn_content))
        return game is not None
    except:
        return False


def simulate_lichess_rate_limit():
    """Simulate Lichess API rate limiting for testing"""
    return {'status_code': 429, 'retry_after': 60}


def create_mock_subprocess_result(returncode=0, stdout="", stderr=""):
    """Helper to create mock subprocess results"""
    result = Mock()
    result.returncode = returncode
    result.stdout = stdout
    result.stderr = stderr
    return result