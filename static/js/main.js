// main.js - Frontend Logic for PDF OCR and Analysis Tool

// Global variables to store state
let currentResultId = null;
let currentFilename = null;
let currentResultPath = null;
let ocrResults = null;
let filteredResults = null;

// Document ready function
$(document).ready(function() {
    // Handle PDF upload form submission
    $('#pdfUploadForm').on('submit', function(e) {
        e.preventDefault();
        uploadPDF();
    });
    
    // Handle search form submission
    $('#searchForm').on('submit', function(e) {
        e.preventDefault();
        searchAndFilterResults();
    });
    
    // Handle download JSON button
    $('#downloadJsonBtn').on('click', function() {
        if (currentResultId && currentFilename) {
            window.location.href = `/download-json/${currentResultId}/${currentFilename}`;
        }
    });
    
    // Handle view mode switch
    $('#viewModeToggle input').on('change', function() {
        toggleViewMode();
    });
    
    // Validate page range inputs
    $('#startPage, #endPage').on('change', function() {
        validatePageRange();
    });
});

// Toggle between image and text view
function toggleViewMode() {
    const isImageMode = $('#viewModeImage').prop('checked');
    
    if (isImageMode) {
        $('#pageImageContainer').removeClass('d-none');
        $('#pageTextContainer').addClass('d-none');
    } else {
        $('#pageImageContainer').addClass('d-none');
        $('#pageTextContainer').removeClass('d-none');
    }
}

// Validate page range inputs
function validatePageRange() {
    const startPage = parseInt($('#startPage').val()) || 0;
    const endPage = parseInt($('#endPage').val()) || 0;
    
    if (startPage > 0 && endPage > 0 && endPage < startPage) {
        $('#endPage').val(startPage);
    }
}

// Upload and process PDF
function uploadPDF() {
    const formData = new FormData($('#pdfUploadForm')[0]);
    
    // Display processing status
    $('#uploadButton').prop('disabled', true);
    $('#processingStatus').removeClass('d-none');
    
    // Reset results
    resetResults();
    
    // Submit the form data
    $.ajax({
        url: '/upload-pdf',
        type: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        success: function(response) {
            if (response.success) {
                // Store the result information
                currentResultId = response.result_id;
                currentFilename = response.original_filename;
                currentResultPath = response.result_path;
                
                // Enable search form and download button
                $('#searchForm').removeClass('d-none');
                $('#noFileSelected').addClass('d-none');
                $('#downloadSection').removeClass('d-none');
                
                // Load the OCR results
                getOCRResults();
            } else {
                showError('Failed to process PDF: ' + (response.error || 'Unknown error'));
            }
        },
        error: function(xhr) {
            let errorMsg = 'Failed to upload PDF';
            if (xhr.responseJSON && xhr.responseJSON.error) {
                errorMsg += ': ' + xhr.responseJSON.error;
            }
            showError(errorMsg);
        },
        complete: function() {
            // Reset UI state
            $('#uploadButton').prop('disabled', false);
            $('#processingStatus').addClass('d-none');
        }
    });
}

// Get OCR results for the processed PDF
function getOCRResults() {
    if (!currentResultId || !currentFilename) {
        showError('No results available');
        return;
    }
    
    $.ajax({
        url: `/get-results/${currentResultId}/${currentFilename}`,
        type: 'GET',
        success: function(response) {
            // Store the OCR results
            ocrResults = response;
            
            // Apply default search and filter
            searchAndFilterResults();
        },
        error: function(xhr) {
            let errorMsg = 'Failed to retrieve OCR results';
            if (xhr.responseJSON && xhr.responseJSON.error) {
                errorMsg += ': ' + xhr.responseJSON.error;
            }
            showError(errorMsg);
        }
    });
}

// Search and filter OCR results
function searchAndFilterResults() {
    if (!currentResultPath) {
        showError('No results available for filtering');
        return;
    }
    
    // Get search words as an array
    const searchWordsInput = $('#searchWords').val().trim();
    const searchWords = searchWordsInput.split(/\s*,\s*/).filter(word => word.length > 0);
    
    // Get filter type
    const filterType = $('input[name="filterType"]:checked').val();
    
    // Prepare request data
    const requestData = {
        resultPath: currentResultPath,
        searchWords: searchWords,
        filterType: filterType
    };
    
    $.ajax({
        url: '/search-results',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(requestData),
        success: function(response) {
            // Store filtered results
            filteredResults = response;
            
            // Display results
            displayResults();
        },
        error: function(xhr) {
            let errorMsg = 'Failed to search results';
            if (xhr.responseJSON && xhr.responseJSON.error) {
                errorMsg += ': ' + xhr.responseJSON.error;
            }
            showError(errorMsg);
        }
    });
}

