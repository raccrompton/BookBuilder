/**
 * Cross-System Validation Utilities
 *
 * Provides comprehensive comparison utilities for validating that the JavaScript
 * and Python BookBuilder implementations produce identical results for the same inputs.
 */

const { PythonBookBuilderRunner } = require('./PythonRunner.js');

class CrossSystemValidator {
    constructor(options = {}) {
        this.pythonRunner = new PythonBookBuilderRunner(options.pythonOptions);
        this.tolerance = options.tolerance || 0.01; // 1% default tolerance for floating-point comparisons
        this.strictMode = options.strictMode || false; // Require byte-for-byte exact matches
    }

    /**
     * Validate that both systems produce identical outputs for the same input
     */
    async validateIdenticalOutputs(config, jsBookBuilder) {
        console.log('🔄 Starting cross-system validation...');

        // Execute both systems with identical inputs
        const [pythonResult, jsResult] = await Promise.all([
            this.pythonRunner.runPythonSystem(config).catch(error => ({ error: error.message })),
            this.executeJavaScriptSystem(config, jsBookBuilder).catch(error => ({ error: error.message }))
        ]);

        // Handle execution errors
        if (pythonResult.error) {
            throw new Error(`Python execution failed: ${pythonResult.error}`);
        }
        if (jsResult.error) {
            throw new Error(`JavaScript execution failed: ${jsResult.error}`);
        }

        // Compare outputs
        const comparison = this.compareSystemOutputs(pythonResult, jsResult);

        return {
            success: comparison.match,
            pythonResult,
            jsResult,
            comparison,
            executionTimes: {
                python: pythonResult.executionTime,
                javascript: jsResult.executionTime
            }
        };
    }

    /**
     * Execute JavaScript BookBuilder system
     */
    async executeJavaScriptSystem(config, jsBookBuilder) {
        const startTime = Date.now();

        try {
            const result = await jsBookBuilder.processOpening(config);
            const executionTime = Date.now() - startTime;

            return {
                success: true,
                outputs: result,
                executionTime
            };
        } catch (error) {
            const executionTime = Date.now() - startTime;
            throw new Error(`JavaScript execution failed after ${executionTime}ms: ${error.message}`);
        }
    }

    /**
     * Compare outputs from both systems
     */
    compareSystemOutputs(pythonResult, jsResult) {
        const comparison = {
            match: true,
            details: {},
            differences: [],
            statistics: {
                filesCompared: 0,
                percentageMatches: 0,
                structuralMatches: 0
            }
        };

        // Get output files from both systems
        const pythonFiles = Object.keys(pythonResult.outputs || {});
        const jsFiles = Object.keys(jsResult.outputs || {});

        // Check if same files were generated
        if (pythonFiles.length !== jsFiles.length) {
            comparison.match = false;
            comparison.differences.push({
                type: 'file_count_mismatch',
                python: pythonFiles.length,
                javascript: jsFiles.length
            });
        }

        // Compare each file
        for (const fileName of pythonFiles) {
            if (!jsResult.outputs[fileName]) {
                comparison.match = false;
                comparison.differences.push({
                    type: 'missing_js_file',
                    fileName
                });
                continue;
            }

            const fileComparison = this.compareFileContents(
                pythonResult.outputs[fileName],
                jsResult.outputs[fileName],
                fileName
            );

            comparison.details[fileName] = fileComparison;
            comparison.statistics.filesCompared++;

            if (!fileComparison.match) {
                comparison.match = false;
                comparison.differences.push({
                    type: 'file_content_mismatch',
                    fileName,
                    details: fileComparison.differences
                });
            } else {
                comparison.statistics.percentageMatches++;
                if (fileComparison.structuralMatch) {
                    comparison.statistics.structuralMatches++;
                }
            }
        }

        return comparison;
    }

