/**
 * =============================================================================
 * FileGenerator.js - File generation and browser download functionality
 * =============================================================================
 *
 * PURPOSE:
 * This class handles the final step of BookBuilder: creating downloadable
 * files from the analyzed chess lines. It converts our internal data structures
 * into proper PGN format and triggers browser downloads.
 *
 * WHAT IT DOES:
 * 1. Formats analysis results into PGN strings with proper headers
 * 2. Creates browser downloads using Blob URLs
 * 3. Merges multiple lines into tree-structured PGN with variations
 * 4. Provides copy-to-clipboard functionality
 * 5. Validates PGN output format
 *
 * TWO OUTPUT MODES:
 *
 * 1. INDIVIDUAL LINES:
 *    Each analysis line becomes a separate "game" in the PGN file.
 *    Good for importing into study tools that expect separate entries.
 *
 * 2. TREE MODE (VARIATIONS):
 *    Multiple lines are merged into a single game with variations.
 *    Example: 1. e4 e5 (1... c5 2. Nf3 d6) 2. Nf3 Nc6
 *    This is more compact and shows the tree structure visually.
 *
 * HOW BROWSER DOWNLOADS WORK:
 * JavaScript can't directly write files to the user's computer (security!).
 * Instead, we:
 * 1. Create a "Blob" (binary large object) containing our content
 * 2. Generate a temporary URL pointing to that Blob
 * 3. Create a hidden <a> link with that URL and click it programmatically
 * 4. The browser treats this as a download request
 * 5. Clean up the temporary URL afterward
 *
 * DEPENDENCIES:
 * - PgnTreeMerger: For combining lines into variation trees
 * - chess.js: For robust PGN parsing and formatting
 *
 * EXAMPLE USAGE:
 * ```javascript
 * const generator = new FileGenerator();
 * const pgn = await generator.generatePGN(analysisResults, { chapterName: 'Italian Game' });
 * generator.downloadFile(pgn, 'Italian_Game.pgn');
 * // or
 * generator.displayPGN(pgn, 'Italian Game');  // Shows in browser with copy button
 * ```
 * =============================================================================
 */

// Import PgnTreeMerger for combining PGN lines into a single game with variations
// This uses the chessops library for proper PGN tree manipulation
import PgnTreeMerger from '../pgn/PgnTreeMerger.js';

// Logger: Configurable logging - toggle with Logger.setEnabled('FileGenerator', true/false)
import Logger from '../utils/Logger.js';
const log = Logger.get('FileGenerator');

/**
 * FileGenerator Class - Creates and downloads PGN files
 */
class FileGenerator {
    /**
     * Constructor - Initialize file generator
     */
    constructor() {
        // Map to store generated files (key = filename, value = content)
        // Useful for re-downloading or combining multiple files
        this.generatedFiles = new Map();

        // Track download history for debugging and user feedback
        // Each entry has: {filename, timestamp, size, mimeType}
        this.downloadHistory = [];

        // ==================== FORMAT TOGGLE STATE ====================
        // Store both PGN formats for post-generation toggling
        // Populated by generateBothFormats(), used by toggle UI
        this.currentFormats = null;  // { individualPGN, treePGN, chapterName }

        // Currently displayed format: 'individual' or 'tree'
        // Defaults to 'tree' because it's more compact and shows the variation structure visually
        // Tree merges all lines into one game with parenthetical variations at divergence points
        // User can toggle between formats after generation completes
        this.currentFormat = 'tree';
    }

    /**
     * Generate PGN content from analysis results
     * REFACTORED: Now async to support robust chess.js PGN parsing in formatPGNLine
     */
    async generatePGN(results, metadata = {}) {
        const {
            chapterName = 'Opening Analysis', // Default chapter name if not provided
            author = 'BookBuilder', // Default author attribution
            date = new Date().toISOString().split('T')[0] // Today's date in YYYY-MM-DD format
        } = metadata;

        let pgnContent = ''; // Accumulator for the generated PGN string

        // Add header information (standard PGN Seven Tag Roster plus custom tags)
        pgnContent += `[Event "${chapterName}"]\n`; // Event tag - using chapter name
        pgnContent += '[Site "BookBuilder Generated"]\n'; // Site tag - identifies generator
        pgnContent += `[Date "${date}"]\n`; // Date tag in PGN format
        pgnContent += '[Round "1"]\n'; // Round tag (required by PGN spec)
        pgnContent += '[White "Analysis"]\n'; // White player tag
        pgnContent += '[Black "Analysis"]\n'; // Black player tag
        pgnContent += '[Result "*"]\n'; // Result unknown (analysis, not a completed game)
        pgnContent += `[Annotator "${author}"]\n`; // Who created the annotations
        pgnContent += '[Generator "BookBuilder v1.0"]\n'; // Software that generated the PGN

        if (metadata.opening) {
            pgnContent += `[Opening "${metadata.opening}"]\n`; // Optional opening name tag
        }

        if (metadata.totalLines) {
            pgnContent += `[TotalLines "${metadata.totalLines}"]\n`; // Custom tag for line count
        }

        pgnContent += '\n'; // Blank line separates headers from moves (PGN spec)

        // Add lines with analysis - REFACTORED: Use for...of loop for async/await
        const linesToProcess = Array.isArray(results) ? results : (results.finalLines || []); // Get array of lines
        for (let i = 0; i < linesToProcess.length; i++) {
            const formattedLine = await this.formatPGNLine(linesToProcess[i], i + 1); // Await async formatting
            pgnContent += formattedLine; // Add formatted line to output
            pgnContent += '\n\n'; // Double newline separates lines
        }

        return pgnContent; // Return complete PGN content
    }

