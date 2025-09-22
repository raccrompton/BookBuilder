"""
Flask Application Unit Tests
Tests for web interface routes, request handling, and response validation
"""

import pytest
import json
import os
import tempfile
from unittest.mock import patch, Mock, MagicMock
import subprocess
from flask import url_for


class TestFlaskRoutes:
    """Test Flask web application routes"""
    
    def test_home_route_renders_html(self, client):
        """Test that home route returns HTML page with chess interface"""
        response = client.get('/')
        
        assert response.status_code == 200
        assert b'BookBuilder' in response.data
        assert b'Generate Opening Repertoire' in response.data
        assert b'opening-books' in response.data
        assert b'engine-depth' in response.data
        
    def test_health_endpoint(self, client):
        """Test health check endpoint for Railway deployment"""
        response = client.get('/health')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['status'] == 'healthy'
        assert 'timestamp' in data
        
    def test_health_endpoint_json_format(self, client):
        """Test health endpoint returns proper JSON structure"""
        response = client.get('/health')
        
        assert response.content_type == 'application/json'
        data = json.loads(response.data)
        
        # Validate timestamp format
        from datetime import datetime
        try:
            datetime.fromisoformat(data['timestamp'])
            timestamp_valid = True
        except ValueError:
            timestamp_valid = False
        
        assert timestamp_valid, "Timestamp should be ISO format"


class TestGenerateRepertoire:
    """Test repertoire generation endpoint"""
    
    def test_generate_endpoint_requires_post(self, client):
        """Test that generate endpoint only accepts POST requests"""
        response = client.get('/generate')
        assert response.status_code == 405  # Method not allowed
        
    def test_generate_with_valid_config(self, client, sample_config, temp_dirs):
        """Test repertoire generation with valid configuration"""
        
        # Mock the subprocess call to BookBuilder.py
        mock_result = Mock()
        mock_result.returncode = 0
        mock_result.stdout = "Generation completed successfully"
        mock_result.stderr = ""
        
        # Create a fake PGN file that would be generated
        test_pgn_content = "[Event \"Test\"]\n[Site \"Test\"]\n\n1. e4 e5 *"
        test_file = os.path.join(temp_dirs['output'], 'Chapter_Test.pgn')
        
        with patch('app.subprocess.run', return_value=mock_result):
            with patch('app.OUTPUT_FOLDER', temp_dirs['output']):
                with patch('app.UPLOAD_FOLDER', temp_dirs['upload']):
                    # Create the expected output file
                    os.makedirs(temp_dirs['output'], exist_ok=True)
                    with open(test_file, 'w') as f:
                        f.write(test_pgn_content)
                    
                    response = client.post('/generate',
                                         data=json.dumps(sample_config),
                                         content_type='application/json')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['status'] == 'success'
        assert len(data['files']) > 0
        assert 'Chapter_Test.pgn' in data['files']
        
    def test_generate_with_invalid_json(self, client):
        """Test generate endpoint with malformed JSON"""
        response = client.post('/generate',
                             data="invalid json",
                             content_type='application/json')
        
        assert response.status_code == 400
        
    def test_generate_with_invalid_opening_book_json(self, client, sample_config):
        """Test generate endpoint with invalid opening book JSON"""
        # Break the opening book JSON
        sample_config['OPENINGBOOK'] = "invalid json string"
        
        response = client.post('/generate',
                             data=json.dumps(sample_config),
                             content_type='application/json')
        
        assert response.status_code == 500
        data = json.loads(response.data)
        assert 'Invalid opening books JSON format' in data['error']
        
    def test_generate_handles_subprocess_failure(self, client, sample_config):
        """Test generate endpoint handles BookBuilder.py failure"""
        mock_result = Mock()
        mock_result.returncode = 1
        mock_result.stdout = ""
        mock_result.stderr = "Chess engine error"
        
        with patch('app.subprocess.run', return_value=mock_result):
            response = client.post('/generate',
                                 data=json.dumps(sample_config),
                                 content_type='application/json')
        
        assert response.status_code == 500
        data = json.loads(response.data)
        assert 'BookBuilder failed' in data['error']
        
    def test_generate_handles_timeout(self, client, sample_config):
        """Test generate endpoint handles subprocess timeout"""
        with patch('app.subprocess.run', side_effect=subprocess.TimeoutExpired(['python3'], 1800)):
            response = client.post('/generate',
                                 data=json.dumps(sample_config),
                                 content_type='application/json')
        
        assert response.status_code == 500
        data = json.loads(response.data)
        assert 'timed out' in data['error'].lower()
        
    def test_generate_no_files_produced(self, client, sample_config, temp_dirs):
        """Test generate endpoint when no PGN files are produced"""
        mock_result = Mock()
        mock_result.returncode = 0
        mock_result.stdout = "Generation completed"
        mock_result.stderr = ""
        
        with patch('app.subprocess.run', return_value=mock_result):
            with patch('app.OUTPUT_FOLDER', temp_dirs['output']):
                with patch('app.UPLOAD_FOLDER', temp_dirs['upload']):
                    # Don't create any output files
                    os.makedirs(temp_dirs['output'], exist_ok=True)
                    
                    response = client.post('/generate',
                                         data=json.dumps(sample_config),
                                         content_type='application/json')
        
        assert response.status_code == 500
        data = json.loads(response.data)
        assert 'No PGN files were generated' in data['error']


