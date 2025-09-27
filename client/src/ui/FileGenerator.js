/**
 * FileGenerator.js - Client-side file generation and download functionality
 *
 * Handles PGN file creation and browser download functionality for the
 * BookBuilder client-side application.
 */

class FileGenerator {
    constructor() {
        this.generatedFiles = new Map();
        this.downloadHistory = [];
    }

    /**
     * Generate PGN content from analysis results
     */
    generatePGN(results, metadata = {}) {
        const {
            chapterName = 'Opening Analysis',
            author = 'BookBuilder',
            date = new Date().toISOString().split('T')[0]
        } = metadata;

        let pgnContent = '';

        // Add header information
        pgnContent += `[Event "${chapterName}"]\n`;
        pgnContent += '[Site "BookBuilder Generated"]\n';
        pgnContent += `[Date "${date}"]\n`;
        pgnContent += '[Round "1"]\n';
        pgnContent += '[White "Analysis"]\n';
        pgnContent += '[Black "Analysis"]\n';
        pgnContent += '[Result "*"]\n';
        pgnContent += `[Annotator "${author}"]\n`;
        pgnContent += '[Generator "BookBuilder v1.0"]\n';

        if (metadata.opening) {
            pgnContent += `[Opening "${metadata.opening}"]\n`;
        }

        if (metadata.totalLines) {
            pgnContent += `[TotalLines "${metadata.totalLines}"]\n`;
        }

        pgnContent += '\n';

        // Add lines with analysis
        if (Array.isArray(results)) {
            results.forEach((line, index) => {
                pgnContent += this.formatPGNLine(line, index + 1);
                pgnContent += '\n\n';
            });
        } else if (results.finalLines) {
            results.finalLines.forEach((line, index) => {
                pgnContent += this.formatPGNLine(line, index + 1);
                pgnContent += '\n\n';
            });
        }

        return pgnContent;
    }

    /**
     * Format a single PGN line with annotations
     */
    formatPGNLine(line, lineNumber) {
        let formatted = `{ Line ${lineNumber} }\n`;

        // Add statistical information
        if (line.cumulativeLikelihood) {
            formatted += `{ Cumulative Likelihood: ${(line.cumulativeLikelihood * 100).toFixed(2)}% }\n`;
        }

        if (line.totalGames) {
            formatted += `{ Total Games: ${line.totalGames} }\n`;
        }

        if (line.winRate !== undefined) {
            formatted += `{ Win Rate: ${(line.winRate * 100).toFixed(1)}% }\n`;
        }

        // Format the moves
        let moves = line.pgn || '';

        // Add move quality annotations if available
        if (line.moveQualities) {
            moves = this.addMoveQualityAnnotations(moves, line.moveQualities);
        }

        formatted += moves;

        // Add final evaluation if available
        if (line.finalEvaluation) {
            formatted += ` { Final: ${line.finalEvaluation > 0 ? '+' : ''}${(line.finalEvaluation / 100).toFixed(2)} }`;
        }

        return formatted;
    }

    /**
     * Add move quality annotations to PGN
     */
    addMoveQualityAnnotations(pgnMoves, qualities) {
        if (!qualities || qualities.length === 0) {
            return pgnMoves;
        }

        const moves = pgnMoves.split(' ').filter(move => move.trim());
        const annotated = [];

        let qualityIndex = 0;

        for (let i = 0; i < moves.length; i++) {
            const move = moves[i];
            annotated.push(move);

            // Add quality annotation after the move
            if (qualityIndex < qualities.length) {
                const quality = qualities[qualityIndex];
                const annotation = this.getQualityAnnotation(quality);
                if (annotation) {
                    annotated.push(annotation);
                }
                qualityIndex++;
            }
        }

        return annotated.join(' ');
    }

    /**
     * Get PGN annotation for move quality
     */
    getQualityAnnotation(quality) {
        if (typeof quality === 'string') {
            switch (quality.toLowerCase()) {
            case 'excellent': return '!!';
            case 'good': return '!';
            case 'inaccuracy': return '?!';
            case 'mistake': return '?';
            case 'blunder': return '??';
            default: return '';
            }
        }

        // Handle numeric centipawn loss
        if (typeof quality === 'number') {
            if (quality <= 10) return '!';
            if (quality <= 25) return '';
            if (quality <= 50) return '?!';
            if (quality <= 100) return '?';
            return '??';
        }

        return '';
    }

    /**
     * Create a combined PGN file from multiple chapters
     */
    generateCombinedPGN(chapters) {
        let combinedContent = '';

        // Add overall header
        combinedContent += '[Event "Complete Opening Repertoire"]\n';
        combinedContent += '[Site "BookBuilder Generated"]\n';
        combinedContent += `[Date "${new Date().toISOString().split('T')[0]}"]\n`;
        combinedContent += '[Round "1"]\n';
        combinedContent += '[White "Repertoire"]\n';
        combinedContent += '[Black "Analysis"]\n';
        combinedContent += '[Result "*"]\n';
        combinedContent += '[Annotator "BookBuilder"]\n';
        combinedContent += `[TotalChapters "${chapters.length}"]\n`;
        combinedContent += '\n';

        // Add each chapter
        chapters.forEach((chapter, index) => {
            combinedContent += `{ ========== CHAPTER ${index + 1}: ${chapter.name} ========== }\n\n`;
            combinedContent += chapter.content;
            combinedContent += '\n\n';
        });

        return combinedContent;
    }

