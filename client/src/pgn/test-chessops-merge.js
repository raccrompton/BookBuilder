/**
 * test-chessops-merge.js - Standalone test for chessops PGN merging
 *
 * Tests whether chessops can:
 * 1. Parse PGN lines with annotation blocks
 * 2. Preserve comments after round-trip (parse -> makePgn)
 * 3. Merge multiple lines into a tree structure
 *
 * Run with: node --experimental-modules test-chessops-merge.js
 * Or in browser console after importing
 */

import { parsePgn, makePgn, startingPosition } from 'chessops/pgn'; // Import chessops PGN functions for parsing and generating PGN strings
import { Chess } from 'chessops/chess'; // Import Chess class for position tracking during merge
import { makeFen, parseFen } from 'chessops/fen'; // Import FEN utilities for position identification
import { parseSan, makeSan } from 'chessops/san'; // Import SAN utilities for move parsing

// ============================================================================
// TEST DATA - Cleaned versions of ExampleLines.txt (single Event header each)
// ============================================================================

// Test data using new annotation format: "e4 55.79%, Nf3 62.36%." with commas between moves and periods between sections
const testLines = [
    // Line 1: 1. e4 e5 2. Nf3 d5 3. exd5 e4 4. Qe2 ...
    `[Event "Opening: e4 e5 Line 1"]

1. e4 e5 2. Nf3 d5 3. exd5 e4 4. Qe2 Be7 5. Qxe4 Nf6 6. Qa4+ c6 *
{Move playrates:
e4 55.79%, Nf3 62.36%, exd5 54.88%, Qe2 40.27%, Qxe4 72.06%, Qa4+ 39.50%.
Line cumulative playrate: 2.19%.
Line winrate (draws as half points): 51.24% over 6,680 games.}`,

    // Line 2: 1. e4 e5 2. Nf3 d5 3. exd5 e4 4. Nd4 ... (diverges at move 4)
    `[Event "Opening: e4 e5 Line 2"]

1. e4 e5 2. Nf3 d5 3. exd5 e4 4. Nd4 Qxd5 5. c3 Bd6 *
{Move playrates:
e4 55.79%, Nf3 62.36%, exd5 54.88%, Nd4 28.48%, c3 48.12%.
Line cumulative playrate: 2.62%.
Line winrate (draws as half points): 64.00% over 30,364 games.}`,

    // Line 3: 1. e4 e5 2. Nf3 d5 3. exd5 e4 4. Nd4 Qxd5 5. Nb3 ... (diverges at move 5)
    `[Event "Opening: e4 e5 Line 3"]

1. e4 e5 2. Nf3 d5 3. exd5 e4 4. Nd4 Qxd5 5. Nb3 Qe5 *
{Move playrates:
e4 55.79%, Nf3 62.36%, exd5 54.88%, Nd4 28.48%, Nb3 46.13%.
Line cumulative playrate: 2.51%.
Line winrate (draws as half points): 62.22% over 33,534 games.}`,

    // Line 7: 1. e4 e5 2. Bc4 ... (diverges at move 2)
    `[Event "Opening: e4 e5 Line 7"]

1. e4 e5 2. Bc4 f5 3. exf5 Nf6 *
{Move playrates:
e4 55.79%, Bc4 9.30%, exf5 39.63%.
Line cumulative playrate: 2.06%.
Line winrate (draws as half points): 53.90% over 242,882 games.}`
];

// ============================================================================
// TEST 1: Basic Parsing
// ============================================================================

function testBasicParsing() {
    console.log('\n========== TEST 1: Basic Parsing =========='); // Log test section header

    let allPassed = true; // Track overall test success

    for (let i = 0; i < testLines.length; i++) { // Iterate through each test line
        try {
            const games = parsePgn(testLines[i]); // Parse the PGN string into game objects

            if (games.length === 0) { // Check if parsing returned any games
                console.log(`❌ Line ${i + 1}: No games parsed`); // Log failure if no games
                allPassed = false; // Mark test as failed
                continue; // Move to next line
            }

            const game = games[0]; // Get the first (and should be only) game
            console.log(`✅ Line ${i + 1}: Parsed successfully`); // Log success
            console.log(`   Headers: ${[...game.headers.entries()].map(([k, v]) => `${k}="${v}"`).join(', ')}`); // Show parsed headers

            // Count moves in mainline by walking the tree
            let moveCount = 0; // Initialize move counter
            let node = game.moves; // Start at root node
            while (node.children.length > 0) { // Walk through mainline
                moveCount++; // Increment move count
                node = node.children[0]; // Move to first child (mainline)
            }
            console.log(`   Moves in mainline: ${moveCount}`); // Log move count

        } catch (error) { // Catch any parsing errors
            console.log(`❌ Line ${i + 1}: Parse error - ${error.message}`); // Log error details
            allPassed = false; // Mark test as failed
        }
    }

    return allPassed; // Return overall test result
}

