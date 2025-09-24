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

    /**
     * Sleep utility for download delays
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default FileGenerator;