    /**
     * Download file to browser
     */
    downloadFile(content, filename, mimeType = null) {
        console.log(`💾 [FileGenerator] downloadFile called:`);
        console.log(`   Filename: ${filename}`);
        console.log(`   Content size: ${content.length} characters`);
        console.log(`   Requested MIME type: ${mimeType || 'auto-detect'}`);

        try {
            // Determine MIME type if not provided
            if (!mimeType) {
                if (filename.endsWith('.pgn')) {
                    mimeType = 'application/x-chess-pgn';
                } else if (filename.endsWith('.json')) {
                    mimeType = 'application/json';
                } else {
                    mimeType = 'text/plain';
                }
                console.log(`   Auto-detected MIME type: ${mimeType}`);
            }

            // Create blob
            console.log(`   Creating blob with MIME type: ${mimeType}`);
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            console.log(`   Blob URL created: ${url.substring(0, 50)}...`);

            // Create download link
            console.log(`   Creating download link element`);
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = filename;
            downloadLink.style.display = 'none';

            // Add to DOM, click, and remove
            console.log(`   Triggering download...`);
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            console.log(`   Download link cleaned up`);

            // Clean up object URL
            URL.revokeObjectURL(url);
            console.log(`   Blob URL revoked`);

            // Track download
            this.downloadHistory.push({
                filename,
                timestamp: new Date(),
                size: content.length,
                mimeType
            });

            const formattedSize = this.formatFileSize(content.length);
            console.log(`✅ [FileGenerator] Downloaded: ${filename} (${formattedSize})`);

            return { success: true, filename, size: content.length };

        } catch (error) {
            console.error(`❌ [FileGenerator] Download failed for ${filename}:`, error);
            throw new Error(`Failed to download ${filename}: ${error.message}`);
        }
    }

