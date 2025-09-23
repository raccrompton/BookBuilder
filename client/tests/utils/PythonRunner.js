/**
 * Python BookBuilder System Integration Utilities
 *
 * Provides utilities to execute the legacy Python BookBuilder system
 * for cross-system validation testing. Handles subprocess execution,
 * environment validation, and output normalization.
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class PythonBookBuilderRunner {
    constructor(options = {}) {
        this.pythonPath = options.pythonPath || 'python3';
        this.projectRoot = options.projectRoot || path.resolve(__dirname, '../../..');
        this.legacyPath = path.join(this.projectRoot, 'legacy');
        this.tempDir = options.tempDir || os.tmpdir();
        this.timeout = options.timeout || 300000; // 5 minutes default

        // Path validation
        this.bookBuilderScript = path.join(this.legacyPath, 'core', 'BookBuilder.py');
        this.configPath = path.join(this.legacyPath, 'config');
    }

    /**
     * Validate Python environment and dependencies
     */
    async validateEnvironment() {
        try {
            // Check Python installation
            const pythonVersion = execSync(`${this.pythonPath} --version`, { encoding: 'utf8' });
            console.log(`✓ Python version: ${pythonVersion.trim()}`);

            // Check if BookBuilder script exists
            await fs.access(this.bookBuilderScript);
            console.log(`✓ BookBuilder script found: ${this.bookBuilderScript}`);

            // Check Python dependencies
            const requiredPackages = ['chess', 'requests', 'numpy', 'scipy'];
            for (const pkg of requiredPackages) {
                try {
                    execSync(`${this.pythonPath} -c "import ${pkg}; print('${pkg} OK')"`, { encoding: 'utf8' });
                    console.log(`✓ Python package ${pkg} available`);
                } catch (error) {
                    throw new Error(`Missing Python package: ${pkg}. Install with: pip install ${pkg}`);
                }
            }

            return true;
        } catch (error) {
            throw new Error(`Python environment validation failed: ${error.message}`);
        }
    }

    /**
     * Create temporary configuration file for Python system
     */
    async createTempConfig(config) {
        const configFileName = `test_config_${Date.now()}.yaml`;
        const tempConfigPath = path.join(this.tempDir, configFileName);

        // Convert JS config to YAML config format
        const yamlConfig = this.convertConfigToYaml(config);

        await fs.writeFile(tempConfigPath, yamlConfig, 'utf8');
        return tempConfigPath;
    }

    /**
     * Convert JavaScript config object to YAML config format
     */
    convertConfigToYaml(jsConfig) {
        // Format openings array for YAML
        const openings = jsConfig.openings || [{
            name: 'Test_Opening',
            pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5'
        }];

        const openingBookYaml = openings.map(opening =>
            `  - Name: "${opening.name}"\n    pgn: "${opening.pgn || opening.fen}"`
        ).join('\n');

        // Format arrays for YAML
        const speeds = (jsConfig.SPEEDS || ['blitz', 'rapid', 'classical']).join(',');
        const ratings = (jsConfig.RATINGS || ['1600', '1800', '2000', '2200', '2500']).join(',');

        return `# Generated test configuration for Python BookBuilder
# Auto-generated from JavaScript test suite

# BOOK SETTINGS
OPENINGBOOK:
${openingBookYaml}
LONGTOSHORT: ${jsConfig.LONGTOSHORT ? 1 : 0}

# DATABASE SETTINGS
VARIANT: '${jsConfig.VARIANT || 'standard'}'
SPEEDS: ['${speeds}']
RATINGS: ['${ratings}']
MOVES: ${jsConfig.MOVES || 15}

# MOVE SELECTION SETTINGS
DEPTHLIKELIHOOD: ${jsConfig.DEPTHLIKELIHOOD || 0.05}
ALPHA: ${jsConfig.ALPHA || 0.05}
MINPLAYRATE: ${jsConfig.MINPLAYRATE || 0.01}
MINGAMES: ${jsConfig.MINGAMES || 100}
CONTINUATIONGAMES: ${jsConfig.CONTINUATIONGAMES || 1000}
DRAWSAREHALF: ${jsConfig.DRAWSAREHALF ? 1 : 0}

# ENGINE SETTINGS
CAREABOUTENGINE: ${jsConfig.CAREABOUTENGINE ? 1 : 0}
ENGINEFINISH: ${jsConfig.ENGINEFINISH ? 1 : 0}
ENGINEPATH: "${jsConfig.ENGINEPATH || '/usr/local/bin/stockfish'}"
ENGINEDEPTH: ${jsConfig.ENGINEDEPTH || 15}
ENGINEHASH: ${jsConfig.ENGINEHASH || 256}
ENGINETHREADS: ${jsConfig.ENGINETHREADS || 1}
SOUNDNESSLIMIT: ${jsConfig.SOUNDNESSLIMIT || -200}
MOVELOSSLIMIT: ${jsConfig.MOVELOSSLIMIT || -50}
IGNORELOSSLIMIT: ${jsConfig.IGNORELOSSLIMIT || 200}

# OUTPUT SETTINGS
PRINT_INFO_TO_CONSOLE: ${jsConfig.PRINT_INFO_TO_CONSOLE || false}
`;
    }

    /**
     * Execute Python BookBuilder with given configuration
     */
    async runPythonSystem(config, options = {}) {
        await this.validateEnvironment();

        const tempConfigPath = await this.createTempConfig(config);
        const outputDir = options.outputDir || this.projectRoot;

        try {
            console.log('🐍 Starting Python BookBuilder execution...');

            // Prepare environment variables
            const env = {
                ...process.env,
                PYTHONPATH: this.projectRoot,
                BOOKBUILDER_CONFIG: tempConfigPath
            };

            // Execute Python BookBuilder with config file path
            const result = await this.executeWithTimeout(
                this.pythonPath,
                [this.bookBuilderScript, tempConfigPath],
                {
                    cwd: this.projectRoot,
                    env: env,
                    timeout: this.timeout
                }
            );

            // Read generated PGN files
            const pgnFiles = await this.findGeneratedPgnFiles(outputDir);
            const outputs = {};

            for (const pgnFile of pgnFiles) {
                const content = await fs.readFile(pgnFile, 'utf8');
                const fileName = path.basename(pgnFile);
                outputs[fileName] = content;
            }

            console.log(`✓ Python BookBuilder completed. Generated ${pgnFiles.length} files.`);

            return {
                success: true,
                outputs: outputs,
                stdout: result.stdout,
                stderr: result.stderr,
                executionTime: result.executionTime
            };

        } catch (error) {
            console.error('❌ Python BookBuilder execution failed:', error.message);
            throw new Error(`Python execution failed: ${error.message}`);
        } finally {
            // Cleanup temporary config file
            try {
                await fs.unlink(tempConfigPath);
            } catch (cleanupError) {
                console.warn('Warning: Failed to cleanup temp config file:', cleanupError.message);
            }
        }
    }

    /**
     * Execute command with timeout and proper error handling
     */
    executeWithTimeout(command, args, options) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const child = spawn(command, args, options);

            let stdout = '';
            let stderr = '';
            let timeoutId;

            // Set up timeout
            if (options.timeout) {
                timeoutId = setTimeout(() => {
                    child.kill('SIGTERM');
                    reject(new Error(`Process timeout after ${options.timeout}ms`));
                }, options.timeout);
            }

            // Collect output
            child.stdout?.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr?.on('data', (data) => {
                stderr += data.toString();
            });

            // Handle completion
            child.on('close', (code) => {
                if (timeoutId) clearTimeout(timeoutId);

                const executionTime = Date.now() - startTime;

                if (code === 0) {
                    resolve({ stdout, stderr, executionTime });
                } else {
                    reject(new Error(`Process exited with code ${code}. Stderr: ${stderr}`));
                }
            });

            child.on('error', (error) => {
                if (timeoutId) clearTimeout(timeoutId);
                reject(error);
            });
        });
    }

    /**
     * Find generated PGN files in output directory
     */
    async findGeneratedPgnFiles(outputDir) {
        try {
            const files = await fs.readdir(outputDir);
            const pgnFiles = files
                .filter(file => file.endsWith('.pgn') && file.includes('Chapter_'))
                .map(file => path.join(outputDir, file));

            return pgnFiles;
        } catch (error) {
            console.warn('Warning: Could not read output directory:', error.message);
            return [];
        }
    }

    /**
     * Normalize Python output for comparison with JavaScript output
     */
    normalizeOutput(pythonOutput) {
        if (typeof pythonOutput !== 'string') {
            return pythonOutput;
        }

        return pythonOutput
            // Normalize line endings
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            // Remove extra whitespace
            .replace(/[ \t]+$/gm, '')
            // Normalize move number formatting
            .replace(/(\d+)\.\s+/g, '$1. ')
            // Normalize percentage formatting (handle slight differences)
            .replace(/([+-]?\d+\.\d{2})%/g, (match, p1) => {
                const num = parseFloat(p1);
                return `${num.toFixed(2)}%`;
            });
    }

    /**
     * Compare two outputs with tolerance for floating-point differences
     */
    compareWithTolerance(pythonOutput, jsOutput, tolerance = 0.01) {
        const normalizedPython = this.normalizeOutput(pythonOutput);
        const normalizedJs = this.normalizeOutput(jsOutput);

        // Extract all percentage values for comparison
        const pythonPercentages = this.extractPercentages(normalizedPython);
        const jsPercentages = this.extractPercentages(normalizedJs);

        if (pythonPercentages.length !== jsPercentages.length) {
            return {
                match: false,
                reason: `Different number of percentage values: Python=${pythonPercentages.length}, JS=${jsPercentages.length}`
            };
        }

        // Compare percentages with tolerance
        for (let i = 0; i < pythonPercentages.length; i++) {
            const diff = Math.abs(pythonPercentages[i] - jsPercentages[i]);
            if (diff > tolerance) {
                return {
                    match: false,
                    reason: `Percentage difference exceeds tolerance: ${diff.toFixed(4)} > ${tolerance} at index ${i}`
                };
            }
        }

        // Compare text content (excluding percentages)
        const pythonText = normalizedPython.replace(/[+-]?\d+\.\d{2}%/g, 'XX.XX%');
        const jsText = normalizedJs.replace(/[+-]?\d+\.\d{2}%/g, 'XX.XX%');

        if (pythonText !== jsText) {
            return {
                match: false,
                reason: 'Text structure differs (excluding numerical values)'
            };
        }

        return { match: true };
    }

    /**
     * Extract all percentage values from text
     */
    extractPercentages(text) {
        const matches = text.match(/([+-]?\d+\.\d{2})%/g) || [];
        return matches.map(match => parseFloat(match.replace('%', '')));
    }
}

module.exports = { PythonBookBuilderRunner };