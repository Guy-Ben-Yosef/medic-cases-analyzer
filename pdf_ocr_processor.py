import os
import json
import pytesseract
from pdf2image import convert_from_path
import argparse
from tqdm import tqdm
import logging
from PyPDF2 import PdfReader
import fitz
from PIL import Image

# Configure logging - INFO to file, WARNING and ERROR to console
# File handler for all logs (INFO and above)
file_handler = logging.FileHandler("ocr_process.log")
file_handler.setLevel(logging.INFO)

# Console handler only for WARNING and ERROR
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.WARNING)

# Format for both handlers
log_format = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
file_handler.setFormatter(log_format)
console_handler.setFormatter(log_format)

# Configure the root logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
logger.addHandler(file_handler)
logger.addHandler(console_handler)

# Prevent double logging
logger.propagate = False

def setup_tesseract_for_multilingual():
    """Configure Tesseract to work with Hebrew and English."""
    # Set Tesseract to use Hebrew and English language packs
    # Make sure you have these language packs installed for Tesseract
    # On Ubuntu: sudo apt-get install tesseract-ocr-heb tesseract-ocr-eng
    # On macOS: brew install tesseract-lang
    pytesseract.pytesseract.tesseract_cmd = r'tesseract'  # Update path if necessary
    return 'heb+eng'  # Hebrew and English language codes

def perform_ocr_on_image(image, lang):
    """
    Perform OCR on a single image.
    
    Args:
        image: Image to be processed
        lang: Language setting for OCR
    
    Returns:
        Extracted text from the image
    """
    try:
        # Set page segmentation mode to 4 for sparse text with OSD
        # This works better with mixed right-to-left and left-to-right text
        # Set OCR engine mode to 3 for default, based on what is available
        text = pytesseract.image_to_string(image, lang=lang, config='--psm 4 --oem 3')
        
        # Process text to handle mixed language directions
        processed_text = text.strip()
        
        return processed_text
    except Exception as e:
        logger.error(f"Error performing OCR: {str(e)}")
        return ""

def save_to_json(results, output_path):
    """Save OCR results to a JSON file."""
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        logger.info(f"Results saved to {output_path}")
        return True
    except Exception as e:
        logger.error(f"Error saving results to JSON: {str(e)}")
        return False

def remove_highlights_from_page(pdf_path, page_number, output_dir=None, dpi=300):
    """
    Remove all highlights from a specific page of a PDF and save it as an image.
    
    Args:
        pdf_path: Path to the PDF file
        page_number: Page number to process (1-based indexing)
        output_dir: Directory to save the image (default: current directory)
        dpi: DPI for the output image (default: 300)
        
    Returns:
        Path to the saved image
    """
    # Validate inputs
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")
    
    # Create output directory if needed
    if output_dir is None:
        output_dir = os.getcwd()
    os.makedirs(output_dir, exist_ok=True)
    
    try:
        # Open the PDF document with PyMuPDF
        doc = fitz.open(pdf_path)
        
        # Check if page number is valid
        if page_number < 1 or page_number > len(doc):
            raise ValueError(f"Invalid page number: {page_number}. PDF has {len(doc)} pages.")
        
        # Get the specified page (PyMuPDF uses 0-based indexing)
        page = doc[page_number - 1]
        
        # Get all annotations on the page
        annotations = page.annots()
        
        # Count how many highlights were removed
        removed_count = 0
        
        # Remove all annotations from the page
        if annotations:
            for annot in annotations:
                # Remove the annotation
                page.delete_annot(annot)
                removed_count += 1
        
        # Create the output filename
        base_name = os.path.splitext(os.path.basename(pdf_path))[0]
        output_filename = f"page{page_number}_no_highlights.png"
        output_path = os.path.join(output_dir, output_filename)
        
        # Render the page to an image at the specified DPI
        pix = page.get_pixmap(matrix=fitz.Matrix(dpi/72, dpi/72))
        
        # Convert PyMuPDF pixmap to PIL Image
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        
        # Save the image
        img.save(output_path, "PNG")
        
        logger.info(f"Removed {removed_count} annotations from page {page_number}")
        logger.info(f"Saved image to: {output_path}")
        
        # Close the document
        doc.close()
        
        return output_path, removed_count
        
    except Exception as e:
        raise Exception(f"Error processing PDF: {str(e)}")