// ============================================================================
// TEST 2: Comment Preservation (Round-trip)
// ============================================================================

function testCommentPreservation() {
    console.log('\n========== TEST 2: Comment Preservation =========='); // Log test section header

    const testPgn = testLines[0]; // Use first line for this test

    try {
        // Parse the PGN
        const games = parsePgn(testPgn); // Parse the test PGN string
        if (games.length === 0) { // Check if parsing succeeded
            console.log('❌ Failed to parse test PGN'); // Log failure
            return false; // Return failure
        }

        const game = games[0]; // Get the parsed game

        // Find the comment on the last move (the annotation block)
        let lastNode = game.moves; // Start at root
        while (lastNode.children.length > 0) { // Walk to end of mainline
            lastNode = lastNode.children[0]; // Move to next node
        }

        // Check if there's a comment on the last node
        const hasComment = lastNode.data && lastNode.data.comments && lastNode.data.comments.length > 0; // Check for comments array

        if (hasComment) { // If comment exists
            console.log('✅ Found comment on last move:'); // Log success
            console.log(`   "${lastNode.data.comments[0].substring(0, 50)}..."`); // Show first 50 chars of comment
        } else { // If no comment found
            console.log('❌ No comment found on last move'); // Log failure
            console.log('   Last node data:', lastNode.data); // Debug: show node data
            return false; // Return failure
        }

        // Round-trip: convert back to PGN string
        const outputPgn = makePgn(game); // Generate PGN string from game object
        console.log('\n   Round-trip output (first 200 chars):'); // Log output preview label
        console.log(`   ${outputPgn.substring(0, 200)}...`); // Show first 200 chars of output

        // Check if comment is preserved in output
        const commentPreserved = outputPgn.includes('Move playrates:'); // Check if annotation marker is in output

        if (commentPreserved) { // If comment was preserved
            console.log('\n✅ Comment preserved after round-trip!'); // Log success
            return true; // Return success
        } else { // If comment was lost
            console.log('\n❌ Comment lost after round-trip'); // Log failure
            return false; // Return failure
        }

    } catch (error) { // Catch any errors
        console.log(`❌ Error: ${error.message}`); // Log error message
        return false; // Return failure
    }
}

// ============================================================================
// TEST 3: Simple Two-Line Merge
// ============================================================================

