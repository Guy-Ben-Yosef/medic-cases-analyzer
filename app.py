from flask import Flask, request, jsonify, render_template, send_from_directory, url_for, make_response
import os
import sys
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
from progress_tracker import init_socketio, start_progress_tracking, update_progress, complete_progress, get_progress

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
app.config['SERVER_NAME'] = '127.0.0.1:5000'  # Use your actual host:port
app.config['APPLICATION_ROOT'] = '/'
app.config['PREFERRED_URL_SCHEME'] = 'http'  # Use 'https' if you're using SSL

# Initialize SocketIO
socketio = init_socketio(app)

# Ensure folders exist
os.makedirs(RESULTS_FOLDER, exist_ok=True)
os.makedirs(IMAGES_FOLDER, exist_ok=True)
os.makedirs(NOTES_FOLDER, exist_ok=True)
os.makedirs(DOCX_FOLDER, exist_ok=True)

def load_search_words():
    """Load search words with fallback to template if user file doesn't exist."""
    user_file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'search_words.json')
    template_file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'search_words.template.json')
    
    # Try to load user-specific file first
    if os.path.exists(user_file_path):
        try:
            with open(user_file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading user search words: {str(e)}")
    
    # Fall back to template file
    try:
        with open(template_file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading template search words: {str(e)}")
        # Return a basic default if both files fail
        return [
            {"word": "גב", "representative_group": ["גב"]},
            {"word": "יד", "representative_group": ["יד"]}
        ]

def ensure_user_search_words_file():
    """Create user search words file from template if it doesn't exist."""
    user_file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'search_words.json')
    template_file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'search_words.template.json')
    
    # Only create if user file doesn't exist
    if not os.path.exists(user_file_path) and os.path.exists(template_file_path):
        try:
            # Copy template to user file
            with open(template_file_path, 'r', encoding='utf-8') as template_file:
                template_data = json.load(template_file)
            
            with open(user_file_path, 'w', encoding='utf-8') as user_file:
                json.dump(template_data, user_file, ensure_ascii=False, indent=2)
                
            print("Created user search words file from template")
        except Exception as e:
            print(f"Error creating user search words file: {str(e)}")

@app.route('/')
def index():
    """Render the main page."""
    search_words = load_search_words()
    return render_template('index.html', search_words=search_words)

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
            
            # Get total page count to initialize progress tracking
            try:
                from PyPDF2 import PdfReader
                pdf_reader = PdfReader(pdf_path)
                total_pages = len(pdf_reader.pages)
                
                # Initialize progress tracking for this session
                if page_numbers:
                    total_pages_to_process = len(page_numbers)
                else:
                    total_pages_to_process = total_pages
                
                start_progress_tracking(unique_id, total_pages_to_process)
                
                # Return initial response immediately so client can connect for progress updates
                initial_response = {
                    'success': True,
                    'message': 'PDF processing started',
                    'result_id': unique_id,
                    'original_filename': filename,
                    'total_pages': total_pages_to_process,
                    'status': 'processing'
                }
                
                # Create a copy of variables needed for the thread for thread safety
                thread_pdf_path = pdf_path
                thread_output_path = output_path
                thread_page_numbers = page_numbers
                thread_unique_id = unique_id
                thread_document_images_folder = document_images_folder
                
                # Start processing in a separate thread with better context handling
                import threading
                
                def process_pdf_thread(pdf_path, output_path, page_numbers, unique_id, document_images_folder):
                    # Create a new app context for this thread
                    with app.app_context():
                        try:
                            # Define progress callback
                            def progress_callback(current_page, total_pages, status, message=None, error=None):
                                update_progress(unique_id, current_page, status, message, error)
                            
                            # Process the PDF with progress updates
                            success = process_pdf(
                                pdf_path, 
                                output_path, 
                                page_numbers, 
                                dpi=300, 
                                image_output_dir=document_images_folder,
                                progress_callback=progress_callback
                            )
                            
                            # Mark processing as complete
                            complete_progress(unique_id, success=success)
                            
                            # If successful, update the JSON file with image URLs
                            if success:
                                try:
                                    with open(output_path, 'r', encoding='utf-8') as f:
                                        results = json.load(f)
                                    
                                    # Add image URLs for each page - use direct URL construction instead of url_for
                                    for page in results['pages']:
                                        if 'image_path' in page:
                                            page_num = page['page_number']
                                            # Build the URL directly instead of using url_for
                                            page['image_url'] = f'/page-images/{unique_id}/{page_num}'
                                    
                                    # Save updated results
                                    with open(output_path, 'w', encoding='utf-8') as f:
                                        json.dump(results, f, ensure_ascii=False, indent=2)
                                except Exception as e:
                                    print(f"Error updating JSON with image URLs: {str(e)}")
                                    # Still mark as complete since OCR processing succeeded
                                    update_progress(unique_id, total_pages_to_process, 'completed', 
                                                  message="Processing complete, but error with image links.")
                            
                            # Delete the temporary PDF file after processing
                            if os.path.exists(pdf_path):
                                os.unlink(pdf_path)
                                
                        except Exception as e:
                            # Update progress with error
                            error_msg = str(e)
                            print(f"Thread error: {error_msg}")
                            update_progress(unique_id, 0, 'error', error=error_msg)
                            
                            # Ensure temporary file is cleaned up
                            if os.path.exists(pdf_path):
                                os.unlink(pdf_path)
                
                # Start processing thread with all needed parameters
                processing_thread = threading.Thread(
                    target=process_pdf_thread,
                    args=(thread_pdf_path, thread_output_path, thread_page_numbers, 
                          thread_unique_id, thread_document_images_folder)
                )
                processing_thread.daemon = True  # Make thread exit when main thread exits
                processing_thread.start()
                
                return jsonify(initial_response)
                
            except Exception as e:
                # Clean up temporary file in case of error
                if os.path.exists(pdf_path):
                    os.unlink(pdf_path)
                return jsonify({'error': f'Failed to initialize PDF processing: {str(e)}'}), 500
                
        except Exception as e:
            # Ensure temporary file is cleaned up in case of error
            if os.path.exists(pdf_path):
                os.unlink(pdf_path)
            return jsonify({'error': f'Error processing PDF: {str(e)}'}), 500
    
    return jsonify({'error': 'Invalid file type. Please upload a PDF file.'}), 400

