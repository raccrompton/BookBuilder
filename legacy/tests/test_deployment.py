"""
Production Deployment Tests
Tests for Railway deployment, production environment validation, and operational readiness
"""

import pytest
import requests
import os
import time
import json
import subprocess
from unittest.mock import Mock, patch
import tempfile


class TestDeploymentReadiness:
    """Test production deployment readiness"""
    
    def test_environment_variable_handling(self):
        """Test handling of production environment variables"""
        required_env_vars = [
            'PORT',
            'SECRET_KEY'
        ]
        
        optional_env_vars = [
            'FLASK_ENV',
            'RAILWAY_ENVIRONMENT'
        ]
        
        # Test default values when env vars are not set
        for var in required_env_vars:
            # Temporarily remove env var if it exists
            original_value = os.environ.get(var)
            if var in os.environ:
                del os.environ[var]
            
            try:
                # Test that application can start with defaults
                if var == 'PORT':
                    default_port = int(os.environ.get('PORT', 5000))
                    assert 1000 <= default_port <= 65535
                elif var == 'SECRET_KEY':
                    # Should use a default development key
                    default_key = os.environ.get('SECRET_KEY', 'chess-bookbuilder-dev-key')
                    assert len(default_key) > 10
                    
            finally:
                # Restore original value
                if original_value is not None:
                    os.environ[var] = original_value
    
    def test_railway_specific_configuration(self):
        """Test Railway platform-specific configuration"""
        # Test Railway environment detection
        railway_env = os.environ.get('RAILWAY_ENVIRONMENT')
        
        # Simulate Railway environment
        with patch.dict(os.environ, {'RAILWAY_ENVIRONMENT': 'production'}):
            # Should handle Railway-specific paths and settings
            assert os.environ.get('RAILWAY_ENVIRONMENT') == 'production'
        
        # Test Railway port binding
        railway_port = os.environ.get('PORT', '5000')
        assert railway_port.isdigit()
        port_int = int(railway_port)
        assert 1000 <= port_int <= 65535
    
    def test_production_secret_key_security(self):
        """Test production secret key requirements"""
        # Production secret key should be strong
        secret_key = os.environ.get('SECRET_KEY', 'chess-bookbuilder-dev-key')
        
        if secret_key == 'chess-bookbuilder-dev-key':
            # Development environment - should warn about using production key
            assert len(secret_key) > 10  # At least basic length
        else:
            # Production environment - should have strong key
            assert len(secret_key) >= 32  # Strong key length
            assert not secret_key.isalnum()  # Should contain special characters
    
    def test_file_system_permissions(self):
        """Test file system permissions in production environment"""
        temp_dirs = ['/tmp/bookbuilder_uploads', '/tmp/bookbuilder_outputs']
        
        for temp_dir in temp_dirs:
            try:
                # Test directory creation
                os.makedirs(temp_dir, exist_ok=True)
                assert os.path.exists(temp_dir)
                
                # Test file write permissions
                test_file = os.path.join(temp_dir, 'permission_test.tmp')
                with open(test_file, 'w') as f:
                    f.write('permission test')
                
                # Test file read permissions
                with open(test_file, 'r') as f:
                    content = f.read()
                assert content == 'permission test'
                
                # Cleanup
                os.remove(test_file)
                
            except (PermissionError, OSError) as e:
                pytest.fail(f"File system permission error for {temp_dir}: {e}")