    /**
     * Format a single PGN line with annotations
     * REFACTORED: Now async to support robust chess.js PGN parsing
     */
    async formatPGNLine(line, lineNumber) {
        let formatted = `{ Line ${lineNumber} }\n`; // Start with line number annotation

        // Add statistical information
        if (line.cumulativeLikelihood) {
            formatted += `{ Cumulative Likelihood: ${(line.cumulativeLikelihood * 100).toFixed(2)}% }\n`; // Add likelihood as percentage
        }

        if (line.totalGames) {
            formatted += `{ Total Games: ${line.totalGames} }\n`; // Add game count
        }

        if (line.winRate !== undefined) {
            formatted += `{ Win Rate: ${(line.winRate * 100).toFixed(1)}% }\n`; // Add win rate as percentage
        }

        // Format the moves
        let moves = line.pgn || ''; // Get PGN string from line object

        // Add move quality annotations if available
        if (line.moveQualities) {
            moves = await this.addMoveQualityAnnotations(moves, line.moveQualities); // REFACTORED: Now awaits async method
        }

        formatted += moves; // Append moves to formatted output

        // Add final evaluation if available
        if (line.finalEvaluation) {
            formatted += ` { Final: ${line.finalEvaluation > 0 ? '+' : ''}${(line.finalEvaluation / 100).toFixed(2)} }`; // Add centipawn evaluation
        }

        return formatted; // Return complete formatted line
    }

    /**
     * Add move quality annotations to PGN
     * REFACTORED: Uses chess.js for robust PGN parsing instead of fragile split(' ')
     *
     * WHAT IT DOES:
     * Takes a PGN string and an array of quality annotations (!!, !, ?!, etc.)
     * and interleaves them after each move.
     *
     * @param {string} pgnMoves - PGN moves string (e.g., "1. e4 e5 2. Nf3 Nc6")
     * @param {Array} qualities - Array of quality annotations for each move
     * @returns {string} - PGN with quality annotations inserted after moves
     */
    async addMoveQualityAnnotations(pgnMoves, qualities) {
        if (!qualities || qualities.length === 0) {
            return pgnMoves; // Return unchanged if no quality annotations provided
        }

        try {
            // Use chess.js to robustly parse the PGN moves
            const { Chess } = await import('/node_modules/chess.js/dist/esm/chess.js'); // Dynamic import for ES module
            const chess = new Chess(); // Create new chess instance

            chess.loadPgn(pgnMoves); // Load the PGN - chess.js handles all formatting
            const moves = chess.history(); // Extract clean move list in SAN notation

            if (moves.length === 0) {
                log.warn('[FileGenerator] No moves extracted from PGN for quality annotations');
                return pgnMoves; // Return original if parsing yielded no moves
            }

            // Rebuild PGN with quality annotations interleaved
            const annotatedMoves = []; // Array to build annotated move sequence
            for (let i = 0; i < moves.length; i++) {
                annotatedMoves.push(moves[i]); // Add the move

                // Add quality annotation if available for this move
                if (i < qualities.length) {
                    const annotation = this.getQualityAnnotation(qualities[i]); // Convert quality to PGN symbol
                    if (annotation) {
                        annotatedMoves.push(annotation); // Add annotation after move
                    }
                }
            }

            // Re-format with proper move numbers using chess.js
            const rebuiltChess = new Chess(); // New instance for rebuilding
            for (let i = 0; i < moves.length; i++) {
                rebuiltChess.move(moves[i]); // Replay each move
            }

            // Get properly numbered PGN, then insert annotations at correct positions
            // Note: chess.js pgn() doesn't support annotations, so we build manually
            const result = this.buildAnnotatedPgnString(moves, qualities); // Build annotated string with move numbers
            return result;

        } catch (error) {
            log.error(`[FileGenerator] Error adding quality annotations: ${error.message}`);
            return pgnMoves; // Return original on error as graceful fallback
        }
    }

