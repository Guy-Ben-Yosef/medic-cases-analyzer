from flask import Flask, request, jsonify, render_template, send_from_directory
import os
import tempfile
import uuid
import json
from werkzeug.utils import secure_filename

# Import the functionality from the provided scripts
from pdf_ocr_processor import process_pdf
from ocr_results_searcher import search_words_in_pages, normalize_text

app = Flask(__name__, static_folder='static', template_folder='templates')

# Configure upload folder
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
RESULTS_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'results')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['RESULTS_FOLDER'] = RESULTS_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload size

# Ensure folders exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(RESULTS_FOLDER, exist_ok=True)

# Default search words
DEFAULT_SEARCH_WORDS = ["important", "note", "key", "conclusion"]

@app.route('/')
def index():
    """Render the main page."""
    return render_template('index.html', default_words=DEFAULT_SEARCH_WORDS)

@app.route('/upload-pdf', methods=['POST'])
def upload_pdf():
    """Handle PDF upload and processing."""
    if 'pdfFile' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['pdfFile']
    
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if file and file.filename.lower().endswith('.pdf'):
        # Generate a unique filename
        unique_id = str(uuid.uuid4())
        filename = secure_filename(file.filename)
        base_filename = os.path.splitext(filename)[0]
        
        # Save the uploaded PDF
        pdf_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{unique_id}_{filename}")
        file.save(pdf_path)
        
        # Process the PDF and save results
        output_path = os.path.join(app.config['RESULTS_FOLDER'], f"{unique_id}_{base_filename}_ocr_results.json")
        
        # Get page range if specified
        start_page = request.form.get('startPage', type=int)
        end_page = request.form.get('endPage', type=int)
        
        page_numbers = None
        if start_page:
            if end_page and end_page >= start_page:
                page_numbers = list(range(start_page, end_page + 1))
            else:
                page_numbers = [start_page]
        
        # Process the PDF
        success = process_pdf(pdf_path, output_path, page_numbers)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'PDF processed successfully',
                'result_id': unique_id,
                'original_filename': filename,
                'result_path': output_path
            })
        else:
            return jsonify({'error': 'Failed to process PDF'}), 500
    
    return jsonify({'error': 'Invalid file type. Please upload a PDF file.'}), 400

@app.route('/get-results/<result_id>/<filename>')
def get_results(result_id, filename):
    """Get OCR results for the processed PDF."""
    base_filename = os.path.splitext(filename)[0]
    result_path = os.path.join(app.config['RESULTS_FOLDER'], f"{result_id}_{base_filename}_ocr_results.json")
    
    if os.path.exists(result_path):
        with open(result_path, 'r', encoding='utf-8') as f:
            ocr_results = json.load(f)
        return jsonify(ocr_results)
    else:
        return jsonify({'error': 'Results not found'}), 404

@app.route('/search-results', methods=['POST'])
def search_results():
    """Search within OCR results for specific words."""
    data = request.get_json()
    
    if not data or 'resultPath' not in data or 'searchWords' not in data:
        return jsonify({'error': 'Missing required parameters'}), 400
    
    result_path = data['resultPath']
    search_words = set(data['searchWords'])
    filter_type = data.get('filterType', 'both')  # 'highlights', 'words', or 'both'
    
    if not os.path.exists(result_path):
        return jsonify({'error': 'Results file not found'}), 404
    
    try:
        # Load OCR results
        with open(result_path, 'r', encoding='utf-8') as f:
            ocr_results = json.load(f)
        
        # Search for words in pages
        search_results = {}
        if 'words' in filter_type or filter_type == 'both':
            search_results = search_words_in_pages(ocr_results, search_words)
        
        # Filter pages based on criteria
        filtered_pages = []
        for page in ocr_results.get('pages', []):
            page_number = page.get('page_number')
            has_annotations = page.get('has_annotations', False)
            contains_search_words = search_results.get(page_number, False)
            
            include_page = False
            if filter_type == 'highlights' and has_annotations:
                include_page = True
            elif filter_type == 'words' and contains_search_words:
                include_page = True
            elif filter_type == 'both' and (has_annotations or contains_search_words):
                include_page = True
            
            if include_page:
                page['contains_search_words'] = contains_search_words
                filtered_pages.append(page)
        
        # Create filtered results
        filtered_results = ocr_results.copy()
        filtered_results['filtered_pages'] = filtered_pages
        filtered_results['search_information'] = {
            'search_words': list(search_words),
            'filter_type': filter_type,
            'total_matching_pages': len(filtered_pages)
        }
        
        return jsonify(filtered_results)
    
    except Exception as e:
        return jsonify({'error': f'Error processing search: {str(e)}'}), 500

@app.route('/download-json/<result_id>/<filename>')
def download_json(result_id, filename):
    """Download the JSON results file."""
    base_filename = os.path.splitext(filename)[0]
    return send_from_directory(
        app.config['RESULTS_FOLDER'],
        f"{result_id}_{base_filename}_ocr_results.json",
        as_attachment=True
    )

if __name__ == '__main__':
    app.run(debug=True, port=5000)