function testTwoLineMerge() {
    console.log('\n========== TEST 3: Two-Line Merge =========='); // Log test section header

    // Lines 1 and 2 share moves 1-3, diverge at move 4 (Qe2 vs Nd4)
    const line1 = testLines[0]; // First test line
    const line2 = testLines[1]; // Second test line

    try {
        const game1 = parsePgn(line1)[0]; // Parse first line
        const game2 = parsePgn(line2)[0]; // Parse second line

        console.log('Parsed both lines successfully'); // Log parsing success

        // Simple merge: we need to walk both trees and find divergence point
        // For now, let's just verify we can access both trees

        // Get move sequences from both games
        const moves1 = []; // Array to hold moves from game 1
        let node1 = game1.moves; // Start at root of game 1
        while (node1.children.length > 0) { // Walk mainline
            moves1.push(node1.children[0].data.san); // Add move SAN to array
            node1 = node1.children[0]; // Move to next node
        }

        const moves2 = []; // Array to hold moves from game 2
        let node2 = game2.moves; // Start at root of game 2
        while (node2.children.length > 0) { // Walk mainline
            moves2.push(node2.children[0].data.san); // Add move SAN to array
            node2 = node2.children[0]; // Move to next node
        }

        console.log(`Line 1 moves: ${moves1.join(' ')}`); // Log moves from line 1
        console.log(`Line 2 moves: ${moves2.join(' ')}`); // Log moves from line 2

        // Find divergence point
        let divergeAt = -1; // Initialize divergence point as not found
        for (let i = 0; i < Math.min(moves1.length, moves2.length); i++) { // Iterate through both move lists
            if (moves1[i] !== moves2[i]) { // If moves differ at this point
                divergeAt = i; // Record divergence point
                break; // Stop searching
            }
        }

        if (divergeAt === -1) { // If no divergence found
            console.log('Lines are identical or one is prefix of other'); // Log this case
        } else { // If divergence found
            console.log(`\n✅ Lines diverge at move ${divergeAt + 1}:`); // Log divergence point (1-indexed)
            console.log(`   Line 1: ${moves1[divergeAt]}`); // Show diverging move from line 1
            console.log(`   Line 2: ${moves2[divergeAt]}`); // Show diverging move from line 2
        }

        // Now let's try to manually create a merged tree
        console.log('\n   Attempting manual merge...'); // Log merge attempt

        // Create new game with merged tree
        const mergedGame = { // Create new game object
            headers: new Map([['Event', 'Merged Test']]), // Set merged game header
            moves: { children: [] } // Initialize empty root node
        };

        // Add shared moves to merged game
        let currentNode = mergedGame.moves; // Start at root of merged game
        for (let i = 0; i < divergeAt; i++) { // Add all shared moves
            const newChild = { // Create new child node
                data: { san: moves1[i] }, // Set move SAN
                children: [] // Initialize empty children array
            };
            currentNode.children.push(newChild); // Add child to current node
            currentNode = newChild; // Move to new child for next iteration
        }

        // At divergence point, add both branches
        const branch1 = { // Create branch for line 1's diverging move
            data: { san: moves1[divergeAt] }, // Set move SAN
            children: [] // Initialize children
        };
        const branch2 = { // Create branch for line 2's diverging move
            data: { san: moves2[divergeAt] }, // Set move SAN
            children: [] // Initialize children
        };

        currentNode.children.push(branch1); // Add first branch (mainline)
        currentNode.children.push(branch2); // Add second branch (variation)

        // Continue line 1 as mainline
        let branchNode = branch1; // Start at first branch
        for (let i = divergeAt + 1; i < moves1.length; i++) { // Add remaining moves from line 1
            const newChild = { // Create child node
                data: { san: moves1[i] }, // Set move SAN
                children: [] // Initialize children
            };
            branchNode.children.push(newChild); // Add child
            branchNode = newChild; // Move to new child
        }

        // Continue line 2 as variation
        branchNode = branch2; // Start at second branch
        for (let i = divergeAt + 1; i < moves2.length; i++) { // Add remaining moves from line 2
            const newChild = { // Create child node
                data: { san: moves2[i] }, // Set move SAN
                children: [] // Initialize children
            };
            branchNode.children.push(newChild); // Add child
            branchNode = newChild; // Move to new child
        }

        // Export merged game
        const mergedPgn = makePgn(mergedGame); // Generate PGN from merged game object
        console.log('\n   Merged PGN output:'); // Log output label
        console.log(`   ${mergedPgn}`); // Log the merged PGN

        // Check if output has variation syntax
        const hasVariation = mergedPgn.includes('('); // Check for variation parentheses
        if (hasVariation) { // If variation syntax present
            console.log('\n✅ Merged PGN contains variation syntax!'); // Log success
            return true; // Return success
        } else { // If no variation syntax
            console.log('\n❌ Merged PGN missing variation syntax'); // Log failure
            return false; // Return failure
        }

    } catch (error) { // Catch any errors
        console.log(`❌ Error: ${error.message}`); // Log error message
        console.log(error.stack); // Log stack trace for debugging
        return false; // Return failure
    }
}

// ============================================================================
// TEST 4: Comment Preservation in Merged Output
// ============================================================================