    /**
     * Build annotated PGN string with proper move numbers
     * Helper for addMoveQualityAnnotations
     *
     * @param {Array} moves - Clean move array from chess.js history()
     * @param {Array} qualities - Quality annotations for each move
     * @returns {string} - Properly formatted PGN with annotations
     */
    buildAnnotatedPgnString(moves, qualities) {
        const parts = []; // Array to collect PGN tokens
        let moveNumber = 1; // Track current move number

        for (let i = 0; i < moves.length; i++) {
            const isWhiteMove = (i % 2 === 0); // Even indices are white moves (0, 2, 4...)

            if (isWhiteMove) {
                parts.push(`${moveNumber}.`); // Add move number before white's move
            }

            parts.push(moves[i]); // Add the move itself

            // Add quality annotation if available
            if (i < qualities.length && qualities[i]) {
                const annotation = this.getQualityAnnotation(qualities[i]); // Get PGN symbol for quality
                if (annotation) {
                    parts.push(annotation); // Add annotation immediately after move
                }
            }

            if (!isWhiteMove) {
                moveNumber++; // Increment move number after black's move
            }
        }

        return parts.join(' '); // Join all parts with spaces
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
        log.log(`💾 [FileGenerator] downloadFile called:`);
        log.log(`   Filename: ${filename}`);
        log.log(`   Content size: ${content.length} characters`);
        log.log(`   Requested MIME type: ${mimeType || 'auto-detect'}`);

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
                log.log(`   Auto-detected MIME type: ${mimeType}`);
            }

            // Create blob
            log.log(`   Creating blob with MIME type: ${mimeType}`);
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            log.log(`   Blob URL created: ${url.substring(0, 50)}...`);

            // Create download link
            log.log(`   Creating download link element`);
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = filename;
            downloadLink.style.display = 'none';

            // Add to DOM, click, and remove
            log.log(`   Triggering download...`);
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            log.log(`   Download link cleaned up`);

            // Clean up object URL
            URL.revokeObjectURL(url);
            log.log(`   Blob URL revoked`);

            // Track download
            this.downloadHistory.push({
                filename,
                timestamp: new Date(),
                size: content.length,
                mimeType
            });

            const formattedSize = this.formatFileSize(content.length);
            log.log(`✅ [FileGenerator] Downloaded: ${filename} (${formattedSize})`);