    /**
     * Compare contents of individual files
     */
    compareFileContents(pythonContent, jsContent, fileName) {
        const result = {
            match: true,
            structuralMatch: true,
            differences: [],
            statistics: {}
        };

        // Normalize both contents
        const normalizedPython = this.pythonRunner.normalizeOutput(pythonContent);
        const normalizedJs = this.pythonRunner.normalizeOutput(jsContent);

        // Extract and compare structural elements
        const pythonStructure = this.extractPgnStructure(normalizedPython);
        const jsStructure = this.extractPgnStructure(normalizedJs);

        // Compare PGN structure
        const structureComparison = this.comparePgnStructures(pythonStructure, jsStructure);
        if (!structureComparison.match) {
            result.match = false;
            result.structuralMatch = false;
            result.differences.push({
                type: 'structural_difference',
                details: structureComparison.differences
            });
        }

        // Compare statistical values with tolerance
        const statisticalComparison = this.compareStatisticalValues(normalizedPython, normalizedJs);
        if (!statisticalComparison.match) {
            result.match = false;
            result.differences.push({
                type: 'statistical_difference',
                details: statisticalComparison.differences
            });
        }

        // Compare move sequences
        const moveComparison = this.compareMoveSequences(pythonStructure, jsStructure);
        if (!moveComparison.match) {
            result.match = false;
            result.differences.push({
                type: 'move_sequence_difference',
                details: moveComparison.differences
            });
        }

        result.statistics = {
            pythonLines: pythonStructure.lines.length,
            jsLines: jsStructure.lines.length,
            statisticalValues: statisticalComparison.valuesCompared,
            moveSequences: moveComparison.sequencesCompared
        };

        return result;
    }