// Display filtered results
function displayResults() {
    if (!filteredResults) {
        return;
    }
    
    // Show results section
    $('#resultsSection').removeClass('d-none');
    
    // Set default view mode
    $('#viewModeImage').prop('checked', true).trigger('change');
    
    // Update results summary
    const totalPages = filteredResults.total_pages_in_document;
    const matchingPages = filteredResults.filtered_pages.length;
    $('#resultsSummary').text(
        `Showing ${matchingPages} pages out of ${totalPages} total pages. ` +
        `Filter: ${getFilterTypeText(filteredResults.search_information.filter_type)}`
    );
    
    // Clear existing page list
    $('#pageList').empty();
    
    // Add filtered pages to the list
    filteredResults.filtered_pages.forEach(function(page) {
        const pageNumber = page.page_number;
        const hasAnnotations = page.has_annotations;
        const containsSearchWords = page.contains_search_words;
        const matchedWords = page.matched_words || [];
        
        // Determine page item class
        let pageItemClass = '';
        if (hasAnnotations && containsSearchWords) {
            pageItemClass = 'both-matched-page';
        } else if (hasAnnotations) {
            pageItemClass = 'highlighted-page';
        } else if (containsSearchWords) {
            pageItemClass = 'search-matched-page';
        }
        
        // Create page list item
        const pageItem = $('<a>')
            .addClass(`list-group-item list-group-item-action ${pageItemClass}`)
            .attr('href', '#')
            .attr('data-page', pageNumber)
            .html(`
                <div class="page-list-item">
                    <span>Page ${pageNumber}</span>
                    <div class="badge-container">
                        ${hasAnnotations ? '<span class="badge bg-warning text-dark">Highlighted</span>' : ''}
                        ${containsSearchWords ? '<span class="badge bg-success">Matched Words</span>' : ''}
                    </div>
                </div>
            `);
        
        // Add click event to display page content
        pageItem.on('click', function(e) {
            e.preventDefault();
            displayPageContent(pageNumber);
            
            // Highlight selected page
            $('#pageList .list-group-item').removeClass('active');
            $(this).addClass('active');
        });
        
        // Add to page list
        $('#pageList').append(pageItem);
    });
    
    // If there are pages, select the first one
    if (filteredResults.filtered_pages.length > 0) {
        $('#pageList .list-group-item:first').trigger('click');
    } else {
        // Display message for no matching pages
        $('#pageHeader').text('No matching pages found');
        $('#pageContent').html('<p class="text-muted">No pages match the current filter criteria.</p>');
        $('#pageImage').html('<p class="text-muted">No pages match the current filter criteria.</p>');
    }
}

// Display page content
function displayPageContent(pageNumber) {
    // Find the page in filtered results
    const page = filteredResults.filtered_pages.find(p => p.page_number === pageNumber);
    
    if (page) {
        // Update page header
        $('#pageHeader').text(`Page ${pageNumber}`);
        
        // Add badges for page properties
        let badges = '';
        if (page.has_annotations) {
            badges += '<span class="badge bg-warning text-dark ms-2">Highlighted</span>';
        }
        if (page.contains_search_words) {
            badges += '<span class="badge bg-success ms-2">Matched Words</span>';
        }
        $('#pageHeader').append(badges);
        
        // Display matched words if any
        if (page.matched_words && page.matched_words.length > 0) {
            const matchedWordsStr = page.matched_words.join(', ');
            $('#matchedWords').text(`Matched Words: ${matchedWordsStr}`).removeClass('d-none');
        } else {
            $('#matchedWords').addClass('d-none');
        }
        
        // Prepare page content (text)
        const pageText = page.text || 'No text content available for this page.';
        
        // Display page image if available
        if (page.image_url) {
            // Initialize the image viewer with zoom and pan capabilities
            $('#pageImage').html(`
                <div class="image-container">
                    <div class="image-controls">
                        <button id="zoomIn" class="btn btn-sm btn-light" title="Zoom In"><i class="bi bi-plus-lg"></i></button>
                        <button id="zoomOut" class="btn btn-sm btn-light" title="Zoom Out"><i class="bi bi-dash-lg"></i></button>
                        <button id="resetZoom" class="btn btn-sm btn-light" title="Reset"><i class="bi bi-arrows-angle-contract"></i></button>
                    </div>
                    <div class="image-wrapper">
                        <img src="${page.image_url}" class="page-image-content" id="pageImageContent" alt="Page ${pageNumber}">
                    </div>
                </div>
            `);
            
            // Initialize zoom and pan functionality
            initializeImageZoomPan();
        } else {
            $('#pageImage').html('<p class="text-muted">Image not available for this page.</p>');
        }
        
        // Create text direction toggle button
        const toggleButton = $('<button>')
            .addClass('btn btn-sm btn-outline-secondary text-direction-toggle')
            .text('Toggle RTL/LTR')
            .on('click', function() {
                $('#pageContent').toggleClass('rtl-text');
            });
        
        // Update page content
        $('#pageContent').text(pageText);
        
        // Add toggle button if there's content
        if (pageText && pageText !== 'No text content available for this page.') {
            $('#pageTextContainer').addClass('page-text-container');
            $('.text-direction-toggle').remove();
            $('#pageTextContainer').append(toggleButton);
            
            // Auto-detect if it should be RTL
            if (containsRTLCharacters(pageText)) {
                $('#pageContent').addClass('rtl-text');
            } else {
                $('#pageContent').removeClass('rtl-text');
            }
        }
    }
}