    /**
     * Download multiple files as a ZIP (simplified version)
     */
    async downloadMultipleFiles(files) {
        const results = [];

        for (const file of files) {
            try {
                const result = this.downloadFile(file.content, file.filename, file.mimeType);
                results.push(result);

                // Add small delay between downloads
                await this.sleep(500);

            } catch (error) {
                console.error(`Failed to download ${file.filename}:`, error);
                results.push({
                    success: false,
                    filename: file.filename,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Generate summary file with statistics
     */
    generateSummaryFile(results, processingTime) {
        const summary = {
            generationTime: new Date().toISOString(),
            processingTime: processingTime || 'Unknown',
            totalFiles: Array.isArray(results) ? results.length : Object.keys(results).length,
            files: []
        };

        if (Array.isArray(results)) {
            results.forEach((result, index) => {
                summary.files.push({
                    index: index + 1,
                    filename: result.filename || `Chapter_${index + 1}`,
                    lines: result.lines?.length || 0,
                    totalGames: result.totalGames || 0,
                    averageWinRate: result.averageWinRate || 0
                });
            });
        } else {
            Object.entries(results).forEach(([filename, content], index) => {
                const lines = this.countPGNLines(content);
                summary.files.push({
                    index: index + 1,
                    filename,
                    lines,
                    size: content.length
                });
            });
        }

        return JSON.stringify(summary, null, 2);
    }

    /**
     * Count lines in PGN content
     */
    countPGNLines(pgnContent) {
        if (!pgnContent) return 0;

        // Count occurrences of "{ Line N }" patterns
        const lineMatches = pgnContent.match(/\{\s*Line\s+\d+\s*\}/g);
        return lineMatches ? lineMatches.length : 0;
    }

    /**
     * Format file size for display
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Get download history
     */
    getDownloadHistory() {
        return this.downloadHistory;
    }

    /**
     * Clear download history
     */
    clearDownloadHistory() {
        this.downloadHistory = [];
    }

    /**
     * Validate PGN content
     */
    validatePGN(pgnContent) {
        const errors = [];

        if (!pgnContent || typeof pgnContent !== 'string') {
            errors.push('PGN content is empty or invalid');
            return { isValid: false, errors };
        }

        // Check for required headers
        const requiredHeaders = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];
        for (const header of requiredHeaders) {
            if (!pgnContent.includes(`[${header} `)) {
                errors.push(`Missing required header: ${header}`);
            }
        }

        // Check for basic move notation
        const movePattern = /\b[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?/;
        if (!movePattern.test(pgnContent)) {
            errors.push('No valid chess moves found');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // ==================== TREE/CONFIG FUNCTIONALITY ====================
    // (Moved from PgnGenerator for proper separation of concerns)

    /**
     * Generate PGN with tree structure or individual lines based on config
     * @param {Array} lines - Array of line objects with moves and statistics
     * @param {string} chapterName - Base name for the chapter
     * @param {Object} config - Output configuration
     * @param {Object} pgnGenerator - Simple PgnGenerator instance
     * @returns {string} Formatted PGN content
     */
    async generateConfiguredPGN(lines, chapterName, config, pgnGenerator) {
        console.log('\n📁 [FileGenerator] generateConfiguredPGN() - FORMATTING ENGINE CALLED');
        console.log('   🎯 Handling SORTING + FORMATTING (moved from BookBuilder)');
        console.log('   📊 Received config:', {
            outputFormat: config.outputFormat,
            pgnConfig: config.pgnConfig,
            LONGTOSHORT: config.LONGTOSHORT,
            configKeys: Object.keys(config)
        });
        console.log('   📊 Input lines:', { linesCount: lines?.length || 'MISSING', chapterName });

        // Handle empty lines array
        if (!lines || lines.length === 0) {
            console.log('   ❌ Empty lines array, returning empty string');
            return '';
        }

        // Sort lines by probability (moved from BookBuilder for consistent behavior)
        console.log('   📈 Sorting lines by probability...');
        const sortedLines = this.sortLinesByProbability(lines);
        console.log('   🔝 Top 3 lines by probability:', sortedLines.slice(0, 3).map(line => ({
            pgn: line.pgn,
            likelihood: line.cumulativeLikelihood?.toFixed(6)
        })));

        // Apply LONGTOSHORT reversal if configured
        let finalLines = sortedLines;
        if (config.LONGTOSHORT) {
            console.log('   🔄 Applying LONGTOSHORT reversal');
            finalLines = [...sortedLines].reverse();
        }

        // Route to appropriate generation method based on configuration
        if (config.outputFormat === 'tree') {
            console.log('   🌳 → Taking TREE generation path');
            return await this.generateTreePGN(finalLines, chapterName, config, pgnGenerator);
        } else {
            console.log('   📋 → Taking INDIVIDUAL lines path');
            return await this.generateIndividualLinesPGN(finalLines, chapterName, pgnGenerator);
        }
    }

    /**
     * Generate PGN with tree structure using variations
     * @param {Array} lines - Array of line objects with moves and statistics
     * @param {string} chapterName - Base name for the chapter
     * @param {Object} config - Configuration object
     * @param {Object} pgnGenerator - Simple PgnGenerator instance
     * @returns {string} Tree-structured PGN content
     */
    async generateTreePGN(lines, chapterName, config, pgnGenerator) {
        console.log(`📋 [FileGenerator] Generating tree-structured PGN for ${lines.length} lines`);

        // Build tree structure from lines
        const variationTree = this.buildVariationTree(lines);

        // Use simple PgnGenerator for the event header
        const eventHeader = `[Event "${chapterName} Line 1"]`;

        // Generate tree PGN with variations and endBlock annotations
        const treePgn = await this.generateTreeMoveSequence(variationTree);
        
        return `${eventHeader}\n\n${treePgn}`.trim();
    }

    /**
     * Generate individual lines PGN using simple PgnGenerator
     * @param {Array} lines - Array of line objects
     * @param {string} chapterName - Chapter name
     * @param {Object} pgnGenerator - Simple PgnGenerator instance
     * @returns {string} Individual lines PGN
     */
    async generateIndividualLinesPGN(lines, chapterName, pgnGenerator) {
        console.log(`📋 [FileGenerator] Generating individual lines PGN for ${lines.length} lines`);

        let pgnContent = '';
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNumber = i + 1;
            const eventName = `${chapterName} Line ${lineNumber}`;

            // Use simple PgnGenerator for individual lines
            const linePgn = await pgnGenerator.generateSingleLine(line, eventName);
            pgnContent += linePgn + '\n\n';
        }

        return pgnContent.trim();
    }

    /**
     * Build a tree structure from multiple lines for variation-based PGN
     * @param {Array} lines - Array of line objects (should already be sorted by probability)
     * @returns {Object} Tree structure with main line and variations
     */
    buildVariationTree(lines) {
        console.log(`🌳 [FileGenerator] Building variation tree from ${lines.length} lines`);

        if (lines.length === 0) {
            return { mainLine: '', variations: [] };
        }

        // Deduplicate lines at tree level (critical for preventing duplicate variations)
        const deduplicatedLines = this.deduplicateTreeLines(lines);
        console.log(`   🧹 Tree-level deduplication: ${lines.length} → ${deduplicatedLines.length} unique lines`);

        // Lines should already be sorted by probability (highest first)
        // Use highest probability line as main line (much better than longest!)
        const mainLine = deduplicatedLines[0];
        const variations = deduplicatedLines.slice(1);

        console.log(`   🎯 Main line (highest probability): ${mainLine.pgn}`);
        console.log(`   📊 Main line likelihood: ${mainLine.cumulativeLikelihood?.toFixed(6)}`);
        console.log(`   🌿 Variations: ${variations.length}`);

        return {
            mainLine: mainLine,
            variations: variations,
            allLines: deduplicatedLines
        };
    }

    /**
     * Deduplicate lines at tree level by PGN (simple duplicate removal)
     * @param {Array} lines - Array of line objects
     * @returns {Array} Deduplicated lines
     */
    deduplicateTreeLines(lines) {
        const seen = new Set();
        const deduplicated = [];

        for (const line of lines) {
            if (!seen.has(line.pgn)) {
                seen.add(line.pgn);
                deduplicated.push(line);
            }
        }

        return deduplicated;
    }

    /**
     * Format combined annotations for tree structure
     * @param {Array} lines - Array of line objects
     * @returns {string} Combined statistics annotation
     */
    formatCombinedAnnotations(lines) {
        let annotations = '\n{Move playrates:';

        // Collect all unique moves and their playrates from all lines
        const movePlayrates = new Map();

        for (const line of lines) {
            if (line.likelihoodPath) {
                for (const pathMove of line.likelihoodPath) {
                    if (pathMove.san && pathMove.playrate !== undefined) {
                        // Use the highest playrate if move appears in multiple lines
                        const existing = movePlayrates.get(pathMove.san);
                        if (!existing || pathMove.playrate > existing) {
                            movePlayrates.set(pathMove.san, pathMove.playrate);
                        }
                    }
                }
            }
        }

        // Add move playrates
        for (const [san, playrate] of movePlayrates) {
            const playratePercent = (playrate * 100).toFixed(2);
            annotations += `\n+${playratePercent}%\t${san}`;
        }

        // Add combined line statistics
        let totalCumulativePlayrate = 0;
        let totalGames = 0;
        let totalWins = 0;

        for (const line of lines) {
            if (line.cumulativeLikelihood) {
                totalCumulativePlayrate += line.cumulativeLikelihood;
            }
            // Use statistics object if available, otherwise fallback to direct properties
            const stats = line.statistics || line;
            if (stats.totalGames) totalGames += stats.totalGames;
            if (stats.winrate && stats.totalGames) {
                totalWins += stats.winrate * stats.totalGames;
            } else if (stats.winRate && stats.totalGames) {
                totalWins += stats.winRate * stats.totalGames;
            }
        }

        if (totalCumulativePlayrate > 0) {
            const avgCumulative = (totalCumulativePlayrate / lines.length * 100).toFixed(2);
            annotations += `\nLine cumulative playrate: +${avgCumulative}%`;
        }

        if (totalGames > 0) {
            const avgWinRate = totalWins / totalGames;
            const winratePercent = (avgWinRate * 100).toFixed(2);
            const gamesFormatted = totalGames.toLocaleString();

            annotations += `\nLine winrate (combined): +${winratePercent}% over ${gamesFormatted} games`;
        }

        annotations += '\n}';
        return annotations;
    }

    /**
     * Generate PGN with inline annotations (delegates to individual lines for now)
     * @param {Array} lines - Array of line objects
     * @param {string} chapterName - Chapter name
     * @param {Object} config - Configuration object
     * @param {Object} pgnGenerator - Simple PgnGenerator instance
     * @returns {string} PGN with inline annotations
     */


    /**
     * Generate tree move sequence with proper PGN variation syntax
     * @param {Object} variationTree - Tree structure with main line and variations
     * @returns {string} Tree move sequence with (variation) notation
     */
    async generateTreeMoveSequence(variationTree) {
        console.log(`🌳 [FileGenerator] generateTreeMoveSequence() - Building PGN tree`);

        if (!variationTree.mainLine || !variationTree.mainLine.pgn) {
            console.log(`   ❌ No main line found`);
            return '';
        }

        const mainLine = variationTree.mainLine;
        const variations = variationTree.variations || [];

        console.log(`   📋 Main line: ${mainLine.pgn}`);
        console.log(`   🌿 Processing ${variations.length} variations`);

        // Parse main line moves using chess.js
        const mainMoves = await this.parsePGNMoves(mainLine.pgn);
        if (mainMoves.length === 0) {
            console.log(`   ❌ Could not parse main line moves`);
            return mainLine.pgn; // Fallback to original PGN
        }

        // Build the tree structure with divergence analysis
        const treeStructure = await this.buildMoveTree(mainMoves, variations);

        // Generate final PGN with inline variations
        const treePGN = this.generateTreePGNFromStructure(treeStructure, mainLine);

        return treePGN;
    }

    /**
     * Parse PGN string to extract clean move array using chess.js
     * @param {string} pgn - PGN moves string (with or without headers)
     * @returns {Array} - Clean move array in SAN notation
     */
    async parsePGNMoves(pgn) {
        try {
            console.log(`   🔍 Parsing PGN with chess.js: "${pgn.substring(0, 50)}..."`);

            // Import chess.js for robust PGN parsing
            const { Chess } = await import('../../node_modules/chess.js/dist/esm/chess.js');
            const chess = new Chess();

            // Load the PGN - chess.js handles headers, formatting, etc.
            chess.loadPgn(pgn); // loadPgn returns undefined, not boolean - chess.js API quirk

            // Get move history in SAN notation - this is the robust way!
            const moves = chess.history();
            if (moves.length === 0) {
                console.warn(`   ⚠️  Chess.js loaded PGN but extracted no moves`);
                return [];
            }

            console.log(`   ✅ Chess.js extracted ${moves.length} moves:`, moves);

            return moves;

        } catch (error) {
            console.error(`   ❌ Error parsing PGN with chess.js: ${error.message}`);
            return [];
        }
    }

    /**
     * Build nested variation tree from variations (new nested approach)
     * Creates proper PGN-style nested variations like: 1. e4 e5 (1... c5 2. Nf3 d6) 2. Nf3
     * @param {Array} variations - Array of variation line objects
     * @param {Array} mainMoves - Main line moves for reference
     * @returns {Object} - Nested variation tree structure
     */
    async buildNestedVariationTree(variations, mainMoves) {
        console.log(`   🌳 Building nested variation tree from ${variations.length} variations`);

        // Parse all variations into move sequences with divergence points
        const parsedVariations = [];
        for (const variation of variations) {
            try {
                const moves = await this.parsePGNMoves(variation.pgn);
                if (moves.length > 0) {
                    const divergencePoint = this.findDivergencePoint(mainMoves, moves);
                    if (divergencePoint !== -1) {
                        parsedVariations.push({
                            ...variation,
                            moves: moves,
                            divergencePoint: divergencePoint,
                            divergentMove: moves[divergencePoint],
                            continuation: moves.slice(divergencePoint + 1)
                        });
                    }
                }
            } catch (error) {
                console.warn(`Error parsing variation: ${error.message}`);
            }
        }

        // Group variations by divergence point
        const divergenceGroups = new Map();
        for (const variation of parsedVariations) {
            const point = variation.divergencePoint;
            if (!divergenceGroups.has(point)) {
                divergenceGroups.set(point, []);
            }
            divergenceGroups.get(point).push(variation);
        }

        // Build nested structure for each divergence point
        const nestedDivergences = [];
        for (const [point, variations] of divergenceGroups) {
            const nestedStructure = this.buildNestedStructureAtPoint(variations, point);
            nestedDivergences.push({
                position: point,
                nested: nestedStructure
            });
        }

        // Sort by position
        nestedDivergences.sort((a, b) => a.position - b.position);

        console.log(`   ✅ Built nested tree with ${nestedDivergences.length} divergence points`);
        return nestedDivergences;
    }

    /**
     * Build nested structure at a specific divergence point
     * @param {Array} variations - Variations at this point
     * @param {number} divergencePoint - The divergence position
     * @returns {Array} - Nested variation structure
     */
    buildNestedStructureAtPoint(variations, divergencePoint) {
        // Group by first divergent move
        const moveGroups = new Map();

        for (const variation of variations) {
            const move = variation.divergentMove;
            if (!moveGroups.has(move)) {
                moveGroups.set(move, []);
            }
            moveGroups.get(move).push(variation);
        }

        // Build nested structure for each move group
        const nestedMoves = [];
        for (const [move, moveVariations] of moveGroups) {
            // Separate variations that end here vs continue further
            const endingHere = moveVariations.filter(v => v.continuation.length === 0);
            const continuingFurther = moveVariations.filter(v => v.continuation.length > 0);

            const moveNode = {
                move: move,
                stats: endingHere.length > 0 ? (endingHere[0].statistics || endingHere[0].stats || {}) : null,
                likelihoodPath: endingHere.length > 0 ? endingHere[0].likelihoodPath : null,
                cumulativeLikelihood: endingHere.length > 0 ? endingHere[0].cumulativeLikelihood : null,
                subVariations: []
            };

            // If there are continuing variations, build sub-structure recursively
            if (continuingFurther.length > 0) {
                moveNode.subVariations = this.buildSubVariationStructure(continuingFurther, 0);
            }

            nestedMoves.push(moveNode);
        }

        return nestedMoves;
    }

    /**
     * Build sub-variation structure recursively
     * @param {Array} variations - Continuing variations
     * @param {number} contDepth - Depth in continuation
     * @returns {Array} - Sub-variation structure
     */
    buildSubVariationStructure(variations, contDepth) {
        if (variations.length === 0) return [];

        // Group by next move in continuation
        const groups = new Map();

        for (const variation of variations) {
            if (variation.continuation.length <= contDepth) continue;

            const nextMove = variation.continuation[contDepth];
            if (!groups.has(nextMove)) {
                groups.set(nextMove, []);
            }
            groups.get(nextMove).push(variation);
        }

        // Build sub-variation nodes
        const subVars = [];
        for (const [move, groupVars] of groups) {
            const endingAtThisDepth = groupVars.filter(v => v.continuation.length === contDepth + 1);
            const continuingDeeper = groupVars.filter(v => v.continuation.length > contDepth + 1);

            const subVar = {
                move: move,
                stats: endingAtThisDepth.length > 0 ? (endingAtThisDepth[0].statistics || endingAtThisDepth[0].stats || {}) : null,
                subVariations: continuingDeeper.length > 0 ?
                    this.buildSubVariationStructure(continuingDeeper, contDepth + 1) : []
            };

            subVars.push(subVar);
        }

        return subVars;
    }

    /**
     * Build move tree structure by finding variation divergence points
     * @param {Array} mainMoves - Main line moves array ["e4", "e5", "Nf3", "Nc6", "Bc4", "f5", "d3"]
     * @param {Array} variations - Array of variation line objects
     * @returns {Object} - Tree structure with divergence points and statistics
     */
    async buildMoveTree(mainMoves, variations) {
        console.log(`   🔨 Building move tree from main line (${mainMoves.length} moves) and ${variations.length} variations`);

        // Build nested variation tree for proper consolidation
        const nestedDivergences = await this.buildNestedVariationTree(variations, mainMoves);

        // Convert nested structure to the format expected by generateTreePGNFromStructure
        const divergences = [];

        for (const nestedDiv of nestedDivergences) {
            const divergenceGroup = {
                position: nestedDiv.position,
                mainMove: mainMoves[nestedDiv.position],
                variations: [],
                nestedStructure: nestedDiv.nested // Keep nested structure for new formatter
            };

            // Convert nested structure to flat variations for backward compatibility
            // But also preserve the nested structure for the new formatter
            this.flattenNestedStructure(nestedDiv.nested, divergenceGroup.variations);

            divergences.push(divergenceGroup);
        }

        console.log(`   🌳 Tree structure complete: ${divergences.length} divergence points`);

        return {
            mainMoves: mainMoves,
            divergences: divergences,
            hasNestedStructure: true // Flag to use new formatter
        };
    }

    /**
     * Flatten nested structure for backward compatibility (while preserving nested for new formatter)
     * @param {Array} nestedMoves - Nested move structure
     * @param {Array} flatVariations - Output array for flat variations
     */
    flattenNestedStructure(nestedMoves, flatVariations) {
        for (const moveNode of nestedMoves) {
            // Add this move as a variation
            const variation = {
                move: moveNode.move,
                continuation: this.extractContinuation(moveNode.subVariations),
                stats: moveNode.stats || {},
                likelihoodPath: moveNode.likelihoodPath || [],
                cumulativeLikelihood: moveNode.cumulativeLikelihood || 0,
                isNested: true // Flag that this came from nested structure
            };

            flatVariations.push(variation);

            // Recursively flatten sub-variations (they'll get added as separate variations)
            if (moveNode.subVariations && moveNode.subVariations.length > 0) {
                this.flattenNestedStructure(moveNode.subVariations, flatVariations);
            }
        }
    }

    /**
     * Extract continuation moves from sub-variations
     * @param {Array} subVariations - Sub-variation nodes
     * @returns {Array} - Array of continuation moves
     */
    extractContinuation(subVariations) {
        const continuation = [];

        // Take the first sub-variation's moves as continuation (simplified approach)
        if (subVariations && subVariations.length > 0) {
            const firstSub = subVariations[0];
            continuation.push(firstSub.move);

            // Add moves from deeper levels (limit to 3-4 moves for readability)
            const deeperContinuation = this.extractContinuation(firstSub.subVariations);
            continuation.push(...deeperContinuation.slice(0, 2));
        }

        return continuation;
    }

    /**
     * Generate PGN with inline variation annotations from tree structure
     * @param {Object} treeStructure - Tree structure from buildMoveTree
     * @param {Object} mainLineStats - Statistics for the main line
     * @returns {string} - Formatted PGN with inline variations
     */
    generateTreePGNFromStructure(treeStructure, mainLineStats) {
        console.log('🎯 Generating PGN tree format from structure');

        const { mainMoves, divergences, hasNestedStructure } = treeStructure;

        // Use new nested formatter if available
        if (hasNestedStructure) {
            return this.generateNestedPGNFromStructure(treeStructure, mainLineStats);
        }

        // Fallback to old formatter for backward compatibility
        return this.generateFlatPGNFromStructure(treeStructure, mainLineStats);
    }

    /**
     * Generate proper nested PGN with sub-variations
     * @param {Object} treeStructure - Tree structure with nested data
     * @param {Object} mainLineStats - Main line statistics
     * @returns {string} - Nested PGN format
     */
    generateNestedPGNFromStructure(treeStructure, mainLineStats) {
        console.log('🌳 Generating nested PGN with proper sub-variations');

        const { mainMoves, divergences } = treeStructure;
        let pgnParts = [];
        let moveNumber = 1;
        let isWhiteMove = true;

        for (let i = 0; i < mainMoves.length; i++) {
            // Add move number for white moves
            if (isWhiteMove) {
                pgnParts.push(`${moveNumber}.`);
            }

            // Add the main move
            pgnParts.push(mainMoves[i]);

            // Check if there are variations at this position
            const divergenceAtThisMove = divergences.find(d => d.position === i);
            if (divergenceAtThisMove && divergenceAtThisMove.nestedStructure) {
                console.log(`   📝 Adding nested variations after move ${i + 1} (${mainMoves[i]})`);

                // Generate nested variations using the new structure
                const nestedVariations = this.generateNestedVariationsAtPosition(
                    divergenceAtThisMove.nestedStructure,
                    moveNumber,
                    isWhiteMove
                );

                pgnParts.push(...nestedVariations);
            }

            // Update move tracking
            if (isWhiteMove) {
                isWhiteMove = false;
            } else {
                isWhiteMove = true;
                moveNumber++;
            }
        }

        // Add main line statistics
        if (mainLineStats) {
            const mainStatsAnnotation = this.generateStatsAnnotation(mainLineStats, 'Main');
            if (mainStatsAnnotation) {
                pgnParts.push(mainStatsAnnotation);
            }
        }

        pgnParts.push('*'); // Add game termination

        const result = pgnParts.join(' ');
        console.log('✅ Generated nested PGN:', result.substring(0, 150) + '...');
        return result;
    }

    /**
     * Generate nested variations at a specific position
     * @param {Array} nestedMoves - Nested move structure
     * @param {number} currentMoveNumber - Current move number
     * @param {boolean} isWhiteMove - Whether current position is white to move
     * @returns {Array} - Array of PGN parts for variations
     */
    generateNestedVariationsAtPosition(nestedMoves, currentMoveNumber, isWhiteMove) {
        const variationParts = [];

        for (const moveNode of nestedMoves) {
            // Build the variation string with correct move numbering
            let variationStr = [`(${currentMoveNumber}${isWhiteMove ? '.' : '...'} ${moveNode.move}`];

            // Add continuation moves and sub-variations
            if (moveNode.subVariations && moveNode.subVariations.length > 0) {
                const subVarParts = this.generateContinuationMoves(
                    moveNode.subVariations,
                    currentMoveNumber,
                    isWhiteMove
                );
                variationStr.push(...subVarParts);
            }

            // Add statistics for this variation
            const statsAnnotation = this.generateStatsAnnotation(moveNode);
            if (statsAnnotation) {
                variationStr.push(statsAnnotation);
            }

            variationStr.push(')');
            variationParts.push(variationStr.join(' '));
        }

        return variationParts;
    }

    /**
     * Generate continuation moves with proper nested sub-variations
     * @param {Array} subVariations - Sub-variation nodes
     * @param {number} baseMoveNumber - Base move number
     * @param {boolean} baseIsWhite - Whether base position is white to move
     * @returns {Array} - Continuation PGN parts
     */
    generateContinuationMoves(subVariations, baseMoveNumber, baseIsWhite) {
        const parts = [];
        let currentMoveNumber = baseIsWhite ? baseMoveNumber + 1 : baseMoveNumber;
        let isWhiteMove = !baseIsWhite;

        // If there's only one sub-variation, just continue the line
        if (subVariations.length === 1) {
            const subVar = subVariations[0];

            // Add the move with proper numbering
            if (isWhiteMove) {
                parts.push(`${currentMoveNumber}.`);
            }
            parts.push(subVar.move);

            // Recursively add deeper continuations
            if (subVar.subVariations && subVar.subVariations.length > 0) {
                const deeperParts = this.generateContinuationMoves(
                    subVar.subVariations,
                    currentMoveNumber,
                    isWhiteMove
                );
                parts.push(...deeperParts);
            }
        } else {
            // Multiple sub-variations - need to create nested structure
            // Add the first move as continuation
            const firstSub = subVariations[0];
            if (isWhiteMove) {
                parts.push(`${currentMoveNumber}.`);
            }
            parts.push(firstSub.move);

            // Add other variations as nested
            for (let i = 1; i < subVariations.length; i++) {
                const subVar = subVariations[i];
                const nestedPart = `(${currentMoveNumber}${isWhiteMove ? '.' : '...'} ${subVar.move}`;

                // Add any deeper continuations for this nested variation
                if (subVar.subVariations && subVar.subVariations.length > 0) {
                    const deeperParts = this.generateContinuationMoves(
                        subVar.subVariations,
                        currentMoveNumber,
                        isWhiteMove
                    );
                    parts.push(`${nestedPart} ${deeperParts.join(' ')})`)
                } else {
                    parts.push(`${nestedPart})`);
                }
            }

            // Continue with the first variation's continuations
            if (firstSub.subVariations && firstSub.subVariations.length > 0) {
                const deeperParts = this.generateContinuationMoves(
                    firstSub.subVariations,
                    currentMoveNumber,
                    isWhiteMove
                );
                parts.push(...deeperParts);
            }
        }

        return parts;
    }

    /**
     * Generate sub-variations recursively
     * @param {Array} subVariations - Sub-variation nodes
     * @param {number} moveNumber - Current move number
     * @param {boolean} isWhiteMove - Whether white to move
     * @param {number} depth - Current depth (for limiting)
     * @returns {Array} - Sub-variation PGN parts
     */
    generateSubVariations(subVariations, moveNumber, isWhiteMove, depth) {
        if (depth > 3 || !subVariations || subVariations.length === 0) {
            return []; // Limit depth to keep PGN readable
        }

        const subParts = [];

        for (const subVar of subVariations) {
            // Add move number and move
            if (isWhiteMove) {
                subParts.push(`${moveNumber}.`);
            }
            subParts.push(subVar.move);

            // Add nested sub-variations
            if (subVar.subVariations && subVar.subVariations.length > 0) {
                const nestedParts = [`(${subVar.subVariations.map(sv =>
                    `${!isWhiteMove ? moveNumber + 1 : moveNumber}${!isWhiteMove ? '.' : '...'} ${sv.move}`
                ).join(' ')}`];

                nestedParts.push(')');
                subParts.push(nestedParts.join(' '));
            }

            // Update for next iteration
            if (isWhiteMove) {
                isWhiteMove = false;
            } else {
                isWhiteMove = true;
                moveNumber++;
            }
        }

        return subParts;
    }

    /**
     * Generate statistics annotation for a move/variation
     * @param {Object} moveNode - Move node with statistics
     * @param {string} prefix - Prefix for stats (optional)
     * @returns {string} - Statistics annotation
     */
    generateStatsAnnotation(moveNode, prefix = '') {
        if (!moveNode) return '';

        const stats = moveNode.stats || moveNode.statistics || moveNode;
        const games = stats.totalGames || stats.games || 0;
        const winrate = stats.winrate || stats.probability || 0;

        if (games === 0) return '';

        const detailedStats = [];

        // Add cumulative likelihood
        if (moveNode.cumulativeLikelihood) {
            detailedStats.push(`${(moveNode.cumulativeLikelihood * 100).toFixed(1)}%`);
        }

        // Add winrate
        const winratePercent = (winrate * 100).toFixed(1);
        const gamesFormatted = games.toLocaleString();
        detailedStats.push(`${prefix ? prefix + ' ' : ''}+${winratePercent}% (${gamesFormatted})`);

        return detailedStats.length > 0 ? `{${detailedStats.join(', ')}}` : '';
    }

    /**
     * Generate flat PGN (backward compatibility)
     */
    generateFlatPGNFromStructure(treeStructure, mainLineStats) {
        // Keep the original implementation for backward compatibility
        const { mainMoves, divergences } = treeStructure;
        let pgnParts = [];
        let moveNumber = 1;
        let isWhiteMove = true;

        for (let i = 0; i < mainMoves.length; i++) {
            if (isWhiteMove) {
                pgnParts.push(`${moveNumber}.`);
            }
            pgnParts.push(mainMoves[i]);

            const divergenceAtThisMove = divergences.find(d => d.position === i);
            if (divergenceAtThisMove) {
                for (const variation of divergenceAtThisMove.variations) {
                    if (variation.isNested) continue; // Skip nested variations in flat mode

                    let variationParts = [`(${variation.move}`];

                    if (variation.continuation && variation.continuation.length > 0) {
                        let contMoveNum = isWhiteMove ? moveNumber : moveNumber + 1;
                        let contIsWhite = !isWhiteMove;

                        for (const contMove of variation.continuation.slice(0, 3)) {
                            if (contIsWhite) {
                                variationParts.push(`${contMoveNum}.`);
                            }
                            variationParts.push(contMove);
                            contIsWhite = !contIsWhite;
                            if (contIsWhite) contMoveNum++;
                        }
                    }

                    const statsAnnotation = this.generateStatsAnnotation(variation);
                    if (statsAnnotation) {
                        variationParts.push(statsAnnotation);
                    }

                    variationParts.push(')');
                    pgnParts.push(variationParts.join(' '));
                }
            }

            if (isWhiteMove) {
                isWhiteMove = false;
            } else {
                isWhiteMove = true;
                moveNumber++;
            }
        }

        if (mainLineStats) {
            const mainStatsAnnotation = this.generateStatsAnnotation(mainLineStats, 'Main');
            if (mainStatsAnnotation) {
                pgnParts.push(mainStatsAnnotation);
            }
        }

        pgnParts.push('*');
        return pgnParts.join(' ');
    }

    /**
     * Combine statistics from multiple identical variations
     * @param {Array} variations - Array of identical variations with statistics
     * @returns {Object} - Combined statistics object
     */
    combineStatistics(variations) {
        if (variations.length === 1) {
            return variations[0].statistics || variations[0].stats || {};
        }

        const combined = {
            totalGames: 0,
            wins: 0,
            draws: 0,
            losses: 0
        };

        let totalCumulativeLikelihood = 0;

        for (const variation of variations) {
            const stats = variation.statistics || variation.stats || {};

            if (stats.totalGames) {
                combined.totalGames += stats.totalGames;
            }
            if (stats.wins) combined.wins += stats.wins;
            if (stats.draws) combined.draws += stats.draws;
            if (stats.losses) combined.losses += stats.losses;

            if (variation.cumulativeLikelihood) {
                totalCumulativeLikelihood += variation.cumulativeLikelihood;
            }
        }

        // Calculate combined win rate
        if (combined.totalGames > 0) {
            combined.winrate = combined.wins / combined.totalGames;
        }

        // Average cumulative likelihood
        if (totalCumulativeLikelihood > 0) {
            combined.averageCumulativeLikelihood = totalCumulativeLikelihood / variations.length;
        }

        return combined;
    }

    /**
     * Find the first position where two move arrays diverge
     * @param {Array} mainMoves - Main line moves
     * @param {Array} varMoves - Variation moves
     * @returns {number} - Index of first divergence, or -1 if no divergence
     */
    findDivergencePoint(mainMoves, varMoves) {
        const minLength = Math.min(mainMoves.length, varMoves.length);

        for (let i = 0; i < minLength; i++) {
            if (mainMoves[i] !== varMoves[i]) {
                return i;
            }
        }

        // If one line is longer than the other, divergence is at the end of the shorter line
        if (mainMoves.length !== varMoves.length) {
            return minLength;
        }

        // Lines are identical
        return -1;
    }

    /**
     * Sort lines by consecutive move probabilities (moved from BookBuilder)
     * @param {Array} lines - Array of line objects
     * @returns {Array} - Sorted lines (highest probability first)
     */
    sortLinesByProbability(lines) {
        return lines.sort((a, b) => {
            const aProbs = a.likelihoodPath.map(move => move.playrate);
            const bProbs = b.likelihoodPath.map(move => move.playrate);

            for (let i = 0; i < Math.min(aProbs.length, bProbs.length); i++) {
                if (aProbs[i] !== bProbs[i]) {
                    return bProbs[i] - aProbs[i]; // Descending order (highest probability first)
                }
            }

            return bProbs.length - aProbs.length;
        });
    }

    /**
     * Display PGN content in browser with copy functionality
     * @param {string} content - PGN content to display
     * @param {string} chapterName - Name of the chapter/repertoire
     * @param {Object} metadata - Additional metadata for statistics
     * @returns {Object} Display result with success status
     */
    displayPGN(content, chapterName = 'Chess Repertoire', metadata = {}) {
        console.log(`📋 [FileGenerator] displayPGN called:`);
        console.log(`   Chapter: ${chapterName}`);
        console.log(`   Content size: ${content.length} characters`);
        console.log(`   Metadata:`, metadata);

        try {
            // Get display container elements
            const displayContainer = document.getElementById('pgn-display-container');
            const pgnContent = document.getElementById('pgn-content');
            const statsContainer = document.getElementById('pgn-display-stats');
            const copyBtn = document.getElementById('copy-pgn-btn');
            const downloadBtn = document.getElementById('download-pgn-btn');

            if (!displayContainer || !pgnContent) {
                throw new Error('PGN display elements not found in DOM');
            }

            // Set the PGN content
            pgnContent.textContent = content;

            // Generate and display statistics
            if (statsContainer) {
                this.populateDisplayStats(statsContainer, content, metadata);
            }

            // Setup copy functionality
            if (copyBtn) {
                this.setupCopyButton(copyBtn, content);
            }

            // Setup download functionality (fallback option)
            if (downloadBtn) {
                this.setupDownloadButton(downloadBtn, content, chapterName);
            }

            // Show the display container
            displayContainer.style.display = 'block';

            // Hide other containers
            this.hideOtherContainers(['success-container', 'error-container']);

            // Scroll to display
            displayContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

            console.log(`✅ [FileGenerator] PGN displayed successfully`);

            return {
                success: true,
                chapterName,
                contentLength: content.length,
                displayMethod: 'browser'
            };

        } catch (error) {
            console.error(`❌ [FileGenerator] Display failed:`, error);
            throw new Error(`Failed to display PGN: ${error.message}`);
        }
    }

    /**
     * Populate statistics in the PGN display
     * @param {HTMLElement} statsContainer - Container for statistics
     * @param {string} content - PGN content
     * @param {Object} metadata - Metadata with statistics
     */
    populateDisplayStats(statsContainer, content, metadata) {
        const stats = [];

        // Count lines
        const lineCount = this.countPGNLines(content);
        if (lineCount > 0) {
            stats.push(`<div class="pgn-stat-item">📈 <span class="pgn-stat-value">${lineCount}</span> lines generated</div>`);
        }

        // Content size
        const formattedSize = this.formatFileSize(content.length);
        stats.push(`<div class="pgn-stat-item">📄 <span class="pgn-stat-value">${formattedSize}</span> total content</div>`);

        // Processing time if available
        if (metadata.processingTime) {
            stats.push(`<div class="pgn-stat-item">⏱️ <span class="pgn-stat-value">${metadata.processingTime}</span> processing time</div>`);
        }

        // Generation timestamp
        const timestamp = new Date().toLocaleString();
        stats.push(`<div class="pgn-stat-item">🕒 Generated <span class="pgn-stat-value">${timestamp}</span></div>`);

        // Total games if available
        if (metadata.totalGames) {
            const formattedGames = metadata.totalGames.toLocaleString();
            stats.push(`<div class="pgn-stat-item">🎯 <span class="pgn-stat-value">${formattedGames}</span> games analyzed</div>`);
        }

        statsContainer.innerHTML = stats.join('');
    }

    /**
     * Setup copy button functionality
     * @param {HTMLElement} copyBtn - Copy button element
     * @param {string} content - Content to copy
     */
    setupCopyButton(copyBtn, content) {
        // Remove existing event listeners
        const newCopyBtn = copyBtn.cloneNode(true);
        copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);

        newCopyBtn.addEventListener('click', async () => {
            try {
                console.log(`📋 [FileGenerator] Copying PGN to clipboard...`);

                // Use modern clipboard API if available
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(content);
                } else {
                    // Fallback for older browsers
                    this.fallbackCopyToClipboard(content);
                }

                // Visual feedback
                this.showCopySuccess(newCopyBtn);

                console.log(`✅ [FileGenerator] PGN copied to clipboard successfully`);

            } catch (error) {
                console.error(`❌ [FileGenerator] Copy failed:`, error);
                this.showCopyError(newCopyBtn, error.message);
            }
        });
    }

    /**
     * Setup download button functionality
     * @param {HTMLElement} downloadBtn - Download button element
     * @param {string} content - Content to download
     * @param {string} filename - Base filename
     */
    setupDownloadButton(downloadBtn, content, filename) {
        // Remove existing event listeners
        const newDownloadBtn = downloadBtn.cloneNode(true);
        downloadBtn.parentNode.replaceChild(newDownloadBtn, downloadBtn);

        newDownloadBtn.addEventListener('click', () => {
            try {
                const pgnFilename = `${filename.replace(/[^a-zA-Z0-9]/g, '_')}.pgn`;
                this.downloadFile(content, pgnFilename, 'application/x-chess-pgn');
            } catch (error) {
                console.error(`❌ [FileGenerator] Download failed:`, error);
            }
        });
    }

    /**
     * Fallback copy method for older browsers
     * @param {string} content - Content to copy
     */
    fallbackCopyToClipboard(content) {
        const textArea = document.createElement('textarea');
        textArea.value = content;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            document.execCommand('copy');
        } finally {
            document.body.removeChild(textArea);
        }
    }

    /**
     * Show copy success feedback
     * @param {HTMLElement} button - Button to show feedback on
     */
    showCopySuccess(button) {
        const originalText = button.innerHTML;

        button.classList.add('copy-success');
        button.innerHTML = '✅ Copied!';

        setTimeout(() => {
            button.classList.remove('copy-success');
            button.innerHTML = originalText;
        }, 2000);
    }

    /**
     * Show copy error feedback
     * @param {HTMLElement} button - Button to show feedback on
     * @param {string} errorMsg - Error message
     */
    showCopyError(button, errorMsg) {
        const originalText = button.innerHTML;

        button.style.background = 'var(--danger-color)';
        button.innerHTML = '❌ Copy Failed';

        setTimeout(() => {
            button.style.background = '';
            button.innerHTML = originalText;
        }, 3000);

        // Show error in console for debugging
        console.error('Copy error details:', errorMsg);
    }

    /**
     * Hide other UI containers
     * @param {Array} containerIds - Array of container IDs to hide
     */
    hideOtherContainers(containerIds = []) {
        const defaultContainers = ['success-container', 'error-container', 'progress-container'];
        const containersToHide = [...new Set([...defaultContainers, ...containerIds])];

        containersToHide.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.style.display = 'none';
            }
        });
    }

    /**
     * Sleep utility for download delays
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default FileGenerator;