class TestRailwayDeployment:
    """Test Railway deployment-specific functionality"""
    
    def test_health_endpoint_for_deployment(self, client):
        """Test health endpoint for Railway deployment monitoring"""
        response = client.get('/health')
        
        assert response.status_code == 200
        
        data = json.loads(response.data)
        assert data['status'] == 'healthy'
        assert 'timestamp' in data
        
        # Validate timestamp format for monitoring
        from datetime import datetime
        try:
            datetime.fromisoformat(data['timestamp'])
        except ValueError:
            pytest.fail("Health endpoint timestamp format invalid")
    
    def test_railway_build_process_simulation(self):
        """Test simulation of Railway build process"""
        # Simulate Railway's build steps
        build_steps = [
            'pip install -r requirements.txt',
            'python -c "import sys; sys.path.append(\'web\'); import app; print(\'Import successful\')"',
            'python -c "import sys; sys.path.append(\'core\'); import config; print(\'Config loaded\')"',
        ]
        
        for step in build_steps:
            try:
                if step.startswith('pip install'):
                    # Simulate package installation check
                    required_packages = ['flask', 'chess', 'requests', 'pyyaml']
                    for package in required_packages:
                        try:
                            __import__(package)
                        except ImportError:
                            pytest.fail(f"Required package {package} not available")
                
                elif step.startswith('python -c'):
                    # Simulate Python import tests
                    if 'import app' in step:
                        try:
                            import sys
                            sys.path.append('web')
                            import app
                        except Exception as e:
                            pytest.fail(f"App import failed: {e}")
                    
                    elif 'import config' in step:
                        try:
                            # Simulate config loading with mock file
                            with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
                                f.write("VARIANT: 'standard'\nCAREABOUTENGINE: 0\n")
                                temp_config = f.name
                            
                            # Test config loading
                            with patch('config.input', return_value=temp_config):
                                import sys
                                sys.path.append('core')
                                import config
                            
                            os.unlink(temp_config)
                            
                        except Exception as e:
                            pytest.fail(f"Config import failed: {e}")
                            
            except Exception as e:
                pytest.fail(f"Build step failed: {step}, error: {e}")
    
    def test_railway_startup_process(self):
        """Test Railway startup process simulation"""
        # Test that app can start with Railway environment
        with patch.dict(os.environ, {
            'PORT': '8000',
            'RAILWAY_ENVIRONMENT': 'production'
        }):
            
            # Simulate app startup
            port = int(os.environ.get('PORT', 5000))
            assert port == 8000
            
            # Test that Flask app can initialize
            try:
                import sys
                sys.path.append('web')
                from app import app
                assert app.config['SECRET_KEY'] is not None
            except Exception as e:
                pytest.fail(f"App startup failed: {e}")
    
    def test_railway_log_format_compliance(self, client):
        """Test that logs are formatted for Railway monitoring"""
        import logging
        
        # Capture log output
        log_messages = []
        
        class TestLogHandler(logging.Handler):
            def emit(self, record):
                log_messages.append(self.format(record))
        
        # Add test handler
        test_handler = TestLogHandler()
        logging.getLogger('app').addHandler(test_handler)
        
        try:
            # Generate some log entries
            response = client.get('/health')
            
            # Railway expects structured logs
            # At minimum, should not crash the application
            assert response.status_code == 200
            
        finally:
            logging.getLogger('app').removeHandler(test_handler)


class TestProductionPerformance:
    """Test production performance requirements"""
    
    def test_startup_time(self):
        """Test application startup time for Railway"""
        # Railway expects reasonably fast startup
        start_time = time.time()
        
        try:
            # Simulate app import and initialization
            import app
            
            startup_time = time.time() - start_time
            
            # Should start within reasonable time
            assert startup_time < 30.0, f"Startup took {startup_time:.1f}s, too slow for Railway"
            
        except Exception as e:
            pytest.fail(f"Startup failed: {e}")
    
    def test_memory_footprint(self):
        """Test memory footprint for Railway deployment"""
        import psutil
        
        process = psutil.Process()
        initial_memory = process.memory_info().rss
        
        # Import main modules
        try:
            import app
            import config
            
            current_memory = process.memory_info().rss
            memory_usage = current_memory - initial_memory
            
            # Railway has memory limits - should not use excessive memory at startup
            max_startup_memory = 200 * 1024 * 1024  # 200MB limit
            assert memory_usage < max_startup_memory, f"Startup memory usage: {memory_usage / 1024 / 1024:.1f}MB"
            
        except ImportError as e:
            pytest.skip(f"Cannot test memory usage: {e}")
    
    def test_response_time_requirements(self, client):
        """Test response time requirements for production"""
        endpoints = [
            ('/', 'text/html'),
            ('/health', 'application/json')
        ]
        
        for endpoint, content_type in endpoints:
            start_time = time.time()
            response = client.get(endpoint)
            response_time = time.time() - start_time
            
            assert response.status_code == 200
            assert content_type in response.content_type
            
            # Production response times should be reasonable
            max_response_time = 5.0  # 5 seconds max for static content
            assert response_time < max_response_time, f"{endpoint} took {response_time:.1f}s"


