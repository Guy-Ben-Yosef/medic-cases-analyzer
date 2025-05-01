# Medic Cases Analyzer

## PDF OCR and Analysis Tool

A specialized tool for analyzing multi-language medical documents with advanced OCR, annotation detection, and search capabilities.

## Overview

Medic Cases Analyzer is a web application that processes PDF documents containing medical information, particularly those with mixed language content (Hebrew and English). The tool extracts text using OCR, detects highlighted annotations, and provides powerful search and filtering capabilities for efficient document analysis.

### Key Features

- **Multi-language OCR**: Process documents containing both Hebrew and English text
- **Annotation Detection**: Identify highlighted sections in PDF documents
- **Full-text Search**: Search for specific words or phrases across all pages
- **Intuitive Filtering**: Filter pages based on highlights, search terms, or both
- **Notes System**: Add and export notes for specific pages
- **Image Viewing**: View high-quality page images with zoom and pan capabilities
- **Real-time Progress Tracking**: Monitor OCR processing through a real-time progress bar
- **DOCX Export**: Export all notes with page references as a DOCX document
- **RTL Support**: Full right-to-left text support for Hebrew content

## Installation

### Prerequisites

- Python 3.7 or higher
- Tesseract OCR with Hebrew and English language packs
- Poppler (for PDF to image conversion)
- Pandoc (for DOCX export)

### macOS Installation (using the included script)

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/medic-cases-analyzer.git
   cd medic-cases-analyzer
   ```

2. Run the setup script:
   ```bash
   chmod +x run.sh
   ./run.sh
   ```

The script will:
- Check for and install Python dependencies
- Install Tesseract OCR with necessary language packs
- Install Pandoc for DOCX export
- Install Poppler for PDF conversion
- Create a virtual environment and install required Python packages
- Set up the necessary directory structure
- Start the application

### Manual Installation

1. Install system dependencies:
   ```bash
   # For macOS
   brew install tesseract
   brew install tesseract-lang
   brew install poppler
   brew install pandoc
   
   # For Ubuntu/Debian
   sudo apt-get install tesseract-ocr
   sudo apt-get install tesseract-ocr-heb tesseract-ocr-eng
   sudo apt-get install poppler-utils
   sudo apt-get install pandoc
   ```

2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Run the setup script:
   ```bash
   python setup.py
   ```

## Usage

1. Start the application:
   ```bash
   python app.py
   ```

2. Open your web browser and navigate to:
   ```
   http://localhost:5000
   ```

3. Upload a PDF document for processing:
   - Select your PDF file
   - Optionally specify page ranges to process
   - Click "Upload and Process PDF"

4. Once processing is complete:
   - Enter search terms (comma-separated) in the search box
   - Choose a filter type (All Pages, Highlights Only, Search Words Only, or both)
   - Click "Apply Filters" to view results
   - Navigate between pages using the page list or navigation buttons
   - Add notes to pages as needed
   - Export notes to DOCX when finished

## Project Structure

```
medic-cases-analyzer/
├── app.py                    # Main Flask application
├── pdf_ocr_processor.py      # PDF OCR processing logic
├── ocr_results_searcher.py   # Search functionality for OCR results
├── progress_tracker.py       # WebSocket-based progress tracking
├── setup.py                  # Project setup script
├── run.sh                    # macOS installation and run script
├── requirements.txt          # Python dependencies
├── templates/                # HTML templates
│   └── index.html            # Main web interface
├── static/                   # Static assets
│   ├── css/                  # CSS stylesheets
│   │   └── styles.css        # Main stylesheet
│   └── js/                   # JavaScript files
│       └── main.js           # Main frontend logic
├── results/                  # Stores OCR results (JSON)
├── temp_images/              # Temporary storage for page images
├── notes/                    # Temporary storage for notes
├── docx_files/               # Exported DOCX files
└── styles/                   # DOCX reference styles
```

## Command Line Interfaces

### PDF OCR Processor

```bash
python pdf_ocr_processor.py --pdf-path document.pdf --output results.json --start-page 1 --end-page 10 --dpi 300 --image-dir images/
```

### OCR Results Searcher

```bash
python ocr_results_searcher.py --json-path results.json --words word1 word2 --output filtered_results.json
```

## Technical Features

- **WebSocket-based Progress Tracking**: Real-time updates during OCR processing
- **Whole-word Matching**: Search algorithm matches whole words, not parts of larger words
- **Image Enhancement**: High-quality PDF to image conversion for optimal OCR
- **RTL/LTR Text Direction Detection**: Automatic detection of text direction
- **Dynamic Page Filtering**: Filter pages based on various criteria
- **Pandoc Integration**: Convert notes to properly formatted DOCX documents
- **Responsive UI**: Works on desktop and mobile devices

## Browser Compatibility

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Troubleshooting

### Common Issues

1. **OCR Quality Issues**:
   - Try increasing the DPI value for better image quality
   - Ensure the PDF document is of good quality
   - Check that Tesseract language packs are properly installed

2. **Installation Problems**:
   - Ensure all dependencies are properly installed
   - Check system compatibility with required packages
   - Review logs for specific error messages

3. **Processing Errors**:
   - Verify PDF document isn't corrupted
   - Check file permissions
   - Try processing a smaller page range

### Logs

Application logs are stored in:
- Application: `logs/app_[timestamp].log`
- OCR Process: `ocr_process.log`

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [Tesseract OCR](https://github.com/tesseract-ocr/tesseract)
- [pdf2image](https://github.com/Belval/pdf2image)
- [PyMuPDF](https://github.com/pymupdf/PyMuPDF)
- [Flask](https://flask.palletsprojects.com/)
- [Flask-SocketIO](https://flask-socketio.readthedocs.io/)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
