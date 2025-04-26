import os
import json
import pytesseract
from pdf2image import convert_from_path
import argparse
from tqdm import tqdm
import logging
from PyPDF2 import PdfReader

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

def pdf_to_images(pdf_path, dpi=300, pages=None):
    """
    Convert PDF to list of images.
    
    Args:
        pdf_path: Path to the PDF file
        dpi: DPI resolution for the images (higher is better for OCR)
        pages: Optional list of page numbers to process (1-based indexing)
              Example: [1, 3, 5] processes only pages 1, 3, and 5
    
    Returns:
        List of images and their corresponding page numbers
    """
    logger.info(f"Converting PDF to images: {pdf_path}")
    try:
        if pages:
            # Convert to 0-based indexing for pdf2image
            zero_based_pages = [p-1 for p in pages]
            logger.info(f"Processing only pages: {pages}")
            images = convert_from_path(pdf_path, dpi=dpi, first_page=min(zero_based_pages)+1, 
                                     last_page=max(zero_based_pages)+1)
            
            # Filter out only the requested pages
            # Note: pdf2image uses 1-based indexing for first_page/last_page params, but returns
            # images in sequence starting from 0 relative to first_page
            page_offset = min(zero_based_pages)
            result = []
            for i, img in enumerate(images):
                if (i + page_offset) in zero_based_pages:
                    # Store the actual page number (1-based) with each image
                    result.append((img, i + page_offset + 1))
            return result
        else:
            # Process all pages
            images = convert_from_path(pdf_path, dpi=dpi)
            # Return images with their page numbers (1-based)
            return [(img, i+1) for i, img in enumerate(images)]
    except Exception as e:
        logger.error(f"Error converting PDF to images: {str(e)}")
        raise

def perform_ocr(image_page_pairs, lang):
    """
    Perform OCR on a list of images with their corresponding page numbers.
    
    Args:
        image_page_pairs: List of tuples (image, page_number)
        lang: Language setting for OCR
    
    Returns:
        List of dictionaries with page number and extracted text
    """
    results = []
    logger.info(f"Performing OCR on {len(image_page_pairs)} pages with language: {lang}")
    
    for img, page_num in tqdm(image_page_pairs, desc="Processing pages"):
        try:
            # Set page segmentation mode to 4 for sparse text with OSD
            # This works better with mixed right-to-left and left-to-right text
            # Set OCR engine mode to 3 for default, based on what is available
            text = pytesseract.image_to_string(img, lang=lang, config='--psm 4 --oem 3')
            
            # Process text to handle mixed language directions
            processed_text = text.strip()
            
            # Add page to results
            results.append({
                "page_number": page_num,
                "text": processed_text
            })
            
            # Log a short preview of the extracted text
            preview = processed_text[:50] + "..." if len(processed_text) > 50 else processed_text
            logger.info(f"Page {page_num} processed. Preview: {preview}")
            
        except Exception as e:
            logger.error(f"Error performing OCR on page {page_num}: {str(e)}")
            results.append({
                "page_number": page_num,
                "text": "",
                "error": str(e)
            })
    
    return results

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
    """Save OCR results to a JSON file."""
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        logger.info(f"Results saved to {output_path}")
        return True
    except Exception as e:
        logger.error(f"Error saving results to JSON: {str(e)}")
        return False

def process_pdf(pdf_path, output_path=None, page_numbers=None):
    """
    Process a PDF document with mixed Hebrew and English text and save results to JSON.
    
    Args:
        pdf_path: Path to the PDF file
        output_path: Path where to save the JSON output
        page_numbers: Optional list of page numbers to process (1-based indexing)
                     Example: [1, 3, 5] processes only pages 1, 3, and 5
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
        # Convert PDF to images (only specified pages if provided)
        image_page_pairs = pdf_to_images(pdf_path, pages=page_numbers)
        
        # Log which pages we're processing
        if page_numbers:
            logger.info(f"Processing selected pages: {page_numbers}")
        else:
            logger.info(f"Processing all pages")
        
        # Perform OCR
        results = perform_ocr(image_page_pairs, lang)
        
        # Get total number of pages in the original document
        # This is different from the number of pages we processed
        from PyPDF2 import PdfReader
        reader = PdfReader(pdf_path)
        total_pages_in_document = len(reader.pages)
        
        # Create structured output
        document_results = {
            "document_name": os.path.basename(pdf_path),
            "total_pages_in_document": total_pages_in_document,
            "pages_processed": len(image_page_pairs),
            "page_numbers_processed": [p[1] for p in image_page_pairs] if page_numbers else list(range(1, total_pages_in_document + 1)),
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
    parser.add_argument('pdf_path', help='Path to the PDF file')
    parser.add_argument('--output', '-o', help='Output JSON file path')
    parser.add_argument('--start-page', type=int, help='First page to process (starts from 1)')
    parser.add_argument('--end-page', type=int, help='Last page to process')
    parser.add_argument('--dpi', type=int, default=300, help='DPI resolution for image conversion (default: 300)')
    args = parser.parse_args()
    
    # Process specific page range if provided
    page_numbers = None
    if args.start_page:
        if args.end_page and args.end_page >= args.start_page:
            page_numbers = list(range(args.start_page, args.end_page + 1))
        else:
            # If only start page is provided or end page is invalid
            page_numbers = [args.start_page]
    
    success = process_pdf(args.pdf_path, args.output, page_numbers)
    
    if success:
        logger.info("Processing completed successfully")
    else:
        logger.error("Processing failed")

if __name__ == "__main__":
    main()