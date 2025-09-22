"""
Performance Tests
Tests for performance characteristics, resource usage, and scalability limits
"""

import pytest
import time
import psutil
import threading
import json
from unittest.mock import Mock, patch
import tempfile
import os
import sys
import gc


class TestGenerationPerformance:
    """Test performance characteristics of repertoire generation"""
    
    def test_small_repertoire_generation_time(self, client, sample_config, temp_dirs):
        """Test generation time for small repertoire (baseline performance)"""
        # Configure for minimal generation time
        fast_config = sample_config.copy()
        fast_config.update({
            'CAREABOUTENGINE': 0,  # Disable engine for speed
            'MOVES': 5,  # Fewer moves to analyze
            'MINGAMES': 10,  # Lower threshold
            'DEPTHLIKELIHOOD': 0.1,  # Shallower analysis
        })
        
        # Mock fast BookBuilder execution
        mock_result = Mock()
        mock_result.returncode = 0
        mock_result.stdout = "Generation completed quickly"
        mock_result.stderr = ""
        
        # Create minimal output
        output_file = os.path.join(temp_dirs['output'], 'Chapter_Fast.pgn')
        os.makedirs(temp_dirs['output'], exist_ok=True)
        with open(output_file, 'w') as f:
            f.write("[Event \"Fast Test\"]\n\n1. e4 e5 *")
        
        start_time = time.time()
        
        with patch('app.subprocess.run', return_value=mock_result):
            with patch('app.OUTPUT_FOLDER', temp_dirs['output']):
                with patch('app.UPLOAD_FOLDER', temp_dirs['upload']):
                    response = client.post('/generate',
                                         data=json.dumps(fast_config),
                                         content_type='application/json')
        
        end_time = time.time()
        generation_time = end_time - start_time
        
        assert response.status_code == 200
        assert generation_time < 5.0  # Should complete in under 5 seconds (mocked)
    
    def test_memory_usage_during_generation(self, sample_config):
        """Test memory usage patterns during generation"""
        # Get initial memory usage
        process = psutil.Process()
        initial_memory = process.memory_info().rss
        
        # Create a moderately large configuration
        large_config = sample_config.copy()
        large_config['OPENINGBOOK'] = [
            {"Name": f"Opening_{i}", "pgn": "1. e4 e5"} for i in range(100)
        ]
        
        # Serialize and deserialize to measure memory impact
        config_json = json.dumps(large_config)
        parsed_config = json.loads(config_json)
        
        # Measure memory after processing
        current_memory = process.memory_info().rss
        memory_increase = current_memory - initial_memory
        
        # Memory increase should be reasonable (less than 100MB for this test)
        assert memory_increase < 100 * 1024 * 1024  # 100MB limit
        
        # Cleanup
        del large_config, config_json, parsed_config
        gc.collect()
    
    def test_cpu_usage_during_processing(self, sample_config):
        """Test CPU usage patterns during configuration processing"""
        # This test measures the computational cost of config processing
        
        def cpu_intensive_config_processing():
            """Simulate CPU-intensive configuration processing"""
            large_config = sample_config.copy()
            
            # Create many openings
            for i in range(1000):
                large_config['OPENINGBOOK'].append({
                    "Name": f"Generated_Opening_{i}",
                    "pgn": f"1. e4 e5 2. Nf3 {'Nc6' if i % 2 == 0 else 'Nf6'}"
                })
            
            # Process multiple times
            for _ in range(10):
                json_data = json.dumps(large_config)
                parsed = json.loads(json_data)
                
                # Simulate field mapping
                for key, value in parsed.items():
                    if key == 'OPENINGBOOK':
                        for opening in value:
                            _ = opening.get('Name', '')
                            _ = opening.get('pgn', '')
        
        # Measure execution time
        start_time = time.time()
        cpu_intensive_config_processing()
        end_time = time.time()
        
        processing_time = end_time - start_time
        
        # Should complete within reasonable time (adjust based on hardware)
        assert processing_time < 30.0  # 30 seconds max for intensive processing
    
    @pytest.mark.slow
    def test_timeout_behavior_under_load(self, client, sample_config):
        """Test timeout behavior under simulated heavy load"""
        def slow_subprocess(*args, **kwargs):
            """Simulate slow BookBuilder execution"""
            time.sleep(2)  # 2 second delay
            raise subprocess.TimeoutExpired(['python3'], timeout=1)  # 1 second timeout
        
        start_time = time.time()
        
        with patch('app.subprocess.run', side_effect=slow_subprocess):
            response = client.post('/generate',
                                 data=json.dumps(sample_config),
                                 content_type='application/json')
        
        end_time = time.time()
        total_time = end_time - start_time
        
        # Should timeout promptly
        assert response.status_code == 500
        assert 'timed out' in json.loads(response.data)['error'].lower()
        assert total_time < 10.0  # Should fail quickly, not hang


