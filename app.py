from flask import Flask, request, jsonify, render_template, send_from_directory, url_for, make_response
import os
import tempfile
import uuid
import json
import shutil
import datetime
import pypandoc
from werkzeug.utils import secure_filename

# Import the functionality from the provided scripts
from pdf_ocr_processor import process_pdf
from ocr_results_searcher import search_words_in_pages, normalize_text

app = Flask(__name__, static_folder='static', template_folder='templates')

# Configure storage folders (only results and temporary images)
RESULTS_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'results')
IMAGES_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp_images')
NOTES_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'notes')
DOCX_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'docx_files')

app.config['RESULTS_FOLDER'] = RESULTS_FOLDER
app.config['IMAGES_FOLDER'] = IMAGES_FOLDER
app.config['NOTES_FOLDER'] = NOTES_FOLDER
app.config['DOCX_FOLDER'] = DOCX_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload size

# Ensure folders exist
os.makedirs(RESULTS_FOLDER, exist_ok=True)
os.makedirs(IMAGES_FOLDER, exist_ok=True)
os.makedirs(NOTES_FOLDER, exist_ok=True)
os.makedirs(DOCX_FOLDER, exist_ok=True)

# Default search words
DEFAULT_SEARCH_WORDS = ["גב", "יד"]

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
        # Generate a unique ID for this processing session
        unique_id = str(uuid.uuid4())
        filename = secure_filename(file.filename)
        base_filename = os.path.splitext(filename)[0]
        
        # Clean up previous image directories to save space
        cleanup_old_images()
        
        # Create a temporary file for the PDF
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_pdf:
            # Save uploaded file to the temporary file
            file.save(temp_pdf.name)
            pdf_path = temp_pdf.name
        
        try:
            # Create a document-specific image directory
            document_images_folder = os.path.join(app.config['IMAGES_FOLDER'], unique_id)
            os.makedirs(document_images_folder, exist_ok=True)
            
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
            
            # Process the PDF with image saving
            success = process_pdf(
                pdf_path, 
                output_path, 
                page_numbers, 
                dpi=300, 
                image_output_dir=document_images_folder
            )
            
            # Delete the temporary PDF file after processing
            os.unlink(pdf_path)
            
            if success:
                # Update the JSON file with image URLs for web access
                with open(output_path, 'r', encoding='utf-8') as f:
                    results = json.load(f)
                
                # Add image URLs for each page
                for page in results['pages']:
                    if 'image_path' in page:
                        page_num = page['page_number']
                        # Replace absolute path with URL route
                        page['image_url'] = url_for(
                            'serve_page_image', 
                            unique_id=unique_id, 
                            page_number=page_num
                        )
                
                # Save updated results
                with open(output_path, 'w', encoding='utf-8') as f:
                    json.dump(results, f, ensure_ascii=False, indent=2)
                
                return jsonify({
                    'success': True,
                    'message': 'PDF processed successfully',
                    'result_id': unique_id,
                    'original_filename': filename,
                    'result_path': output_path
                })
            else:
                return jsonify({'error': 'Failed to process PDF'}), 500
        except Exception as e:
            # Ensure temporary file is cleaned up in case of error
            if os.path.exists(pdf_path):
                os.unlink(pdf_path)
            return jsonify({'error': f'Error processing PDF: {str(e)}'}), 500
    
    return jsonify({'error': 'Invalid file type. Please upload a PDF file.'}), 400

@app.route('/page-images/<unique_id>/<int:page_number>')
def serve_page_image(unique_id, page_number):
    """Serve a page image."""
    image_filename = f"page_{page_number}.png"
    document_images_folder = os.path.join(app.config['IMAGES_FOLDER'], unique_id)
    return send_from_directory(document_images_folder, image_filename)

