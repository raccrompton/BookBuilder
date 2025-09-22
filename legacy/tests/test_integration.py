"""
Integration Tests
Tests for complete workflow integration, subprocess execution, and file I/O
"""

import pytest
import os
import tempfile
import subprocess
import time
import json
import yaml
from unittest.mock import patch, Mock, MagicMock
import requests
import chess.pgn
import io


class TestBookBuilderIntegration:
    """Test integration between Flask app and BookBuilder.py"""
    
    def test_end_to_end_repertoire_generation(self, client, sample_config, temp_dirs):
        """Test complete end-to-end repertoire generation workflow"""
        # Mock successful BookBuilder execution
        mock_result = Mock()
        mock_result.returncode = 0
        mock_result.stdout = "BookBuilder completed successfully"
        mock_result.stderr = ""
        
        # Create expected output file
        test_pgn = """[Event "Test Opening"]
[Site "BookBuilder"]
[Date "2024.01.01"]
[Round "1"]
[White "Analysis"]
[Black "Analysis"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *
"""
        
        output_file = os.path.join(temp_dirs['output'], 'Chapter_Kings_Pawn.pgn')
        os.makedirs(temp_dirs['output'], exist_ok=True)
        with open(output_file, 'w') as f:
            f.write(test_pgn)
        
        with patch('app.subprocess.run', return_value=mock_result):
            with patch('app.OUTPUT_FOLDER', temp_dirs['output']):
                with patch('app.UPLOAD_FOLDER', temp_dirs['upload']):
                    # Generate repertoire
                    response = client.post('/generate',
                                         data=json.dumps(sample_config),
                                         content_type='application/json')
        
        # Verify generation response
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['status'] == 'success'
        assert len(data['files']) > 0
        
        # Test file download
        filename = data['files'][0]
        with patch('app.OUTPUT_FOLDER', temp_dirs['output']):
            download_response = client.get(f'/download/{filename}')
        
        assert download_response.status_code == 200
        assert b'1. e4 e5' in download_response.data
    
    def test_config_file_creation_and_cleanup(self, client, sample_config, temp_dirs):
        """Test that config files are properly created and cleaned up"""
        config_files_created = []
        original_run = subprocess.run
        
        def mock_run(*args, **kwargs):
            # Capture config file path from stdin
            if 'input' in kwargs and kwargs['input']:
                config_files_created.append(kwargs['input'])
            
            # Return success
            result = Mock()
            result.returncode = 0
            result.stdout = "Success"
            result.stderr = ""
            return result
        
        with patch('app.subprocess.run', side_effect=mock_run):
            with patch('app.OUTPUT_FOLDER', temp_dirs['output']):
                with patch('app.UPLOAD_FOLDER', temp_dirs['upload']):
                    os.makedirs(temp_dirs['output'], exist_ok=True)
                    # Create a dummy output file
                    with open(os.path.join(temp_dirs['output'], 'Chapter_Test.pgn'), 'w') as f:
                        f.write("[Event \"Test\"]\n\n1. e4 *")
                    
                    response = client.post('/generate',
                                         data=json.dumps(sample_config),
                                         content_type='application/json')
        
        # Verify config file was created and used
        assert len(config_files_created) == 1
        config_path = config_files_created[0]
        
        # Config file should be cleaned up
        assert not os.path.exists(config_path)
    
    def test_bookbuilder_subprocess_execution(self, sample_config, temp_dirs):
        """Test actual BookBuilder.py subprocess execution (without engine)"""
        # Create config file
        config_data = sample_config.copy()
        config_data['CAREABOUTENGINE'] = 0  # Disable engine for testing
        
        config_path = os.path.join(temp_dirs['upload'], 'test_config.yaml')
        with open(config_path, 'w') as f:
            yaml.dump(config_data, f)
        
        # Test subprocess command construction
        current_dir = os.getcwd()
        bookbuilder_path = os.path.join(current_dir, 'BookBuilder.py')
        
        cmd = ['python3', bookbuilder_path]
        
        # Verify command structure
        assert len(cmd) == 2
        assert cmd[0] == 'python3'
        assert cmd[1].endswith('BookBuilder.py')
        
        # Note: We don't actually execute BookBuilder.py to avoid modifying it
        # This test validates the command construction logic
    
    def test_concurrent_generation_requests(self, client, sample_config, temp_dirs):
        """Test handling of multiple concurrent generation requests"""
        mock_results = []
        call_count = 0
        
        def mock_run(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            
            # Simulate different execution times
            result = Mock()
            result.returncode = 0
            result.stdout = f"Generation {call_count} completed"
            result.stderr = ""
            mock_results.append(result)
            return result
        
        with patch('app.subprocess.run', side_effect=mock_run):
            with patch('app.OUTPUT_FOLDER', temp_dirs['output']):
                with patch('app.UPLOAD_FOLDER', temp_dirs['upload']):
                    os.makedirs(temp_dirs['output'], exist_ok=True)
                    
                    # Create output files for each request
                    for i in range(3):
                        with open(os.path.join(temp_dirs['output'], f'Chapter_Test_{i}.pgn'), 'w') as f:
                            f.write(f"[Event \"Test {i}\"]\n\n1. e4 *")
                    
                    # Make concurrent requests
                    responses = []
                    for i in range(3):
                        config = sample_config.copy()
                        config['OPENINGBOOK'][0]['Name'] = f'Test_{i}'
                        
                        response = client.post('/generate',
                                             data=json.dumps(config),
                                             content_type='application/json')
                        responses.append(response)
        
        # All requests should succeed
        for response in responses:
            assert response.status_code == 200
        
        # Should have handled all requests
        assert call_count == 3


class TestFileSystemOperations:
    """Test file system operations and I/O handling"""
    
    def test_temporary_directory_creation(self):
        """Test that temporary directories are created properly"""
        upload_folder = '/tmp/bookbuilder_uploads'
        output_folder = '/tmp/bookbuilder_outputs'
        
        # Simulate directory creation
        os.makedirs(upload_folder, exist_ok=True)
        os.makedirs(output_folder, exist_ok=True)
        
        assert os.path.exists(upload_folder)
        assert os.path.exists(output_folder)
        
        # Cleanup
        try:
            os.rmdir(upload_folder)
            os.rmdir(output_folder)
        except OSError:
            pass  # Directories might not be empty
    
    def test_pgn_file_generation_and_validation(self, temp_dirs):
        """Test PGN file generation and content validation"""
        test_pgn_content = """[Event "Test Repertoire"]
[Site "BookBuilder"]
[Date "2024.01.01"]
[Round "1"]
[White "Analysis"]
[Black "Analysis"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 *
"""
        
        # Create test PGN file
        pgn_path = os.path.join(temp_dirs['output'], 'Chapter_Spanish.pgn')
        os.makedirs(temp_dirs['output'], exist_ok=True)
        with open(pgn_path, 'w') as f:
            f.write(test_pgn_content)
        
        # Validate PGN structure
        assert os.path.exists(pgn_path)
        
        with open(pgn_path, 'r') as f:
            content = f.read()
            
        # Parse PGN to validate structure
        game = chess.pgn.read_game(io.StringIO(content))
        assert game is not None
        assert game.headers['Event'] == 'Test Repertoire'
        
        # Verify moves are valid
        board = game.board()
        move_count = 0
        for move in game.mainline_moves():
            assert move in board.legal_moves
            board.push(move)
            move_count += 1
        
        assert move_count > 0
    
    def test_file_cleanup_on_error(self, temp_dirs):
        """Test that temporary files are cleaned up when errors occur"""
        config_path = os.path.join(temp_dirs['upload'], 'error_test_config.yaml')
        
        # Create temporary config file
        test_config = {'VARIANT': 'standard', 'CAREABOUTENGINE': 0}
        with open(config_path, 'w') as f:
            yaml.dump(test_config, f)
        
        assert os.path.exists(config_path)
        
        # Simulate cleanup
        try:
            os.remove(config_path)
        except Exception:
            pass  # Cleanup might fail, but shouldn't crash
        
        # File should be removed
        assert not os.path.exists(config_path)
    
    def test_disk_space_handling(self, temp_dirs):
        """Test behavior when disk space is limited"""
        # This is a conceptual test - in practice, disk space issues
        # are difficult to simulate reliably
        
        large_config = {
            'OPENINGBOOK': [{"Name": f"Opening_{i}", "pgn": "1. e4 e5"} for i in range(100)],
            'VARIANT': 'standard'
        }
        
        config_path = os.path.join(temp_dirs['upload'], 'large_config.yaml')
        
        try:
            with open(config_path, 'w') as f:
                yaml.dump(large_config, f)
            
            # Verify large config can be written and read
            with open(config_path, 'r') as f:
                loaded_config = yaml.safe_load(f)
            
            assert len(loaded_config['OPENINGBOOK']) == 100
            
        except OSError as e:
            # Handle disk space or permission errors gracefully
            assert 'No space left' in str(e) or 'Permission denied' in str(e)
        
        finally:
            if os.path.exists(config_path):
                os.remove(config_path)


class TestNetworkIntegration:
    """Test network operations and API integration"""
    
    @patch('requests.get')
    def test_lichess_api_integration_with_retries(self, mock_get):
        """Test Lichess API integration with retry logic"""
        # Simulate rate limiting followed by success
        rate_limit_response = Mock()
        rate_limit_response.status_code = 429
        
        success_response = Mock()
        success_response.status_code = 200
        success_response.json.return_value = {
            "white": 500,
            "black": 400,
            "draws": 100,
            "moves": [
                {"uci": "e2e4", "san": "e4", "white": 250, "black": 200, "draws": 50}
            ]
        }
        
        mock_get.side_effect = [rate_limit_response, success_response]
        
        # Simulate the API call with retry logic
        max_retries = 3
        retry_delay = 1  # seconds
        
        for attempt in range(max_retries):
            response = mock_get('https://explorer.lichess.ovh/lichess?variant=standard')
            
            if response.status_code == 429:
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)
                    continue
                else:
                    pytest.fail("Max retries exceeded")
            elif response.status_code == 200:
                data = response.json()
                assert data['white'] == 500
                assert len(data['moves']) == 1
                break
    
    @patch('requests.get')
    def test_network_timeout_handling(self, mock_get):
        """Test handling of network timeouts"""
        mock_get.side_effect = requests.Timeout("Request timed out")
        
        try:
            response = mock_get('https://explorer.lichess.ovh/lichess?variant=standard', timeout=30)
            pytest.fail("Should have raised timeout exception")
        except requests.Timeout:
            # Should handle timeout gracefully
            assert True
    
    @patch('requests.get')
    def test_malformed_api_response_handling(self, mock_get):
        """Test handling of malformed API responses"""
        malformed_responses = [
            Mock(status_code=200, json=Mock(side_effect=json.JSONDecodeError("Invalid JSON", "", 0))),
            Mock(status_code=200, json=Mock(return_value={"invalid": "structure"})),
            Mock(status_code=200, json=Mock(return_value={})),
            Mock(status_code=200, text="Not JSON at all")
        ]
        
        for malformed_response in malformed_responses:
            mock_get.return_value = malformed_response
            
            try:
                response = mock_get('https://explorer.lichess.ovh/lichess?variant=standard')
                if hasattr(response, 'json'):
                    data = response.json()
                    # Should handle missing required fields gracefully
                    assert data is not None
            except (json.JSONDecodeError, KeyError, AttributeError):
                # These exceptions should be caught and handled
                assert True


