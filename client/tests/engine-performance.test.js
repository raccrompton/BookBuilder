/**
 * Engine Performance Tests
 * Tests engine timing at different depth levels for performance benchmarking
 */

import StockfishEngine from '../src/engine/StockfishEngine.js';

describe('Engine Performance Benchmarking', () => {
    let stockfishEngine;
    const DEPTH_CONFIGS = [5, 10, 15, 20];

    // Test positions for benchmarking
    const TEST_POSITIONS = {
        starting: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        middlegame: 'r1bq1rk1/pp2nppp/2np1n2/2p1p3/2P1P3/2NP1N2/PP2QPPP/R1B1R1K1 w - - 0 9',
        tactical: 'r2qkb1r/pp2nppp/3p1n2/2pNp3/2B1P3/3P1N2/PPP2PPP/R1BQK2R w KQkq - 1 7',
        endgame: '4k3/8/4K3/8/8/8/8/4R3 w - - 0 1'
    };

    beforeAll(async () => {
        stockfishEngine = new StockfishEngine({
            threads: 1,
            hash: 128
        });

        console.log('🔥 Initializing Stockfish engine for performance testing...');
        await stockfishEngine.initialize();
        console.log('✅ Engine ready for performance benchmarking');
    });

    afterAll(async () => {
        if (stockfishEngine) {
            stockfishEngine.destroy();
        }
    });

    describe('Depth Performance Testing', () => {
        test('measures engine timing at configured depths [5, 10, 15, 20]', async () => {
            const results = [];
            const position = TEST_POSITIONS.starting;

            console.log('\n📊 Running depth performance benchmark...');
            console.log('Position: Starting position');
            console.log('Depths: [5, 10, 15, 20]');
            console.log('─'.repeat(50));

            for (const depth of DEPTH_CONFIGS) {
                console.log(`⏱️  Testing depth ${depth}...`);

                const startTime = performance.now();
                const bestMove = await stockfishEngine.getBestMove(position, depth);
                const endTime = performance.now();

                const duration = Math.round(endTime - startTime);

                results.push({
                    depth,
                    duration,
                    bestMove,
                    position: 'starting'
                });

                // Validate results
                expect(bestMove).toBeDefined();
                expect(typeof bestMove).toBe('string');
                expect(bestMove.length).toBeGreaterThanOrEqual(4); // UCI format
                expect(duration).toBeGreaterThan(0);
                expect(duration).toBeLessThan(depth * 2000); // Reasonable upper bound

                console.log(`   Depth ${depth}: ${duration}ms → ${bestMove}`);
            }

            // Performance analysis
            console.log('─'.repeat(50));
            console.log('📈 Performance Analysis:');

            // Check if timing increases with depth (generally expected)
            const timings = results.map(r => r.duration);
            let increasingTrend = true;
            for (let i = 1; i < timings.length; i++) {
                if (timings[i] < timings[i-1] * 0.8) { // Allow some variance
                    increasingTrend = false;
                    break;
                }
            }

            console.log(`   Timing trend: ${increasingTrend ? 'Increasing with depth ✅' : 'Non-linear 📊'}`);
            console.log(`   Fastest: Depth ${results[0].depth} (${results[0].duration}ms)`);
            console.log(`   Slowest: Depth ${results[results.length-1].depth} (${results[results.length-1].duration}ms)`);

            const totalTime = timings.reduce((sum, time) => sum + time, 0);
            console.log(`   Total benchmark time: ${totalTime}ms`);

            // Store results for potential analysis
            expect(results).toHaveLength(DEPTH_CONFIGS.length);
            results.forEach(result => {
                expect(result.duration).toBeGreaterThan(0);
                expect(result.bestMove).toBeTruthy();
            });

        }, 120000); // 2 minute timeout for full benchmark

        test('compares performance across different position types', async () => {
            const depth = 10; // Fixed depth for comparison
            const results = [];

            console.log('\n🎯 Position-based performance comparison...');
            console.log(`Fixed depth: ${depth}`);
            console.log('─'.repeat(50));

            for (const [positionType, fen] of Object.entries(TEST_POSITIONS)) {
                console.log(`⏱️  Testing ${positionType} position...`);

                const startTime = performance.now();
                const bestMove = await stockfishEngine.getBestMove(fen, depth);
                const endTime = performance.now();

                const duration = Math.round(endTime - startTime);

                results.push({
                    positionType,
                    duration,
                    bestMove,
                    depth
                });

                console.log(`   ${positionType}: ${duration}ms → ${bestMove}`);

                // Validate each result
                expect(bestMove).toBeDefined();
                expect(duration).toBeGreaterThan(0);
                expect(duration).toBeLessThan(30000); // 30 second max per position
            }

            console.log('─'.repeat(50));
            console.log('📊 Position Analysis:');

            const sortedResults = results.sort((a, b) => a.duration - b.duration);
            console.log(`   Fastest: ${sortedResults[0].positionType} (${sortedResults[0].duration}ms)`);
            console.log(`   Slowest: ${sortedResults[sortedResults.length-1].positionType} (${sortedResults[sortedResults.length-1].duration}ms)`);

            expect(results).toHaveLength(Object.keys(TEST_POSITIONS).length);

        }, 90000); // 90 second timeout for position comparison

        test('validates engine consistency across multiple runs', async () => {
            const depth = 8; // Moderate depth for consistency testing
            const position = TEST_POSITIONS.starting;
            const runs = 3;
            const results = [];

            console.log('\n🔄 Engine consistency testing...');
            console.log(`Depth: ${depth}, Runs: ${runs}`);
            console.log('─'.repeat(50));

            for (let run = 1; run <= runs; run++) {
                console.log(`⏱️  Run ${run}/${runs}...`);

                const startTime = performance.now();
                const bestMove = await stockfishEngine.getBestMove(position, depth);
                const endTime = performance.now();

                const duration = Math.round(endTime - startTime);

                results.push({
                    run,
                    duration,
                    bestMove
                });

                console.log(`   Run ${run}: ${duration}ms → ${bestMove}`);
            }

            // Analyze consistency
            const moves = results.map(r => r.bestMove);
            const timings = results.map(r => r.duration);

            const uniqueMoves = new Set(moves);
            const avgTiming = Math.round(timings.reduce((sum, t) => sum + t, 0) / timings.length);
            const maxVariation = Math.max(...timings) - Math.min(...timings);

            console.log('─'.repeat(50));
            console.log('🎯 Consistency Analysis:');
            console.log(`   Move consistency: ${uniqueMoves.size === 1 ? 'Perfect ✅' : `${uniqueMoves.size} different moves 📊`}`);
            console.log(`   Average timing: ${avgTiming}ms`);
            console.log(`   Max variation: ${maxVariation}ms`);

            // Validate consistency (engine should generally give same move for same position/depth)
            expect(results).toHaveLength(runs);
            expect(uniqueMoves.size).toBeLessThanOrEqual(2); // Allow minimal variation
            expect(maxVariation).toBeLessThan(avgTiming); // Timing variation shouldn't exceed average

        }, 60000); // 60 second timeout for consistency test
    });

    describe('Performance Regression Detection', () => {
        test('establishes performance baselines', async () => {
            const benchmarkConfig = {
                position: TEST_POSITIONS.starting,
                depth: 12,
                runs: 2
            };

            const results = [];

            console.log('\n📏 Establishing performance baseline...');
            console.log(`Position: Starting, Depth: ${benchmarkConfig.depth}`);
            console.log('─'.repeat(50));

            for (let run = 1; run <= benchmarkConfig.runs; run++) {
                const startTime = performance.now();
                const bestMove = await stockfishEngine.getBestMove(
                    benchmarkConfig.position,
                    benchmarkConfig.depth
                );
                const endTime = performance.now();

                const duration = Math.round(endTime - startTime);
                results.push(duration);

                console.log(`   Baseline run ${run}: ${duration}ms → ${bestMove}`);
            }

            const avgTime = Math.round(results.reduce((sum, t) => sum + t, 0) / results.length);

            console.log('─'.repeat(50));
            console.log(`📊 Baseline established: ${avgTime}ms average`);

            // Store baseline for future comparisons (in real implementation,
            // this would be persisted)
            expect(avgTime).toBeGreaterThan(0);
            expect(avgTime).toBeLessThan(20000); // Reasonable upper bound

            // Log for CI/performance tracking
            console.log(`🏆 PERFORMANCE_BASELINE_DEPTH_${benchmarkConfig.depth}: ${avgTime}ms`);

        }, 45000);
    });
});