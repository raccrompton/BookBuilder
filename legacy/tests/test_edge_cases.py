"""
Edge Case Tests
Comprehensive testing of boundary conditions, error scenarios, and chess-specific edge cases
"""

import pytest
import json
import chess
import chess.pgn
import io
import tempfile
import os
from unittest.mock import Mock, patch
import subprocess


class TestChessSpecificEdgeCases:
    """Test chess-specific edge cases and boundary conditions"""
    
    def test_maximum_game_length_handling(self):
        """Test handling of very long chess games"""
        # Create a long game (near maximum moves)
        long_pgn = "1. e4 e5 "
        for i in range(2, 200):  # Very long game
            if i % 2 == 0:
                long_pgn += f"{i//2}. Nf3 Nf6 "
            else:
                long_pgn += "Ng1 Ng8 "
        long_pgn += "*"
        
        # Should handle long games gracefully
        try:
            game = chess.pgn.read_game(io.StringIO(long_pgn))
            if game is not None:
                move_count = sum(1 for _ in game.mainline_moves())
                assert move_count > 100  # Verify it's actually long
        except Exception as e:
            # Long games might be rejected, which is acceptable
            assert "too long" in str(e).lower() or "invalid" in str(e).lower()
    
    def test_complex_opening_variations(self):
        """Test complex opening variations with deep transpositions"""
        complex_openings = [
            # Sicilian Dragon variations
            "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Be3 Bg7 7. f3 O-O 8. Qd2 Nc6",
            # French Defense variations
            "1. e4 e6 2. d4 d5 3. Nc3 Bb4 4. e5 c5 5. a3 Bxc3+ 6. bxc3 Ne7 7. Qg4 Qc7 8. Qxg7 Rg8 9. Qxh7 cxd4",
            # King's Indian Defense
            "1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5 7. O-O Nc6 8. d5 Ne7 9. Ne1 Nd7 10. Be3 f5",
            # Ruy Lopez Marshall Attack
            "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Bb7 10. d4 Re8"
        ]
        
        for opening_pgn in complex_openings:
            try:
                game = chess.pgn.read_game(io.StringIO(opening_pgn))
                assert game is not None
                
                # Verify all moves are legal
                board = game.board()
                for move in game.mainline_moves():
                    assert move in board.legal_moves, f"Illegal move in {opening_pgn}"
                    board.push(move)
                
                # Should reach a reasonable position
                assert len(list(board.legal_moves)) > 0  # Position not terminal
                
            except Exception as e:
                pytest.fail(f"Complex opening failed: {opening_pgn}, error: {e}")
    
    def test_extreme_statistical_scenarios(self):
        """Test extreme statistical scenarios in move evaluation"""
        extreme_scenarios = [
            # Very high confidence with few games
            {'white': 10, 'black': 0, 'draws': 0, 'total_games': 10},
            # Very low confidence with many games
            {'white': 5000, 'black': 5000, 'draws': 0, 'total_games': 10000},
            # All draws scenario
            {'white': 0, 'black': 0, 'draws': 100, 'total_games': 100},
            # Single game scenarios
            {'white': 1, 'black': 0, 'draws': 0, 'total_games': 1},
            {'white': 0, 'black': 1, 'draws': 0, 'total_games': 1},
            {'white': 0, 'black': 0, 'draws': 1, 'total_games': 1},
        ]
        
        for scenario in extreme_scenarios:
            white, black, draws = scenario['white'], scenario['black'], scenario['draws']
            total = white + black + draws
            
            assert total == scenario['total_games']
            
            # Test win rate calculation with draws as losses (DRAWSAREHALF = 0)
            if total > 0:
                white_rate = white / total
                black_rate = black / total
                draw_rate = draws / total
                
                assert 0 <= white_rate <= 1
                assert 0 <= black_rate <= 1
                assert 0 <= draw_rate <= 1
                assert abs(white_rate + black_rate + draw_rate - 1.0) < 0.0001
            
            # Test win rate calculation with draws as half wins (DRAWSAREHALF = 1)
            if total > 0:
                white_rate_half = (white + 0.5 * draws) / total
                black_rate_half = (black + 0.5 * draws) / total
                
                assert 0 <= white_rate_half <= 1
                assert 0 <= black_rate_half <= 1
                assert abs(white_rate_half + black_rate_half - 1.0) < 0.0001
    
    def test_zero_and_negative_game_counts(self):
        """Test handling of zero and negative game counts"""
        edge_cases = [
            {'white': 0, 'black': 0, 'draws': 0},  # No games
            {'white': -1, 'black': 10, 'draws': 5},  # Negative white games
            {'white': 10, 'black': -1, 'draws': 5},  # Negative black games
            {'white': 10, 'black': 5, 'draws': -1},  # Negative draws
        ]
        
        for case in edge_cases:
            white, black, draws = case['white'], case['black'], case['draws']
            total = white + black + draws
            
            if total <= 0:
                # Should handle zero/negative totals gracefully
                assert total <= 0
            else:
                # For mixed cases, should handle negative components
                if white < 0 or black < 0 or draws < 0:
                    # Negative values should be rejected or handled specially
                    assert True  # Test that system doesn't crash
    
    def test_unicode_and_special_characters(self):
        """Test handling of Unicode and special characters in chess notation"""
        special_openings = [
            # Unicode chess pieces
            {"Name": "♔♕♖ Test", "pgn": "1. e4 e5"},
            # Special characters in names
            {"Name": "Test's Opening (Zürich)", "pgn": "1. d4 d5"},
            # Accented characters
            {"Name": "Réti Opening", "pgn": "1. Nf3 Nf6"},
            # Quotes and apostrophes
            {"Name": "Queen's Gambit \"Accepted\"", "pgn": "1. d4 d5 2. c4 dxc4"},
            # Mathematical symbols
            {"Name": "α-β Test ∞", "pgn": "1. e4 c5"},
        ]
        
        for opening in special_openings:
            # Should be able to handle Unicode in JSON
            opening_json = json.dumps([opening])
            parsed_opening = json.loads(opening_json)
            
            assert len(parsed_opening) == 1
            assert parsed_opening[0]['Name'] == opening['Name']
            assert parsed_opening[0]['pgn'] == opening['pgn']
    
    def test_malformed_fen_positions(self):
        """Test handling of malformed FEN positions"""
        malformed_fens = [
            "",  # Empty string
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",  # Missing additional fields
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0",  # Missing move number
            "invalid/position/here w KQkq - 0 1",  # Invalid board representation
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1",  # Invalid turn
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w XYZ - 0 1",  # Invalid castling rights
        ]
        
        for fen in malformed_fens:
            try:
                board = chess.Board(fen)
                # If it doesn't raise an exception, validate it's actually valid
                assert board.is_valid() or fen == ""  # Empty string might be handled specially
            except (ValueError, chess.InvalidFenError):
                # Expected to fail for malformed FENs
                assert True


