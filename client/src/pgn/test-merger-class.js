/**
 * test-merger-class.js - Test the PgnTreeMerger class
 *
 * Run with: node src/pgn/test-merger-class.js
 */

import PgnTreeMerger from './PgnTreeMerger.js'; // Import our merger class

// Test data - 4 lines from ExampleLines.txt (cleaned, using new annotation format)
// New format: "e4 55.79%, Nf3 62.36%." with commas between moves and periods between sections
const testLines = [
    // Line 1: Main line through 4. Qe2
    `[Event "Opening: e4 e5 Line 1"]

1. e4 e5 2. Nf3 d5 3. exd5 e4 4. Qe2 Be7 5. Qxe4 Nf6 6. Qa4+ c6 *
{Move playrates:
e4 55.79%, Nf3 62.36%, Qe2 40.27%.
Line cumulative playrate: 2.19%.
Line winrate (draws as half points): 51.24% over 6,680 games.}`,

    // Line 2: Diverges at move 4 with Nd4 instead of Qe2
    `[Event "Opening: e4 e5 Line 2"]

1. e4 e5 2. Nf3 d5 3. exd5 e4 4. Nd4 Qxd5 5. c3 Bd6 *
{Move playrates:
e4 55.79%, Nf3 62.36%, Nd4 28.48%.
Line cumulative playrate: 2.62%.
Line winrate (draws as half points): 64.00% over 30,364 games.}`,

    // Line 3: Same as Line 2 until move 5, then Nb3 instead of c3
    `[Event "Opening: e4 e5 Line 3"]

1. e4 e5 2. Nf3 d5 3. exd5 e4 4. Nd4 Qxd5 5. Nb3 Qe5 *
{Move playrates:
e4 55.79%, Nf3 62.36%, Nd4 28.48%, Nb3 46.13%.
Line cumulative playrate: 2.51%.
Line winrate (draws as half points): 62.22% over 33,534 games.}`,

    // Line 7: Diverges at move 2 with Bc4 instead of Nf3
    `[Event "Opening: e4 e5 Line 7"]

1. e4 e5 2. Bc4 f5 3. exf5 Nf6 *
{Move playrates:
e4 55.79%, Bc4 9.30%, exf5 39.63%.
Line cumulative playrate: 2.06%.
Line winrate (draws as half points): 53.90% over 242,882 games.}`
];

// ============================================================================
// TEST 1: Basic merge with 2 lines
// ============================================================================

function testBasicMerge() {
    console.log('\n========== TEST 1: Basic Two-Line Merge =========='); // Log test header

    const merger = new PgnTreeMerger(); // Create new merger instance
    merger.setHeader('Event', 'Basic Merge Test'); // Set the event header

    // Add lines 1 and 2 (diverge at move 4: Qe2 vs Nd4)
    merger.addLine(testLines[0]); // Add first line
    merger.addLine(testLines[1]); // Add second line

    console.log(`Added ${merger.getLineCount()} lines`); // Log how many lines were added

    const output = merger.toPgn(); // Generate the merged PGN
    console.log('\nMerged output:'); // Log output label
    console.log(output); // Display the merged PGN

    // Verify output
    const hasVariation = output.includes('('); // Check for variation parentheses
    const hasLine1Stats = output.includes('51.24%'); // Check for line 1's winrate
    const hasLine2Stats = output.includes('64.00%'); // Check for line 2's winrate
    const hasQe2 = output.includes('Qe2'); // Check for line 1's diverging move
    const hasNd4 = output.includes('Nd4'); // Check for line 2's diverging move

    console.log('\nVerification:'); // Log verification section
    console.log(`  Has variation syntax: ${hasVariation ? '✅' : '❌'}`); // Report variation check
    console.log(`  Has Line 1 stats (51.24%): ${hasLine1Stats ? '✅' : '❌'}`); // Report line 1 stats
    console.log(`  Has Line 2 stats (64.00%): ${hasLine2Stats ? '✅' : '❌'}`); // Report line 2 stats
    console.log(`  Has Qe2 move: ${hasQe2 ? '✅' : '❌'}`); // Report Qe2 presence
    console.log(`  Has Nd4 move: ${hasNd4 ? '✅' : '❌'}`); // Report Nd4 presence

    const passed = hasVariation && hasLine1Stats && hasLine2Stats && hasQe2 && hasNd4; // All checks must pass
    console.log(`\nTest ${passed ? '✅ PASSED' : '❌ FAILED'}`); // Report overall result
    return passed; // Return test result
}