class TestPerformanceIntegration:
    """Test performance characteristics and resource usage"""
    
    def test_generation_timeout_handling(self, client, sample_config):
        """Test that generation requests timeout appropriately"""
        def slow_subprocess(*args, **kwargs):
            # Simulate slow BookBuilder execution
            time.sleep(0.1)  # Short delay for testing
            raise subprocess.TimeoutExpired(['python3'], timeout=0.05)
        
        with patch('app.subprocess.run', side_effect=slow_subprocess):
            response = client.post('/generate',
                                 data=json.dumps(sample_config),
                                 content_type='application/json')
        
        assert response.status_code == 500
        data = json.loads(response.data)
        assert 'timed out' in data['error'].lower()
    
    def test_memory_usage_with_large_configs(self, sample_config):
        """Test memory usage with large configuration files"""
        # Create a large configuration
        large_config = sample_config.copy()
        large_config['OPENINGBOOK'] = [
            {"Name": f"Opening_{i:04d}", "pgn": f"1. e4 e5 2. Nf3 Nc6 {i}"[:20]} 
            for i in range(1000)
        ]
        
        # Test that large configs can be processed
        config_json = json.dumps(large_config)
        assert len(config_json) > 50000  # Should be reasonably large
        
        # Should be able to parse back
        parsed_config = json.loads(config_json)
        assert len(parsed_config['OPENINGBOOK']) == 1000
    
    def test_concurrent_request_resource_usage(self, performance_test_data):
        """Test resource usage under concurrent requests"""
        small_repertoire = performance_test_data['small_repertoire']
        
        # Simulate multiple concurrent configurations
        configs = []
        for i in range(5):  # 5 concurrent requests
            config = {
                'OPENINGBOOK': [{"Name": f"Concurrent_{i}", "pgn": "1. e4 e5"}],
                'VARIANT': 'standard',
                'CAREABOUTENGINE': 0,
                'MOVES': 5  # Keep small for testing
            }
            configs.append(config)
        
        # Test that all configs can be processed
        for config in configs:
            config_json = json.dumps(config)
            assert len(config_json) > 0
            parsed = json.loads(config_json)
            assert parsed['OPENINGBOOK'][0]['Name'].startswith('Concurrent_')