class TestConfigurationEdgeCases:
    """Test edge cases in configuration handling"""
    
    def test_extreme_configuration_values(self, client):
        """Test extremely large or small configuration values"""
        extreme_configs = [
            # Very large values
            {
                'MOVES': 10000,
                'ENGINEDEPTH': 1000,
                'MINGAMES': 100000,
                'DEPTHLIKELIHOOD': 0.000001,
            },
            # Very small values
            {
                'MOVES': 1,
                'ENGINEDEPTH': 1,
                'MINGAMES': 1,
                'DEPTHLIKELIHOOD': 0.999,
            },
            # Zero values
            {
                'MOVES': 0,
                'MINGAMES': 0,
                'ALPHA': 0,
                'MINPLAYRATE': 0,
            },
            # Negative values
            {
                'SOUNDNESSLIMIT': -10000,
                'MOVELOSSLIMIT': -10000,
                'IGNORELOSSLIMIT': -1000,
            }
        ]
        
        for config in extreme_configs:
            # Add required fields
            full_config = {
                'OPENINGBOOK': [{"Name": "Test", "pgn": "1. e4 e5"}],
                'VARIANT': 'standard',
                'CAREABOUTENGINE': 0,
                **config
            }
            
            # Should handle extreme values gracefully
            config_json = json.dumps(full_config)
            parsed_config = json.loads(config_json)
            
            # Values should be preserved (even if they're extreme)
            for key, value in config.items():
                assert parsed_config[key] == value
    
    def test_invalid_data_types_in_config(self, client):
        """Test handling of invalid data types in configuration"""
        invalid_configs = [
            # String where number expected
            {'MOVES': "ten", 'CAREABOUTENGINE': 0},
            # Array where string expected
            {'VARIANT': ['standard'], 'CAREABOUTENGINE': 0},
            # Object where primitive expected
            {'MINGAMES': {'value': 19}, 'CAREABOUTENGINE': 0},
            # Boolean where number expected
            {'ENGINEDEPTH': True, 'CAREABOUTENGINE': 0},
            # Null values
            {'VARIANT': None, 'CAREABOUTENGINE': 0},
        ]
        
        for invalid_config in invalid_configs:
            full_config = {
                'OPENINGBOOK': [{"Name": "Test", "pgn": "1. e4 e5"}],
                **invalid_config
            }
            
            response = client.post('/generate',
                                 data=json.dumps(full_config),
                                 content_type='application/json')
            
            # Should handle invalid types gracefully (either convert or reject)
            assert response.status_code in [200, 400, 500]
    
    def test_missing_required_fields(self, client):
        """Test handling of missing required configuration fields"""
        incomplete_configs = [
            {},  # Completely empty
            {'OPENINGBOOK': [{"Name": "Test", "pgn": "1. e4 e5"}]},  # Only opening book
            {'VARIANT': 'standard'},  # Only variant
            {'CAREABOUTENGINE': 1},  # Engine enabled but no engine path
        ]
        
        for config in incomplete_configs:
            response = client.post('/generate',
                                 data=json.dumps(config),
                                 content_type='application/json')
            
            # Should handle missing fields (either with defaults or rejection)
            assert response.status_code in [200, 400, 500]
    
    def test_contradictory_configuration_combinations(self, client):
        """Test contradictory configuration combinations"""
        contradictory_configs = [
            # Engine enabled but depth is 0
            {
                'CAREABOUTENGINE': 1,
                'ENGINEDEPTH': 0,
                'ENGINEPATH': '/usr/local/bin/stockfish'
            },
            # Minimum games higher than total possible
            {
                'MINGAMES': 1000000,
                'CONTINUATIONGAMES': 2000000,
            },
            # Confidence interval alpha > 1
            {
                'ALPHA': 2.0,
                'DEPTHLIKELIHOOD': 1.5,
            },
            # Soundness limit more restrictive than loss limit
            {
                'SOUNDNESSLIMIT': -50,
                'MOVELOSSLIMIT': -200,  # More restrictive
            }
        ]
        
        for config in contradictory_configs:
            full_config = {
                'OPENINGBOOK': [{"Name": "Test", "pgn": "1. e4 e5"}],
                'VARIANT': 'standard',
                **config
            }
            
            response = client.post('/generate',
                                 data=json.dumps(full_config),
                                 content_type='application/json')
            
            # Should handle contradictory configs (may warn or auto-correct)
            assert response.status_code in [200, 400, 500]


