#!/usr/bin/env python3
"""
Setup script for the PDF OCR and Analysis Tool.
Creates necessary directories and ensures proper file structure.
"""

import os
import sys
import shutil

def setup_project():
    """Create necessary directories and file structure for the project."""
    print("Setting up PDF OCR and Analysis Tool...")
    
    # Define directory paths
    dirs = [
        'static',
        'static/css',
        'static/js',
        'templates',
        'results',
        'temp_images'
    ]
    
    # Create directories if they don't exist
    for directory in dirs:
        if not os.path.exists(directory):
            os.makedirs(directory)
            print(f"✓ Created directory: {directory}")
        else:
            print(f"✓ Directory already exists: {directory}")
    
    # Ensure static files are in the right place
    if os.path.exists('styles.css') and not os.path.exists('static/css/styles.css'):
        shutil.copy('styles.css', 'static/css/')
        print("✓ Moved styles.css to static/css/")
    
    if os.path.exists('main.js') and not os.path.exists('static/js/main.js'):
        shutil.copy('main.js', 'static/js/')
        print("✓ Moved main.js to static/js/")
    
    if os.path.exists('index.html') and not os.path.exists('templates/index.html'):
        shutil.copy('index.html', 'templates/')
        print("✓ Moved index.html to templates/")
    
    print("\nSetup complete! You can now run the application with: python app.py")

if __name__ == "__main__":
    setup_project()