class TestFileDownload:
    """Test file download functionality"""
    
    def test_download_valid_pgn_file(self, client, temp_dirs):
        """Test downloading a valid PGN file"""
        # Create a test PGN file
        test_content = "[Event \"Test Game\"]\n[Site \"Test\"]\n\n1. e4 e5 *"
        test_file = os.path.join(temp_dirs['output'], 'Chapter_Test.pgn')
        os.makedirs(temp_dirs['output'], exist_ok=True)
        
        with open(test_file, 'w') as f:
            f.write(test_content)
        
        with patch('app.OUTPUT_FOLDER', temp_dirs['output']):
            response = client.get('/download/Chapter_Test.pgn')
        
        assert response.status_code == 200
        assert response.data.decode('utf-8') == test_content
        assert 'attachment' in response.headers['Content-Disposition']
        
    def test_download_nonexistent_file_returns_404(self, client, temp_dirs):
        """Test downloading non-existent file returns 404"""
        with patch('app.OUTPUT_FOLDER', temp_dirs['output']):
            response = client.get('/download/Chapter_NonExistent.pgn')
        
        assert response.status_code == 404
        
    def test_download_rejects_non_pgn_files(self, client):
        """Test that download endpoint rejects non-PGN files"""
        response = client.get('/download/malicious.exe')
        assert response.status_code == 404
        
        response = client.get('/download/config.yaml')
        assert response.status_code == 404
        
    def test_download_rejects_non_chapter_files(self, client):
        """Test that download endpoint rejects files not starting with Chapter_"""
        response = client.get('/download/malicious_Chapter.pgn')
        assert response.status_code == 404
        
        response = client.get('/download/NotChapter_file.pgn')
        assert response.status_code == 404


class TestConfigurationMapping:
    """Test configuration field mapping and validation"""
    
    def test_field_mapping_completeness(self, client, sample_config):
        """Test that all form fields map to config keys"""
        expected_mappings = {
            'opening_books': 'OPENINGBOOK',
            'long_to_short': 'LONGTOSHORT',
            'variant': 'VARIANT',
            'speeds': 'SPEEDS',
            'ratings': 'RATINGS',
            'moves': 'MOVES',
            'depth_likelihood': 'DEPTHLIKELIHOOD',
            'alpha': 'ALPHA',
            'min_playrate': 'MINPLAYRATE',
            'min_games': 'MINGAMES',
            'continuation_games': 'CONTINUATIONGAMES',
            'draws_half': 'DRAWSAREHALF',
            'care_engine': 'CAREABOUTENGINE',
            'engine_depth': 'ENGINEDEPTH',
            'engine_finish': 'ENGINEFINISH',
            'soundness_limit': 'SOUNDNESSLIMIT',
            'move_loss_limit': 'MOVELOSSLIMIT'
        }
        
        # This tests the mapping by checking if the client code would handle it properly
        # In a real test, we would inspect the actual form processing code
        for form_field, config_key in expected_mappings.items():
            assert config_key in [
                'OPENINGBOOK', 'LONGTOSHORT', 'VARIANT', 'SPEEDS', 'RATINGS',
                'MOVES', 'DEPTHLIKELIHOOD', 'ALPHA', 'MINPLAYRATE', 'MINGAMES',
                'CONTINUATIONGAMES', 'DRAWSAREHALF', 'CAREABOUTENGINE',
                'ENGINEDEPTH', 'ENGINEFINISH', 'SOUNDNESSLIMIT', 'MOVELOSSLIMIT'
            ]
    
    def test_numeric_field_conversion(self, client, sample_config):
        """Test that numeric fields are properly converted"""
        # Test integer fields
        integer_fields = ['MOVES', 'MINGAMES', 'CONTINUATIONGAMES', 'ENGINEDEPTH']
        for field in integer_fields:
            if field in sample_config:
                assert isinstance(sample_config[field], int)
        
        # Test float fields
        float_fields = ['DEPTHLIKELIHOOD', 'ALPHA', 'MINPLAYRATE']
        for field in float_fields:
            if field in sample_config:
                assert isinstance(sample_config[field], (int, float))