function testMergeWithComments() {
    console.log('\n========== TEST 4: Merge with Comments =========='); // Log test section header

    // Use lines 2 and 3 which diverge at move 5 (c3 vs Nb3)
    const line2 = testLines[1]; // Line 2: ends with 5. c3 Bd6
    const line3 = testLines[2]; // Line 3: ends with 5. Nb3 Qe5

    try {
        const game2 = parsePgn(line2)[0]; // Parse line 2
        const game3 = parsePgn(line3)[0]; // Parse line 3

        // Extract moves and find last nodes (which have comments)
        const getMovesAndLastNode = (game) => { // Helper function to extract moves and last node
            const moves = []; // Array for moves
            let node = game.moves; // Start at root
            let lastNode = null; // Track last node
            while (node.children.length > 0) { // Walk mainline
                lastNode = node.children[0]; // Update last node
                moves.push(lastNode.data.san); // Add move to array
                node = lastNode; // Move to next
            }
            return { moves, lastNode }; // Return both
        };

        const { moves: moves2, lastNode: last2 } = getMovesAndLastNode(game2); // Get data from game 2
        const { moves: moves3, lastNode: last3 } = getMovesAndLastNode(game3); // Get data from game 3

        console.log(`Line 2: ${moves2.join(' ')}`); // Log moves from line 2
        console.log(`Line 3: ${moves3.join(' ')}`); // Log moves from line 3

        // Find divergence
        let divergeAt = moves2.findIndex((m, i) => moves3[i] !== m); // Find first differing move
        if (divergeAt === -1) divergeAt = Math.min(moves2.length, moves3.length); // Handle identical prefix case

        console.log(`Diverge at move ${divergeAt + 1}: ${moves2[divergeAt]} vs ${moves3[divergeAt]}`); // Log divergence point

        // Build merged game with comments preserved
        const mergedGame = { // Create merged game object
            headers: new Map([['Event', 'Merged with Comments']]), // Set header
            moves: { children: [] } // Initialize root
        };

        // Add shared moves
        let currentNode = mergedGame.moves; // Start at root
        for (let i = 0; i < divergeAt; i++) { // Add all shared moves
            const newChild = { // Create child node
                data: { san: moves2[i] }, // Set move SAN
                children: [] // Initialize children
            };
            currentNode.children.push(newChild); // Add to tree
            currentNode = newChild; // Move forward
        }

        // Create branches with remaining moves AND comments on last move
        const buildBranch = (moves, startIdx, lastNodeData) => { // Helper to build a branch with its final comment
            const branch = { // Create branch root
                data: { san: moves[startIdx] }, // Set diverging move
                children: [] // Initialize children
            };

            let node = branch; // Start at branch root
            for (let i = startIdx + 1; i < moves.length; i++) { // Add remaining moves
                const isLastMove = (i === moves.length - 1); // Check if this is the last move
                const newChild = { // Create child node
                    data: {
                        san: moves[i], // Set move SAN
                        // Add comment only to the last move
                        comments: isLastMove && lastNodeData.comments ? lastNodeData.comments : undefined // Preserve comment on last move
                    },
                    children: [] // Initialize children
                };
                node.children.push(newChild); // Add to tree
                node = newChild; // Move forward
            }

            return branch; // Return the built branch
        };

        // Add both branches
        currentNode.children.push(buildBranch(moves2, divergeAt, last2.data)); // Add line 2's branch
        currentNode.children.push(buildBranch(moves3, divergeAt, last3.data)); // Add line 3's branch

        // Export and check
        const mergedPgn = makePgn(mergedGame); // Generate PGN from merged game
        console.log('\nMerged PGN with comments:'); // Log output label
        console.log(mergedPgn); // Log the full merged PGN

        // Check for both comments
        const hasComment2 = mergedPgn.includes('64.00%'); // Check for line 2's winrate
        const hasComment3 = mergedPgn.includes('62.22%'); // Check for line 3's winrate

        if (hasComment2 && hasComment3) { // If both comments preserved
            console.log('\n✅ Both comments preserved in merged output!'); // Log success
            return true; // Return success
        } else { // If any comment lost
            console.log(`\n❌ Comments not fully preserved:`); // Log failure
            console.log(`   Line 2 comment (64.00%): ${hasComment2 ? '✅' : '❌'}`); // Show line 2 status
            console.log(`   Line 3 comment (62.22%): ${hasComment3 ? '✅' : '❌'}`); // Show line 3 status
            return false; // Return failure
        }

    } catch (error) { // Catch any errors
        console.log(`❌ Error: ${error.message}`); // Log error message
        console.log(error.stack); // Log stack trace
        return false; // Return failure
    }
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

async function runAllTests() {
    console.log('🧪 CHESSOPS PGN MERGE TESTS'); // Log test suite header
    console.log('============================'); // Visual separator

    const results = []; // Array to track test results

    results.push({ name: 'Basic Parsing', passed: testBasicParsing() }); // Run and record test 1
    results.push({ name: 'Comment Preservation', passed: testCommentPreservation() }); // Run and record test 2
    results.push({ name: 'Two-Line Merge', passed: testTwoLineMerge() }); // Run and record test 3
    results.push({ name: 'Merge with Comments', passed: testMergeWithComments() }); // Run and record test 4

    // Summary
    console.log('\n============================'); // Visual separator
    console.log('📊 TEST SUMMARY'); // Summary header
    console.log('============================'); // Visual separator

    let passed = 0; // Counter for passed tests
    let failed = 0; // Counter for failed tests

    for (const result of results) { // Iterate through results
        const icon = result.passed ? '✅' : '❌'; // Choose icon based on result
        console.log(`${icon} ${result.name}`); // Log test result
        if (result.passed) passed++; // Increment passed counter
        else failed++; // Increment failed counter
    }

    console.log(`\nTotal: ${passed}/${results.length} passed`); // Log summary totals

    if (failed === 0) { // If all tests passed
        console.log('\n🎉 All tests passed! Chessops is suitable for PGN merging.'); // Log success message
    } else { // If any tests failed
        console.log('\n⚠️  Some tests failed. Review issues before proceeding.'); // Log warning message
    }
}

// Run tests if this is the main module
runAllTests(); // Execute the test suite

export { testBasicParsing, testCommentPreservation, testTwoLineMerge, testMergeWithComments, runAllTests }; // Export test functions for use elsewhere