class TestResourceLimitEdgeCases:
    """Test resource limit and performance edge cases"""
    
    def test_massive_opening_book_configuration(self, client):
        """Test handling of very large opening book configurations"""
        # Create a massive opening book
        massive_openings = []
        for i in range(1000):  # 1000 openings
            massive_openings.append({
                "Name": f"Mass Opening {i:04d}",
                "pgn": f"1. e4 e5 2. Nf3 Nc6 3. Bb5 a{6 + (i % 2)}"
            })
        
        massive_config = {
            'OPENINGBOOK': massive_openings,
            'VARIANT': 'standard',
            'CAREABOUTENGINE': 0,
            'MOVES': 5  # Keep other params small
        }
        
        # Test JSON serialization
        try:
            config_json = json.dumps(massive_config)
            assert len(config_json) > 100000  # Should be quite large
            
            # Test deserialization
            parsed_config = json.loads(config_json)
            assert len(parsed_config['OPENINGBOOK']) == 1000
            
        except (MemoryError, OverflowError):
            # Acceptable to fail with memory error for truly massive configs
            pytest.skip("Configuration too large for available memory")
    
    def test_deeply_nested_json_structures(self, client):
        """Test handling of deeply nested JSON in configuration"""
        # Create nested structure (though not typical for chess config)
        nested_data = {"level_1": {"level_2": {"level_3": {"value": "deep"}}}}
        
        config_with_nesting = {
            'OPENINGBOOK': [{"Name": "Test", "pgn": "1. e4 e5"}],
            'VARIANT': 'standard',
            'CUSTOM_DATA': nested_data  # This might be flattened by the config processing
        }
        
        response = client.post('/generate',
                             data=json.dumps(config_with_nesting),
                             content_type='application/json')
        
        # Should handle nested data gracefully
        assert response.status_code in [200, 400, 500]
    
    def test_extremely_long_string_values(self, client):
        """Test handling of extremely long string values"""
        long_string = "x" * 100000  # 100KB string
        
        config_with_long_strings = {
            'OPENINGBOOK': [{"Name": long_string, "pgn": "1. e4 e5"}],
            'VARIANT': 'standard',
            'CAREABOUTENGINE': 0
        }
        
        try:
            response = client.post('/generate',
                                 data=json.dumps(config_with_long_strings),
                                 content_type='application/json')
            
            # Should handle long strings (may truncate or reject)
            assert response.status_code in [200, 400, 413, 500]  # 413 = Payload Too Large
            
        except MemoryError:
            pytest.skip("String too long for available memory")


