#!/usr/bin/env python3
"""
Golden Master Data Extraction Script for TDD Migration

This script runs the Python BookBuilder with specific test configurations
to generate golden master data for JavaScript TDD validation.

Test Openings:
- Ruy Lopez: 1. e4 e5 2. Nf3 Nc6 3. Bb5 (White's perspective)
- King's Indian Defense: 1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 (Black's perspective)

Usage:
    python migration/extract_golden_master.py
"""

import os
import sys
import json
import time
import shutil
import yaml
from pathlib import Path

# Add legacy core to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'legacy' / 'core'))

def main():
    """Main extraction function"""
    print("🧪 BookBuilder Golden Master Extraction")
    print("="*50)

    script_dir = Path(__file__).parent
    golden_dir = script_dir / 'golden-master-data'
    config_path = script_dir / 'golden-master-config.yaml'

    # Create golden master directory
    golden_dir.mkdir(exist_ok=True)

    print(f"📁 Golden master data will be saved to: {golden_dir}")
    print(f"⚙️  Using config: {config_path}")

    # Load and display config
    with open(config_path, 'r') as f:
        test_config = yaml.safe_load(f)

    print(f"\n📖 Test Openings:")
    for i, opening in enumerate(test_config['OPENINGBOOK'], 1):
        perspective = "White" if len(opening['pgn'].split()) % 2 == 1 else "Black"
        print(f"   {i}. {opening['Name']}: {opening['pgn']} ({perspective})")

    print(f"\n🎯 Test Configuration:")
    print(f"   Depth Likelihood: {test_config['DEPTHLIKELIHOOD']}")
    print(f"   Min Games: {test_config['MINGAMES']}")
    print(f"   Min Play Rate: {test_config['MINPLAYRATE']}")
    print(f"   Engine Enabled: {test_config['CAREABOUTENGINE'] == 1}")

    # Stay in project root directory for correct import paths
    original_cwd = os.getcwd()
    project_root = Path(__file__).parent.parent

    print(f"\n🚀 Running BookBuilder from project root: {project_root}")

    try:
        # Change to project root directory
        os.chdir(project_root)

        # Change to golden master directory for PGN output
        os.chdir(golden_dir)

        # Track start time
        start_time = time.time()

        # Run BookBuilder using subprocess with correct PYTHONPATH
        import subprocess

        # Set up environment with project root in PYTHONPATH
        env = os.environ.copy()
        env['PYTHONPATH'] = str(project_root)

        cmd = [
            sys.executable,
            str(project_root / 'legacy' / 'core' / 'BookBuilder.py'),
            str(config_path.absolute())
        ]

        print(f"✓ Executing: {' '.join(cmd)}")
        print(f"✓ PYTHONPATH: {env['PYTHONPATH']}")

        result = subprocess.run(cmd, capture_output=True, text=True, cwd=golden_dir, env=env)

        if result.returncode != 0:
            print(f"❌ BookBuilder failed with return code {result.returncode}")
            print(f"STDOUT: {result.stdout}")
            print(f"STDERR: {result.stderr}")
            raise Exception(f"BookBuilder execution failed")

        print(f"✓ BookBuilder completed successfully")
        if result.stdout:
            print(f"Output: {result.stdout[-500:]}")  # Last 500 chars

        # Track end time
        end_time = time.time()
        execution_time = end_time - start_time

        print(f"✓ Golden master extraction completed in {execution_time:.2f} seconds")

        # Validate outputs
        pgn_files = list(Path('.').glob('*.pgn'))

        if not pgn_files:
            raise Exception("No PGN files generated - extraction failed")

        print(f"\n📋 Generated Files:")
        total_size = 0
        for pgn_file in pgn_files:
            size = pgn_file.stat().st_size
            total_size += size
            print(f"   {pgn_file.name}: {size:,} bytes")

        print(f"   Total: {len(pgn_files)} files, {total_size:,} bytes")

        # Create metadata
        metadata = {
            'timestamp': time.time(),
            'execution_time_seconds': execution_time,
            'config_used': str(config_path.relative_to(script_dir.parent)),
            'openings': test_config['OPENINGBOOK'],
            'settings': {
                'DEPTHLIKELIHOOD': test_config['DEPTHLIKELIHOOD'],
                'MINPLAYRATE': test_config['MINPLAYRATE'],
                'MINGAMES': test_config['MINGAMES'],
                'CONTINUATIONGAMES': test_config['CONTINUATIONGAMES'],
                'DRAWSAREHALF': test_config['DRAWSAREHALF'],
                'ENGINE_ENABLED': test_config['CAREABOUTENGINE'] == 1
            },
            'files_generated': [f.name for f in pgn_files],
            'total_size_bytes': total_size
        }

        # Save metadata
        with open('golden_master_metadata.json', 'w') as f:
            json.dump(metadata, f, indent=2)

        print(f"✓ Metadata saved to golden_master_metadata.json")

        # Create test summary for JavaScript TDD
        test_cases = []
        for pgn_file in pgn_files:
            with open(pgn_file, 'r') as f:
                content = f.read()

            opening_name = pgn_file.stem.replace('Chapter_1_', '').replace('Chapter_2_', '')

            test_case = {
                'file': pgn_file.name,
                'opening': opening_name,
                'size_chars': len(content),
                'event_count': content.count('[Event'),
                'has_annotations': 'Move playrates:' in content,
                'has_winrates': 'Line winrate' in content,
                'sample_lines': content.split('\n\n\n')[1:4] if '\n\n\n' in content else []
            }
            test_cases.append(test_case)

        summary = {
            'golden_master_files': [f.name for f in pgn_files],
            'test_cases': test_cases,
            'validation_points': [
                'PGN format correctness',
                'Event naming consistency',
                'Move annotation format',
                'Winrate calculation accuracy',
                'Line ordering (short to long)',
                'Cumulative playrate calculations',
                'Perspective handling (White vs Black)',
                'Statistical precision'
            ],
            'tdd_instructions': {
                'setup': 'Copy these files to client/tests/golden-master/',
                'usage': 'Compare JavaScript outputs byte-for-byte against these files',
                'tolerance': 'Allow small floating-point differences (<0.01%)',
                'coverage': 'Test both White (Ruy Lopez) and Black (King\'s Indian) perspectives'
            }
        }

        with open('test_summary.json', 'w') as f:
            json.dump(summary, f, indent=2)

        print(f"✓ Test summary saved to test_summary.json")

        print(f"\n🎯 Golden Master Extraction Complete!")
        print(f"   Location: {golden_dir}")
        print(f"   Files: {len(pgn_files)} PGN files + metadata")
        print(f"   Test cases: {len(test_cases)}")

        print(f"\n📋 Next Steps for JavaScript TDD:")
        print(f"1. Copy {golden_dir}/*.pgn to client/tests/golden-master/")
        print(f"2. Implement JavaScript chess logic to match these exact outputs")
        print(f"3. Create Jest tests comparing JS output to golden master files")
        print(f"4. Achieve 100% functional parity before proceeding")

    except Exception as e:
        print(f"\n❌ Golden master extraction failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        # Return to original directory
        os.chdir(original_cwd)

if __name__ == '__main__':
    main()