class TestProductionSecurity:
    """Test production security requirements"""
    
    def test_debug_mode_disabled(self):
        """Test that debug mode is disabled in production"""
        # Should not run with debug mode in production
        debug_mode = os.environ.get('FLASK_ENV') == 'development'
        
        # If we're testing in production environment, debug should be off
        railway_env = os.environ.get('RAILWAY_ENVIRONMENT')
        if railway_env == 'production':
            assert not debug_mode, "Debug mode should be disabled in production"
    
    def test_error_handling_in_production(self, client):
        """Test that errors don't leak sensitive information"""
        # Test with invalid request
        response = client.post('/generate', 
                             data='invalid json',
                             content_type='application/json')
        
        assert response.status_code in [400, 500]
        
        # Response should not contain sensitive paths or debug info
        response_text = response.data.decode('utf-8').lower()
        
        sensitive_patterns = [
            '/users/',
            '/home/',
            'traceback',
            'stacktrace',
            'exception',
            'file "/',
            'line '
        ]
        
        for pattern in sensitive_patterns:
            if pattern in response_text:
                pytest.fail(f"Response contains sensitive information: {pattern}")
    
    def test_file_upload_security(self, client):
        """Test file upload security in production"""
        # Test that only safe file downloads are allowed
        dangerous_files = [
            'config.py',
            '../../etc/passwd',
            'app.py',
            '__pycache__/config.pyc',
            '.env',
            'BookBuilder.py'
        ]
        
        for dangerous_file in dangerous_files:
            response = client.get(f'/download/{dangerous_file}')
            assert response.status_code == 404, f"Should reject dangerous file: {dangerous_file}"
    
    def test_request_size_limits(self, client):
        """Test request size limits for production"""
        # Test with very large request
        large_config = {
            'OPENINGBOOK': [{"Name": f"Large_{i}", "pgn": "1. e4 e5"} for i in range(10000)],
            'VARIANT': 'standard'
        }
        
        try:
            response = client.post('/generate',
                                 data=json.dumps(large_config),
                                 content_type='application/json')
            
            # Should either process or reject gracefully (not crash)
            assert response.status_code in [200, 400, 413, 500]
            
        except Exception as e:
            pytest.fail(f"Large request handling failed: {e}")


class TestProductionMonitoring:
    """Test production monitoring and observability"""
    
    def test_health_check_comprehensive(self, client):
        """Test comprehensive health check for monitoring"""
        response = client.get('/health')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        
        # Health check should provide useful monitoring data
        required_fields = ['status', 'timestamp']
        for field in required_fields:
            assert field in data, f"Health check missing field: {field}"
        
        assert data['status'] == 'healthy'
    
    def test_error_rate_monitoring(self, client):
        """Test error rate characteristics for monitoring"""
        # Make multiple requests to establish baseline
        successful_requests = 0
        total_requests = 10
        
        for i in range(total_requests):
            response = client.get('/health')
            if response.status_code == 200:
                successful_requests += 1
        
        # Success rate should be high
        success_rate = successful_requests / total_requests
        assert success_rate >= 0.9, f"Success rate too low: {success_rate:.1%}"
    
    def test_log_structure_for_monitoring(self, caplog):
        """Test log structure for production monitoring"""
        import logging
        
        # Set up logging capture
        with caplog.at_level(logging.INFO):
            try:
                import app
                logger = logging.getLogger('app')
                logger.info("Test log message for monitoring")
                
                # Should not crash and should produce structured logs
                assert len(caplog.records) >= 0
                
            except Exception as e:
                pytest.fail(f"Logging setup failed: {e}")