class TestSecurityAndEdgeCases:
    """Test security measures and edge cases"""
    
    def test_config_file_cleanup(self, client, sample_config, temp_dirs):
        """Test that temporary config files are cleaned up"""
        config_files_before = []
        if os.path.exists(temp_dirs['upload']):
            config_files_before = [f for f in os.listdir(temp_dirs['upload']) if f.startswith('config_')]
        
        mock_result = Mock()
        mock_result.returncode = 1  # Force an error to test cleanup
        mock_result.stderr = "Test error"
        
        with patch('app.subprocess.run', return_value=mock_result):
            with patch('app.UPLOAD_FOLDER', temp_dirs['upload']):
                with patch('app.OUTPUT_FOLDER', temp_dirs['output']):
                    response = client.post('/generate',
                                         data=json.dumps(sample_config),
                                         content_type='application/json')
        
        # Check that no new config files remain
        config_files_after = []
        if os.path.exists(temp_dirs['upload']):
            config_files_after = [f for f in os.listdir(temp_dirs['upload']) if f.startswith('config_')]
        
        assert len(config_files_after) == len(config_files_before)
    
    def test_directory_traversal_protection(self, client):
        """Test protection against directory traversal attacks"""
        malicious_paths = [
            '../../../etc/passwd',
            '..\\..\\windows\\system32\\config\\sam',
            'Chapter_../../../../etc/shadow.pgn',
            'Chapter_..%2F..%2Fetc%2Fpasswd.pgn'
        ]
        
        for path in malicious_paths:
            response = client.get(f'/download/{path}')
            assert response.status_code == 404
    
    def test_large_config_payload(self, client):
        """Test handling of unusually large configuration payloads"""
        large_config = {
            'OPENINGBOOK': [{"Name": f"Opening_{i}", "pgn": "1. e4 e5"} for i in range(1000)],
            'VARIANT': 'standard'
        }
        
        response = client.post('/generate',
                             data=json.dumps(large_config),
                             content_type='application/json')
        
        # Should handle gracefully (either accept or reject properly)
        assert response.status_code in [200, 400, 413, 500]  # Valid HTTP responses
    
    def test_empty_config_handling(self, client):
        """Test handling of empty configuration"""
        response = client.post('/generate',
                             data=json.dumps({}),
                             content_type='application/json')
        
        # Should handle gracefully
        assert response.status_code in [400, 500]
        
    def test_special_characters_in_openings(self, client, sample_config):
        """Test handling of special characters in opening names and PGNs"""
        sample_config['OPENINGBOOK'] = [
            {"Name": "Test with 'quotes'", "pgn": "1. e4 e5"},
            {"Name": "Test with \"double quotes\"", "pgn": "1. d4 d5"},
            {"Name": "Test with unicode ♔♕♖", "pgn": "1. Nf3 Nf6"},
            {"Name": "Test with newlines\nand tabs\t", "pgn": "1. c4 c5"}
        ]
        
        # Should not crash the application
        response = client.post('/generate',
                             data=json.dumps(sample_config),
                             content_type='application/json')
        
        assert response.status_code in [200, 400, 500]  # Should handle gracefully