@app.route('/progress/<session_id>')
def get_processing_progress(session_id):
    """Get current processing progress for a session."""
    progress_data = get_progress(session_id)
    if progress_data:
        return jsonify(progress_data)
    else:
        return jsonify({'error': 'Session not found'}), 404

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
    """Generate and save a docx file with multiple note sets for each page."""
    data = request.get_json()
    
    if not data or 'noteSets' not in data or 'filename' not in data:
        return jsonify({'error': 'Missing required parameters'}), 400
    
    filename = secure_filename(data['filename'])
    base_filename = os.path.splitext(filename)[0]
    note_sets_data = data['noteSets']
    
    # Create notes content in markdown format
    markdown_content = f"1. המסמכים הרפואיים שעמדו בפני בעת עריכת חוות דעתי:\n"
    markdown_content += "* תיק קופת חולים (סיכומי ביקור, אישורים, הפניות, מרשמים)\n"

    family_doctor_dates = []
    orthopedicHealthInsurance_doctor_dates = []
    orthopedicHospital_doctor_dates = []
    for page_num in note_sets_data:
        page_note_sets = note_sets_data.get(str(page_num), [])
        for note_set in page_note_sets:
            # switch cases between family doctor and orthopedic doctor
            if note_set.get('doctorType') == 'רופא משפחה':
                family_doctor_dates.append(note_set.get('caseDate', ''))
            elif note_set.get('doctorType') == 'אורתופד':
                if note_set.get('isHospital', True):
                    orthopedicHospital_doctor_dates.append(note_set.get('caseDate', ''))
                else:
                    orthopedicHealthInsurance_doctor_dates.append(note_set.get('caseDate', ''))
    markdown_content += f"  * רופא משפחה -- {', '.join(family_doctor_dates)}\n"
    markdown_content += f"  * אורתופד -- {', '.join(orthopedicHealthInsurance_doctor_dates)}\n"
    markdown_content += "* בתי חולים --\n"
    if orthopedicHospital_doctor_dates:
        markdown_content += f"  * אורתופד -- {', '.join(orthopedicHospital_doctor_dates)}\n"

    markdown_content += "  1. במסמכים הרפואיים שעמדו לפני מצאתי רישומים רבים בהם מתוארים **כאבים בגב התחתון ובצוואר עובר לתאונה הראשונה**. להלן, חלק מאותן הרשומות:\n"
    
    # Acquire all notes and sort them by date and add to markdown content
    all_notes = []
    for page_num in note_sets_data:
        page_note_sets = note_sets_data.get(str(page_num), [])
        for note_set in page_note_sets:
            # Add each note set to the list
            all_notes.append(note_set)

    # Sort each and each note (not note set) by date
    all_notes.sort(key=lambda x: (x.get('caseDate', ''), x.get('doctorType', '')))
    for i, note in enumerate(all_notes):
        # Add each note to the markdown content
        markdown_content += f"  {i}. {note.get('doctorType', 'Unknown')} -- רשם ביום {note.get('caseDate', 'Unknown')}: {note.get('citationNotes', '')}\n"
    
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
        rtl_arg = ["--metadata=dir:rtl"]
        
        print(f"Converting {temp_md_path} to {docx_path}")
        
        try:
            # Try conversion with explicit pandoc path first
            pypandoc.convert_file(
                temp_md_path,
                'docx',
                outputfile=docx_path,
                extra_args=['--standalone'] + reference_arg + rtl_arg
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

def display_ascii_art():
    """
    Display ASCII art from a text file when the application starts.
    Attempts to resize the terminal for optimal display if on Unix-like system.
    The ASCII art will be displayed in the terminal.
    """
    # Try to set terminal size for better viewing (Unix/Linux/macOS only)
    if sys.platform != "win32":
        try:
            # Set terminal to at least 100 columns wide by 35 rows tall
            # The size command is specific to Unix-like systems
            os.system('printf "\033[8;35;100t"')
        except Exception as e:
            print(f"Could not resize terminal: {str(e)}")
    
    ascii_art_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), r'templates/ascii_art.txt')
    
    if os.path.exists(ascii_art_path):
        try:
            with open(ascii_art_path, 'r', encoding='utf-8') as art_file:
                ascii_art = art_file.read()
                # Add a terminal clear command before displaying
                if sys.platform != "win32":
                    os.system('clear')
                else:
                    os.system('cls')
                print("\n" + ascii_art + "\n")
                print("=" * 80)  # Add a separator line after the art
        except Exception as e:
            print(f"Error displaying ASCII art: {str(e)}")
    else:
        print("ASCII art file not found. Create 'ascii_art.txt' in the application root directory.")

if __name__ == '__main__':
    display_ascii_art()
    ensure_user_search_words_file()
    socketio.run(app, debug=True, host='0.0.0.0', port=5001, allow_unsafe_werkzeug=True)