// ============================================================================
// TEST 2: Nested variations (3 lines with 2 divergence points)
// ============================================================================

function testNestedVariations() {
    console.log('\n========== TEST 2: Nested Variations (3 lines) =========='); // Log test header

    const merger = new PgnTreeMerger(); // Create new merger instance
    merger.setHeader('Event', 'Nested Variations Test'); // Set event header

    // Add lines 1, 2, and 3
    // Line 1 vs Line 2: diverge at move 4 (Qe2 vs Nd4)
    // Line 2 vs Line 3: diverge at move 5 (c3 vs Nb3)
    merger.addLine(testLines[0]); // Add line 1 (main line)
    merger.addLine(testLines[1]); // Add line 2 (diverges at move 4)
    merger.addLine(testLines[2]); // Add line 3 (diverges from line 2 at move 5)

    console.log(`Added ${merger.getLineCount()} lines`); // Log line count

    const output = merger.toPgn(); // Generate merged PGN
    console.log('\nMerged output:'); // Log output label
    console.log(output); // Display merged PGN

    // Verify: should have both Nd4 and Nb3 variations
    const hasNd4 = output.includes('Nd4'); // Check for line 2's move
    const hasNb3 = output.includes('Nb3'); // Check for line 3's move
    const hasC3 = output.includes('c3'); // Check for line 2's continuation
    const hasLine3Stats = output.includes('62.22%'); // Check for line 3's winrate

    console.log('\nVerification:'); // Log verification section
    console.log(`  Has Nd4 variation: ${hasNd4 ? '✅' : '❌'}`); // Report Nd4 check
    console.log(`  Has c3 move: ${hasC3 ? '✅' : '❌'}`); // Report c3 check
    console.log(`  Has Nb3 variation: ${hasNb3 ? '✅' : '❌'}`); // Report Nb3 check
    console.log(`  Has Line 3 stats (62.22%): ${hasLine3Stats ? '✅' : '❌'}`); // Report stats check

    const passed = hasNd4 && hasNb3 && hasC3 && hasLine3Stats; // All checks must pass
    console.log(`\nTest ${passed ? '✅ PASSED' : '❌ FAILED'}`); // Report result
    return passed; // Return test result
}

// ============================================================================
// TEST 3: Early divergence (move 2)
// ============================================================================

function testEarlyDivergence() {
    console.log('\n========== TEST 3: Early Divergence (move 2) =========='); // Log test header

    const merger = new PgnTreeMerger(); // Create merger instance
    merger.setHeader('Event', 'Early Divergence Test'); // Set header

    // Line 1 has 2. Nf3, Line 7 has 2. Bc4
    merger.addLine(testLines[0]); // Add line 1 (2. Nf3)
    merger.addLine(testLines[3]); // Add line 7 (2. Bc4)

    console.log(`Added ${merger.getLineCount()} lines`); // Log line count

    const output = merger.toPgn(); // Generate merged PGN
    console.log('\nMerged output:'); // Log output label
    console.log(output); // Display merged PGN

    // Verify both move 2 variations exist
    const hasNf3 = output.includes('Nf3'); // Check for line 1's move 2
    const hasBc4 = output.includes('Bc4'); // Check for line 7's move 2
    const hasLine7Stats = output.includes('53.90%'); // Check for line 7's winrate

    console.log('\nVerification:'); // Log verification section
    console.log(`  Has Nf3 (mainline): ${hasNf3 ? '✅' : '❌'}`); // Report Nf3 check
    console.log(`  Has Bc4 (variation): ${hasBc4 ? '✅' : '❌'}`); // Report Bc4 check
    console.log(`  Has Line 7 stats (53.90%): ${hasLine7Stats ? '✅' : '❌'}`); // Report stats check

    const passed = hasNf3 && hasBc4 && hasLine7Stats; // All checks must pass
    console.log(`\nTest ${passed ? '✅ PASSED' : '❌ FAILED'}`); // Report result
    return passed; // Return test result
}