    /**
     * Extract PGN structure for comparison
     */
    extractPgnStructure(pgnContent) {
        const lines = [];
        const events = pgnContent.split(/\[Event "/).slice(1);

        for (const event of events) {
            const eventMatch = event.match(/^([^"]+)"\]/);
            if (!eventMatch) continue;

            const eventName = eventMatch[1];
            const moveMatch = event.match(/\n\n([^{]+)/);
            const moves = moveMatch ? moveMatch[1].trim() : '';

            // Extract statistics
            const playrates = this.extractPlayrates(event);
            const winrate = this.extractWinrate(event);
            const games = this.extractGameCount(event);

            lines.push({
                eventName,
                moves,
                playrates,
                winrate,
                games
            });
        }

        return { lines };
    }

    /**
     * Extract playrate annotations
     */
    extractPlayrates(eventContent) {
        const playrates = [];
        const playrateMatches = eventContent.match(/([+-]?\d+\.\d{2}%)\s+([a-zA-Z0-9+\-#=]+)/g) || [];

        for (const match of playrateMatches) {
            const parts = match.match(/([+-]?\d+\.\d{2}%)\s+([a-zA-Z0-9+\-#=]+)/);
            if (parts) {
                playrates.push({
                    percentage: parseFloat(parts[1].replace('%', '')),
                    move: parts[2]
                });
            }
        }

        return playrates;
    }

    /**
     * Extract winrate information
     */
    extractWinrate(eventContent) {
        const winrateMatch = eventContent.match(/Line winrate[^:]*:\s*([+-]?\d+\.\d{2}%)/);
        return winrateMatch ? parseFloat(winrateMatch[1].replace('%', '')) : null;
    }

    /**
     * Extract game count
     */
    extractGameCount(eventContent) {
        const gameMatch = eventContent.match(/over\s+(\d+)\s+games/);
        return gameMatch ? parseInt(gameMatch[1], 10) : null;
    }

    /**
     * Compare PGN structures
     */
    comparePgnStructures(pythonStructure, jsStructure) {
        const result = { match: true, differences: [] };

        if (pythonStructure.lines.length !== jsStructure.lines.length) {
            result.match = false;
            result.differences.push({
                type: 'line_count_mismatch',
                python: pythonStructure.lines.length,
                javascript: jsStructure.lines.length
            });
        }

        for (let i = 0; i < Math.min(pythonStructure.lines.length, jsStructure.lines.length); i++) {
            const pythonLine = pythonStructure.lines[i];
            const jsLine = jsStructure.lines[i];

            // Compare event names
            if (pythonLine.eventName !== jsLine.eventName) {
                result.match = false;
                result.differences.push({
                    type: 'event_name_mismatch',
                    lineIndex: i,
                    python: pythonLine.eventName,
                    javascript: jsLine.eventName
                });
            }

            // Compare move sequences
            if (pythonLine.moves !== jsLine.moves) {
                result.match = false;
                result.differences.push({
                    type: 'move_sequence_mismatch',
                    lineIndex: i,
                    python: pythonLine.moves,
                    javascript: jsLine.moves
                });
            }
        }

        return result;
    }

    /**
     * Compare statistical values with tolerance
     */
    compareStatisticalValues(pythonContent, jsContent) {
        const pythonPercentages = this.pythonRunner.extractPercentages(pythonContent);
        const jsPercentages = this.pythonRunner.extractPercentages(jsContent);

        const result = {
            match: true,
            differences: [],
            valuesCompared: Math.min(pythonPercentages.length, jsPercentages.length)
        };

        if (pythonPercentages.length !== jsPercentages.length) {
            result.match = false;
            result.differences.push({
                type: 'percentage_count_mismatch',
                python: pythonPercentages.length,
                javascript: jsPercentages.length
            });
        }

        for (let i = 0; i < Math.min(pythonPercentages.length, jsPercentages.length); i++) {
            const diff = Math.abs(pythonPercentages[i] - jsPercentages[i]);
            if (diff > this.tolerance) {
                result.match = false;
                result.differences.push({
                    type: 'percentage_value_mismatch',
                    index: i,
                    python: pythonPercentages[i],
                    javascript: jsPercentages[i],
                    difference: diff,
                    tolerance: this.tolerance
                });
            }
        }

        return result;
    }

    /**
     * Compare move sequences
     */
    compareMoveSequences(pythonStructure, jsStructure) {
        const result = {
            match: true,
            differences: [],
            sequencesCompared: Math.min(pythonStructure.lines.length, jsStructure.lines.length)
        };

        for (let i = 0; i < Math.min(pythonStructure.lines.length, jsStructure.lines.length); i++) {
            const pythonMoves = this.normalizeMoveSequence(pythonStructure.lines[i].moves);
            const jsMoves = this.normalizeMoveSequence(jsStructure.lines[i].moves);

            if (pythonMoves !== jsMoves) {
                result.match = false;
                result.differences.push({
                    type: 'move_sequence_difference',
                    lineIndex: i,
                    python: pythonMoves,
                    javascript: jsMoves
                });
            }
        }

        return result;
    }

    /**
     * Normalize move sequence for comparison
     */
    normalizeMoveSequence(moves) {
        return moves
            .replace(/\s+/g, ' ')
            .replace(/\d+\.\s*/g, '')
            .trim()
            .toLowerCase();
    }

    /**
     * Generate detailed comparison report
     */
    generateReport(validationResult) {
        const { success, comparison, executionTimes } = validationResult;

        let report = `
# Cross-System Validation Report

## Summary
- **Overall Match**: ${success ? '✅ PASS' : '❌ FAIL'}
- **Files Compared**: ${comparison.statistics.filesCompared}
- **Successful Matches**: ${comparison.statistics.percentageMatches}
- **Structural Matches**: ${comparison.statistics.structuralMatches}

## Execution Times
- **Python System**: ${executionTimes.python}ms
- **JavaScript System**: ${executionTimes.javascript}ms
- **Performance Ratio**: ${(executionTimes.python / executionTimes.javascript).toFixed(2)}x

`;

        if (!success && comparison.differences.length > 0) {
            report += `
## Differences Found

`;
            for (const diff of comparison.differences) {
                report += `### ${diff.type}
`;
                if (diff.fileName) {
                    report += `- **File**: ${diff.fileName}
`;
                }
                if (diff.details) {
                    report += `- **Details**: ${JSON.stringify(diff.details, null, 2)}
`;
                }
                report += `
`;
            }
        }

        if (Object.keys(comparison.details).length > 0) {
            report += `
## File-by-File Analysis

`;
            for (const [fileName, details] of Object.entries(comparison.details)) {
                report += `### ${fileName}
- **Match**: ${details.match ? '✅' : '❌'}
- **Structural Match**: ${details.structuralMatch ? '✅' : '❌'}
- **Statistics**: ${JSON.stringify(details.statistics, null, 2)}

`;
            }
        }

        return report;
    }
}

module.exports = { CrossSystemValidator };