def cleanup_old_images():
    """
    Clean up old image directories to save disk space.
    Completely purges the temp_images directory before each use.
    """
    try:
        images_folder = app.config['IMAGES_FOLDER']
        if not os.path.exists(images_folder):
            return
            
        # Simply remove the entire temp_images directory and recreate it
        shutil.rmtree(images_folder)
        os.makedirs(images_folder)
        print(f"Cleaned up temporary images directory: {images_folder}")
    except Exception as e:
        print(f"Error cleaning up old images: {str(e)}")
        # Try to ensure the directory exists even if cleanup fails
        if not os.path.exists(images_folder):
            os.makedirs(images_folder)

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
    filter_type = data.get('filterType', 'both')  # 'highlights', 'words', 'both', or 'all'
    
    if not os.path.exists(result_path):
        return jsonify({'error': 'Results file not found'}), 404
    
    try:
        # Load OCR results
        with open(result_path, 'r', encoding='utf-8') as f:
            ocr_results = json.load(f)
        
        # Search for words in pages (returns dictionary with matched words info)
        search_results = {}
        if 'words' in filter_type or filter_type == 'both' or filter_type == 'all':
            # Use the improved search_words_in_pages function
            search_results = search_words_in_pages(ocr_results, search_words)
        
        # Prepare all pages for filtering
        all_pages = ocr_results.get('pages', []).copy()
        
        # Add search results to each page
        for page in all_pages:
            page_number = page.get('page_number')
            page_search_result = search_results.get(page_number, {})
            contains_search_words = page_search_result.get('matched', False)
            matched_words = page_search_result.get('matched_words', [])
            
            # Add search results to page data
            page['contains_search_words'] = contains_search_words
            page['matched_words'] = matched_words
        
        # Filter pages based on criteria, unless we want to show all pages
        filtered_pages = []
        if filter_type == 'all':
            # Include all pages, but still mark which ones match criteria
            filtered_pages = all_pages
        else:
            # Filter pages based on selected criteria
            for page in all_pages:
                has_annotations = page.get('has_annotations', False)
                contains_search_words = page.get('contains_search_words', False)
                
                include_page = False
                if filter_type == 'highlights' and has_annotations:
                    include_page = True
                elif filter_type == 'words' and contains_search_words:
                    include_page = True
                elif filter_type == 'both' and (has_annotations or contains_search_words):
                    include_page = True
                
                if include_page:
                    filtered_pages.append(page)
        
        # Create filtered results
        filtered_results = ocr_results.copy()
        filtered_results['filtered_pages'] = filtered_pages
        filtered_results['all_pages'] = all_pages  # Include all pages for reference
        filtered_results['search_information'] = {
            'search_words': list(search_words),
            'filter_type': filter_type,
            'total_matching_pages': len(filtered_pages) if filter_type != 'all' else sum(
                1 for page in all_pages if page.get('has_annotations', False) or page.get('contains_search_words', False)
            )
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

@app.route('/publish-notes', methods=['POST'])
def publish_notes():
    """Generate and save a docx file with notes for all pages."""
    data = request.get_json()
    
    if not data or 'notes' not in data or 'filename' not in data:
        return jsonify({'error': 'Missing required parameters'}), 400
    
    filename = secure_filename(data['filename'])
    base_filename = os.path.splitext(filename)[0]
    notes_data = data['notes']
    
    # Create notes content in markdown format
    markdown_content = f"# Notes for {filename}\n\n"
    markdown_content += f"**Date:** {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
    markdown_content += f"---\n\n"
    
    # Sort page numbers numerically
    page_numbers = sorted([int(page) for page in notes_data.keys() if notes_data[page].strip()])
    
    # Add each page's notes to the content
    for page_num in page_numbers:
        page_note = notes_data.get(str(page_num), '').strip()
        if page_note:
            markdown_content += f"## עמוד {page_num}\n\n"
            markdown_content += f"{page_note}\n\n"
    
    try:
        # Generate a unique filename with timestamp
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        
        # Generate temporary filenames for markdown and docx
        temp_md_filename = f"temp_notes_{base_filename}_{timestamp}.md"
        docx_filename = f"notes_{base_filename}_{timestamp}.docx"
        
        # Ensure directories exist
        os.makedirs(app.config['NOTES_FOLDER'], exist_ok=True)
        os.makedirs(app.config['DOCX_FOLDER'], exist_ok=True)
        
        # Full paths for files
        temp_md_path = os.path.join(app.config['NOTES_FOLDER'], temp_md_filename)
        docx_path = os.path.join(app.config['DOCX_FOLDER'], docx_filename)
        
        # Save markdown to a temporary file
        with open(temp_md_path, 'w', encoding='utf-8') as f:
            f.write(markdown_content)
        
        # Check if pandoc is installed
        try:
            import pypandoc
            # Get pandoc version to verify installation
            version = pypandoc.get_pandoc_version()
            print(f"Pandoc version: {version}")
        except Exception as e:
            print(f"Error checking pandoc: {str(e)}")
            # Fallback to text file if pandoc conversion fails
            return jsonify({'error': f'Pandoc not available: {str(e)}'}), 500
        
        # Check if reference file exists
        reference_docx_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'styles', 'reference.docx')
        reference_arg = ['--reference-doc=' + reference_docx_path] if os.path.exists(reference_docx_path) else []
        
        print(f"Converting {temp_md_path} to {docx_path}")
        
        try:
            # Try conversion with explicit pandoc path first
            pypandoc.convert_file(
                temp_md_path,
                'docx',
                outputfile=docx_path,
                extra_args=['--standalone'] + reference_arg
            )
        except Exception as pandoc_error:
            print(f"Error converting with pandoc: {str(pandoc_error)}")
            
            # As a fallback, let's return a text file instead of failing completely
            text_filename = f"notes_{base_filename}_{timestamp}.txt"
            text_path = os.path.join(app.config['NOTES_FOLDER'], text_filename)
            
            # Copy the markdown file to text file (they're essentially the same format)
            shutil.copy(temp_md_path, text_path)
            
            # Clean up the temporary file
            if os.path.exists(temp_md_path):
                os.remove(temp_md_path)
                
            # Return text file with warning
            response = make_response(open(text_path, 'r', encoding='utf-8').read())
            response.headers["Content-Disposition"] = f"attachment; filename={text_filename}"
            response.headers["Content-Type"] = "text/plain"
            return response
        
        # Clean up the temporary markdown file
        if os.path.exists(temp_md_path):
            os.remove(temp_md_path)
        
        if not os.path.exists(docx_path):
            return jsonify({'error': 'DOCX file was not created successfully'}), 500
            
        # Return the docx file for download
        return send_from_directory(
            app.config['DOCX_FOLDER'],
            docx_filename,
            as_attachment=True,
            etag=str(datetime.datetime.now().timestamp())
        )
    
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error converting to DOCX: {str(e)}")
        print(f"Detailed error: {error_details}")
        return jsonify({'error': f'Error converting to DOCX: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)