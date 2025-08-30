#!/usr/bin/env python3
"""
BookBuilder Web Application
Flask server that provides a web interface for the BookBuilder chess opening repertoire generator.
"""

import os
import tempfile
import subprocess
import yaml
import logging
from datetime import datetime
from flask import Flask, render_template_string, request, jsonify, send_file, abort
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'chess-bookbuilder-dev-key')

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create directories for temporary files
UPLOAD_FOLDER = '/tmp/bookbuilder_uploads'
OUTPUT_FOLDER = '/tmp/bookbuilder_outputs'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# HTML template for the web interface
HTML_TEMPLATE = '''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BookBuilder - Chess Opening Repertoire Generator</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2c3e50;
            text-align: center;
            margin-bottom: 10px;
        }
        .subtitle {
            text-align: center;
            color: #7f8c8d;
            margin-bottom: 30px;
        }
        .section {
            margin: 25px 0;
            padding: 20px;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            background-color: #fafafa;
        }
        .section h3 {
            color: #34495e;
            margin-top: 0;
        }
        .form-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        .form-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            font-weight: 600;
            margin-bottom: 5px;
            color: #2c3e50;
        }
        input, select, textarea {
            width: 100%;
            padding: 8px 12px;
            border: 2px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            box-sizing: border-box;
        }
        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: #3498db;
        }
        textarea {
            height: 120px;
            resize: vertical;
        }
        .help-text {
            font-size: 12px;
            color: #7f8c8d;
            margin-top: 3px;
        }
        .generate-btn {
            background: #27ae60;
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
            margin: 20px 0;
        }
        .generate-btn:hover {
            background: #219a52;
        }
        .generate-btn:disabled {
            background: #95a5a6;
            cursor: not-allowed;
        }
        .progress {
            display: none;
            text-align: center;
            padding: 20px;
            background: #e8f5e8;
            border-radius: 6px;
            margin: 20px 0;
        }
        .results {
            display: none;
            margin-top: 20px;
            padding: 20px;
            background: #e8f8ff;
            border-radius: 6px;
        }
        .error {
            display: none;
            background: #ffe6e6;
            color: #c0392b;
            padding: 15px;
            border-radius: 6px;
            margin: 15px 0;
        }
        @media (max-width: 768px) {
            .form-grid {
                grid-template-columns: 1fr;
            }
            body {
                padding: 10px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>♟️ BookBuilder</h1>
        <p class="subtitle">Generate chess opening repertoires using Lichess database statistics and Stockfish engine evaluation</p>
        
        <form id="bookbuilder-form">
            <!-- Opening Book Configuration -->
            <div class="section">
                <h3>📚 Opening Books</h3>
                <div class="form-group">
                    <label for="opening-books">Opening Books (PGN Format):</label>
                    <textarea id="opening-books" name="opening_books" placeholder='[{"Name": "King\'s Pawn", "pgn": "1. e4 e5"},{"Name": "Queen\'s Gambit", "pgn": "1. d4 d5 2. c4"}]'>
[{"Name": "Book A", "pgn": "1. e4 e5"},{"Name": "Book B", "pgn": "1. e4 e5 2. f4"}]</textarea>
                    <div class="help-text">JSON format with opening names and starting PGNs. Repertoire is built from the last player's perspective.</div>
                </div>
                <div class="form-group">
                    <label for="long-to-short">Line Ordering:</label>
                    <select id="long-to-short" name="long_to_short">
                        <option value="0">Short lines first</option>
                        <option value="1">Long lines first</option>
                    </select>
                </div>
            </div>

            <!-- Database Settings -->
            <div class="section">
                <h3>🎯 Lichess Database Settings</h3>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="variant">Variant:</label>
                        <select id="variant" name="variant">
                            <option value="standard">Standard</option>
                            <option value="chess960">Chess960</option>
                            <option value="antichess">Antichess</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="speeds">Time Controls:</label>
                        <input type="text" id="speeds" name="speeds" value="blitz,rapid,classical,correspondence">
                        <div class="help-text">Comma-separated: blitz, rapid, classical, correspondence</div>
                    </div>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="ratings">Rating Ranges:</label>
                        <input type="text" id="ratings" name="ratings" value="1600,1800,2000,2200,2500">
                        <div class="help-text">Comma-separated rating thresholds</div>
                    </div>
                    <div class="form-group">
                        <label for="moves">Max Moves to Analyze:</label>
                        <input type="number" id="moves" name="moves" value="10" min="5" max="50">
                        <div class="help-text">Number of most played moves to consider (min 5)</div>
                    </div>
                </div>
            </div>

            <!-- Move Selection Settings -->
            <div class="section">
                <h3>🧠 Move Selection Settings</h3>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="depth-likelihood">Depth Likelihood Threshold:</label>
                        <input type="number" id="depth-likelihood" name="depth_likelihood" value="0.03" min="0.001" max="0.5" step="0.001">
                        <div class="help-text">Probability threshold for line depth (0.03 = 3%)</div>
                    </div>
                    <div class="form-group">
                        <label for="alpha">Statistical Alpha:</label>
                        <input type="number" id="alpha" name="alpha" value="0.001" min="0.001" max="0.1" step="0.001">
                        <div class="help-text">Confidence interval alpha (0.001 = 99.9% CI)</div>
                    </div>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="min-playrate">Min Play Rate:</label>
                        <input type="number" id="min-playrate" name="min_playrate" value="0.001" min="0.001" max="0.1" step="0.001">
                        <div class="help-text">Minimum move frequency to consider (0.001 = 0.1%)</div>
                    </div>
                    <div class="form-group">
                        <label for="min-games">Min Games:</label>
                        <input type="number" id="min-games" name="min_games" value="19" min="1" max="100">
                        <div class="help-text">Minimum games for move consideration</div>
                    </div>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="continuation-games">Min Continuation Games:</label>
                        <input type="number" id="continuation-games" name="continuation_games" value="10" min="1" max="100">
                        <div class="help-text">Min games for opponent continuations</div>
                    </div>
                    <div class="form-group">
                        <label for="draws-half">Draw Scoring:</label>
                        <select id="draws-half" name="draws_half">
                            <option value="0">Draws = 0 points</option>
                            <option value="1">Draws = 0.5 points</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Engine Settings -->
            <div class="section">
                <h3>⚙️ Engine Settings</h3>
                <div class="form-group">
                    <label for="care-engine">Use Engine Evaluation:</label>
                    <select id="care-engine" name="care_engine">
                        <option value="0">No engine (faster)</option>
                        <option value="1">Use Stockfish engine</option>
                    </select>
                    <div class="help-text">Engine provides move quality analysis but increases generation time</div>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="engine-depth">Engine Depth:</label>
                        <input type="number" id="engine-depth" name="engine_depth" value="20" min="10" max="40">
                        <div class="help-text">Analysis depth (20+ recommended, higher = slower)</div>
                    </div>
                    <div class="form-group">
                        <label for="engine-finish">Engine Finishing:</label>
                        <select id="engine-finish" name="engine_finish">
                            <option value="1">Complete lines with engine</option>
                            <option value="0">Stop at human data limits</option>
                        </select>
                    </div>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="soundness-limit">Soundness Limit (centipawns):</label>
                        <input type="number" id="soundness-limit" name="soundness_limit" value="-99" max="0">
                        <div class="help-text">Max acceptable disadvantage (-300 = 3 pawn deficit)</div>
                    </div>
                    <div class="form-group">
                        <label for="move-loss-limit">Move Loss Limit (centipawns):</label>
                        <input type="number" id="move-loss-limit" name="move_loss_limit" value="-99" max="0">
                        <div class="help-text">Max centipawn loss vs engine suggestion</div>
                    </div>
                </div>
            </div>

            <button type="submit" class="generate-btn" id="generate-btn">
                🚀 Generate Opening Repertoire
            </button>
        </form>

        <div class="progress" id="progress">
            <h3>🔄 Generating Your Repertoire...</h3>
            <p>This may take several minutes depending on the complexity of your openings and engine settings.</p>
            <p>Please keep this page open while generation is in progress.</p>
        </div>

        <div class="error" id="error-message"></div>

        <div class="results" id="results">
            <h3>✅ Generation Complete!</h3>
            <p>Your opening repertoire has been generated successfully.</p>
            <div id="download-links"></div>
        </div>
    </div>

    <script>
        document.getElementById('bookbuilder-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const generateBtn = document.getElementById('generate-btn');
            const progress = document.getElementById('progress');
            const results = document.getElementById('results');
            const errorDiv = document.getElementById('error-message');
            
            // Hide previous results and errors
            results.style.display = 'none';
            errorDiv.style.display = 'none';
            
            // Show progress and disable button
            progress.style.display = 'block';
            generateBtn.disabled = true;
            generateBtn.textContent = '⏳ Generating...';
            
            try {
                // Collect form data
                const formData = new FormData(e.target);
                const config = {};
                
                // Convert form data to config object with proper field mapping
                const fieldMapping = {
                    'opening_books': 'OPENINGBOOK',
                    'long_to_short': 'LONGTOSHORT',
                    'variant': 'VARIANT',
                    'speeds': 'SPEEDS',
                    'ratings': 'RATINGS',
                    'moves': 'MOVES',
                    'depth_likelihood': 'DEPTHLIKELIHOOD',
                    'alpha': 'ALPHA',
                    'min_playrate': 'MINPLAYRATE',
                    'min_games': 'MINGAMES',
                    'continuation_games': 'CONTINUATIONGAMES',
                    'draws_half': 'DRAWSAREHALF',
                    'care_engine': 'CAREABOUTENGINE',
                    'engine_depth': 'ENGINEDEPTH',
                    'engine_finish': 'ENGINEFINISH',
                    'soundness_limit': 'SOUNDNESSLIMIT',
                    'move_loss_limit': 'MOVELOSSLIMIT'
                };
                
                for (let [key, value] of formData.entries()) {
                    const configKey = fieldMapping[key];
                    if (!configKey) continue; // Skip unknown fields
                    
                    if (key === 'opening_books') {
                        try {
                            config[configKey] = JSON.parse(value);
                        } catch (err) {
                            throw new Error('Invalid opening books JSON format');
                        }
                    } else if (key === 'speeds' || key === 'ratings') {
                        // Keep as single comma-separated string in array format for original config compatibility
                        config[configKey] = [value.trim()];
                    } else if (key.includes('likelihood') || key === 'alpha' || key.includes('playrate')) {
                        config[configKey] = parseFloat(value);
                    } else if (key.includes('games') || key.includes('depth') || key.includes('moves') || key.includes('limit')) {
                        config[configKey] = parseInt(value);
                    } else {
                        // Handle select dropdowns and other string values
                        if (value === 'true' || value === 'false') {
                            config[configKey] = parseInt(value === 'true' ? '1' : '0');
                        } else if (!isNaN(value) && value !== '') {
                            config[configKey] = parseInt(value);
                        } else {
                            config[configKey] = value;
                        }
                    }
                }
                
                // Send request to Flask backend
                const response = await fetch('/generate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(config)
                });
                
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Generation failed');
                }
                
                const result = await response.json();
                
                // Hide progress
                progress.style.display = 'none';
                
                // Show results
                results.style.display = 'block';
                const downloadLinks = document.getElementById('download-links');
                downloadLinks.innerHTML = '';
                
                if (result.files && result.files.length > 0) {
                    result.files.forEach(filename => {
                        const link = document.createElement('a');
                        link.href = `/download/${filename}`;
                        link.textContent = `📥 Download ${filename}`;
                        link.className = 'download-link';
                        link.style.display = 'block';
                        link.style.margin = '10px 0';
                        link.style.padding = '10px 15px';
                        link.style.background = '#3498db';
                        link.style.color = 'white';
                        link.style.textDecoration = 'none';
                        link.style.borderRadius = '4px';
                        link.download = filename;
                        downloadLinks.appendChild(link);
                    });
                } else {
                    downloadLinks.innerHTML = '<p>No files were generated. Please check your configuration.</p>';
                }
                
            } catch (error) {
                console.error('Error:', error);
                progress.style.display = 'none';
                errorDiv.style.display = 'block';
                errorDiv.textContent = `Error: ${error.message}`;
            } finally {
                // Re-enable button
                generateBtn.disabled = false;
                generateBtn.textContent = '🚀 Generate Opening Repertoire';
            }
        });
    </script>
</body>
</html>
'''

