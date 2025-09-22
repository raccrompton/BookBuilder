#!/usr/bin/env python3
"""
BookBuilder Test Runner
Comprehensive test execution with reporting and analysis
"""

import sys
import os
import argparse
import subprocess
import time
from pathlib import Path
import json
import logging

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class TestRunner:
    """Comprehensive test runner for BookBuilder"""
    
    def __init__(self):
        self.project_root = project_root
        self.test_dir = self.project_root / 'tests'
        self.reports_dir = self.project_root / 'test_reports'
        self.reports_dir.mkdir(exist_ok=True)
        
    def run_unit_tests(self, verbose=False):
        """Run unit tests only"""
        logger.info("Running unit tests...")
        
        cmd = [
            'python', '-m', 'pytest',
            str(self.test_dir / 'test_flask_app.py'),
            str(self.test_dir / 'test_chess_logic.py'),
            '-v' if verbose else '',
            '--tb=short',
            '--junit-xml=' + str(self.reports_dir / 'unit_tests.xml'),
            '--html=' + str(self.reports_dir / 'unit_tests.html'),
            '--self-contained-html'
        ]
        
        cmd = [arg for arg in cmd if arg]  # Remove empty strings
        return self._run_command(cmd, "Unit tests")
    
    def run_integration_tests(self, verbose=False):
        """Run integration tests only"""
        logger.info("Running integration tests...")
        
        cmd = [
            'python', '-m', 'pytest',
            str(self.test_dir / 'test_integration.py'),
            '-v' if verbose else '',
            '--tb=short',
            '--junit-xml=' + str(self.reports_dir / 'integration_tests.xml'),
            '--html=' + str(self.reports_dir / 'integration_tests.html'),
            '--self-contained-html'
        ]
        
        cmd = [arg for arg in cmd if arg]
        return self._run_command(cmd, "Integration tests")
    
    def run_edge_case_tests(self, verbose=False):
        """Run edge case tests only"""
        logger.info("Running edge case tests...")
        
        cmd = [
            'python', '-m', 'pytest',
            str(self.test_dir / 'test_edge_cases.py'),
            '-v' if verbose else '',
            '--tb=short',
            '--junit-xml=' + str(self.reports_dir / 'edge_case_tests.xml'),
            '--html=' + str(self.reports_dir / 'edge_case_tests.html'),
            '--self-contained-html'
        ]
        
        cmd = [arg for arg in cmd if arg]
        return self._run_command(cmd, "Edge case tests")
    
    def run_performance_tests(self, verbose=False):
        """Run performance tests only"""
        logger.info("Running performance tests...")
        
        cmd = [
            'python', '-m', 'pytest',
            str(self.test_dir / 'test_performance.py'),
            '-v' if verbose else '',
            '--tb=short',
            '--benchmark-only',
            '--junit-xml=' + str(self.reports_dir / 'performance_tests.xml'),
            '--html=' + str(self.reports_dir / 'performance_tests.html'),
            '--self-contained-html'
        ]
        
        cmd = [arg for arg in cmd if arg]
        return self._run_command(cmd, "Performance tests")
    
    def run_all_tests(self, verbose=False, exclude_slow=False):
        """Run all tests with comprehensive reporting"""
        logger.info("Running comprehensive test suite...")
        
        cmd = [
            'python', '-m', 'pytest',
            str(self.test_dir),
            '-v' if verbose else '',
            '--tb=short',
            '--junit-xml=' + str(self.reports_dir / 'all_tests.xml'),
            '--html=' + str(self.reports_dir / 'all_tests.html'),
            '--self-contained-html',
            '--cov=app',
            '--cov=config',
            '--cov-report=html:' + str(self.reports_dir / 'coverage'),
            '--cov-report=term',
            '--cov-report=xml:' + str(self.reports_dir / 'coverage.xml')
        ]
        
        if exclude_slow:
            cmd.append('-m "not slow"')
        
        cmd = [arg for arg in cmd if arg]
        return self._run_command(cmd, "All tests")
    
    def run_quick_tests(self, verbose=False):
        """Run quick tests for development workflow"""
        logger.info("Running quick test suite...")
        
        cmd = [
            'python', '-m', 'pytest',
            str(self.test_dir),
            '-v' if verbose else '',
            '--tb=line',
            '-x',  # Stop on first failure
            '-m "not slow and not performance"',
            '--junit-xml=' + str(self.reports_dir / 'quick_tests.xml')
        ]
        
        cmd = [arg for arg in cmd if arg]
        return self._run_command(cmd, "Quick tests")
    
    def run_chess_specific_tests(self, verbose=False):
        """Run chess-specific functionality tests"""
        logger.info("Running chess-specific tests...")
        
        cmd = [
            'python', '-m', 'pytest',
            '-v' if verbose else '',
            '--tb=short',
            '-m "chess"',
            '--junit-xml=' + str(self.reports_dir / 'chess_tests.xml'),
            '--html=' + str(self.reports_dir / 'chess_tests.html'),
            '--self-contained-html'
        ]
        
        cmd = [arg for arg in cmd if arg]
        return self._run_command(cmd, "Chess-specific tests")
    
    def run_security_tests(self):
        """Run security-focused tests"""
        logger.info("Running security tests...")
        
        # Run bandit security linter
        bandit_cmd = [
            'bandit', '-r', str(self.project_root),
            '-f', 'json',
            '-o', str(self.reports_dir / 'security_bandit.json'),
            '--exclude', str(self.test_dir)
        ]
        
        bandit_result = self._run_command(bandit_cmd, "Bandit security scan", ignore_errors=True)
        
        # Run safety check for dependencies
        safety_cmd = [
            'safety', 'check',
            '--json',
            '--output', str(self.reports_dir / 'security_safety.json')
        ]
        
        safety_result = self._run_command(safety_cmd, "Safety dependency check", ignore_errors=True)
        
        return bandit_result and safety_result
    
    def run_code_quality_tests(self):
        """Run code quality tests"""
        logger.info("Running code quality tests...")
        
        results = []
        
        # Flake8 linting
        flake8_cmd = [
            'flake8', str(self.project_root),
            '--output-file=' + str(self.reports_dir / 'flake8_report.txt'),
            '--exclude=tests,venv,.git',
            '--max-line-length=100',
            '--ignore=E501,W503'
        ]
        results.append(self._run_command(flake8_cmd, "Flake8 linting", ignore_errors=True))
        
        # Black formatting check
        black_cmd = [
            'black', '--check', '--diff',
            str(self.project_root),
            '--exclude', '/(tests|venv|\.git)/'
        ]
        results.append(self._run_command(black_cmd, "Black formatting check", ignore_errors=True))
        
        # isort import sorting check
        isort_cmd = [
            'isort', '--check-only', '--diff',
            str(self.project_root),
            '--skip', 'tests,venv,.git'
        ]
        results.append(self._run_command(isort_cmd, "isort import check", ignore_errors=True))
        
        return all(results)
    
    def generate_test_summary(self):
        """Generate comprehensive test summary report"""
        logger.info("Generating test summary report...")
        
        summary = {
            'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
            'project': 'BookBuilder',
            'test_files': [],
            'total_tests_run': 0,
            'total_failures': 0,
            'total_errors': 0,
            'coverage_percentage': 0,
            'reports_generated': []
        }
        
        # Scan for generated reports
        for report_file in self.reports_dir.glob('*.xml'):
            summary['reports_generated'].append(str(report_file.name))
        
        for report_file in self.reports_dir.glob('*.html'):
            summary['reports_generated'].append(str(report_file.name))
        
        # Save summary
        summary_file = self.reports_dir / 'test_summary.json'
        with open(summary_file, 'w') as f:
            json.dump(summary, f, indent=2)
        
        logger.info(f"Test summary saved to {summary_file}")
        return summary
    
    def _run_command(self, cmd, description, ignore_errors=False):
        """Run a command and handle results"""
        logger.info(f"Executing: {description}")
        logger.debug(f"Command: {' '.join(cmd)}")
        
        try:
            start_time = time.time()
            result = subprocess.run(cmd, capture_output=True, text=True, cwd=self.project_root)
            end_time = time.time()
            
            duration = end_time - start_time
            
            if result.returncode == 0:
                logger.info(f"✅ {description} completed successfully ({duration:.1f}s)")
                if result.stdout:
                    logger.debug(f"Output: {result.stdout}")
                return True
            else:
                logger.error(f"❌ {description} failed ({duration:.1f}s)")
                logger.error(f"Error: {result.stderr}")
                if result.stdout:
                    logger.info(f"Output: {result.stdout}")
                return ignore_errors
                
        except subprocess.TimeoutExpired:
            logger.error(f"⏰ {description} timed out")
            return False
        except Exception as e:
            logger.error(f"💥 {description} crashed: {e}")
            return False
    
    def cleanup_reports(self):
        """Clean up old test reports"""
        logger.info("Cleaning up old reports...")
        
        for report_file in self.reports_dir.glob('*'):
            if report_file.is_file():
                report_file.unlink()
        
        logger.info("Reports cleaned up")