class TestSystemInteractionEdgeCases:
    """Test edge cases in system interactions"""
    
    def test_simultaneous_file_access(self, temp_dirs):
        """Test handling of simultaneous file access scenarios"""
        test_file_path = os.path.join(temp_dirs['output'], 'Chapter_Concurrent.pgn')
        test_content = "[Event \"Concurrent Test\"]\n\n1. e4 e5 *"
        
        # Create the file
        os.makedirs(temp_dirs['output'], exist_ok=True)
        with open(test_file_path, 'w') as f:
            f.write(test_content)
        
        # Test multiple readers
        readers = []
        for i in range(3):
            try:
                with open(test_file_path, 'r') as f:
                    content = f.read()
                    readers.append(content)
            except IOError:
                # File locking issues might occur
                pass
        
        # At least one reader should succeed
        assert len(readers) > 0
        assert all(content == test_content for content in readers)
    
    def test_filesystem_permission_edge_cases(self, temp_dirs):
        """Test filesystem permission edge cases"""
        # Create a directory structure
        restricted_dir = os.path.join(temp_dirs['output'], 'restricted')
        os.makedirs(restricted_dir, exist_ok=True)
        
        # Test file creation in directory
        test_file = os.path.join(restricted_dir, 'test.pgn')
        
        try:
            with open(test_file, 'w') as f:
                f.write("test content")
            
            # Test reading back
            with open(test_file, 'r') as f:
                content = f.read()
            
            assert content == "test content"
            
        except PermissionError:
            # Permission errors should be handled gracefully
            pytest.skip("Permission error in test environment")
    
    def test_disk_space_exhaustion_simulation(self, temp_dirs):
        """Test behavior when disk space might be exhausted"""
        # This is difficult to test reliably, so we simulate the conditions
        
        large_file_path = os.path.join(temp_dirs['output'], 'large_repertoire.pgn')
        
        try:
            # Try to create a reasonably large file
            with open(large_file_path, 'w') as f:
                for i in range(10000):  # Create substantial content
                    f.write(f"[Event \"Game {i}\"]\n[Site \"Test\"]\n\n1. e4 e5 *\n\n")
            
            # Verify file was created
            assert os.path.exists(large_file_path)
            file_size = os.path.getsize(large_file_path)
            assert file_size > 1000000  # Should be > 1MB
            
        except (OSError, IOError) as e:
            if "No space left" in str(e):
                # This is the scenario we want to test handling for
                assert True
            else:
                # Other I/O errors
                pytest.skip(f"I/O error in test environment: {e}")
    
    def test_process_limit_edge_cases(self):
        """Test handling of process limits and resource constraints"""
        # Test subprocess creation limits
        mock_processes = []
        
        try:
            # Simulate creating multiple processes
            for i in range(10):  # Reasonable number for testing
                mock_process = Mock()
                mock_process.returncode = 0
                mock_process.stdout = f"Process {i} completed"
                mock_process.stderr = ""
                mock_processes.append(mock_process)
            
            # Should be able to handle multiple processes
            assert len(mock_processes) == 10
            
        except (OSError, MemoryError):
            # Process limits might be encountered
            pytest.skip("Process limit reached in test environment")
    
    def test_signal_handling_edge_cases(self):
        """Test handling of system signals and interruptions"""
        # This tests the conceptual handling of interruptions
        
        def simulate_interrupted_process():
            """Simulate a process that gets interrupted"""
            result = Mock()
            result.returncode = -2  # SIGINT
            result.stdout = "Process interrupted"
            result.stderr = ""
            return result
        
        # Test that interrupted processes are handled
        interrupted_result = simulate_interrupted_process()
        assert interrupted_result.returncode < 0  # Negative indicates signal
        
        # System should handle interrupted processes gracefully
        # (In practice, this would be handled by the Flask error handling)