class TestConcurrencyPerformance:
    """Test performance under concurrent load"""
    
    def test_concurrent_request_handling(self, client, sample_config, temp_dirs):
        """Test handling of concurrent generation requests"""
        num_concurrent = 3
        responses = []
        exceptions = []
        
        def make_request(request_id):
            """Make a single request with unique configuration"""
            try:
                config = sample_config.copy()
                config['OPENINGBOOK'][0]['Name'] = f'Concurrent_{request_id}'
                
                # Mock successful execution
                mock_result = Mock()
                mock_result.returncode = 0
                mock_result.stdout = f"Request {request_id} completed"
                mock_result.stderr = ""
                
                # Create output file
                output_file = os.path.join(temp_dirs['output'], f'Chapter_Concurrent_{request_id}.pgn')
                os.makedirs(temp_dirs['output'], exist_ok=True)
                with open(output_file, 'w') as f:
                    f.write(f"[Event \"Concurrent {request_id}\"]\n\n1. e4 e5 *")
                
                with patch('app.subprocess.run', return_value=mock_result):
                    with patch('app.OUTPUT_FOLDER', temp_dirs['output']):
                        with patch('app.UPLOAD_FOLDER', temp_dirs['upload']):
                            response = client.post('/generate',
                                                 data=json.dumps(config),
                                                 content_type='application/json')
                
                responses.append((request_id, response))
                
            except Exception as e:
                exceptions.append((request_id, str(e)))
        
        # Start concurrent requests
        threads = []
        start_time = time.time()
        
        for i in range(num_concurrent):
            thread = threading.Thread(target=make_request, args=(i,))
            thread.start()
            threads.append(thread)
        
        # Wait for all to complete
        for thread in threads:
            thread.join(timeout=30)  # 30 second timeout per thread
        
        end_time = time.time()
        total_time = end_time - start_time
        
        # Analyze results
        assert len(exceptions) == 0, f"Exceptions occurred: {exceptions}"
        assert len(responses) == num_concurrent
        
        # All responses should be successful
        for request_id, response in responses:
            assert response.status_code == 200, f"Request {request_id} failed"
        
        # Concurrent execution should be reasonably fast
        assert total_time < 60.0  # All requests should complete within 1 minute
    
    def test_resource_contention_handling(self, client, sample_config, temp_dirs):
        """Test handling of resource contention (file system, memory)"""
        
        def resource_intensive_request(request_id):
            """Make a resource-intensive request"""
            config = sample_config.copy()
            
            # Create large opening book
            config['OPENINGBOOK'] = [
                {"Name": f"Resource_{request_id}_{i}", "pgn": "1. e4 e5"} 
                for i in range(100)
            ]
            
            # Simulate file system contention
            temp_file = os.path.join(temp_dirs['upload'], f'contention_{request_id}.tmp')
            
            try:
                # Create and write to temporary file
                with open(temp_file, 'w') as f:
                    f.write(json.dumps(config))
                
                # Read it back
                with open(temp_file, 'r') as f:
                    data = f.read()
                
                # Cleanup
                os.remove(temp_file)
                
                return True
                
            except (IOError, OSError) as e:
                return f"File error: {e}"
        
        # Run multiple resource-intensive operations
        results = []
        for i in range(5):
            result = resource_intensive_request(i)
            results.append(result)
        
        # Most operations should succeed
        successful = sum(1 for r in results if r is True)
        assert successful >= 3, f"Too many failures: {results}"
    
    def test_memory_pressure_handling(self):
        """Test behavior under memory pressure"""
        large_objects = []
        
        try:
            # Create memory pressure by allocating large objects
            for i in range(10):  # Reasonable number for testing
                # Create a large configuration object
                large_config = {
                    'OPENINGBOOK': [
                        {"Name": f"Memory_Test_{i}_{j}", "pgn": f"1. e4 e5 2. Nf3 {'Nc6' if j % 2 == 0 else 'Nf6'}"}
                        for j in range(1000)
                    ],
                    'VARIANT': 'standard',
                    'LARGE_DATA': 'x' * 10000  # 10KB string
                }
                
                large_objects.append(large_config)
            
            # Test that we can still create and process new objects
            test_config = {'VARIANT': 'standard', 'TEST': True}
            json_data = json.dumps(test_config)
            parsed = json.loads(json_data)
            
            assert parsed['TEST'] is True
            
        except MemoryError:
            # If we run out of memory, that's acceptable for this stress test
            pytest.skip("Memory pressure test exceeded available memory")
        
        finally:
            # Cleanup to prevent affecting other tests
            del large_objects
            gc.collect()