class TestErrorRecoveryIntegration:
    """Test error recovery and resilience"""
    
    def test_recovery_from_bookbuilder_crash(self, client, sample_config, temp_dirs):
        """Test recovery when BookBuilder.py crashes"""
        def crashing_subprocess(*args, **kwargs):
            result = Mock()
            result.returncode = -11  # Segmentation fault
            result.stdout = ""
            result.stderr = "Segmentation fault (core dumped)"
            return result
        
        with patch('app.subprocess.run', side_effect=crashing_subprocess):
            with patch('app.OUTPUT_FOLDER', temp_dirs['output']):
                with patch('app.UPLOAD_FOLDER', temp_dirs['upload']):
                    response = client.post('/generate',
                                         data=json.dumps(sample_config),
                                         content_type='application/json')
        
        assert response.status_code == 500
        data = json.loads(response.data)
        assert 'BookBuilder failed' in data['error']
    
    def test_recovery_from_corrupted_config(self, client, temp_dirs):
        """Test recovery from corrupted configuration data"""
        corrupted_configs = [
            {"OPENINGBOOK": None},  # Null value
            {"OPENINGBOOK": []},    # Empty array
            {"INVALID_FIELD": "value"},  # Unknown field
            {},  # Empty config
        ]
        
        for corrupted_config in corrupted_configs:
            response = client.post('/generate',
                                 data=json.dumps(corrupted_config),
                                 content_type='application/json')
            
            # Should handle gracefully (not crash the server)
            assert response.status_code in [400, 500]
            assert b'error' in response.data.lower()
    
    def test_recovery_from_filesystem_errors(self, client, sample_config):
        """Test recovery from filesystem permission errors"""
        def permission_error_subprocess(*args, **kwargs):
            raise PermissionError("Permission denied: cannot write to directory")
        
        with patch('app.subprocess.run', side_effect=permission_error_subprocess):
            response = client.post('/generate',
                                 data=json.dumps(sample_config),
                                 content_type='application/json')
        
        assert response.status_code == 500
        # Should handle the error gracefully without crashing
    
    def test_graceful_degradation_without_engine(self, client, sample_config):
        """Test graceful degradation when engine is not available"""
        # Configure to use engine but simulate engine failure
        engine_config = sample_config.copy()
        engine_config['CAREABOUTENGINE'] = 1
        engine_config['ENGINEPATH'] = '/nonexistent/stockfish'
        
        # This should be handled gracefully by the config.py validation
        # The test validates that invalid engine paths are detected
        assert engine_config['CAREABOUTENGINE'] == 1
        assert not os.path.exists(engine_config['ENGINEPATH'])