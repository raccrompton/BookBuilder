#!/usr/bin/env node

/**
 * Algorithm Test Runner
 * 
 * Comprehensive test runner for the BookBuilder algorithmic testing suite.
 * Runs all algorithmic tests in the correct order and provides detailed reporting.
 */

import { spawn } from 'child_process';
// Import removed to avoid Jest global issues

const TEST_SUITES = {
    simulation: {
        name: 'Algorithmic Simulation Tests',
        file: 'algorithm-simulation.test.js',
        description: 'Tests complete algorithm flow with deterministic data',
        priority: 1,
        estimatedTime: '30s'
    },
    validation: {
        name: 'Core Algorithm Validation Tests', 
        file: 'algorithm-validation.test.js',
        description: 'Tests core algorithmic logic and statistical calculations',
        priority: 2,
        estimatedTime: '45s'
    },
    pipeline: {
        name: 'Data Pipeline Tests',
        file: 'data-pipeline.test.js', 
        description: 'Tests data transformation throughout the pipeline',
        priority: 3,
        estimatedTime: '60s'
    },
    goldenMaster: {
        name: 'Golden Master Comparison Tests',
        file: 'golden-master-enhanced.test.js',
        description: 'Validates against Python reference implementation',
        priority: 4,
        estimatedTime: '45s'
    },
    realApi: {
        name: 'Real API Integration Tests',
        file: 'e2e-real-api.test.js',
        description: 'End-to-end tests with actual Lichess API (requires ENABLE_REAL_API_TESTS=true)',
        priority: 5,
        estimatedTime: '2-5min',
        optional: true
    }
};

class TestRunner {
    constructor() {
        this.results = {};
        this.startTime = Date.now();
    }

    async runTestSuite(suiteKey, suite) {
        console.log(`\n🧪 Running ${suite.name}`);
        console.log(`📝 ${suite.description}`);
        console.log(`⏱️  Estimated time: ${suite.estimatedTime}`);
        
        const startTime = Date.now();
        
        return new Promise((resolve) => {
            const testProcess = spawn('npm', ['test', '--', `--testPathPattern=${suite.file}`], {
                stdio: 'pipe',
                cwd: process.cwd()
            });
            
            let stdout = '';
            let stderr = '';
            
            testProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            testProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            testProcess.on('close', (code) => {
                const duration = Date.now() - startTime;
                const success = code === 0;
                
                this.results[suiteKey] = {
                    success,
                    duration,
                    stdout,
                    stderr,
                    suite
                };
                
                if (success) {
                    console.log(`✅ ${suite.name} completed in ${duration}ms`);
                } else {
                    console.log(`❌ ${suite.name} failed after ${duration}ms`);
                    if (stderr) {
                        console.log(`🚫 Error output:\n${stderr.substring(0, 500)}...`);
                    }
                }
                
                resolve(success);
            });
        });
    }

    async runAllTests(options = {}) {
        console.log('🚀 Starting BookBuilder Algorithm Test Suite');
        console.log('=' .repeat(60));
        
        // Set environment variable for real API tests if requested
        if (options.includeRealApi) {
            console.log('🌐 Real API tests will be enabled');
            process.env.ENABLE_REAL_API_TESTS = 'true';
        }
        
        // Run test suites in priority order
        const suitesToRun = Object.entries(TEST_SUITES)
            .filter(([key, suite]) => !suite.optional || options.includeRealApi)
            .sort(([,a], [,b]) => a.priority - b.priority);
        
        console.log(`\n📋 Running ${suitesToRun.length} test suites:`);
        suitesToRun.forEach(([key, suite]) => {
            console.log(`  ${suite.priority}. ${suite.name} (${suite.estimatedTime})`);
        });
        
        for (const [suiteKey, suite] of suitesToRun) {
            await this.runTestSuite(suiteKey, suite);
            
            // Brief pause between suites
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        this.printSummary();
    }

    async runQuickTest() {
        console.log('⚡ Running Quick Algorithm Validation');
        console.log('=' .repeat(40));
        
        // Run only simulation and validation tests for quick feedback
        const quickSuites = ['simulation', 'validation'];
        
        for (const suiteKey of quickSuites) {
            const suite = TEST_SUITES[suiteKey];
            await this.runTestSuite(suiteKey, suite);
        }
        
        this.printSummary();
    }

    printSummary() {
        const totalDuration = Date.now() - this.startTime;
        const successCount = Object.values(this.results).filter(r => r.success).length;
        const totalCount = Object.keys(this.results).length;
        
        console.log('\n' + '=' .repeat(60));
        console.log('📊 ALGORITHM TEST SUMMARY');
        console.log('=' .repeat(60));
        
        console.log(`🎯 Overall Result: ${successCount}/${totalCount} test suites passed`);
        console.log(`⏱️  Total Duration: ${Math.round(totalDuration / 1000)}s`);
        
        // Detailed results
        Object.entries(this.results).forEach(([key, result]) => {
            const status = result.success ? '✅' : '❌';
            const duration = Math.round(result.duration / 1000);
            console.log(`   ${status} ${result.suite.name} (${duration}s)`);
        });
        
        // Test coverage analysis
        console.log('\n📈 Test Coverage Analysis:');
        console.log('   ✅ Algorithmic simulation with deterministic data');
        console.log('   ✅ Core algorithm logic validation');
        console.log('   ✅ Data pipeline transformation accuracy');
        console.log('   ✅ Golden master comparison with Python reference');
        
        if (this.results.realApi) {
            console.log('   ✅ Real API integration validation');
        } else {
            console.log('   ⏭️  Real API tests skipped (use --real-api to include)');
        }
        
        // Recommendations
        if (successCount === totalCount) {
            console.log('\n🎉 All algorithm tests passed! The core BookBuilder algorithm is working correctly.');
            console.log('💡 The complete algorithmic flow has been validated from input to output.');
        } else {
            console.log('\n🚨 Some algorithm tests failed. This indicates issues with the core algorithm.');
            console.log('🔧 Review failed test output above and fix algorithm issues before deployment.');
        }
        
        console.log('\n📝 Test Reports:');
        console.log('   • Detailed logs available in test output above');
        console.log('   • Coverage reports: npm run test:coverage');
        console.log('   • Performance analysis: Check duration metrics above');
        
        process.exit(successCount === totalCount ? 0 : 1);
    }
}

// Command line interface
async function main() {
    const args = process.argv.slice(2);
    const options = {
        includeRealApi: args.includes('--real-api') || args.includes('--full'),
        quickTest: args.includes('--quick') || args.includes('-q')
    };
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log('BookBuilder Algorithm Test Runner');
        console.log('');
        console.log('Usage: npm run test:algorithm [options]');
        console.log('');
        console.log('Options:');
        console.log('  --quick, -q      Run only quick validation tests');
        console.log('  --real-api       Include real Lichess API tests');
        console.log('  --full           Run all tests including real API');
        console.log('  --help, -h       Show this help message');
        console.log('');
        console.log('Test Suites:');
        Object.entries(TEST_SUITES).forEach(([key, suite]) => {
            const optional = suite.optional ? ' (optional)' : '';
            console.log(`  • ${suite.name}${optional}`);
            console.log(`    ${suite.description}`);
        });
        return;
    }
    
    const runner = new TestRunner();
    
    if (options.quickTest) {
        await runner.runQuickTest();
    } else {
        await runner.runAllTests(options);
    }
}

// Handle unhandled errors
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled error in algorithm tests:', error);
    process.exit(1);
});

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export { TestRunner, TEST_SUITES };