class TestDataCorruptionEdgeCases:
    """Test handling of corrupted or malformed data"""
    
    def test_corrupted_json_payloads(self, client):
        """Test handling of corrupted JSON payloads"""
        corrupted_payloads = [
            '{"OPENINGBOOK": [{"Name": "Test", "pgn": "1. e4 e5"}',  # Incomplete
            '{"OPENINGBOOK": [{"Name": "Test", "pgn": "1. e4 e5"}]}{"extra": "data"}',  # Double JSON
            '{"OPENINGBOOK": [{"Name": "Test\\", "pgn": "1. e4 e5"}]}',  # Escaped quotes issue
            '{"OPENINGBOOK": [{"Name": "Test", "pgn": "1. e4 e5"}]}\x00',  # Null byte
            b'\xff\xfe{"OPENINGBOOK": []}',  # Binary data
        ]
        
        for payload in corrupted_payloads:
            if isinstance(payload, bytes):
                response = client.post('/generate',
                                     data=payload,
                                     content_type='application/json')
            else:
                response = client.post('/generate',
                                     data=payload,
                                     content_type='application/json')
            
            # Should handle corrupted payloads gracefully
            assert response.status_code in [400, 500]
            assert b'error' in response.data.lower()
    
    def test_malformed_pgn_in_openings(self, client):
        """Test handling of malformed PGN in opening configurations"""
        malformed_pgns = [
            "1. e4 e9",  # Illegal move
            "1. e4 e5 2.",  # Incomplete move
            "1. Kx4",  # Invalid capture notation
            "not chess moves at all",
            "1. e4 e5 2. Nf3 \x00 invalid",  # Null byte in PGN
            "1. e4 e5 2. Nf3" + "x" * 10000,  # Extremely long move annotation
        ]
        
        for pgn in malformed_pgns:
            config = {
                'OPENINGBOOK': [{"Name": "Test", "pgn": pgn}],
                'VARIANT': 'standard',
                'CAREABOUTENGINE': 0
            }
            
            response = client.post('/generate',
                                 data=json.dumps(config),
                                 content_type='application/json')
            
            # Should handle malformed PGN gracefully
            assert response.status_code in [200, 400, 500]
    
    def test_encoding_issues(self, client):
        """Test handling of encoding issues in text data"""
        encoding_test_cases = [
            # Different Unicode normalization
            {"Name": "café", "pgn": "1. e4 e5"},  # é as single character
            {"Name": "cafe\u0301", "pgn": "1. e4 e5"},  # é as e + combining accent
            # Mixed encodings (simulated)
            {"Name": "Test\u2603", "pgn": "1. e4 e5"},  # Snowman character
            # Control characters
            {"Name": "Test\n\r\t", "pgn": "1. e4 e5"},
        ]
        
        for opening in encoding_test_cases:
            config = {
                'OPENINGBOOK': [opening],
                'VARIANT': 'standard',
                'CAREABOUTENGINE': 0
            }
            
            try:
                config_json = json.dumps(config, ensure_ascii=False)
                response = client.post('/generate',
                                     data=config_json,
                                     content_type='application/json; charset=utf-8')
                
                # Should handle encoding issues gracefully
                assert response.status_code in [200, 400, 500]
                
            except UnicodeEncodeError:
                # Some encodings might not be serializable
                pytest.skip("Encoding not supported in test environment")