import json
import argparse
import sys
import re
from typing import List, Set, Dict, Any, Tuple


def load_ocr_results(json_path: str) -> Dict[str, Any]:
    """
    Load OCR results from a JSON file.
    
    Args:
        json_path: Path to the JSON file containing OCR results
        
    Returns:
        Dictionary containing the OCR results
        
    Raises:
        FileNotFoundError: If the JSON file doesn't exist
        json.JSONDecodeError: If the JSON file is invalid
    """
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Error: File '{json_path}' not found.")
        sys.exit(1)
    except json.JSONDecodeError:
        print(f"Error: '{json_path}' is not a valid JSON file.")
        sys.exit(1)
    except Exception as e:
        print(f"Error loading JSON file: {str(e)}")
        sys.exit(1)


def normalize_text(text: str) -> str:
    """
    Normalize the text for better matching (lowercase and strip).
    
    Args:
        text: The text to normalize
        
    Returns:
        Normalized text
    """
    return text.lower().strip()


def search_words_in_pages(ocr_results: Dict[str, Any], search_words: Set[str]) -> Dict[int, Dict[str, Any]]:
    """
    Search for whole words in each page of the OCR results.
    Only matches complete words, not parts of larger words.
    
    Args:
        ocr_results: Dictionary containing OCR results
        search_words: Set of words to search for
        
    Returns:
        Dictionary mapping page numbers to search results containing:
        - matched: boolean indicating if any word was found
        - matched_words: list of words that were found on the page
    """
    results = {}
    
    # Normalize all search words
    normalized_search_words = {normalize_text(word) for word in search_words}
    
    # Check each page for the presence of search words
    for page in ocr_results.get("pages", []):
        page_number = page.get("page_number")
        page_text = page.get("text", "")
        
        # Normalize page text
        normalized_page_text = normalize_text(page_text)
        
        # Find which specific words matched (only whole words)
        matched_words = []
        for word in normalized_search_words:
            # Create a pattern that matches the word with word boundaries
            # This ensures we only match whole words, not parts of larger words
            pattern = r'\b' + re.escape(word) + r'\b'
            if re.search(pattern, normalized_page_text):
                matched_words.append(word)
        
        # Check if any search word is in the page text
        word_found = len(matched_words) > 0
        
        results[page_number] = {
            "matched": word_found,
            "matched_words": matched_words
        }
    
    return results

def print_search_results(ocr_results: Dict[str, Any], search_results: Dict[int, Dict[str, Any]], 
                         search_words: Set[str]) -> None:
    """
    Print the search results in a user-friendly format.
    
    Args:
        ocr_results: Dictionary containing OCR results
        search_results: Dictionary mapping page numbers to search results
        search_words: Set of words that were searched for
    """
    document_name = ocr_results.get("document_name", "Unknown Document")
    print(f"\nSearch Results for '{document_name}'")
    print(f"Searched for words: {', '.join(search_words)}")
    print(f"Total pages in document: {ocr_results.get('total_pages_in_document', 0)}")
    print(f"Pages processed: {ocr_results.get('pages_processed', 0)}")
    print("\nResults:")
    print("-" * 80)
    print(f"{'Page Number':<12} {'Contains Words':<15} {'Has Annotations':<15} {'Matched Words':<30}")
    print("-" * 80)
    
    # Get page data from OCR results for annotation info
    page_data = {page.get("page_number"): page for page in ocr_results.get("pages", [])}
    
    for page_num, search_result in sorted(search_results.items()):
        page_info = page_data.get(page_num, {})
        has_annotations = page_info.get("has_annotations", False)
        contains_words = search_result.get("matched", False)
        matched_words = search_result.get("matched_words", [])
        
        print(f"{page_num:<12} {str(contains_words):<15} {str(has_annotations):<15} {', '.join(matched_words):<30}")
    
    # Summary stats
    matching_pages = sum(1 for result in search_results.values() if result.get("matched", False))
    print("-" * 80)
    print(f"Summary: {matching_pages} out of {len(search_results)} processed pages contain search words.")


def save_results_to_json(ocr_results: Dict[str, Any], search_results: Dict[int, Dict[str, Any]], 
                        search_words: Set[str], output_path: str) -> None:
    """
    Save the search results to a JSON file.
    
    Args:
        ocr_results: Dictionary containing OCR results
        search_results: Dictionary mapping page numbers to search results
        search_words: Set of words that were searched for
        output_path: Path where to save the JSON output
    """
    # Create a copy of the original OCR results
    enhanced_results = ocr_results.copy()
    
    # Add search information
    enhanced_results["search_information"] = {
        "search_words": list(search_words),
        "total_matching_pages": sum(1 for result in search_results.values() if result.get("matched", False)),
    }
    
    # Update each page with search results
    for page in enhanced_results.get("pages", []):
        page_number = page.get("page_number")
        search_result = search_results.get(page_number, {})
        contains_search_words = search_result.get("matched", False)
        matched_words = search_result.get("matched_words", [])
        
        page["contains_search_words"] = contains_search_words
        page["matched_words"] = matched_words
    
    # Save to JSON file
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(enhanced_results, f, ensure_ascii=False, indent=2)
        print(f"\nResults saved to {output_path}")
    except Exception as e:
        print(f"Error saving results to JSON: {str(e)}")


def get_user_words() -> Set[str]:
    """
    Get a set of search words from the user via interactive input.
    
    Returns:
        Set of words to search for
    """
    print("\nEnter words to search for, separated by spaces or commas:")
    user_input = input("> ").strip()
    
    # Handle different input formats (commas or spaces)
    if ',' in user_input:
        words = [word.strip() for word in user_input.split(',')]
    else:
        words = user_input.split()
    
    # Remove empty strings and duplicates
    return {word for word in words if word}


def main() -> None:
    """Main function to parse arguments and process OCR results."""
    parser = argparse.ArgumentParser(description='Search for words in OCR JSON results')
    parser.add_argument('--json-path', required=True, help='Path to the OCR results JSON file')
    parser.add_argument('--words', nargs='*', help='Words to search for (optional, if not provided, will prompt user)')
    parser.add_argument('--output', '-o', help='Output JSON file path (optional)')
    args = parser.parse_args()

    # Load OCR results
    ocr_results = load_ocr_results(args.json_path)
    
    # Get search words from command line or user input
    if args.words and len(args.words) > 0:
        search_words = set(args.words)
    else:
        search_words = get_user_words()
    
    if not search_words:
        print("Error: No search words provided.")
        sys.exit(1)
    
    # Search for words in pages
    search_results = search_words_in_pages(ocr_results, search_words)
    
    # Print results
    print_search_results(ocr_results, search_results, search_words)
    
    # Save results if output path is provided
    if args.output:
        save_results_to_json(ocr_results, search_results, search_words, args.output)


if __name__ == "__main__":
    main()