/**
 * Real Browser Engine Performance Tests
 *
 * This test runs actual Stockfish WebAssembly in a headless Chrome browser
 * to measure real engine performance at depths [5, 10, 15, 20].
 *
 * Uses Playwright to automate browser interaction and validate timing limits.
 *
 * @jest-environment node
 */

const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');
const url = require('url');

describe('Real Browser Engine Performance', () => {
    let browser;
    let page;
    let server;
    const TEST_PORT = 3001;

    // Create a simple HTTP server to serve our test page
    const createTestServer = () => {
        return new Promise((resolve, reject) => {
            const server = http.createServer((req, res) => {
                const parsedUrl = url.parse(req.url, true);
                let filePath = parsedUrl.pathname;

                // Route requests to appropriate files
                if (filePath === '/' || filePath === '/test') {
                    filePath = '/tests/browser/stockfish-test-page.html';
                } else if (filePath.startsWith('/src/vendor/stockfish-web/')) {
                    // Serve Stockfish WebAssembly files
                    filePath = filePath;
                } else {
                    // Default routing
                    filePath = filePath;
                }

                const fullPath = path.join(__dirname, '../..', filePath);

                // Check if file exists
                if (!fs.existsSync(fullPath)) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('File not found');
                    return;
                }

                // Determine content type
                let contentType = 'text/html';
                if (filePath.endsWith('.js')) {
                    contentType = 'application/javascript';
                } else if (filePath.endsWith('.wasm')) {
                    contentType = 'application/wasm';
                } else if (filePath.endsWith('.css')) {
                    contentType = 'text/css';
                }

                // Add CORS headers for WebAssembly
                res.writeHead(200, {
                    'Content-Type': contentType,
                    'Cross-Origin-Embedder-Policy': 'require-corp',
                    'Cross-Origin-Opener-Policy': 'same-origin',
                    'Access-Control-Allow-Origin': '*'
                });

                const fileStream = fs.createReadStream(fullPath);
                fileStream.pipe(res);
            });

            server.listen(TEST_PORT, 'localhost', (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log(`Test server running at http://localhost:${TEST_PORT}`);
                    resolve(server);
                }
            });
        });
    };

    beforeAll(async () => {
        console.log('🚀 Setting up browser-based engine performance testing...');

        // Start test server
        server = await createTestServer();

        // Launch browser
        browser = await chromium.launch({
            headless: true, // Set to false for debugging
            args: [
                '--enable-features=SharedArrayBuffer',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ]
        });

        // Create page
        page = await browser.newPage();

        // Set up console logging
        page.on('console', msg => {
            console.log('Browser:', msg.text());
        });

        page.on('pageerror', err => {
            console.error('Browser error:', err.message);
        });

        console.log('✅ Browser and test server ready');
    });

    afterAll(async () => {
        if (page) await page.close();
        if (browser) await browser.close();
        if (server) {
            server.close();
            console.log('✅ Test server stopped');
        }
    });

    test('real engine performance at depths [5, 10, 15, 20] - each depth < 60 seconds', async () => {
        console.log('🔥 Starting real engine performance test...');

        // Navigate to test page
        await page.goto(`http://localhost:${TEST_PORT}/test`, {
            waitUntil: 'networkidle'
        });

        // Wait for engine initialization
        console.log('⏳ Waiting for engine initialization...');
        await page.waitForSelector('#startTest:not([disabled])', { timeout: 45000 });

        // Verify engine is ready
        const engineStatus = await page.textContent('#status');
        expect(engineStatus).toContain('ready');

        // Start performance test
        console.log('▶️ Starting performance test...');
        await page.click('#startTest');

        // Wait for test completion (with generous timeout for all depths)
        console.log('⏱️ Running performance tests...');
        const testTimeout = 5 * 60 * 1000; // 5 minutes total timeout
        await page.waitForFunction(
            () => window.performanceTestResults !== null && window.performanceTestResults !== undefined,
            { timeout: testTimeout }
        );

        // Get results
        const results = await page.evaluate(() => window.performanceTestResults);

        console.log('📊 Performance test completed');
        console.log('─'.repeat(50));

        // Validate results structure
        expect(results).toBeDefined();
        expect(results.results).toBeDefined();
        expect(Array.isArray(results.results)).toBe(true);
        expect(results.results.length).toBe(4); // [5, 10, 15, 20]

        // Log and validate each depth
        results.results.forEach(result => {
            const passStatus = result.passed ? '✅' : '❌';
            console.log(`   Depth ${result.depth}: ${result.duration}ms → ${result.bestMove} ${passStatus}`);

            // Individual validations
            expect(result.depth).toBeGreaterThan(0);
            expect(result.duration).toBeGreaterThan(0);
            expect(result.bestMove).toBeDefined();
            expect(result.bestMove.length).toBeGreaterThanOrEqual(4); // UCI format
            expect(result.passed).toBe(true); // Must be under 60 seconds
            expect(result.duration).toBeLessThan(60000); // 60 second limit
        });

        console.log('─'.repeat(50));
        console.log(`📈 Total test time: ${results.totalTime}ms`);
        console.log(`🎯 All depths completed: ${results.passed ? 'PASSED' : 'FAILED'}`);

        // Final validation
        expect(results.passed).toBe(true);
        expect(results.totalTime).toBeLessThan(240000); // 4 minutes total max

        // Verify timing progression (generally should increase with depth)
        const timings = results.results.map(r => r.duration);
        const depthProgression = timings.every((time, index) => {
            if (index === 0) return true;
            // Allow some variance but expect general upward trend
            return time >= timings[index - 1] * 0.1; // Very loose progression check
        });

        console.log(`⚡ Timing progression realistic: ${depthProgression ? 'YES' : 'NO'}`);

        // Log final summary for CI/debugging
        console.log('🏆 REAL ENGINE PERFORMANCE SUMMARY:');
        results.results.forEach(result => {
            console.log(`   DEPTH_${result.depth}_TIMING: ${result.duration}ms`);
        });

    }, 6 * 60 * 1000); // 6 minute Jest timeout

    test('engine initialization and basic functionality', async () => {
        console.log('🔧 Testing engine initialization...');

        // Navigate to fresh test page
        await page.goto(`http://localhost:${TEST_PORT}/test`, {
            waitUntil: 'networkidle'
        });

        // Wait for initialization
        await page.waitForSelector('#startTest:not([disabled])', { timeout: 45000 });

        // Check status
        const status = await page.textContent('#status');
        expect(status).toContain('ready');

        // Check that engine object exists
        const engineExists = await page.evaluate(() => {
            return typeof stockfishEngine !== 'undefined' && stockfishEngine !== null;
        });

        expect(engineExists).toBe(true);
        console.log('✅ Engine initialization test passed');

    }, 60000); // 1 minute timeout

    test('test page serves correctly', async () => {
        console.log('📄 Testing page accessibility...');

        await page.goto(`http://localhost:${TEST_PORT}/test`);

        // Check page title
        const title = await page.title();
        expect(title).toBe('Stockfish Engine Performance Test');

        // Check key elements exist
        const statusExists = await page.$('#status') !== null;
        const startButtonExists = await page.$('#startTest') !== null;
        const resultsExists = await page.$('#results') !== null;

        expect(statusExists).toBe(true);
        expect(startButtonExists).toBe(true);
        expect(resultsExists).toBe(true);

        console.log('✅ Test page accessibility verified');

    }, 30000); // 30 second timeout
});