// Check if text contains RTL characters (Hebrew, Arabic, etc.)
function containsRTLCharacters(text) {
    // This regex matches Hebrew and Arabic character ranges
    const rtlRegex = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    return rtlRegex.test(text);
}

// Get human-readable filter type
function getFilterTypeText(filterType) {
    switch (filterType) {
        case 'highlights':
            return 'Highlights Only';
        case 'words':
            return 'Search Words Only';
        case 'both':
            return 'Highlights OR Search Words';
        default:
            return filterType;
    }
}

// Reset results and UI
function resetResults() {
    // Reset global variables
    ocrResults = null;
    filteredResults = null;
    
    // Reset UI elements
    $('#resultsSection').addClass('d-none');
    $('#pageList').empty();
    $('#pageHeader').text('Select a page to view content');
    $('#pageContent').empty();
    $('#pageImage').empty();
    $('#matchedWords').addClass('d-none');
}

// Initialize zoom and pan functionality for the page image
function initializeImageZoomPan() {
    let scale = 1;
    const $image = $('#pageImageContent');
    const $container = $image.parent();
    
    // Set initial states
    $image.css('transform', 'scale(1)');
    
    // Zoom in button
    $('#zoomIn').on('click', function() {
        scale *= 1.2;  // Increase by 20%
        updateImageTransform();
    });
    
    // Zoom out button
    $('#zoomOut').on('click', function() {
        scale /= 1.2;  // Decrease by 20%
        if (scale < 0.5) scale = 0.5;  // Limit minimum zoom
        updateImageTransform();
    });
    
    // Reset zoom button
    $('#resetZoom').on('click', function() {
        scale = 1;
        $image.css({
            'transform': 'scale(1)',
            'transform-origin': 'center center',
            'left': '0px',
            'top': '0px'
        });
    });
    
    // Pan functionality using mouse drag
    let isDragging = false;
    let lastX, lastY;
    
    $container.on('mousedown', function(e) {
        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        $container.css('cursor', 'grabbing');
    });
    
    $(document).on('mousemove', function(e) {
        if (isDragging && scale > 1) {
            const deltaX = e.clientX - lastX;
            const deltaY = e.clientY - lastY;
            
            const currentLeft = parseInt($image.css('left')) || 0;
            const currentTop = parseInt($image.css('top')) || 0;
            
            $image.css({
                'left': (currentLeft + deltaX) + 'px',
                'top': (currentTop + deltaY) + 'px'
            });
            
            lastX = e.clientX;
            lastY = e.clientY;
        }
    });
    
    $(document).on('mouseup', function() {
        isDragging = false;
        $container.css('cursor', 'grab');
    });
    
    // Update image transform with current scale
    function updateImageTransform() {
        $image.css({
            'transform': `scale(${scale})`,
            'transform-origin': 'center center'
        });
    }
    
    // Make container have grab cursor
    $container.css('cursor', 'grab');
}

// Show error message
function showError(message) {
    alert(message);
    console.error(message);
}