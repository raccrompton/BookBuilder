#!/usr/bin/env node
/**
 * Debug script for testing Stockfish engine in Node.js
 *
 * Run with: node debug-engine.js
 *
 * This lets us test engine operations without needing a browser.
 */

// The stockfish npm package has a Node.js example in examples/loadEngine.js
// It spawns the engine as a child process

const path = require('path');
const { spawn } = require('child_process');

// Path to the stockfish JS file (works in Node.js via child_process)
const stockfishPath = path.join(__dirname, 'node_modules/stockfish/src/stockfish-17.1-lite-single-03e3232.js');

console.log('🔧 Starting Stockfish debug test...\n');

// Create engine process
const engine = spawn('node', [stockfishPath], { stdio: ['pipe', 'pipe', 'pipe'] });

let isReady = false;
let pendingResolve = null;
let outputBuffer = '';

// Handle engine output
engine.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());

    for (const line of lines) {
        console.log(`  [Engine] ${line}`);

        if (line.includes('uciok')) {
            console.log('✅ UCI protocol initialized\n');
            sendCommand('isready');
        }

        if (line.includes('readyok')) {
            console.log('✅ Engine ready\n');
            isReady = true;
            runTests();
        }

        if (line.startsWith('bestmove')) {
            const match = line.match(/bestmove\s+(\S+)/);
            if (match && pendingResolve) {
                pendingResolve(match[1]);
                pendingResolve = null;
            }
        }
    }
});

engine.stderr.on('data', (data) => {
    console.error(`  [Engine Error] ${data}`);
});

engine.on('error', (err) => {
    console.error('❌ Engine error:', err);
});

engine.on('close', (code) => {
    console.log(`\n🏁 Engine exited with code ${code}`);
});

// Send command to engine
function sendCommand(cmd) {
    console.log(`  [Send] ${cmd}`);
    engine.stdin.write(cmd + '\n');
}

// Get best move (returns promise)
function getBestMove(fen, depth = 10) {
    return new Promise((resolve) => {
        pendingResolve = resolve;
        sendCommand(`position fen ${fen}`);
        sendCommand(`go depth ${depth}`);
    });
}

// Test with various positions
async function runTests() {
    console.log('═══════════════════════════════════════');
    console.log('Running engine tests...');
    console.log('═══════════════════════════════════════\n');

    const testCases = [
        {
            name: 'Starting position',
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
        },
        {
            name: 'After 1. e4',
            fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
        },
        {
            name: 'After 1. e4 e5',
            fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
        },
        {
            name: 'Italian Game position',
            fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3'
        }
    ];

    for (const test of testCases) {
        console.log(`📍 Test: ${test.name}`);
        console.log(`   FEN: ${test.fen}`);

        try {
            const bestMove = await getBestMove(test.fen, 8);
            console.log(`   ✅ Best move (UCI): ${bestMove}`);

            // Validate UCI format
            const isValidUci = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(bestMove);
            console.log(`   UCI format valid: ${isValidUci ? '✅' : '❌'}`);

        } catch (err) {
            console.log(`   ❌ Error: ${err.message}`);
        }
        console.log('');
    }

    // Test what happens with rapid sequential operations
    console.log('═══════════════════════════════════════');
    console.log('Testing rapid sequential operations...');
    console.log('═══════════════════════════════════════\n');

    const positions = [
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
        'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
        'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
    ];

    console.log(`Running ${positions.length} sequential getBestMove calls...`);

    for (let i = 0; i < positions.length; i++) {
        const move = await getBestMove(positions[i], 5);
        console.log(`  Position ${i + 1}: bestMove = ${move}`);
    }

    console.log('\n✅ All tests completed successfully!');
    console.log('═══════════════════════════════════════\n');

    // Clean shutdown
    sendCommand('quit');
}

// Initialize UCI
console.log('Initializing UCI protocol...\n');
sendCommand('uci');
