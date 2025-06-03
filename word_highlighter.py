import os
import json
import pytesseract
from PIL import Image, ImageDraw
import cv2
import numpy as np
from typing import List, Dict, Any, Tuple, Set
import re

def normalize_text_for_highlighting(text: str) -> str:
    """
    Normalize text for highlighting comparison.
    Same logic as in ocr_results_searcher.py
    """
    return text.lower().strip()

def extract_word_bounding_boxes(image_path: str, lang: str = 'heb+eng') -> List[Dict[str, Any]]:
    """
    Extract word-level bounding boxes and text from an image using OCR.
    
    Args:
        image_path: Path to the image file
        lang: Language setting for OCR
        
    Returns:
        List of dictionaries containing word data with bounding boxes
    """
    try:
        # Load the image
        image = Image.open(image_path)
        
        # Use pytesseract to get detailed data including bounding boxes
        data = pytesseract.image_to_data(
            image, 
            lang=lang, 
            config='--psm 4 --oem 3',
            output_type=pytesseract.Output.DICT
        )
        
        words_data = []
        
        # Process the OCR data
        for i in range(len(data['text'])):
            text = data['text'][i].strip()
            confidence = int(data['conf'][i])
            
            # Only include words with decent confidence and actual text
            if confidence > 30 and text and len(text) > 0:
                word_info = {
                    'text': text,
                    'confidence': confidence,
                    'left': data['left'][i],
                    'top': data['top'][i],
                    'width': data['width'][i],
                    'height': data['height'][i],
                    'right': data['left'][i] + data['width'][i],
                    'bottom': data['top'][i] + data['height'][i]
                }
                words_data.append(word_info)
        
        return words_data
        
    except Exception as e:
        print(f"Error extracting word bounding boxes from {image_path}: {str(e)}")
        return []

def find_matching_words(words_data: List[Dict[str, Any]], search_words: Set[str]) -> List[Dict[str, Any]]:
    """
    Find words that match the search criteria using whole word matching.
    
    Args:
        words_data: List of word data with bounding boxes
        search_words: Set of normalized search words
        
    Returns:
        List of matching word data
    """
    matching_words = []
    
    # Normalize search words
    normalized_search_words = {normalize_text_for_highlighting(word) for word in search_words}
    
    for word_info in words_data:
        word_text = word_info['text']
        normalized_word = normalize_text_for_highlighting(word_text)
        
        # Check if this word matches any of our search words (whole word matching)
        for search_word in normalized_search_words:
            # Create a pattern that matches the word with word boundaries
            pattern = r'\b' + re.escape(search_word) + r'\b'
            if re.search(pattern, normalized_word):
                matching_words.append(word_info)
                break
    
    return matching_words

def draw_highlights_on_image(image_path: str, matching_words: List[Dict[str, Any]], 
                           output_path: str, highlight_color: Tuple[int, int, int, int] = (255, 20, 147, 160)) -> bool:
    """
    Draw pink highlights over matching words on the image.
    
    Args:
        image_path: Path to the source image
        matching_words: List of word data to highlight
        output_path: Path where to save the highlighted image
        highlight_color: RGBA color tuple for highlights (default: semi-transparent pink)
        
    Returns:
        True if successful, False otherwise
    """
    try:
        # Load the image
        image = Image.open(image_path).convert('RGBA')
        
        # Create a transparent overlay
        overlay = Image.new('RGBA', image.size, (255, 255, 255, 0))
        draw = ImageDraw.Draw(overlay)
        
        # Draw highlights for each matching word
        for word_info in matching_words:
            left = word_info['left']
            top = word_info['top']
            right = word_info['right']
            bottom = word_info['bottom']
            
            # Add some padding around the word
            padding = 2
            highlight_box = (
                max(0, left - padding),
                max(0, top - padding),
                min(image.width, right + padding),
                min(image.height, bottom + padding)
            )
            
            # Draw the highlight rectangle
            draw.rectangle(highlight_box, fill=highlight_color)
        
        # Composite the overlay onto the original image
        highlighted_image = Image.alpha_composite(image, overlay)
        
        # Convert back to RGB for saving as PNG/JPEG
        final_image = highlighted_image.convert('RGB')
        
        # Save the highlighted image
        final_image.save(output_path, 'PNG', quality=95)
        
        return True
        
    except Exception as e:
        print(f"Error creating highlighted image: {str(e)}")
        return False

def create_highlighted_image(image_path: str, search_words: Set[str], output_path: str, 
                           lang: str = 'heb+eng') -> Tuple[bool, int]:
    """
    Create a highlighted version of an image with search words marked.
    
    Args:
        image_path: Path to the source image
        search_words: Set of words to search for and highlight
        output_path: Path where to save the highlighted image
        lang: OCR language setting
        
    Returns:
        Tuple of (success_boolean, number_of_highlights)
    """
    try:
        # Extract word bounding boxes from the image
        words_data = extract_word_bounding_boxes(image_path, lang)
        
        if not words_data:
            print(f"No words extracted from image: {image_path}")
            return False, 0
        
        # Find matching words
        matching_words = find_matching_words(words_data, search_words)
        
        if not matching_words:
            # If no matches, just copy the original image
            original_image = Image.open(image_path)
            original_image.save(output_path, 'PNG')
            return True, 0
        
        # Create highlighted image
        success = draw_highlights_on_image(image_path, matching_words, output_path)
        
        return success, len(matching_words)
        
    except Exception as e:
        print(f"Error in create_highlighted_image: {str(e)}")
        return False, 0

def highlight_page_on_demand(unique_id: str, page_number: int, search_words: Set[str], 
                           images_folder: str) -> Tuple[bool, str, int]:
    """
    Create a highlighted version of a specific page on demand.
    
    Args:
        unique_id: Unique identifier for the document
        page_number: Page number to highlight
        search_words: Set of words to highlight
        images_folder: Base images folder path
        
    Returns:
        Tuple of (success, highlighted_image_path, highlight_count)
    """
    try:
        # Construct paths
        document_images_folder = os.path.join(images_folder, unique_id)
        original_image_path = os.path.join(document_images_folder, f"page_{page_number}.png")
        
        # Create highlighted images folder if it doesn't exist
        highlighted_images_folder = os.path.join(document_images_folder, "highlighted_images")
        os.makedirs(highlighted_images_folder, exist_ok=True)
        
        # Generate a hash from search words for caching
        search_words_hash = hash(frozenset(search_words))
        highlighted_image_filename = f"page_{page_number}_highlighted_{abs(search_words_hash)}.png"
        highlighted_image_path = os.path.join(highlighted_images_folder, highlighted_image_filename)
        
        # Check if highlighted image already exists
        if os.path.exists(highlighted_image_path):
            # Return existing highlighted image
            return True, highlighted_image_path, -1  # -1 indicates cached result
        
        # Check if original image exists
        if not os.path.exists(original_image_path):
            print(f"Original image not found: {original_image_path}")
            return False, "", 0
        
        # Create highlighted image
        success, highlight_count = create_highlighted_image(
            original_image_path, 
            search_words, 
            highlighted_image_path
        )
        
        if success:
            return True, highlighted_image_path, highlight_count
        else:
            return False, "", 0
            
    except Exception as e:
        print(f"Error in highlight_page_on_demand: {str(e)}")
        return False, "", 0