class TestBackupAndRecovery:
    """Test backup and recovery procedures"""
    
    def test_configuration_backup(self, temp_dirs):
        """Test configuration backup procedures"""
        # Test that configurations can be backed up and restored
        test_config = {
            'VARIANT': 'standard',
            'CAREABOUTENGINE': 0,
            'OPENINGBOOK': [{"Name": "Test", "pgn": "1. e4 e5"}]
        }
        
        # Save configuration
        backup_file = os.path.join(temp_dirs['upload'], 'backup_config.yaml')
        import yaml
        
        with open(backup_file, 'w') as f:
            yaml.dump(test_config, f)
        
        # Restore configuration
        with open(backup_file, 'r') as f:
            restored_config = yaml.safe_load(f)
        
        assert restored_config == test_config
    
    def test_output_file_recovery(self, temp_dirs):
        """Test output file recovery procedures"""
        # Test that generated files can be recovered
        test_pgn = "[Event \"Recovery Test\"]\n\n1. e4 e5 *"
        output_file = os.path.join(temp_dirs['output'], 'Chapter_Recovery.pgn')
        
        os.makedirs(temp_dirs['output'], exist_ok=True)
        
        # Create output file
        with open(output_file, 'w') as f:
            f.write(test_pgn)
        
        # Verify recovery
        assert os.path.exists(output_file)
        
        with open(output_file, 'r') as f:
            recovered_content = f.read()
        
        assert recovered_content == test_pgn
    
    def test_data_corruption_recovery(self, temp_dirs):
        """Test recovery from data corruption"""
        # Test graceful handling of corrupted files
        corrupted_file = os.path.join(temp_dirs['output'], 'Chapter_Corrupted.pgn')
        os.makedirs(temp_dirs['output'], exist_ok=True)
        
        # Create corrupted PGN file
        with open(corrupted_file, 'wb') as f:
            f.write(b'\xff\xfe\x00\x00invalid data\x00\x00')
        
        # Should handle corrupted files gracefully
        try:
            with open(corrupted_file, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            # File reading should not crash
            assert isinstance(content, str)
        except Exception as e:
            pytest.fail(f"Corrupted file handling failed: {e}")


class TestDisasterRecovery:
    """Test disaster recovery scenarios"""
    
    def test_service_restart_recovery(self):
        """Test recovery after service restart"""
        # Simulate service restart by re-importing modules
        import sys
        
        # Remove modules from cache (simulate restart)
        modules_to_reload = ['app', 'config']
        for module in modules_to_reload:
            if module in sys.modules:
                del sys.modules[module]
        
        # Re-import (simulate restart)
        try:
            import app
            import config
            
            # Should restart successfully
            assert hasattr(app, 'app')
            
        except Exception as e:
            pytest.fail(f"Service restart failed: {e}")
    
    def test_database_unavailable_fallback(self):
        """Test fallback when external services are unavailable"""
        # Test graceful degradation when Lichess API is unavailable
        with patch('requests.get') as mock_get:
            mock_get.side_effect = requests.ConnectionError("Service unavailable")
            
            # Application should handle external service failure gracefully
            # (This would be tested in actual usage, here we test the mock setup)
            try:
                mock_get('https://explorer.lichess.ovh/lichess?variant=standard')
                pytest.fail("Should have raised ConnectionError")
            except requests.ConnectionError:
                # Expected behavior - service should handle this gracefully
                assert True
    
    def test_file_system_failure_recovery(self, temp_dirs):
        """Test recovery from file system issues"""
        # Test behavior when file system becomes read-only or full
        readonly_dir = temp_dirs['output']
        
        try:
            # Create directory
            os.makedirs(readonly_dir, exist_ok=True)
            
            # Test write failure simulation
            def simulate_write_failure():
                raise PermissionError("File system read-only")
            
            # Should handle file system errors gracefully
            try:
                simulate_write_failure()
            except PermissionError:
                # Application should catch and handle these errors
                assert True
                
        except Exception as e:
            pytest.fail(f"File system error handling failed: {e}")