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
        
        // Generate combined statistics for all lines
        const combinedAnnotations = this.formatCombinedAnnotations(lines);

        return `${eventHeader}\n\n${treePgn}${combinedAnnotations}`.trim();
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

        // Lines should already be sorted by probability (highest first)
        // Use highest probability line as main line (much better than longest!)
        const mainLine = lines[0];
        const variations = lines.slice(1);

        console.log(`   🎯 Main line (highest probability): ${mainLine.pgn}`);
        console.log(`   📊 Main line likelihood: ${mainLine.cumulativeLikelihood?.toFixed(6)}`);
        console.log(`   🌿 Variations: ${variations.length}`);

        return {
            mainLine: mainLine,
            variations: variations,
            allLines: lines
        };
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
     * Build move tree structure by finding variation divergence points
     * @param {Array} mainMoves - Main line moves array ["e4", "e5", "Nf3", "Nc6", "Bc4", "f5", "d3"]
     * @param {Array} variations - Array of variation line objects
     * @returns {Object} - Tree structure with divergence points and statistics
     */
    async buildMoveTree(mainMoves, variations) {
        console.log(`   🔨 Building move tree from main line (${mainMoves.length} moves) and ${variations.length} variations`);

        const divergences = [];

        // Parse each variation and find where it diverges from main line
        for (let i = 0; i < variations.length; i++) {
            const variation = variations[i];
            console.log(`   🌿 Processing variation ${i + 1}: "${variation.pgn?.substring(0, 30)}..."`);

            try {
                // Parse variation moves using chess.js
                const varMoves = await this.parsePGNMoves(variation.pgn);
                console.log(`   📊 Variation ${i + 1} moves:`, varMoves);

                // Find divergence point
                const divergencePoint = this.findDivergencePoint(mainMoves, varMoves);

                if (divergencePoint !== -1) {
                    console.log(`   🎯 Variation ${i + 1} diverges at move ${divergencePoint + 1}: main="${mainMoves[divergencePoint]}" vs var="${varMoves[divergencePoint]}"`);

                    // Find or create divergence group at this position
                    let divergenceGroup = divergences.find(d => d.position === divergencePoint);
                    if (!divergenceGroup) {
                        divergenceGroup = {
                            position: divergencePoint,
                            mainMove: mainMoves[divergencePoint],
                            variations: []
                        };
                        divergences.push(divergenceGroup);
                    }

                    // Add this variation to the group
                    divergenceGroup.variations.push({
                        move: varMoves[divergencePoint],
                        continuation: varMoves.slice(divergencePoint + 1),
                        stats: variation.statistics || variation.stats || {},
                        pgn: variation.pgn,
                        likelihoodPath: variation.likelihoodPath || [],
                        cumulativeLikelihood: variation.cumulativeLikelihood || 0
                    });
                }
            } catch (error) {
                console.warn(`   ⚠️ Error processing variation ${i + 1}:`, error.message);
            }
        }

        // Sort divergences by position
        divergences.sort((a, b) => a.position - b.position);

        console.log(`   🌳 Tree structure complete: ${divergences.length} divergence points, ${divergences.reduce((sum, d) => sum + d.variations.length, 0)} total variations`);

        return {
            mainMoves: mainMoves,
            divergences: divergences
        };
    }

    /**
     * Generate PGN with inline variation annotations from tree structure
     * @param {Object} treeStructure - Tree structure from buildMoveTree
     * @param {Object} mainLineStats - Statistics for the main line
     * @returns {string} - Formatted PGN with inline variations
     */
    generateTreePGNFromStructure(treeStructure, mainLineStats) {
        console.log('🎯 Generating PGN tree format from structure');

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
            if (divergenceAtThisMove) {
                console.log(`   📝 Adding ${divergenceAtThisMove.variations.length} variations after move ${i + 1} (${mainMoves[i]})`);

                // Add each variation as inline annotation
                for (const variation of divergenceAtThisMove.variations) {
                    const stats = variation.stats || {};

                    // Build variation string: (alternative_move continuation {stats})
                    let variationParts = [`(${variation.move}`];

                    // Add continuation moves if any
                    if (variation.continuation && variation.continuation.length > 0) {
                        // Add appropriate move numbers for continuation
                        let contMoveNum = isWhiteMove ? moveNumber : moveNumber + 1;
                        let contIsWhite = !isWhiteMove;

                        for (const contMove of variation.continuation.slice(0, 3)) { // Limit to 3 moves
                            if (contIsWhite) {
                                variationParts.push(`${contMoveNum}.`);
                            }
                            variationParts.push(contMove);
                            contIsWhite = !contIsWhite;
                            if (contIsWhite) contMoveNum++;
                        }
                    }

                    // Add detailed statistics annotation with move playrates
                    const games = stats.totalGames || stats.games || 0;
                    const winrate = stats.winrate || stats.probability || 0;

                    if (games > 0) {
                        const winratePercent = (winrate * 100).toFixed(1);
                        const gamesFormatted = games.toLocaleString();

                        // Build detailed stats including move playrates
                        let detailedStats = [];

                        // Add move playrates if available
                        if (variation.likelihoodPath && variation.likelihoodPath.length > 0) {
                            const movePlayrates = variation.likelihoodPath
                                .map(move => `+${(move.playrate * 100).toFixed(1)}% ${move.san || move.move}`)
                                .join(', ');
                            detailedStats.push(`Move playrates: ${movePlayrates}`);
                        }

                        // Add cumulative likelihood
                        if (variation.cumulativeLikelihood) {
                            detailedStats.push(`Line cumulative: +${(variation.cumulativeLikelihood * 100).toFixed(1)}%`);
                        }

                        // Add winrate
                        detailedStats.push(`Winrate: +${winratePercent}% over ${gamesFormatted} games`);

                        variationParts.push(`{${detailedStats.join('. ')}}`);
                    }

                    variationParts.push(')');
                    pgnParts.push(variationParts.join(' '));
                }
            }

            // Update move tracking
            if (isWhiteMove) {
                isWhiteMove = false;
            } else {
                isWhiteMove = true;
                moveNumber++;
            }
        }

        // Add detailed main line statistics at the end
        if (mainLineStats) {
            // Handle both direct stats and nested statistics object
            const statsObj = mainLineStats.statistics || mainLineStats;
            const games = statsObj.totalGames || statsObj.games || 0;
            const winrate = statsObj.winrate || statsObj.probability || 0;

            if (games > 0) {
                const winratePercent = (winrate * 100).toFixed(1);
                const gamesFormatted = games.toLocaleString();

                // Build detailed main line stats
                let mainStats = [];

                // Add move playrates if available
                if (mainLineStats.likelihoodPath && mainLineStats.likelihoodPath.length > 0) {
                    const movePlayrates = mainLineStats.likelihoodPath
                        .map(move => `+${(move.playrate * 100).toFixed(1)}% ${move.san || move.move}`)
                        .join(', ');
                    mainStats.push(`Move playrates: ${movePlayrates}`);
                }

                // Add cumulative likelihood
                if (mainLineStats.cumulativeLikelihood) {
                    mainStats.push(`Line cumulative: +${(mainLineStats.cumulativeLikelihood * 100).toFixed(1)}%`);
                }

                // Add winrate
                mainStats.push(`Main winrate: +${winratePercent}% over ${gamesFormatted} games`);

                pgnParts.push(`{${mainStats.join('. ')}}`);
            }
        }

        pgnParts.push('*'); // Add game termination

        const result = pgnParts.join(' ');
        console.log('✅ Generated tree PGN:', result.substring(0, 100) + '...');
        return result;
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
     * Sleep utility for download delays
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default FileGenerator;
