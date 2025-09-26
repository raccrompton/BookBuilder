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
        console.log('📁 [FileGenerator] generateConfiguredPGN called:');
        console.log('   outputFormat:', config.outputFormat);
        console.log('   annotationStyle:', config.annotationStyle);
        console.log('   lines count:', lines.length);

        // Handle empty lines array
        if (!lines || lines.length === 0) {
            console.log('   → Empty lines array, returning empty string');
            return '';
        }

        // Route to appropriate generation method based on configuration
        if (config.outputFormat === 'tree') {
            console.log('   → Taking TREE generation path');
            return await this.generateTreePGN(lines, chapterName, config, pgnGenerator);
        } else {
            console.log('   → Taking INDIVIDUAL lines path');
            return await this.generateIndividualLinesPGN(lines, chapterName, pgnGenerator);
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
     * @param {Array} lines - Array of line objects with moves and pgn
     * @returns {Object} Tree structure with main line and variations
     */
    buildVariationTree(lines) {
        console.log(`🌳 [FileGenerator] Building variation tree from ${lines.length} lines`);

        if (lines.length === 0) {
            return { mainLine: '', variations: [] };
        }

        // Sort lines by length (longest first for main line)
        const sortedLines = lines.slice().sort((a, b) => {
            const aLength = (a.moves || []).length;
            const bLength = (b.moves || []).length;
            return bLength - aLength; // Longest first
        });

        // Use longest line as main line
        const mainLine = sortedLines[0];
        const variations = sortedLines.slice(1);

        console.log(`   Main line (longest): ${mainLine.pgn}`);
        console.log(`   Variations: ${variations.length}`);

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
     * Generate tree move sequence without inline stats
     * @param {Object} variationTree - Tree structure with main line and variations
     * @returns {string} Tree move sequence
     */
    async generateTreeMoveSequence(variationTree) {
        if (!variationTree.mainLine || !variationTree.mainLine.pgn) {
            return '';
        }

        // For now, just return the main line PGN
        // TODO: Implement proper variation tree with ( ) notation
        return variationTree.mainLine.pgn;
    }



    /**
     * Sleep utility for download delays
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default FileGenerator;
