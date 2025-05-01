#!/bin/bash

# Run script for PDF OCR and Analysis Tool on macOS

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Python3 is not installed. Please install Python 3.7 or higher."
    echo "You can install it using Homebrew: brew install python3"
    exit 1
fi

# Check if Tesseract is installed
if ! command -v tesseract &> /dev/null; then
    echo "Tesseract OCR is not installed. Installing with Homebrew..."
    if ! command -v brew &> /dev/null; then
        echo "Homebrew is not installed. Please install Homebrew first:"
        echo '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
        exit 1
    fi
    brew install tesseract
    brew install tesseract-lang
    echo "Tesseract OCR installed."
else
    echo "Tesseract OCR is already installed."
fi

# Check if Pandoc is installed
if ! command -v pandoc &> /dev/null; then
    echo "Pandoc is not installed. Installing with Homebrew..."
    if ! command -v brew &> /dev/null; then
        echo "Homebrew is not installed. Please install Homebrew first:"
        echo '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
        exit 1
    fi
    brew install pandoc
    echo "Pandoc installed."
else
    echo "Pandoc is already installed."
fi

# Check if required language packs are installed
if ! tesseract --list-langs | grep -q "eng"; then
    echo "English language pack for Tesseract is missing. Installing..."
    brew install tesseract-lang
fi

if ! tesseract --list-langs | grep -q "heb"; then
    echo "Hebrew language pack for Tesseract is missing. Installing..."
    brew install tesseract-lang
fi

# Check if Poppler (for pdf2image) is installed
if ! command -v pdfinfo &> /dev/null; then
    echo "Poppler is not installed. Installing with Homebrew..."
    brew install poppler
    echo "Poppler installed."
else
    echo "Poppler is already installed."
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    echo "Virtual environment created."
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install or update dependencies
echo "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Run setup script
echo "Running setup script..."
python setup.py

# Create logs directory
mkdir -p logs

# Run the application
echo "Starting the application..."
echo "Access the application at http://localhost:5000"
python app.py 2>&1 | tee logs/app_$(date +%Y%m%d_%H%M%S).log

# Deactivate virtual environment on exit
trap "echo 'Deactivating virtual environment...'; deactivate" EXIT