def process_pdf(pdf_path, output_path=None, page_numbers=None, dpi=300, image_output_dir=None, progress_callback=None):
    """
    Process a PDF document with mixed Hebrew and English text and save results to JSON.
    Uses a single loop to process each page - check for highlights, convert to image, and perform OCR.
    
    Args:
        pdf_path: Path to the PDF file
        output_path: Path where to save the JSON output
        page_numbers: Optional list of page numbers to process (1-based indexing)
                     Example: [1, 3, 5] processes only pages 1, 3, and 5
        dpi: DPI resolution for the image conversion
        image_output_dir: Directory to save page images
        progress_callback: Optional callback function to report progress
                          Function signature: progress_callback(current_page, total_pages, status, message=None, error=None)
    """
    # Validate input
    if not os.path.exists(pdf_path):
        logger.error(f"PDF file not found: {pdf_path}")
        if progress_callback:
            progress_callback(0, 0, 'error', message='PDF file not found', error=f"PDF file not found: {pdf_path}")
        return False
    
    # Set default output path if not provided
    if output_path is None:
        base_name = os.path.splitext(os.path.basename(pdf_path))[0]
        output_path = f"{base_name}_ocr_results.json"

    # Create image output directory if needed
    if image_output_dir:
        os.makedirs(image_output_dir, exist_ok=True)
        logger.info(f"Images will be saved to: {image_output_dir}")
        
        # Create a subdirectory for the clean images (without highlights)
        clean_images_dir = os.path.join(image_output_dir, "clean_images")
        os.makedirs(clean_images_dir, exist_ok=True)
        logger.info(f"Clean images will be saved to: {clean_images_dir}")
    
    # Setup for multilingual OCR (Hebrew + English)
    lang = setup_tesseract_for_multilingual()
    
    try:
        # Open the PDF with PyMuPDF for annotations and with PyPDF2 for total page count
        if progress_callback:
            progress_callback(0, 0, 'initializing', message='Opening PDF document...')
            
        pdf_doc = fitz.open(pdf_path)
        pdf_reader = PdfReader(pdf_path)
        total_pages_in_document = len(pdf_reader.pages)
        
        # Determine which pages to process
        if page_numbers:
            pages_to_process = page_numbers
            logger.info(f"Processing selected pages: {page_numbers}")
        else:
            pages_to_process = list(range(1, total_pages_in_document + 1))
            logger.info(f"Processing all pages")
        
        # Report initial status
        if progress_callback:
            progress_callback(0, len(pages_to_process), 'processing', message='Starting PDF processing...')
        
        results = []
        
        # Single loop to process all selected pages
        for i, page_num in enumerate(tqdm(pages_to_process, desc="Processing pages")):
            page_result = {"page_number": page_num}
            
            # Report progress
            if progress_callback:
                progress_message = f"Processing page {page_num} of {len(pages_to_process)}..."
                progress_callback(i, len(pages_to_process), 'processing', message=progress_message)
            
            try:
                # Step 1: Check for highlights/annotations on this page
                # PyMuPDF uses 0-based indexing
                fitz_page = pdf_doc[page_num - 1]
                annotations = fitz_page.annots()
                
                has_annotations = annotations is not None and len(list(annotations)) > 0
                annotation_types = []
                
                if has_annotations:
                    for annot in annotations:
                        annotation_types.append(annot.type[1])
                    logger.info(f"Page {page_num} has annotations")
                
                page_result["has_annotations"] = has_annotations
                page_result["annotation_types"] = annotation_types
                
                # Save image paths for both regular and clean versions
                original_image_path = None
                clean_image_path = None
                
                # Step 2: Handle page differently based on whether it has highlights
                if has_annotations and image_output_dir:
                    # Step 2a: First, convert the page with highlights to image (for viewing)
                    images_with_highlights = convert_from_path(
                        pdf_path, 
                        dpi=dpi, 
                        first_page=page_num, 
                        last_page=page_num
                    )
                    
                    if images_with_highlights:
                        # Save the original image with highlights
                        original_image_filename = f"page_{page_num}.png"
                        original_image_path = os.path.join(image_output_dir, original_image_filename)
                        images_with_highlights[0].save(original_image_path, "PNG")
                        page_result["image_path"] = original_image_path
                        page_result["highlighted_image_path"] = original_image_path
                        
                        # Step 2b: Now, remove highlights and save clean version (for OCR)
                        try:
                            clean_image_path, removed_count = remove_highlights_from_page(
                                pdf_path, 
                                page_num, 
                                output_dir=clean_images_dir, 
                                dpi=dpi
                            )
                            page_result["clean_image_path"] = clean_image_path
                            page_result["removed_highlights_count"] = removed_count
                            
                            # Step 2c: Perform OCR on the clean image
                            clean_image = Image.open(clean_image_path)
                            page_result["text"] = perform_ocr_on_image(clean_image, lang)
                            
                        except Exception as e:
                            logger.error(f"Error removing highlights from page {page_num}: {str(e)}")
                            # Fallback: Perform OCR on the original image with highlights
                            page_result["text"] = perform_ocr_on_image(images_with_highlights[0], lang)
                    else:
                        logger.warning(f"No image generated for page {page_num}")
                        page_result["text"] = ""
                        
                else:
                    # Step 3: Regular processing for pages without highlights
                    images = convert_from_path(
                        pdf_path, 
                        dpi=dpi, 
                        first_page=page_num, 
                        last_page=page_num
                    )
                    
                    if images:
                        # Save the image directly to the output directory
                        if image_output_dir:
                            image_filename = f"page_{page_num}.png"
                            image_path = os.path.join(image_output_dir, image_filename)
                            images[0].save(image_path, "PNG")
                            page_result["image_path"] = image_path
                        
                        # Perform OCR on the image
                        page_result["text"] = perform_ocr_on_image(images[0], lang)
                    else:
                        logger.warning(f"No image generated for page {page_num}")
                        page_result["text"] = ""
                
                results.append(page_result)
                
            except Exception as e:
                logger.error(f"Error processing page {page_num}: {str(e)}")
                page_result["text"] = ""
                page_result["error"] = str(e)
                results.append(page_result)
                
                # Report error
                if progress_callback:
                    progress_callback(i, len(pages_to_process), 'error', 
                                     error=f"Error processing page {page_num}: {str(e)}")
        
        # Close the PDF document
        pdf_doc.close()
        
        # Create structured output
        document_results = {
            "document_name": os.path.basename(pdf_path),
            "total_pages_in_document": total_pages_in_document,
            "pages_processed": len(pages_to_process),
            "page_numbers_processed": pages_to_process,
            "language": "Hebrew and English",
            "pages": results
        }
        
        # Report completed status
        if progress_callback:
            progress_callback(len(pages_to_process), len(pages_to_process), 'completed', 
                             message='PDF processing completed successfully.')
        
        # Save results
        success = save_to_json(document_results, output_path)
        
        return success
    
    except Exception as e:
        logger.error(f"Error processing PDF: {str(e)}")
        # Report error
        if progress_callback:
            progress_callback(0, 0, 'error', error=f"Error processing PDF: {str(e)}")
        return False

def main():
    """Main function to parse arguments and process PDF."""
    parser = argparse.ArgumentParser(description='Process PDF with Hebrew and English text using OCR')
    parser.add_argument('--pdf-path', help='Path to the PDF file')
    parser.add_argument('--output', '-o', help='Output JSON file path')
    parser.add_argument('--start-page', type=int, help='First page to process (starts from 1)')
    parser.add_argument('--end-page', type=int, help='Last page to process')
    parser.add_argument('--dpi', type=int, default=300, help='DPI resolution for image conversion (default: 300)')
    parser.add_argument('--image-dir', help='Directory to save page images')
    args = parser.parse_args()

    # Process specific page range if provided
    page_numbers = None
    if args.start_page:
        if args.end_page and args.end_page >= args.start_page:
            page_numbers = list(range(args.start_page, args.end_page + 1))
        else:
            # If only start page is provided or end page is invalid
            page_numbers = [args.start_page]
    
    success = process_pdf(args.pdf_path, args.output, page_numbers, args.dpi, args.image_dir)
    
    if success:
        logger.info("Processing completed successfully")
    else:
        logger.error("Processing failed")

if __name__ == "__main__":
    main()