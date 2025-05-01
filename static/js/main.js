// main.js - Frontend Logic for PDF OCR and Analysis Tool

// Global variables to store state
let currentResultId = null;
let currentFilename = null;
let currentResultPath = null;
let ocrResults = null;
let filteredResults = null;
let currentPageNumber = null;
let pageNotes = {}; // Object to store notes for each page

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
    
    // Handle publish notes button
    $('#publishNotesBtn').off('click').on('click', function() {
        publishNotes();
    });
    
    // Update publish notes button text to show DOCX
    updatePublishButtonText();
    
    // Handle view mode switch
    $('#viewModeToggle input').on('change', function() {
        toggleViewMode();
    });
    
    // Validate page range inputs
    $('#startPage, #endPage').on('change', function() {
        validatePageRange();
    });
    
    // Save notes when user types in the textarea
    $('#pageNotes').on('input', function() {
        if (currentPageNumber) {
            saveNoteForCurrentPage();
        }
    });
});

// Save note for the current page
function saveNoteForCurrentPage() {
    if (currentPageNumber) {
        const noteText = $('#pageNotes').val();
        pageNotes[currentPageNumber] = noteText;
        
        // Optional: Add visual indicator for pages with notes
        updatePageListItemWithNoteIndicator(currentPageNumber);
    }
}

// Update page list item to show note indicator
function updatePageListItemWithNoteIndicator(pageNumber) {
    const hasNote = pageNotes[pageNumber] && pageNotes[pageNumber].trim() !== '';
    
    // Find the page list item
    const pageItem = $(`#pageList .list-group-item[data-page="${pageNumber}"]`);
    
    // Remove existing note badge
    pageItem.find('.badge-note').remove();
    
    // Add or remove 'has-notes' class based on whether there's a note
    if (hasNote) {
        pageItem.addClass('has-notes');
        pageItem.find('.badge-container').append(
            '<span class="badge bg-info text-dark badge-note ms-1"><i class="bi bi-pencil-fill"></i></span>'
        );
    } else {
        pageItem.removeClass('has-notes');
    }
}

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
    
    // Inform user about whole word matching
    if (searchWords.length > 0) {
        const infoMessage = $('<div>')
            .addClass('alert alert-info mb-2')
            .html('<strong>Note:</strong> Search will match whole words only. For example, searching for "pose" will not match "compose".')
            .hide();
        
        // Add message if not already shown
        if ($('#searchForm .alert-info').length === 0) {
            $('#searchForm .btn-success').before(infoMessage);
            infoMessage.fadeIn();
            
            // Set a timeout to remove the message after a few seconds
            setTimeout(() => {
                infoMessage.fadeOut(() => {
                    infoMessage.remove();
                });
            }, 5000);
        }
    }
    
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
    
    // Determine which pages to display based on filter type
    const filterType = filteredResults.search_information.filter_type;
    const isShowAllPages = filterType === 'all';
    
    // Get the appropriate list of pages to display
    const pagesToDisplay = isShowAllPages ? 
        filteredResults.all_pages : 
        filteredResults.filtered_pages;
    
    // Update results summary
    const totalPages = filteredResults.total_pages_in_document;
    const matchingPages = filteredResults.search_information.total_matching_pages;
    
    if (isShowAllPages) {
        $('#resultsSummary').text(
            `Showing all ${totalPages} pages. ${matchingPages} pages match the search criteria.`
        );
    } else {
        $('#resultsSummary').text(
            `Showing ${pagesToDisplay.length} pages out of ${totalPages} total pages. ` +
            `Filter: ${getFilterTypeText(filterType)}`
        );
    }
    
    // Clear existing page list
    $('#pageList').empty();
    
    // Add pages to the list
    pagesToDisplay.forEach(function(page) {
        const pageNumber = page.page_number;
        const hasAnnotations = page.has_annotations;
        const containsSearchWords = page.contains_search_words;
        const matchedWords = page.matched_words || [];
        
        // Determine if this is a matching page
        const isMatchingPage = hasAnnotations || containsSearchWords;
        
        // Determine page item class
        let pageItemClass = '';
        
        if (isShowAllPages && !isMatchingPage) {
            pageItemClass = 'non-matching-page';
        } else if (hasAnnotations && containsSearchWords) {
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
            
            // Save note for current page before switching
            saveNoteForCurrentPage();
            
            // Display new page content
            displayPageContent(pageNumber);
            
            // Highlight selected page
            $('#pageList .list-group-item').removeClass('active');
            $(this).addClass('active');
        });
        
        // Add to page list
        $('#pageList').append(pageItem);
        
        // Add note indicator if there's a note for this page
        if (pageNotes[pageNumber] && pageNotes[pageNumber].trim() !== '') {
            updatePageListItemWithNoteIndicator(pageNumber);
        }
    });
    
    // If there are pages, select the first one
    if (pagesToDisplay.length > 0) {
        $('#pageList .list-group-item:first').trigger('click');
    } else {
        // Display message for no matching pages
        $('#pageHeader').text('No pages available');
        $('#pageContent').html('<p class="text-muted">No pages match the current filter criteria.</p>');
        $('#pageImage').html('<p class="text-muted">No pages match the current filter criteria.</p>');
        $('#pageNotes').prop('disabled', true);
    }
}

