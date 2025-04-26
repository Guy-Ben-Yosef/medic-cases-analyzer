import os
import json
import pytesseract
from pdf2image import convert_from_path
import argparse
from tqdm import tqdm
import logging
from PyPDF2 import PdfReader
import fitz

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.FileHandler("ocr_process.log"), logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

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

def process_pdf(pdf_path, output_path=None, page_numbers=None, dpi=300):
    """
    Process a PDF document with mixed Hebrew and English text and save results to JSON.
    Uses a single loop to process each page - check for highlights, convert to image, and perform OCR.
    
    Args:
        pdf_path: Path to the PDF file
        output_path: Path where to save the JSON output
        page_numbers: Optional list of page numbers to process (1-based indexing)
                     Example: [1, 3, 5] processes only pages 1, 3, and 5
        dpi: DPI resolution for the image conversion
    """
    # Validate input
    if not os.path.exists(pdf_path):
        logger.error(f"PDF file not found: {pdf_path}")
        return False
    
    # Set default output path if not provided
    if output_path is None:
        base_name = os.path.splitext(os.path.basename(pdf_path))[0]
        output_path = f"{base_name}_ocr_results.json"
    
    # Setup for multilingual OCR (Hebrew + English)
    lang = setup_tesseract_for_multilingual()
    
    try:
        # Open the PDF with PyMuPDF for annotations and with PyPDF2 for total page count
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
        
        results = []
        
        # Single loop to process all selected pages
        for page_num in tqdm(pages_to_process, desc="Processing pages"):
            page_result = {"page_number": page_num}
            
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
                    logger.info(f"Page {page_num} has annotations: {annotation_types}")
                
                page_result["has_annotations"] = has_annotations
                page_result["annotation_types"] = annotation_types
                
                # Step 2: Convert the specific page to an image
                # pdf2image uses 1-based indexing for first_page/last_page
                images = convert_from_path(
                    pdf_path, 
                    dpi=dpi, 
                    first_page=page_num, 
                    last_page=page_num
                )
                
                if images:
                    # Step 3: Perform OCR on the image
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
        
        # Save results
        success = save_to_json(document_results, output_path)
        
        return success
    
    except Exception as e:
        logger.error(f"Error processing PDF: {str(e)}")
        return False

def main():
    """Main function to parse arguments and process PDF."""
    parser = argparse.ArgumentParser(description='Process PDF with Hebrew and English text using OCR')
    parser.add_argument('--pdf-path', help='Path to the PDF file')
    parser.add_argument('--output', '-o', help='Output JSON file path')
    parser.add_argument('--start-page', type=int, help='First page to process (starts from 1)')
    parser.add_argument('--end-page', type=int, help='Last page to process')
    parser.add_argument('--dpi', type=int, default=300, help='DPI resolution for image conversion (default: 300)')
    args = parser.parse_args()
    
    for arg in vars(args):
        print(f"{arg}: {getattr(args, arg)}")

    # Process specific page range if provided
    page_numbers = None
    if args.start_page:
        if args.end_page and args.end_page >= args.start_page:
            page_numbers = list(range(args.start_page, args.end_page + 1))
        else:
            # If only start page is provided or end page is invalid
            page_numbers = [args.start_page]
    
    success = process_pdf(args.pdf_path, args.output, page_numbers, args.dpi)
    
    if success:
        logger.info("Processing completed successfully")
    else:
        logger.error("Processing failed")

if __name__ == "__main__":
    main()