def main():
    """Main test runner entry point"""
    parser = argparse.ArgumentParser(description='BookBuilder Test Runner')
    parser.add_argument('--unit', action='store_true', help='Run unit tests only')
    parser.add_argument('--integration', action='store_true', help='Run integration tests only')
    parser.add_argument('--edge-cases', action='store_true', help='Run edge case tests only')
    parser.add_argument('--performance', action='store_true', help='Run performance tests only')
    parser.add_argument('--chess', action='store_true', help='Run chess-specific tests only')
    parser.add_argument('--quick', action='store_true', help='Run quick test suite')
    parser.add_argument('--all', action='store_true', help='Run comprehensive test suite')
    parser.add_argument('--security', action='store_true', help='Run security tests')
    parser.add_argument('--quality', action='store_true', help='Run code quality tests')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    parser.add_argument('--exclude-slow', action='store_true', help='Exclude slow tests')
    parser.add_argument('--cleanup', action='store_true', help='Clean up reports before running')
    
    args = parser.parse_args()
    
    runner = TestRunner()
    
    if args.cleanup:
        runner.cleanup_reports()
    
    success = True
    
    try:
        if args.unit:
            success &= runner.run_unit_tests(args.verbose)
        elif args.integration:
            success &= runner.run_integration_tests(args.verbose)
        elif args.edge_cases:
            success &= runner.run_edge_case_tests(args.verbose)
        elif args.performance:
            success &= runner.run_performance_tests(args.verbose)
        elif args.chess:
            success &= runner.run_chess_specific_tests(args.verbose)
        elif args.quick:
            success &= runner.run_quick_tests(args.verbose)
        elif args.security:
            success &= runner.run_security_tests()
        elif args.quality:
            success &= runner.run_code_quality_tests()
        elif args.all:
            success &= runner.run_all_tests(args.verbose, args.exclude_slow)
        else:
            # Default: run quick tests
            success &= runner.run_quick_tests(args.verbose)
        
        # Always generate summary
        runner.generate_test_summary()
        
        if success:
            logger.info("🎉 All tests completed successfully!")
            sys.exit(0)
        else:
            logger.error("💥 Some tests failed!")
            sys.exit(1)
            
    except KeyboardInterrupt:
        logger.warning("⚠️ Test execution interrupted by user")
        sys.exit(130)
    except Exception as e:
        logger.error(f"💥 Test runner crashed: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()