// Display page content
function displayPageContent(pageNumber) {
    // Save current page number
    currentPageNumber = pageNumber;
    
    // Determine the correct array to search based on filter type
    let pagesArray = filteredResults.filtered_pages;
    
    // If showing all pages, we need to look in all_pages
    if (filteredResults.search_information.filter_type === 'all') {
        pagesArray = filteredResults.all_pages;
    }
    
    // Find the page in the appropriate array
    const page = pagesArray.find(p => p.page_number === pageNumber);
    
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
        
        // Load notes for this page if they exist
        $('#pageNotes').val(pageNotes[pageNumber] || '');
        $('#pageNotes').prop('disabled', false);
    }
}

// Publish all notes to a docx file
function publishNotes() {
    if (!ocrResults || !currentFilename) {
        showError('No document loaded to publish notes from.');
        return;
    }
    
    // Make sure to save the current page's notes
    saveNoteForCurrentPage();
    
    // Check if there are any notes
    const hasNotes = Object.values(pageNotes).some(note => note && note.trim() !== '');
    
    if (!hasNotes) {
        alert('No notes found. Please add notes to at least one page before publishing.');
        return;
    }
    
    // Prepare request data
    const requestData = {
        notes: pageNotes,
        filename: currentFilename
    };
    
    // Set button to loading state
    const $publishBtn = $('#publishNotesBtn');
    const originalBtnHtml = $publishBtn.html();
    $publishBtn.html('<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Exporting...');
    $publishBtn.prop('disabled', true);
    
    // Use the server-side endpoint to generate and download the docx file
    fetch('/publish-notes', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to export notes to DOCX');
        }
        return response.blob();
    })
    .then(blob => {
        // Create a timestamp for the filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const downloadFilename = `notes_${currentFilename}_${timestamp}.docx`;
        
        // Create a download link and trigger download
        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = downloadFilename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        // Clean up
        URL.revokeObjectURL(url);
        
        // Show success message
        alert('Notes exported to DOCX successfully!');
    })
    .catch(error => {
        console.error('Error publishing notes:', error);
        showError('Failed to export notes to DOCX: ' + error.message);
    })
    .finally(() => {
        // Reset button state
        $publishBtn.html(originalBtnHtml);
        $publishBtn.prop('disabled', false);
    });
}

// Function to update the Publish Notes button text and icon
function updatePublishButtonText() {
    $('#publishNotesBtn').html('<i class="bi bi-file-earmark-word"></i> Export Notes to DOCX');
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
        case 'all':
            return 'All Pages';
        default:
            return filterType;
    }
}

// Reset results and UI
function resetResults() {
    // Reset global variables
    ocrResults = null;
    filteredResults = null;
    currentPageNumber = null;
    pageNotes = {}; // Clear notes when loading a new document
    
    // Reset UI elements
    $('#resultsSection').addClass('d-none');
    $('#pageList').empty();
    $('#pageHeader').text('Select a page to view content');
    $('#pageContent').empty();
    $('#pageImage').empty();
    $('#matchedWords').addClass('d-none');
    $('#pageNotes').val('').prop('disabled', true);
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