            return { success: true, filename, size: content.length };

        } catch (error) {
            log.error(`❌ [FileGenerator] Download failed for ${filename}:`, error);
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
                log.error(`Failed to download ${file.filename}:`, error);
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
        log.log('\n📁 [FileGenerator] generateConfiguredPGN() - FORMATTING ENGINE CALLED');
        log.log('   🎯 Handling SORTING + FORMATTING (moved from BookBuilder)');
        log.log('   📊 Received config:', {
            outputFormat: config.outputFormat,
            pgnConfig: config.pgnConfig,
            LONGTOSHORT: config.LONGTOSHORT,
            configKeys: Object.keys(config)
        });
        log.log('   📊 Input lines:', { linesCount: lines?.length || 'MISSING', chapterName });

        // Handle empty lines array
        if (!lines || lines.length === 0) {
            log.log('   ❌ Empty lines array, returning empty string');
            return '';
        }

        // Sort lines by probability (moved from BookBuilder for consistent behavior)
        log.log('   📈 Sorting lines by probability...');
        const sortedLines = this.sortLinesByProbability(lines);
        log.log('   🔝 Top 3 lines by probability:', sortedLines.slice(0, 3).map(line => ({
            pgn: line.pgn,
            likelihood: line.cumulativeLikelihood?.toFixed(6)
        })));

        // Apply LONGTOSHORT reversal if configured
        let finalLines = sortedLines;
        if (config.LONGTOSHORT) {
            log.log('   🔄 Applying LONGTOSHORT reversal');
            finalLines = [...sortedLines].reverse();
        }

        // Route to appropriate generation method based on configuration
        if (config.outputFormat === 'tree') {
            log.log('   🌳 → Taking TREE generation path');
            return await this.generateTreePGN(finalLines, chapterName, config, pgnGenerator);
        } else {
            log.log('   📋 → Taking INDIVIDUAL lines path');
            return await this.generateIndividualLinesPGN(finalLines, chapterName, pgnGenerator);
        }
    }

    /**
     * Generate BOTH PGN formats (individual lines + tree) for post-generation toggling
     *
     * This method creates both output formats simultaneously during generation,
     * allowing users to switch between them after generation completes without
     * needing to regenerate.
     *
     * @param {Array} lines - Array of line objects with moves and statistics
     * @param {string} chapterName - Base name for the chapter
     * @param {Object} config - Configuration object (for sorting options)
     * @param {Object} pgnGenerator - PgnGenerator instance for creating annotated lines
     * @returns {Object} Both formats: { individualPGN, treePGN, chapterName }
     *
     * @example
     * const formats = await fileGenerator.generateBothFormats(lines, 'Italian Game', config, pgnGenerator);
     * // formats.individualPGN - Each line as separate PGN entry
     * // formats.treePGN - Combined lines with variations using parentheses
     */
    async generateBothFormats(lines, chapterName, config, pgnGenerator) {
        log.log('\n📁 [FileGenerator] generateBothFormats() - GENERATING BOTH FORMATS');
        log.log('   📊 Input:', { linesCount: lines?.length || 0, chapterName });

        // Handle empty lines array - return empty strings for both formats
        if (!lines || lines.length === 0) {
            log.log('   ❌ Empty lines array, returning empty formats');
            return {
                individualPGN: '',
                treePGN: '',
                chapterName
            };
        }

        // Sort lines by probability (consistent with generateConfiguredPGN)
        log.log('   📈 Sorting lines by probability...');
        const sortedLines = this.sortLinesByProbability(lines);

        // Apply LONGTOSHORT reversal if configured
        let finalLines = sortedLines;
        if (config.LONGTOSHORT) {
            log.log('   🔄 Applying LONGTOSHORT reversal');
            finalLines = [...sortedLines].reverse();
        }

        // Generate INDIVIDUAL lines format
        // Each line becomes a separate PGN "game" entry
        log.log('   📋 Generating individual lines format...');
        const individualPGN = await this.generateIndividualLinesPGN(finalLines, chapterName, pgnGenerator);

        // Generate TREE format with variations
        // Lines are merged into single game with divergence points as variations
        log.log('   🌳 Generating tree format...');
        const treePGN = await this.generateTreePGN(finalLines, chapterName, config, pgnGenerator);

        log.log('   ✅ Both formats generated successfully');
        log.log(`   📊 Individual: ${individualPGN.length} chars, Tree: ${treePGN.length} chars`);

        // Return both formats in an object for toggle functionality
        return {
            individualPGN,
            treePGN,
            chapterName
        };
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
        log.log(`📋 [FileGenerator] Generating tree-structured PGN for ${lines.length} lines`); // Log entry point with line count

        // Create a new tree merger instance to combine all lines
        const merger = new PgnTreeMerger(); // Initialize the chessops-based merger
        merger.setHeader('Event', `${chapterName} Line 1`); // Set the chapter name with "Line 1" as Event header (tree combines all lines into one)

        // Generate each line with full annotations using PgnGenerator, then merge
        for (let i = 0; i < lines.length; i++) { // Iterate through all lines
            const line = lines[i]; // Get current line data
            const lineNumber = i + 1; // Calculate 1-indexed line number
            const eventName = `${chapterName} Line ${lineNumber}`; // Create event name for this line

            // Use PgnGenerator to create fully-annotated individual line PGN
            // This preserves all annotations (playrates, winrates, etc.)
            const annotatedPgn = pgnGenerator.generateSingleLine(line, eventName); // Generate annotated PGN for this line

            // Add the annotated line to the merger - it will find divergence points automatically
            merger.addLine(annotatedPgn); // Merge this line into the tree
        }

        // Export the merged tree as a single PGN with variations
        const treePgn = merger.toPgn(); // Generate final merged PGN string

        log.log(`✅ [FileGenerator] Tree PGN generated with ${lines.length} lines merged`); // Log success

        return treePgn; // Return the merged tree PGN
    }

    /**
     * Generate individual lines PGN using simple PgnGenerator
     * @param {Array} lines - Array of line objects
     * @param {string} chapterName - Chapter name
     * @param {Object} pgnGenerator - Simple PgnGenerator instance
     * @returns {string} Individual lines PGN
     */
    async generateIndividualLinesPGN(lines, chapterName, pgnGenerator) {
        log.log(`📋 [FileGenerator] Generating individual lines PGN for ${lines.length} lines`);

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
        log.log(`🌳 [FileGenerator] Building variation tree from ${lines.length} lines`);

        if (lines.length === 0) {
            return { mainLine: '', variations: [] };
        }

        // Deduplicate lines at tree level (critical for preventing duplicate variations)
        const deduplicatedLines = this.deduplicateTreeLines(lines);
        log.log(`   🧹 Tree-level deduplication: ${lines.length} → ${deduplicatedLines.length} unique lines`);

        // Lines should already be sorted by probability (highest first)
        // Use highest probability line as main line (much better than longest!)
        const mainLine = deduplicatedLines[0];
        const variations = deduplicatedLines.slice(1);

        log.log(`   🎯 Main line (highest probability): ${mainLine.pgn}`);
        log.log(`   📊 Main line likelihood: ${mainLine.cumulativeLikelihood?.toFixed(6)}`);
        log.log(`   🌿 Variations: ${variations.length}`);

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
            annotations += `\n${playratePercent}%\t${san}`;
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
            annotations += `\nLine cumulative playrate: ${avgCumulative}%`;
        }

        if (totalGames > 0) {
            const avgWinRate = totalWins / totalGames;
            const winratePercent = (avgWinRate * 100).toFixed(2);
            const gamesFormatted = totalGames.toLocaleString();

            annotations += `\nLine winrate (combined): ${winratePercent}% over ${gamesFormatted} games`;
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
        log.log(`🌳 [FileGenerator] generateTreeMoveSequence() - Building PGN tree`);

        if (!variationTree.mainLine || !variationTree.mainLine.pgn) {
            log.log(`   ❌ No main line found`);
            return '';
        }

        const mainLine = variationTree.mainLine;
        const variations = variationTree.variations || [];

        log.log(`   📋 Main line: ${mainLine.pgn}`);
        log.log(`   🌿 Processing ${variations.length} variations`);

        // Parse main line moves using chess.js
        const mainMoves = await this.parsePGNMoves(mainLine.pgn);
        if (mainMoves.length === 0) {
            log.log(`   ❌ Could not parse main line moves`);
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
            log.log(`   🔍 Parsing PGN with chess.js: "${pgn.substring(0, 50)}..."`);

            // Import chess.js for robust PGN parsing
            const { Chess } = await import('/node_modules/chess.js/dist/esm/chess.js');
            const chess = new Chess();

            // Load the PGN - chess.js handles headers, formatting, etc.
            chess.loadPgn(pgn); // loadPgn returns undefined, not boolean - chess.js API quirk

            // Get move history in SAN notation - this is the robust way!
            const moves = chess.history();
            if (moves.length === 0) {
                log.warn(`   ⚠️  Chess.js loaded PGN but extracted no moves`);
                return [];
            }

            log.log(`   ✅ Chess.js extracted ${moves.length} moves:`, moves);

            return moves;

        } catch (error) {
            log.error(`   ❌ Error parsing PGN with chess.js: ${error.message}`);
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
        log.log(`   🌳 Building nested variation tree from ${variations.length} variations`);

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
                log.warn(`Error parsing variation: ${error.message}`);
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

        log.log(`   ✅ Built nested tree with ${nestedDivergences.length} divergence points`);
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

            // Store reference to the original line object for full annotation generation
            const moveNode = {
                move: move,
                // Store the original line object which contains all data needed for full annotations
                originalLine: endingHere.length > 0 ? endingHere[0] : null,
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

            // Store reference to the original line object for full annotation generation
            const subVar = {
                move: move,
                // Store the original line object which contains all data needed for full annotations
                originalLine: endingAtThisDepth.length > 0 ? endingAtThisDepth[0] : null,
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
        log.log(`   🔨 Building move tree from main line (${mainMoves.length} moves) and ${variations.length} variations`);

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

        log.log(`   🌳 Tree structure complete: ${divergences.length} divergence points`);

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
        log.log('🎯 Generating PGN tree format from structure');

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
        log.log('🌳 Generating nested PGN with proper sub-variations');

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
                log.log(`   📝 Adding nested variations after move ${i + 1} (${mainMoves[i]})`);

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

        // Add main line statistics using full annotation format
        if (mainLineStats) {
            // Use generateFullAnnotation for the same format as individual lines
            const mainStatsAnnotation = this.generateFullAnnotation(mainLineStats, this.config);
            if (mainStatsAnnotation) {
                pgnParts.push(mainStatsAnnotation);
            }
        }

        pgnParts.push('*'); // Add game termination

        const result = pgnParts.join(' ');
        log.log('✅ Generated nested PGN:', result.substring(0, 150) + '...');
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

            // Add full statistics for this variation (using originalLine for complete data)
            // Use generateFullAnnotation for the same format as individual lines
            const statsAnnotation = moveNode.originalLine
                ? this.generateFullAnnotation(moveNode.originalLine, this.config)
                : this.generateStatsAnnotation(moveNode);
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
        detailedStats.push(`${prefix ? prefix + ' ' : ''}${winratePercent}% (${gamesFormatted})`);

        return detailedStats.length > 0 ? `{${detailedStats.join(', ')}}` : '';
    }

    /**
     * Generate full annotation matching PgnGenerator.formatMoveAnnotations() format
     * This produces the complete stats block with move playrates, cumulative playrate, and winrate
     * @param {Object} lineData - Original line object with likelihoodPath, statistics, etc.
     * @param {Object} config - Configuration object with DRAWSAREHALF setting
     * @returns {string} - Full annotation block matching individual lines format
     */
    generateFullAnnotation(lineData, config = {}) {
        // Return empty string if no line data
        if (!lineData) return '';

        let annotations = '{Move playrates:\n';

        // Add individual move playrates from likelihoodPath (matches PgnGenerator format)
        if (lineData.likelihoodPath && lineData.likelihoodPath.length > 0) {
            for (const move of lineData.likelihoodPath) {
                // Only add moves with valid playrate and san
                if (move.playrate !== undefined && move.san) {
                    const playratePercent = (move.playrate * 100).toFixed(2);
                    annotations += `${playratePercent}%\t${move.san}\n`;
                }
            }
        }

        // Add line statistics - check statistics object first, then fallback to direct properties
        if (lineData.statistics) {
            // Use statistics object format
            if (lineData.statistics.cumulativePlayrate !== undefined) {
                const cumulativePlayrate = (lineData.statistics.cumulativePlayrate * 100).toFixed(2);
                annotations += `Line cumulative playrate: ${cumulativePlayrate}%\n`;
            }

            // Add winrate information
            if (lineData.statistics.winrate !== undefined && lineData.statistics.totalGames !== undefined) {
                // Check if this is a terminal position (checkmate/draw) that needs transparent labeling
                // Terminal positions have manufactured stats that shouldn't look like database data
                if (lineData.statistics.isTerminalPosition) {
                    // Build honest annotation based on terminal position type
                    let terminalAnnotation;
                    if (lineData.statistics.terminalType === 'checkmate') {
                        // For checkmate, show win or loss based on the winrate value
                        // winrate of 1.0 = we delivered checkmate, 0.0 = we got checkmated
                        const outcome = lineData.statistics.winrate === 1 ? 'win' : 'loss';
                        terminalAnnotation = `Position outcome: Checkmate (${outcome})`;
                    } else {
                        // For draws, show the value being used based on DRAWSAREHALF config
                        terminalAnnotation = `Position outcome: Draw (counted as ${lineData.statistics.winrate})`;
                    }
                    annotations += terminalAnnotation;
                } else {
                    // Normal position with real Lichess database statistics
                    const winratePercent = (lineData.statistics.winrate * 100).toFixed(2);
                    const gamesFormatted = lineData.statistics.totalGames.toLocaleString();

                    // Use correct description based on DRAWSAREHALF config
                    let winrateDescription;
                    if (config.DRAWSAREHALF === 0) {
                        winrateDescription = 'Line winrate (excluding draws)';
                    } else {
                        winrateDescription = 'Line winrate (draws as half points)';
                    }

                    annotations += `${winrateDescription}: ${winratePercent}% over ${gamesFormatted} games`;
                }
            }
        } else {
            // Fallback to direct properties on lineData
            if (lineData.cumulativeLikelihood !== undefined) {
                const cumulativePlayrate = (lineData.cumulativeLikelihood * 100).toFixed(2);
                annotations += `Line cumulative playrate: ${cumulativePlayrate}%\n`;
            }

            // Check for winRate/totalGames on lineData directly
            const winRate = lineData.winRate || lineData.winrate;
            const totalGames = lineData.totalGames || lineData.games;
            if (winRate !== undefined && totalGames !== undefined) {
                const winratePercent = (winRate * 100).toFixed(2);
                const gamesFormatted = totalGames.toLocaleString();

                // Use correct description based on DRAWSAREHALF config
                let winrateDescription;
                if (config.DRAWSAREHALF === 0) {
                    winrateDescription = 'Line winrate (excluding draws)';
                } else {
                    winrateDescription = 'Line winrate (draws as half points)';
                }

                annotations += `${winrateDescription}: ${winratePercent}% over ${gamesFormatted} games`;
            }
        }

        annotations += '}';
        return annotations;
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

                    // Use full annotation format for variations (matching individual lines format)
                    const statsAnnotation = variation.originalLine
                        ? this.generateFullAnnotation(variation.originalLine, this.config)
                        : this.generateStatsAnnotation(variation);
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

        // Add main line statistics using full annotation format
        if (mainLineStats) {
            const mainStatsAnnotation = this.generateFullAnnotation(mainLineStats, this.config);
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
     * Display PGN content in browser with copy functionality and format toggle
     *
     * This method handles two input types:
     * 1. String (legacy): A single PGN string to display
     * 2. Object (new): { individualPGN, treePGN, chapterName } for toggle functionality
     *
     * When given a format object, it stores both formats and sets up a toggle UI
     * that allows users to switch between individual lines and tree view.
     *
     * @param {string|Object} pgnData - PGN content string OR format object with both formats
     * @param {string} chapterName - Name of the chapter/repertoire
     * @param {Object} metadata - Additional metadata for statistics
     * @returns {Object} Display result with success status
     */
    displayPGN(pgnData, chapterName = 'Chess Repertoire', metadata = {}) {
        // Determine if we received a format object or a plain string
        // Format objects have individualPGN and treePGN properties
        const isFormatObject = typeof pgnData === 'object' && pgnData.individualPGN !== undefined;

        // Store formats for toggle functionality
        // If plain string, wrap it so both formats show the same content
        if (isFormatObject) {
            this.currentFormats = pgnData;
            chapterName = pgnData.chapterName || chapterName;
        } else {
            // Legacy compatibility: wrap string in format object
            this.currentFormats = {
                individualPGN: pgnData,
                treePGN: pgnData,
                chapterName
            };
        }

        // Reset to tree format when displaying new content
        // Tree is the default because it's more compact and better shows how lines branch
        this.currentFormat = 'tree';

        // Get the content for initial display (tree format shows all lines merged with variations)
        const content = this.currentFormats.treePGN;

        log.log(`📋 [FileGenerator] displayPGN called:`);
        log.log(`   Chapter: ${chapterName}`);
        log.log(`   Format object: ${isFormatObject}`);
        log.log(`   Content size: ${content.length} characters`);
        log.log(`   Metadata:`, metadata);

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

            // Set the PGN content (individual format by default)
            pgnContent.textContent = content;

            // Setup format toggle UI (only if we have both formats)
            // This adds the toggle buttons to the display header
            if (isFormatObject) {
                this.setupFormatToggle();
            }

            // Generate and display statistics
            if (statsContainer) {
                this.populateDisplayStats(statsContainer, content, metadata);
            }

            // Setup copy functionality - now uses getCurrentContent() internally
            if (copyBtn) {
                this.setupCopyButton(copyBtn);
            }

            // Setup download functionality - now uses getCurrentContent() internally
            if (downloadBtn) {
                this.setupDownloadButton(downloadBtn, chapterName);
            }

            // Show the display container
            displayContainer.style.display = 'block';

            // Hide other containers
            this.hideOtherContainers(['success-container', 'error-container']);

            // Scroll to display
            displayContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

            log.log(`✅ [FileGenerator] PGN displayed successfully`);

            return {
                success: true,
                chapterName,
                contentLength: content.length,
                displayMethod: 'browser'
            };

        } catch (error) {
            log.error(`❌ [FileGenerator] Display failed:`, error);
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
     *
     * Uses getCurrentContent() to get the currently displayed format,
     * so copy always reflects what the user is viewing.
     *
     * @param {HTMLElement} copyBtn - Copy button element
     */
    setupCopyButton(copyBtn) {
        // Remove existing event listeners by replacing the button
        // This prevents stacking multiple handlers on subsequent displays
        const newCopyBtn = copyBtn.cloneNode(true);
        copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);

        // Use arrow function to preserve 'this' context for getCurrentContent()
        newCopyBtn.addEventListener('click', async () => {
            try {
                // Get the currently displayed format content
                const content = this.getCurrentContent();
                log.log(`📋 [FileGenerator] Copying ${this.currentFormat} format to clipboard...`);

                // Use modern clipboard API if available
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(content);
                } else {
                    // Fallback for older browsers
                    this.fallbackCopyToClipboard(content);
                }

                // Visual feedback
                this.showCopySuccess(newCopyBtn);

                log.log(`✅ [FileGenerator] PGN copied to clipboard successfully`);

            } catch (error) {
                log.error(`❌ [FileGenerator] Copy failed:`, error);
                this.showCopyError(newCopyBtn, error.message);
            }
        });
    }

    /**
     * Setup download button functionality
     *
     * Uses getCurrentContent() to download the currently displayed format.
     * Adds format suffix to filename (e.g., "Opening_individual.pgn" or "Opening_tree.pgn").
     *
     * @param {HTMLElement} downloadBtn - Download button element
     * @param {string} filename - Base filename (without format suffix)
     */
    setupDownloadButton(downloadBtn, filename) {
        // Remove existing event listeners by replacing the button
        const newDownloadBtn = downloadBtn.cloneNode(true);
        downloadBtn.parentNode.replaceChild(newDownloadBtn, downloadBtn);

        // Use arrow function to preserve 'this' context
        newDownloadBtn.addEventListener('click', () => {
            try {
                // Get the currently displayed format content
                const content = this.getCurrentContent();

                // Add format suffix to filename so user knows which format they downloaded
                const formatSuffix = this.currentFormat === 'tree' ? '_tree' : '_individual';
                const pgnFilename = `${filename.replace(/[^a-zA-Z0-9]/g, '_')}${formatSuffix}.pgn`;

                log.log(`📥 [FileGenerator] Downloading ${this.currentFormat} format as ${pgnFilename}`);
                this.downloadFile(content, pgnFilename, 'application/x-chess-pgn');
            } catch (error) {
                log.error(`❌ [FileGenerator] Download failed:`, error);
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
        log.error('Copy error details:', errorMsg);
    }

    // ==================== FORMAT TOGGLE METHODS ====================
    // These methods handle switching between individual lines and tree formats

    /**
     * Setup the format toggle UI in the display header
     *
     * Creates two toggle buttons (Individual / Tree) that allow users to
     * switch between PGN output formats after generation completes.
     * The toggle is inserted into the display header before the copy/download buttons.
     */
    setupFormatToggle() {
        // Find the header actions container where copy/download buttons live
        const headerActions = document.querySelector('.pgn-display-actions');
        if (!headerActions) {
            log.warn('[FileGenerator] Could not find .pgn-display-actions for toggle');
            return;
        }

        // Check if toggle already exists (from previous generation)
        // Remove it so we create fresh buttons with listeners bound to THIS instance
        // This fixes a stale closure bug where old listeners reference old FileGenerator instances
        let toggleContainer = document.getElementById('format-toggle-container');
        if (toggleContainer) {
            toggleContainer.remove();
        }

        // Create the toggle container with two buttons
        toggleContainer = document.createElement('div');
        toggleContainer.id = 'format-toggle-container';
        toggleContainer.className = 'format-toggle-container';

        // Build the toggle HTML with icons matching the project style
        // Tree view is active by default because it's more compact and shows variation structure
        // Individual view separates each line into its own PGN game entry (useful for some tools)
        toggleContainer.innerHTML = `
            <button type="button" class="format-toggle-btn" data-format="individual" id="toggle-individual">
                <i data-lucide="list" class="icon"></i> Individual
            </button>
            <button type="button" class="format-toggle-btn active" data-format="tree" id="toggle-tree">
                <i data-lucide="git-branch" class="icon"></i> Tree
            </button>
        `;

        // Insert toggle at the beginning of header actions (before copy/download)
        headerActions.insertBefore(toggleContainer, headerActions.firstChild);

        // Initialize Lucide icons for the new buttons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Attach click handlers to toggle buttons
        const individualBtn = document.getElementById('toggle-individual');
        const treeBtn = document.getElementById('toggle-tree');

        // Use arrow functions to preserve 'this' context
        individualBtn.addEventListener('click', () => this.switchFormat('individual'));
        treeBtn.addEventListener('click', () => this.switchFormat('tree'));

        log.log('[FileGenerator] Format toggle UI initialized');
    }

    /**
     * Switch the displayed PGN format
     *
     * Updates the displayed content, toggle button states, and logs the change.
     * Called when user clicks one of the format toggle buttons.
     *
     * @param {string} format - The format to switch to: 'individual' or 'tree'
     */
    switchFormat(format) {
        // Guard: Ensure we have format data to switch
        if (!this.currentFormats) {
            log.warn('[FileGenerator] Cannot switch format: no format data available');
            return;
        }

        // Guard: Don't do anything if already on this format
        if (this.currentFormat === format) {
            return;
        }

        // Update the current format state
        this.currentFormat = format;

        // Get the PGN content element and update its content
        const pgnContent = document.getElementById('pgn-content');
        if (pgnContent) {
            // Select the appropriate format content
            const content = format === 'tree'
                ? this.currentFormats.treePGN
                : this.currentFormats.individualPGN;

            pgnContent.textContent = content;
        }

        // Update toggle button visual states
        this.updateToggleButtonStates();

        log.log(`[FileGenerator] Switched to ${format} format`);
    }

    /**
     * Update toggle button visual states to reflect current format
     *
     * Adds 'active' class to the currently selected format button
     * and removes it from the other.
     */
    updateToggleButtonStates() {
        const buttons = document.querySelectorAll('.format-toggle-btn');
        buttons.forEach(btn => {
            // Toggle 'active' class based on data-format attribute
            const isActive = btn.dataset.format === this.currentFormat;
            btn.classList.toggle('active', isActive);
        });
    }

    /**
     * Get the currently displayed PGN content
     *
     * Returns the content for whichever format is currently selected.
     * Used by copy and download functions to operate on the visible format.
     *
     * @returns {string} The PGN content for the current format
     */
    getCurrentContent() {
        // Guard: Return empty string if no formats loaded
        if (!this.currentFormats) {
            return '';
        }

        // Return the appropriate format based on current selection
        return this.currentFormat === 'tree'
            ? this.currentFormats.treePGN
            : this.currentFormats.individualPGN;
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
