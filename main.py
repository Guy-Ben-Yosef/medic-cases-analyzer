import os
import json
import pytesseract
from pdf2image import convert_from_path
import argparse
from tqdm import tqdm
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.FileHandler("ocr_process.log"), logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

def setup_tesseract_for_hebrew():
    """Configure Tesseract to work with Hebrew."""
    # Set Tesseract to use Hebrew language pack
    # Make sure you have the Hebrew language pack installed for Tesseract
    # You can install it with: sudo apt-get install tesseract-ocr-heb
    pytesseract.pytesseract.tesseract_cmd = r'tesseract'  # Update path if necessary
    return '+heb'  # Hebrew language code

def pdf_to_images(pdf_path, dpi=300):
    """Convert PDF to list of images."""
    logger.info(f"Converting PDF to images: {pdf_path}")
    try:
        # Higher DPI for better OCR results
        return convert_from_path(pdf_path, dpi=dpi)
    except Exception as e:
        logger.error(f"Error converting PDF to images: {str(e)}")
        raise

def perform_ocr(images, lang):
    """Perform OCR on a list of images."""
    results = []
    logger.info(f"Performing OCR on {len(images)} pages with language: {lang}")
    
    for i, img in enumerate(tqdm(images, desc="Processing pages")):
        try:
            # Set page segmentation mode to 1 for automatic page segmentation with OSD
            # Set OCR engine mode to 3 for default, based on what is available
            text = pytesseract.image_to_string(img, lang=lang, config='--psm 1 --oem 3')
            
            # Right-to-left text might need special handling
            results.append({
                "page_number": i + 1,
                "text": text.strip()
            })
            
            # Log a short preview of the extracted text
            preview = text.strip()[:50] + "..." if len(text.strip()) > 50 else text.strip()
            logger.info(f"Page {i+1} processed. Preview: {preview}")
            
        except Exception as e:
            logger.error(f"Error performing OCR on page {i+1}: {str(e)}")
            results.append({
                "page_number": i + 1,
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

def process_pdf(pdf_path, output_path=None):
    """Process a PDF document with Hebrew text and save results to JSON."""
    # Validate input
    if not os.path.exists(pdf_path):
        logger.error(f"PDF file not found: {pdf_path}")
        return False
    
    # Set default output path if not provided
    if output_path is None:
        base_name = os.path.splitext(os.path.basename(pdf_path))[0]
        output_path = f"{base_name}_ocr_results.json"
    
    # Setup for Hebrew OCR
    lang = setup_tesseract_for_hebrew()
    
    try:
        # Convert PDF to images
        images = pdf_to_images(pdf_path)
        
        # Perform OCR
        results = perform_ocr(images, lang)
        
        # Create structured output
        document_results = {
            "document_name": os.path.basename(pdf_path),
            "total_pages": len(images),
            "language": "Hebrew",
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
    parser = argparse.ArgumentParser(description='Process PDF with Hebrew text using OCR')
    parser.add_argument('pdf_path', help='Path to the PDF file')
    parser.add_argument('--output', '-o', help='Output JSON file path')
    args = parser.parse_args()
    
    success = process_pdf(args.pdf_path, args.output)
    
    if success:
        logger.info("Processing completed successfully")
    else:
        logger.error("Processing failed")

if __name__ == "__main__":
    main()