class TestScalabilityLimits:
    """Test scalability limits and breaking points"""
    
    def test_maximum_opening_book_size(self, client):
        """Test the practical maximum opening book size"""
        max_sizes = [10, 50, 100, 500, 1000]  # Test increasing sizes
        successful_sizes = []
        
        for size in max_sizes:
            try:
                large_config = {
                    'OPENINGBOOK': [
                        {"Name": f"Scale_Test_{i}", "pgn": "1. e4 e5"}
                        for i in range(size)
                    ],
                    'VARIANT': 'standard',
                    'CAREABOUTENGINE': 0
                }
                
                # Test JSON serialization
                start_time = time.time()
                json_data = json.dumps(large_config)
                serialization_time = time.time() - start_time
                
                # Test deserialization
                start_time = time.time()
                parsed_config = json.loads(json_data)
                deserialization_time = time.time() - start_time
                
                # Verify correctness
                assert len(parsed_config['OPENINGBOOK']) == size
                
                successful_sizes.append({
                    'size': size,
                    'serialization_time': serialization_time,
                    'deserialization_time': deserialization_time,
                    'json_size': len(json_data)
                })
                
                # If operations take too long, break
                if serialization_time > 10.0 or deserialization_time > 10.0:
                    break
                    
            except (MemoryError, OverflowError):
                break
        
        # Should handle at least moderate sizes
        assert len(successful_sizes) >= 3, "Should handle reasonable opening book sizes"
        
        # Performance should degrade predictably
        for i in range(1, len(successful_sizes)):
            current = successful_sizes[i]
            previous = successful_sizes[i-1]
            
            # JSON size should grow roughly linearly
            size_ratio = current['size'] / previous['size']
            json_size_ratio = current['json_size'] / previous['json_size']
            
            # Size should be roughly proportional (within reasonable bounds)
            assert 0.5 * size_ratio <= json_size_ratio <= 2.0 * size_ratio
    
    def test_configuration_complexity_limits(self):
        """Test limits of configuration complexity"""
        complexity_tests = [
            # Nested depth
            {
                'name': 'deeply_nested',
                'config': {
                    'level1': {
                        'level2': {
                            'level3': {
                                'level4': {
                                    'value': 'deep'
                                }
                            }
                        }
                    }
                }
            },
            # Many fields
            {
                'name': 'many_fields',
                'config': {f'field_{i}': f'value_{i}' for i in range(1000)}
            },
            # Large string values
            {
                'name': 'large_strings',
                'config': {
                    'large_field_1': 'x' * 10000,
                    'large_field_2': 'y' * 10000,
                    'large_field_3': 'z' * 10000
                }
            }
        ]
        
        results = {}
        
        for test in complexity_tests:
            try:
                start_time = time.time()
                json_data = json.dumps(test['config'])
                json_time = time.time() - start_time
                
                start_time = time.time()
                parsed = json.loads(json_data)
                parse_time = time.time() - start_time
                
                results[test['name']] = {
                    'success': True,
                    'json_time': json_time,
                    'parse_time': parse_time,
                    'size': len(json_data)
                }
                
            except (MemoryError, OverflowError, RecursionError) as e:
                results[test['name']] = {
                    'success': False,
                    'error': str(e)
                }
        
        # At least simple complexity should work
        assert results['deeply_nested']['success'], "Should handle reasonable nesting"
        
        # Performance should be acceptable for reasonable complexity
        if results['many_fields']['success']:
            assert results['many_fields']['json_time'] < 5.0, "Many fields should serialize quickly"
    
    @pytest.mark.slow
    def test_long_running_operation_simulation(self, client, sample_config):
        """Test behavior of long-running operations"""
        def very_slow_subprocess(*args, **kwargs):
            """Simulate very slow BookBuilder execution"""
            time.sleep(5)  # 5 second delay
            result = Mock()
            result.returncode = 0
            result.stdout = "Long operation completed"
            result.stderr = ""
            return result
        
        start_time = time.time()
        
        with patch('app.subprocess.run', side_effect=very_slow_subprocess):
            response = client.post('/generate',
                                 data=json.dumps(sample_config),
                                 content_type='application/json')
        
        end_time = time.time()
        actual_time = end_time - start_time
        
        # Should complete the long operation
        assert response.status_code == 200
        assert actual_time >= 5.0  # Should actually take the simulated time
        assert actual_time < 10.0  # But not much longer due to overhead