// ============================================================================
// TEST 4: All 4 lines merged
// ============================================================================

function testFullMerge() {
    console.log('\n========== TEST 4: Full Merge (4 lines) =========='); // Log test header

    const merger = new PgnTreeMerger(); // Create merger instance
    merger.setHeader('Event', 'Full Merge Test'); // Set header

    // Add all 4 lines
    for (const line of testLines) { // Iterate through all test lines
        merger.addLine(line); // Add each line
    }

    console.log(`Added ${merger.getLineCount()} lines`); // Log line count

    const output = merger.toPgn(); // Generate merged PGN
    console.log('\nMerged output:'); // Log output label
    console.log(output); // Display merged PGN

    // Verify all major moves and stats are present
    const checks = [ // Array of checks to perform
        { label: 'Has Qe2 (line 1)', test: output.includes('Qe2') }, // Check line 1 move
        { label: 'Has Nd4 (line 2,3)', test: output.includes('Nd4') }, // Check line 2/3 move
        { label: 'Has c3 (line 2)', test: output.includes('c3') }, // Check line 2 continuation
        { label: 'Has Nb3 (line 3)', test: output.includes('Nb3') }, // Check line 3 continuation
        { label: 'Has Bc4 (line 7)', test: output.includes('Bc4') }, // Check line 7 move
        { label: 'Line 1 stats (51.24%)', test: output.includes('51.24%') }, // Check line 1 stats
        { label: 'Line 2 stats (64.00%)', test: output.includes('64.00%') }, // Check line 2 stats
        { label: 'Line 3 stats (62.22%)', test: output.includes('62.22%') }, // Check line 3 stats
        { label: 'Line 7 stats (53.90%)', test: output.includes('53.90%') }, // Check line 7 stats
        { label: 'Has variations', test: output.includes('(') } // Check variation syntax
    ];

    console.log('\nVerification:'); // Log verification section
    let allPassed = true; // Track overall success
    for (const check of checks) { // Iterate through checks
        console.log(`  ${check.label}: ${check.test ? '✅' : '❌'}`); // Report each check
        if (!check.test) allPassed = false; // Update overall status
    }

    console.log(`\nTest ${allPassed ? '✅ PASSED' : '❌ FAILED'}`); // Report result
    return allPassed; // Return test result
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

async function runAllTests() {
    console.log('🧪 PGNTREEMERGER CLASS TESTS'); // Log test suite header
    console.log('============================'); // Visual separator

    const results = []; // Array to track results

    results.push({ name: 'Basic Two-Line Merge', passed: testBasicMerge() }); // Run test 1
    results.push({ name: 'Nested Variations', passed: testNestedVariations() }); // Run test 2
    results.push({ name: 'Early Divergence', passed: testEarlyDivergence() }); // Run test 3
    results.push({ name: 'Full Merge (4 lines)', passed: testFullMerge() }); // Run test 4

    // Summary
    console.log('\n============================'); // Visual separator
    console.log('📊 TEST SUMMARY'); // Summary header
    console.log('============================'); // Visual separator

    let passed = 0; // Counter for passed tests
    let failed = 0; // Counter for failed tests

    for (const result of results) { // Iterate through results
        const icon = result.passed ? '✅' : '❌'; // Choose icon
        console.log(`${icon} ${result.name}`); // Log result
        if (result.passed) passed++; else failed++; // Update counters
    }

    console.log(`\nTotal: ${passed}/${results.length} passed`); // Log totals

    if (failed === 0) { // If all passed
        console.log('\n🎉 All tests passed! PgnTreeMerger is working correctly.'); // Success message
    } else { // If any failed
        console.log('\n⚠️  Some tests failed. Review implementation.'); // Warning message
    }
}

runAllTests(); // Execute the test suite