@app.route('/')
def home():
    """Serve the main web interface."""
    return render_template_string(HTML_TEMPLATE)

@app.route('/health')
def health():
    """Health check endpoint for Railway."""
    return jsonify({"status": "healthy", "timestamp": datetime.now().isoformat()})

@app.route('/generate', methods=['POST'])
def generate_repertoire():
    """Generate opening repertoire using the existing BookBuilder.py script."""
    try:
        config_data = request.json
        logger.info(f"Received generation request with config: {list(config_data.keys())}")
        
        # Create temporary config file
        config_filename = f"config_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{os.getpid()}.yaml"
        config_path = os.path.join(UPLOAD_FOLDER, config_filename)
        
        # Ensure all config values are proper primitive types (not nested objects)
        def flatten_config_value(value):
            """Convert any nested dict/object values to primitives"""
            if isinstance(value, dict) and len(value) == 0:
                return 0  # Empty dict becomes 0
            elif isinstance(value, dict) and len(value) == 1:
                # Single-key dict, return the value
                return list(value.values())[0]
            elif isinstance(value, (list, tuple)) and len(value) == 1:
                return flatten_config_value(value[0])
            return value
        
        # Flatten all config values to avoid addict.Dict issues
        for key, value in config_data.items():
            config_data[key] = flatten_config_value(value)
            
        # Add required fields that aren't in the form
        config_data.update({
            'VARIANT': config_data.get('VARIANT', 'standard'),
            'ENGINEPATH': '/usr/local/bin/stockfish',  # Default path, will be ignored if CAREABOUTENGINE=0
            'ENGINETHREADS': 1,
            'ENGINEHASH': 320,
            'IGNORELOSSLIMIT': 300,
            'PRINT_INFO_TO_CONSOLE': True
        })
        
        # Debug: Log the final config structure
        logger.info(f"Final config before writing: DRAWSAREHALF={config_data.get('DRAWSAREHALF', 'MISSING')}, type={type(config_data.get('DRAWSAREHALF', 'MISSING'))}")
        
        # Write config file
        with open(config_path, 'w') as f:
            yaml.dump(config_data, f, default_flow_style=False)
        
        logger.info(f"Created config file: {config_path}")
        
        # Change to output directory
        original_cwd = os.getcwd()
        os.chdir(OUTPUT_FOLDER)
        
        try:
            # Run BookBuilder.py with the generated config
            cmd = [
                'python3', 
                os.path.join(original_cwd, 'BookBuilder.py')
            ]
            
            logger.info(f"Running command: {' '.join(cmd)}")
            logger.info(f"Working directory: {os.getcwd()}")
            
            # Run with config path as input
            process = subprocess.run(
                cmd,
                input=config_path,
                text=True,
                capture_output=True,
                timeout=300  # 5 minute timeout
            )
            
            logger.info(f"BookBuilder exit code: {process.returncode}")
            logger.info(f"BookBuilder stdout: {process.stdout}")
            if process.stderr:
                logger.warning(f"BookBuilder stderr: {process.stderr}")
            
            if process.returncode != 0:
                error_msg = f"BookBuilder failed: {process.stderr or process.stdout}"
                logger.error(error_msg)
                return jsonify({"error": error_msg}), 500
            
            # Find generated PGN files
            generated_files = []
            for file in os.listdir(OUTPUT_FOLDER):
                if file.endswith('.pgn') and file.startswith('Chapter_'):
                    generated_files.append(file)
                    logger.info(f"Found generated file: {file}")
            
            if not generated_files:
                logger.warning("No PGN files were generated")
                return jsonify({"error": "No PGN files were generated. Check your opening book configuration."}), 500
            
            return jsonify({
                "status": "success",
                "files": generated_files,
                "message": f"Generated {len(generated_files)} opening repertoire(s)"
            })
            
        finally:
            # Restore original working directory
            os.chdir(original_cwd)
            
            # Clean up config file
            try:
                os.remove(config_path)
            except Exception as e:
                logger.warning(f"Could not remove config file {config_path}: {e}")
        
    except subprocess.TimeoutExpired:
        logger.error("BookBuilder generation timed out")
        return jsonify({"error": "Generation timed out. Try reducing complexity or engine depth."}), 500
    except Exception as e:
        logger.error(f"Generation error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/download/<filename>')
def download_file(filename):
    """Serve generated PGN files for download."""
    try:
        # Security: only allow .pgn files
        if not filename.endswith('.pgn') or not filename.startswith('Chapter_'):
            abort(404)
        
        # Try the filename as-is first, then with secure_filename transformation
        file_path = os.path.join(OUTPUT_FOLDER, filename)
        if not os.path.exists(file_path):
            file_path = os.path.join(OUTPUT_FOLDER, secure_filename(filename))
        
        if not os.path.exists(file_path):
            logger.warning(f"Requested file not found: {filename} (tried both original and secure versions)")
            abort(404)
        
        logger.info(f"Serving download: {filename}")
        return send_file(file_path, as_attachment=True, download_name=filename)
        
    except Exception as e:
        logger.error(f"Download error: {str(e)}")
        abort(500)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV') == 'development'
    
    logger.info(f"Starting BookBuilder Flask server on port {port}")
    logger.info(f"Debug mode: {debug}")
    logger.info(f"Upload folder: {UPLOAD_FOLDER}")
    logger.info(f"Output folder: {OUTPUT_FOLDER}")
    
    app.run(host='0.0.0.0', port=port, debug=debug)