class TestResourceUtilizationPatterns:
    """Test resource utilization patterns and efficiency"""
    
    def test_memory_leak_detection(self, sample_config):
        """Test for memory leaks in repeated operations"""
        process = psutil.Process()
        initial_memory = process.memory_info().rss
        
        # Perform many repeated operations
        for i in range(100):
            # Create and destroy configurations
            config = sample_config.copy()
            config['ITERATION'] = i
            
            # Serialize and deserialize
            json_data = json.dumps(config)
            parsed = json.loads(json_data)
            
            # Clear references
            del config, json_data, parsed
            
            # Periodic garbage collection
            if i % 20 == 0:
                gc.collect()
        
        # Final garbage collection
        gc.collect()
        
        # Check memory usage
        final_memory = process.memory_info().rss
        memory_increase = final_memory - initial_memory
        
        # Memory increase should be minimal (less than 50MB)
        assert memory_increase < 50 * 1024 * 1024, f"Memory increased by {memory_increase / 1024 / 1024:.1f}MB"
    
    def test_file_handle_management(self, temp_dirs):
        """Test proper file handle management"""
        import resource
        
        # Get initial file descriptor count
        try:
            initial_fds = len(os.listdir('/proc/self/fd'))
        except (FileNotFoundError, PermissionError):
            # /proc not available, skip this test
            pytest.skip("Cannot access /proc filesystem for FD counting")
        
        # Create and close many files
        for i in range(100):
            temp_file = os.path.join(temp_dirs['output'], f'fd_test_{i}.tmp')
            
            # Create file
            with open(temp_file, 'w') as f:
                f.write(f"Test data {i}")
            
            # Read file
            with open(temp_file, 'r') as f:
                data = f.read()
                assert f"Test data {i}" in data
            
            # Delete file
            os.remove(temp_file)
        
        # Check file descriptor count
        try:
            final_fds = len(os.listdir('/proc/self/fd'))
            fd_increase = final_fds - initial_fds
            
            # Should not leak file descriptors (allow small increase for normal operations)
            assert fd_increase <= 5, f"File descriptors increased by {fd_increase}"
        except (FileNotFoundError, PermissionError):
            # If we can't check, at least verify no exceptions occurred
            pass
    
    def test_cpu_utilization_efficiency(self):
        """Test CPU utilization efficiency patterns"""
        import multiprocessing
        
        # Test single-threaded CPU usage
        def cpu_work():
            """Simulate CPU-intensive work"""
            result = 0
            for i in range(1000000):
                result += i * i
            return result
        
        # Measure single-threaded performance
        start_time = time.time()
        single_result = cpu_work()
        single_time = time.time() - start_time
        
        # Measure multi-threaded performance (if applicable)
        if multiprocessing.cpu_count() > 1:
            start_time = time.time()
            
            # Run multiple workers
            with multiprocessing.Pool(processes=2) as pool:
                results = pool.map(lambda x: cpu_work(), range(2))
            
            multi_time = time.time() - start_time
            
            # Multi-threading should be more efficient for CPU-bound work
            # (though GIL limitations may affect this in Python)
            efficiency_ratio = single_time / (multi_time / 2)  # Normalize for 2 workers
            
            # At minimum, shouldn't be much worse than single-threaded
            assert efficiency_ratio > 0.5, f"Multi-processing efficiency: {efficiency_ratio:.2f}"
        
        # Verify correctness
        assert single_result > 0