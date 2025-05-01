# PDF OCR and Analysis Tool

A web application for processing PDF files, extracting text via OCR, and analyzing the documents based on highlighted content and specific keywords.

## Features

- PDF upload and processing
- OCR (Optical Character Recognition) for text extraction
- Support for multilingual documents (particularly Hebrew and English)
- Detection of highlighted/annotated content
- Search for specific keywords within processed pages
- Filter pages based on highlights, search words, or both
- Download processing results as JSON
- Toggle RTL/LTR text direction for better readability
- Responsive web interface

## Project Structure

```
pdf-ocr-tool/
├── app.py                  # Flask application main file
├── pdf_ocr_processor.py    # OCR processing script
├── ocr_results_searcher.py # Results searching and filtering script
├── static/                 # Static files
│   ├── css/
│   │   └── styles.css      # Custom styles
│   └── js/
│       └── main.js         # Frontend JavaScript
├── templates/
│   └── index.html          # Main HTML template
├── uploads/                # Directory for uploaded PDFs
└── results/                # Directory for OCR results
```

## Requirements

- Python 3.7+
- Tesseract OCR
- Required Python packages (see requirements.txt)

## Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd pdf-ocr-tool
   ```

2. Install Tesseract OCR:
   - Ubuntu/Debian: `sudo apt-get install tesseract-ocr tesseract-ocr-heb tesseract-ocr-eng`
   - macOS: `brew install tesseract tesseract-lang`
   - Windows: Download and install from https://github.com/UB-Mannheim/tesseract/wiki

3. Install required Python packages:
   ```
   pip install -r requirements.txt
   ```

4. Create necessary directories:
   ```
   mkdir -p uploads results
   ```

## Usage

1. Start the Flask application:
   ```
   python app.py
   ```

2. Open a web browser and navigate to:
   ```
   http://localhost:5000
   ```

3. Upload a PDF document, set optional parameters, and click "Upload and Process PDF"

4. Once processing is complete, you can:
   - Edit search words (default words are provided)
   - Select filtering options (highlights, words, or both)
   - View the filtered pages and their content
   - Toggle between RTL and LTR text display
   - Download the complete OCR results as JSON