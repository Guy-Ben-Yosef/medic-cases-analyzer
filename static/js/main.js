// main.js - Frontend Logic for PDF OCR and Analysis Tool

// Global variables to store state
let currentResultId = null;
let currentFilename = null;
let currentResultPath = null;
let ocrResults = null;
let filteredResults = null;
let currentPageNumber = null;
let pageNotes = {}; // Object to store notes for each page
let pageMetadata = {}; // Object to store metadata (hospital, doctor type, date) for each page
let pageNoteSets = {}; // Object to store all note sets for each page
let showingCleanImage = false;

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

    $('#isHospital').on('change', function() {
        if (currentPageNumber) {
            saveMetadataForCurrentPage();
        }
    });
    
    $('#doctorType').on('change', function() {
        if (currentPageNumber) {
            saveMetadataForCurrentPage();
        }
    });
    
    $('#caseDate').on('input', function() {
        if (currentPageNumber) {
            saveMetadataForCurrentPage();
        }
    });
    
    // Date input validation and formatting
    $('#caseDate').on('blur', function() {
        validateAndFormatDate($(this));
    });

    // Add note set button click handler
    $('#addNoteSetBtn').on('click', function() {
        addNewNoteSet();
    });
    
    // Event delegation for dynamically added note set elements
    $('#dynamicNoteSets').on('change', '.isHospital, .doctorType', function() {
        if (currentPageNumber) {
            saveNoteSetDataForCurrentPage();
        }
    });
    
    $('#dynamicNoteSets').on('input', '.caseDate, .citationNotes', function() {
        if (currentPageNumber) {
            saveNoteSetDataForCurrentPage();
        }
    });
    
    // Event delegation for date validation
    $('#dynamicNoteSets').on('blur', '.caseDate', function() {
        validateAndFormatDate($(this));
    });
    
    // Event delegation for remove note set button
    $('#dynamicNoteSets').on('click', '.remove-note-set', function() {
        removeNoteSet($(this).closest('.note-set'));
    });

    // Initialize Bootstrap Select for the multi-select dropdown
    $('#searchWordsSelect').selectpicker({
        actionsBox: true,
        liveSearch: true,
        selectedTextFormat: 'count > 2',
        countSelectedText: '{0} words selected',
        width: '100%',
        noneSelectedText: 'Select search words...'
    });

    // Update publish notes button text to show DOCX
    updatePublishButtonText();

    // Initialize Socket.IO connection
    initializeSocketIO();

    // Initialize with at least one note set when first loading a page
    initializeNoteSets();

    // Populate the dropdown with words from the server
    populateSearchWords();

    // Initialize sticky features
    if (window.stickyFeatures) {
        window.stickyFeatures.initialize();
        window.stickyFeatures.addKeyboardShortcuts();
    }
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
    // Check if there are any note sets with data
    const hasNoteSets = pageNoteSets[pageNumber] && pageNoteSets[pageNumber].length > 0;
    const noteSetCount = hasNoteSets ? pageNoteSets[pageNumber].length : 0;
    
    // Find the page list item
    const pageItem = $(`#pageList .list-group-item[data-page="${pageNumber}"]`);
    
    // Remove existing note badge
    pageItem.find('.badge-note').remove();
    
    // Add or remove 'has-notes' class based on whether there are note sets
    if (hasNoteSets) {
        pageItem.addClass('has-notes');
        pageItem.find('.badge-container').append(
            `<span class="badge bg-info text-dark badge-note ms-1"><i class="bi bi-pencil-fill"></i> ${noteSetCount}</span>`
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

function uploadPDF() {
    const formData = new FormData($('#pdfUploadForm')[0]);
    
    // Display processing status
    $('#uploadButton').prop('disabled', true);
    $('#processingStatus').removeClass('d-none');
    
    // Initialize the progress bar
    $('#progressBar').css('width', '0%')
                     .attr('aria-valuenow', 0)
                     .removeClass('bg-success bg-danger')
                     .addClass('progress-bar-animated');
    $('#progressPercentage').text('0%');
    $('#currentPage').text('Page 0');
    $('#totalPages').text('of ? pages');
    $('#statusMessage').text('Initializing...');
    $('#processingError').addClass('d-none');
    
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
                
                // Update the total pages count
                $('#totalPages').text(`of ${response.total_pages} pages`);
                
                // Note: We don't need to call getOCRResults() immediately here,
                // as we'll wait for the WebSocket to notify us when processing is complete
            } else {
                showError('Failed to process PDF: ' + (response.error || 'Unknown error'));
                $('#processingStatus').addClass('d-none');
                $('#uploadButton').prop('disabled', false);
            }
        },
        error: function(xhr) {
            let errorMsg = 'Failed to upload PDF';
            if (xhr.responseJSON && xhr.responseJSON.error) {
                errorMsg += ': ' + xhr.responseJSON.error;
            }
            showError(errorMsg);
            $('#processingStatus').addClass('d-none');
            $('#uploadButton').prop('disabled', false);
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
            
            // Store result path for future use
            currentResultPath = `results/${currentResultId}_${currentFilename.replace(/\.[^/.]+$/, '')}_ocr_results.json`;
            
            // Enable search form and download button
            $('#searchForm').removeClass('d-none');
            $('#noFileSelected').addClass('d-none');
            $('#downloadSection').removeClass('d-none');
            
            // Apply default search and filter
            searchAndFilterResults();
            
            // Hide processing status after a short delay
            setTimeout(function() {
                $('#processingStatus').addClass('d-none');
                $('#uploadButton').prop('disabled', false);
            }, 500);
        },
        error: function(xhr) {
            let errorMsg = 'Failed to retrieve OCR results';
            if (xhr.responseJSON && xhr.responseJSON.error) {
                errorMsg += ': ' + xhr.responseJSON.error;
            }
            showError(errorMsg);
            $('#uploadButton').prop('disabled', false);
        }
    });
}

// Search and filter OCR results
function searchAndFilterResults() {
    if (!currentResultPath) {
        showError('No results available for filtering');
        return;
    }
    
    // Get selected words from the dropdown
    const selectedOptions = $('#searchWordsSelect option:selected');
    const searchWords = [];
    const searchWordGroups = [];
    
    // Collect all selected words and their representative groups
    selectedOptions.each(function() {
        const word = $(this).val();
        searchWords.push(word);
        
        // Get the representative group for this word
        const representativeGroup = JSON.parse($(this).attr('data-representative-group'));
        searchWordGroups.push(...representativeGroup);
    });
    
    // Use Set to remove duplicates, then convert back to array
    const uniqueSearchWords = [...new Set(searchWordGroups)];
    
    // Get filter type
    const filterType = $('input[name="filterType"]:checked').val();
    
    // Prepare request data
    const requestData = {
        resultPath: currentResultPath,
        searchWords: uniqueSearchWords,
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

    // Re-initialize sticky features after results are displayed
    if (window.stickyFeatures) {
        setTimeout(function() {
            window.stickyFeatures.initialize();
        }, 100);
    }
    
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
                        ${hasAnnotations ? 
                            `<span class="badge bg-warning text-dark">Highlighted${
                                page.removed_highlights_count ? 
                                ` <span class="badge badge-highlights">${page.removed_highlights_count}</span>` : 
                                ''}
                            </span>` : 
                            ''}
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
    
    // Show the navigation buttons
    $('#pageNavigationButtons').removeClass('d-none');
    
    // Initialize navigation buttons
    initializeNavigation();
    
    // If there are pages, select the first one
    if (pagesToDisplay.length > 0) {
        $('#pageList .list-group-item:first').trigger('click');
    } else {
        // Display message for no matching pages
        $('#pageHeader').text('No pages available');
        $('#pageContent').html('<p class="text-muted">No pages match the current filter criteria.</p>');
        $('#pageImage').html('<p class="text-muted">No pages match the current filter criteria.</p>');
        $('#pageNotes').prop('disabled', true);
        
        // Hide navigation buttons when no pages are available
        $('#pageNavigationButtons').addClass('d-none');
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
        
        // Reset clean image state when navigating to a new page
        showingCleanImage = false;
        
        // Display info about highlights removal if applicable
        if (page.has_annotations) {
            if (page.removed_highlights_count > 0) {
                $('#highlightInfo').html(`<div class="highlighted-notice">This page contains ${page.removed_highlights_count} highlight(s). OCR was performed on a cleaned version for better results.</div>`).removeClass('d-none');
            } else {
                $('#highlightInfo').html(`<div class="highlighted-notice">This page contains highlights.</div>`).removeClass('d-none');
            }
        } else {
            $('#highlightInfo').html('').addClass('d-none');
        }
        
        // Display page image if available
        if (page.image_url) {
            // Initialize the image viewer with zoom and pan capabilities
            $('#pageImage').html(`
                <div class="image-container">
                    <div class="image-controls">
                        <button id="zoomIn" class="btn btn-sm btn-light" title="Zoom In"><i class="bi bi-plus-lg"></i></button>
                        <button id="zoomOut" class="btn btn-sm btn-light" title="Zoom Out"><i class="bi bi-dash-lg"></i></button>
                        <button id="resetZoom" class="btn btn-sm btn-light" title="Reset"><i class="bi bi-arrows-angle-contract"></i></button>
                        ${page.has_annotations && page.clean_image_url ? `
                        <button id="toggleHighlightBtn" class="btn btn-sm btn-light" title="Toggle Highlights">
                            Show Without Highlights
                        </button>` : ''}
                        <button id="toggleWordHighlightBtn" class="btn btn-sm btn-light" title="Toggle Word Highlights">
                            Show Word Highlights
                        </button>
                    </div>
                    <div class="image-wrapper">
                        <img src="${page.image_url}" class="page-image-content" id="pageImageContent" alt="Page ${pageNumber}">
                    </div>
                </div>
            `);
            
            // Initialize zoom and pan functionality
            initializeImageZoomPan();
            
            // Add event handler for toggle highlight button if present
            if (page.has_annotations && page.clean_image_url) {
                $('#toggleHighlightBtn').off('click').on('click', toggleHighlightedImage);
            }
            $('#toggleWordHighlightBtn').off('click').on('click', toggleWordHighlights);
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
        
        // Load note sets for this page
        $('#dynamicNoteSets').empty();
        const noteSets = pageNoteSets[pageNumber] || [];

        if (noteSets.length > 0) {
            // Create note sets for each saved data
            noteSets.forEach(noteSetData => {
                addNewNoteSet(noteSetData);
            });
        } else {
            // Add one empty note set if none exist
            addNewNoteSet();
        }
        
        // Update navigation buttons after changing the page
        updateNavigationButtonStates();

        // Update sticky page counter if active
        if (window.stickyFeatures && $('.sticky-nav-wrapper').hasClass('sticky-active')) {
            window.stickyFeatures.updatePageCounter();
        }
    }
}

// Publish all notes to a docx file
function publishNotes() {
    if (!ocrResults || !currentFilename) {
        showError('No document loaded to publish notes from.');
        return;
    }

    // Make sure to save the current page's notes
    saveNoteSetDataForCurrentPage();
    
    // Check if there are any note sets with data
    const hasNotes = Object.keys(pageNoteSets).some(pageNum => 
        pageNoteSets[pageNum] && 
        pageNoteSets[pageNum].length > 0 && 
        pageNoteSets[pageNum].some(noteSet => 
            noteSet.isHospital || 
            noteSet.doctorType || 
            (noteSet.caseDate && noteSet.caseDate.trim() !== '') || 
            (noteSet.citationNotes && noteSet.citationNotes.trim() !== '')
        )
    );

    if (!hasNotes) {
        alert('No notes found. Please add notes to at least one page before publishing.');
        return;
    }
    
    // Prepare request data with notes and metadata
    const requestData = {
        noteSets: pageNoteSets,
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
    pageNoteSets = {}; // Clear note sets when loading a new document
    allPageNumbers = []; // Reset navigation arrays
    matchingPageNumbers = [];

    // Reset sticky states
    $('.sticky-notes-wrapper').removeClass('sticky-active');
    $('.sticky-nav-wrapper').removeClass('sticky-active');
    $('.floating-notes-toggle').remove();
    
    // Reset UI elements
    $('#resultsSection').addClass('d-none');
    $('#pageList').empty();
    $('#pageHeader').text('Select a page to view content');
    $('#pageContent').empty();
    $('#pageImage').empty();
    $('#matchedWords').addClass('d-none');
    $('#pageNotes').val('').prop('disabled', true);
    $('#pageNavigationButtons').addClass('d-none'); // Hide navigation buttons
}

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
    
    // Modified mousedown event to explicitly handle left mouse button (button 0)
    $container.on('mousedown', function(e) {
        // Check if it's the left mouse button (0) or middle mouse button (1)
        if (e.button === 0 || e.button === 1) {
            // Prevent default browser behavior for left click
            e.preventDefault();
            
            isDragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
            $container.css('cursor', 'grabbing');
        }
    });
    
    // Use the container for mousemove instead of document for better performance
    $container.on('mousemove', function(e) {
        if (isDragging && scale > 1) {
            e.preventDefault(); // Prevent selection during drag
            
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
    
    // Handle mouseup on both container and document for better reliability
    $container.on('mouseup mouseleave', function() {
        if (isDragging) {
            isDragging = false;
            $container.css('cursor', 'grab');
        }
    });
    
    $(document).on('mouseup', function() {
        if (isDragging) {
            isDragging = false;
            $container.css('cursor', 'grab');
        }
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
    
    // Disable context menu on container to prevent interference with right-click
    $container.on('contextmenu', function(e) {
        e.preventDefault();
    });
}

// Show error message
function showError(message) {
    alert(message);
    console.error(message);
}

// Global variables for navigation
let allPageNumbers = [];
let matchingPageNumbers = [];

// Initialize navigation buttons
function initializeNavigation() {
    // Reset page number arrays
    allPageNumbers = [];
    matchingPageNumbers = [];
    
    // Disable all navigation buttons by default
    $('#prevPageBtn, #nextPageBtn, #prevMatchingPageBtn, #nextMatchingPageBtn').prop('disabled', true);
    
    // If no results are available, don't continue
    if (!filteredResults) {
        return;
    }
    
    // Get all page numbers in order
    const pagesArray = filteredResults.all_pages;
    allPageNumbers = pagesArray.map(page => page.page_number).sort((a, b) => a - b);
    
    // Get all matching page numbers (pages with annotations or search word matches)
    matchingPageNumbers = pagesArray
        .filter(page => page.has_annotations || page.contains_search_words)
        .map(page => page.page_number)
        .sort((a, b) => a - b);
    
    // Update navigation button states
    updateNavigationButtonStates();
    
    // Add click handlers to navigation buttons
    $('#prevPageBtn').off('click').on('click', navigateToPreviousPage);
    $('#nextPageBtn').off('click').on('click', navigateToNextPage);
    $('#prevMatchingPageBtn').off('click').on('click', navigateToPreviousMatchingPage);
    $('#nextMatchingPageBtn').off('click').on('click', navigateToNextMatchingPage);
}

// Update the state of navigation buttons based on current page
function updateNavigationButtonStates() {
    if (!currentPageNumber || allPageNumbers.length === 0) {
        $('#prevPageBtn, #nextPageBtn, #prevMatchingPageBtn, #nextMatchingPageBtn').prop('disabled', true);
        return;
    }
    
    // Find current indices
    const currentAllIndex = allPageNumbers.indexOf(currentPageNumber);
    const currentMatchingIndex = matchingPageNumbers.indexOf(currentPageNumber);
    
    // Previous page button
    $('#prevPageBtn').prop('disabled', currentAllIndex <= 0);
    
    // Next page button
    $('#nextPageBtn').prop('disabled', currentAllIndex >= allPageNumbers.length - 1);
    
    // Previous matching page button
    // Disable if current page is not a matching page or is the first matching page
    if (currentMatchingIndex === -1) {
        // If we're on a non-matching page, find the previous matching page
        const previousMatches = matchingPageNumbers.filter(page => page < currentPageNumber);
        $('#prevMatchingPageBtn').prop('disabled', previousMatches.length === 0);
    } else {
        $('#prevMatchingPageBtn').prop('disabled', currentMatchingIndex <= 0);
    }
    
    // Next matching page button
    // Disable if current page is not a matching page or is the last matching page
    if (currentMatchingIndex === -1) {
        // If we're on a non-matching page, find the next matching page
        const nextMatches = matchingPageNumbers.filter(page => page > currentPageNumber);
        $('#nextMatchingPageBtn').prop('disabled', nextMatches.length === 0);
    } else {
        $('#nextMatchingPageBtn').prop('disabled', currentMatchingIndex >= matchingPageNumbers.length - 1);
    }
}

// Navigate to previous page
function navigateToPreviousPage() {
    if (!currentPageNumber) return;
    
    const currentIndex = allPageNumbers.indexOf(currentPageNumber);
    if (currentIndex > 0) {
        const previousPageNumber = allPageNumbers[currentIndex - 1];
        navigateToPage(previousPageNumber);
    }
}

// Navigate to next page
function navigateToNextPage() {
    if (!currentPageNumber) return;
    
    const currentIndex = allPageNumbers.indexOf(currentPageNumber);
    if (currentIndex < allPageNumbers.length - 1) {
        const nextPageNumber = allPageNumbers[currentIndex + 1];
        navigateToPage(nextPageNumber);
    }
}

// Navigate to previous matching page
function navigateToPreviousMatchingPage() {
    if (!currentPageNumber) return;
    
    // Find the previous matching page
    let previousMatchingPage;
    
    // If current page is a matching page
    const currentMatchingIndex = matchingPageNumbers.indexOf(currentPageNumber);
    if (currentMatchingIndex > 0) {
        previousMatchingPage = matchingPageNumbers[currentMatchingIndex - 1];
    } else {
        // Find the last matching page that comes before the current page
        const previousMatches = matchingPageNumbers.filter(page => page < currentPageNumber);
        if (previousMatches.length > 0) {
            previousMatchingPage = Math.max(...previousMatches);
        }
    }
    
    if (previousMatchingPage) {
        navigateToPage(previousMatchingPage);
    }
}

// Navigate to next matching page
function navigateToNextMatchingPage() {
    if (!currentPageNumber) return;
    
    // Find the next matching page
    let nextMatchingPage;
    
    // If current page is a matching page
    const currentMatchingIndex = matchingPageNumbers.indexOf(currentPageNumber);
    if (currentMatchingIndex !== -1 && currentMatchingIndex < matchingPageNumbers.length - 1) {
        nextMatchingPage = matchingPageNumbers[currentMatchingIndex + 1];
    } else {
        // Find the first matching page that comes after the current page
        const nextMatches = matchingPageNumbers.filter(page => page > currentPageNumber);
        if (nextMatches.length > 0) {
            nextMatchingPage = Math.min(...nextMatches);
        }
    }
    
    if (nextMatchingPage) {
        navigateToPage(nextMatchingPage);
    }
}

// Navigate to a specific page number
function navigateToPage(pageNumber) {
    // Save note sets before navigating
    saveNoteSetDataForCurrentPage();
    
    // Find the page list item and trigger a click to navigate
    $(`#pageList .list-group-item[data-page="${pageNumber}"]`).trigger('click');
    
    // Update sticky page counter if active
    setTimeout(function() {
        if (window.stickyFeatures && $('.sticky-nav-wrapper').hasClass('sticky-active')) {
            window.stickyFeatures.updatePageCounter();
        }
    }, 50);
}

// Initialize Socket.IO connection
function initializeSocketIO() {
    console.log('Initializing Socket.IO connection...');
    
    // Connect with debug options
    socket = io({
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 20000,
        forceNew: true,
        transports: ['websocket', 'polling'] // Try WebSocket first, then fall back to polling
    });
    
    // Connection event handlers
    socket.on('connect', function() {
        console.log('Socket.IO connected successfully! Socket ID:', socket.id);
    });
    
    // Listen for progress updates
    socket.on('progress_update', function(data) {
        console.log('Received progress update:', data);
        updateProgressUI(data.data);
    });
    
    // Connection error handling
    socket.on('connect_error', function(error) {
        console.error('Socket.IO connection error:', error);
        // Show error in UI
        $('#processingError').removeClass('d-none');
        $('#errorMessage').text('Connection error: ' + error.message + '. Try refreshing the page.');
    });
    
    socket.on('connect_timeout', function() {
        console.error('Socket.IO connection timeout');
    });
    
    socket.on('error', function(error) {
        console.error('Socket.IO error:', error);
    });
    
    socket.on('disconnect', function(reason) {
        console.log('Socket.IO disconnected. Reason:', reason);
    });
    
    socket.on('reconnect', function(attemptNumber) {
        console.log('Socket.IO reconnected after', attemptNumber, 'attempts');
    });
    
    socket.on('reconnect_attempt', function(attemptNumber) {
        console.log('Socket.IO reconnection attempt:', attemptNumber);
    });
    
    socket.on('reconnect_error', function(error) {
        console.error('Socket.IO reconnection error:', error);
    });
    
    socket.on('reconnect_failed', function() {
        console.error('Socket.IO failed to reconnect');
        // Show permanent error in UI
        $('#processingError').removeClass('d-none');
        $('#errorMessage').text('Failed to establish connection. Please refresh the page and try again.');
    });
}

// Update progress UI based on server data
function updateProgressUI(progressData) {
    // Show processing status if hidden
    $('#processingStatus').removeClass('d-none');
    
    // Update progress percentage
    const percentage = progressData.percentage || 0;
    $('#progressBar').css('width', percentage + '%').attr('aria-valuenow', percentage);
    $('#progressPercentage').text(percentage + '%');
    
    // Update page count
    const currentPage = progressData.current_page || 0;
    const totalPages = progressData.total_pages || 0;
    $('#currentPage').text(`Page ${currentPage}`);
    $('#totalPages').text(`of ${totalPages} pages`);
    
    // Update status message
    if (progressData.message) {
        $('#statusMessage').text(progressData.message);
    }
    
    // Handle errors
    if (progressData.errors && progressData.errors.length > 0) {
        $('#processingError').removeClass('d-none');
        const latestError = progressData.errors[progressData.errors.length - 1];
        $('#errorMessage').text(latestError);
        
        // Check for specific error messages related to Flask context
        if (latestError.includes('application context') || 
            latestError.includes('Working outside of application context')) {
            // This is likely the Flask app context error, but processing might still be complete
            console.warn('App context error detected, but checking if processing completed');
            
            // Check if processing is actually complete despite the error
            if (percentage >= 98) {  // If we're close to completion
                console.log('Processing nearly complete, attempting to load results');
                
                // Add a delay and try to get results
                setTimeout(function() {
                    getOCRResults();
                }, 2000);
            }
        }
    } else {
        $('#processingError').addClass('d-none');
    }
    
    // Handle completed status
    if (progressData.status === 'completed') {
        // Add success styles
        $('#progressBar').removeClass('progress-bar-animated')
                         .addClass('bg-success');
        
        // Delay hiding the progress for a moment so user can see it finished
        setTimeout(function() {
            // Get OCR results once processing is complete
            getOCRResults();
        }, 1500);
    } else if (progressData.status === 'error') {
        // Add error styles
        $('#progressBar').removeClass('progress-bar-animated')
                         .addClass('bg-danger');
    }
}

function handleProcessingError(error) {
    console.error('Processing error:', error);
    
    // Update the UI to show the error
    $('#progressBar').removeClass('progress-bar-animated').addClass('bg-danger');
    $('#processingError').removeClass('d-none');
    $('#errorMessage').text(error);
    
    // Allow user to try again
    setTimeout(function() {
        $('#uploadButton').prop('disabled', false);
    }, 2000);
}

function validateAndFormatDate(dateInput) {
    const value = dateInput.val().trim();
    
    // If empty, don't validate
    if (!value) {
        dateInput.removeClass('is-invalid');
        return;
    }
    
    // Regular expression for DD/MM/YYYY format
    const dateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
    const match = value.match(dateRegex);
    
    if (match) {
        let day = parseInt(match[1], 10);
        let month = parseInt(match[2], 10);
        const year = parseInt(match[3], 10);
        
        // Check if date is valid
        if (month >= 1 && month <= 12 && day >= 1) {
            // Calculate the last day of the month
            const lastDayOfMonth = new Date(year, month, 0).getDate();
            
            if (day <= lastDayOfMonth) {
                // Format the date with leading zeros
                const formattedDay = day.toString().padStart(2, '0');
                const formattedMonth = month.toString().padStart(2, '0');
                
                // Set the formatted value
                dateInput.val(`${formattedDay}/${formattedMonth}/${year}`);
                dateInput.removeClass('is-invalid');
                return;
            }
        }
    }
    
    // Invalid date
    dateInput.addClass('is-invalid');
}

// Update the saveNoteForCurrentPage function to also save metadata
// Find this function:
function saveNoteForCurrentPage() {
    if (currentPageNumber) {
        const noteText = $('#pageNotes').val();
        pageNotes[currentPageNumber] = noteText;
        
        // Optional: Add visual indicator for pages with notes
        updatePageListItemWithNoteIndicator(currentPageNumber);
    }
}

function saveMetadataForCurrentPage() {
    if (currentPageNumber) {
        // Initialize metadata object for this page if it doesn't exist
        if (!pageMetadata[currentPageNumber]) {
            pageMetadata[currentPageNumber] = {};
        }
        
        // Save current values of form fields
        pageMetadata[currentPageNumber].isHospital = $('#isHospital').prop('checked');
        pageMetadata[currentPageNumber].doctorType = $('#doctorType').val();
        pageMetadata[currentPageNumber].caseDate = $('#caseDate').val();
    }
}

function initializeNoteSets() {
    // Clear existing note sets
    $('#dynamicNoteSets').empty();
    
    // If there are no note sets yet, add the first one
    if (currentPageNumber && (!pageNoteSets[currentPageNumber] || pageNoteSets[currentPageNumber].length === 0)) {
        addNewNoteSet();
    }
}

// Function to add a new note set
function addNewNoteSet(data = null) {
    // Clone the template
    const template = $('#noteSet-template').clone();
    template.attr('id', '');
    template.addClass('real-note-set');
    template.show();
    
    // Determine the new index
    const noteSetCount = $('#dynamicNoteSets .note-set').length + 1;
    template.find('.note-set-number').text(noteSetCount);
    
    // Set unique IDs for all form elements based on the index
    template.find('.isHospital').attr('id', `isHospital-${noteSetCount}`);
    template.find('.isHospital').next('label').attr('for', `isHospital-${noteSetCount}`);
    template.find('.doctorType').attr('id', `doctorType-${noteSetCount}`);
    template.find('.doctorType').prev('label').attr('for', `doctorType-${noteSetCount}`);
    template.find('.caseDate').attr('id', `caseDate-${noteSetCount}`);
    template.find('.caseDate').prev('label').attr('for', `caseDate-${noteSetCount}`);
    template.find('.citationNotes').attr('id', `citationNotes-${noteSetCount}`);
    template.find('.citationNotes').prev('label').attr('for', `citationNotes-${noteSetCount}`);
    
    // If we have data, populate the form elements
    if (data) {
        template.find('.isHospital').prop('checked', data.isHospital || false);
        template.find('.doctorType').val(data.doctorType || '');
        template.find('.caseDate').val(data.caseDate || '');
        template.find('.citationNotes').val(data.citationNotes || '');
    }
    
    // Add to the container
    $('#dynamicNoteSets').append(template);
    
    // Save the current state
    if (currentPageNumber) {
        saveNoteSetDataForCurrentPage();
    }
    
    // Update the page list indicator
    updatePageListItemWithNoteIndicator(currentPageNumber);
    
    // Update floating notes button if it exists
    if (window.stickyFeatures) {
        window.stickyFeatures.updateFloatingButton();
    }

    return template;
}

// Function to remove a note set
function removeNoteSet(noteSetElement) {
    // Ask for confirmation
    if (confirm('Are you sure you want to remove this note set?')) {
        // Remove the element
        noteSetElement.remove();
        
        // Renumber the remaining note sets
        $('#dynamicNoteSets .note-set').each(function(index) {
            $(this).find('.note-set-number').text(index + 1);
        });
        
        // Save the current state
        if (currentPageNumber) {
            saveNoteSetDataForCurrentPage();
        }
        
        // Update floating notes button if it exists
        if (window.stickyFeatures) {
            window.stickyFeatures.updateFloatingButton();
        }
        
        // Update the page list indicator
        updatePageListItemWithNoteIndicator(currentPageNumber);
    }
}

// Function to save all note sets for the current page
function saveNoteSetDataForCurrentPage() {
    if (currentPageNumber) {
        const noteSets = [];
        
        // Collect data from all note sets
        $('#dynamicNoteSets .note-set').each(function() {
            const noteSet = {
                isHospital: $(this).find('.isHospital').prop('checked'),
                doctorType: $(this).find('.doctorType').val(),
                caseDate: $(this).find('.caseDate').val(),
                citationNotes: $(this).find('.citationNotes').val()
            };
            
            // Only add if it has some data
            if (noteSet.isHospital || noteSet.doctorType || noteSet.caseDate || noteSet.citationNotes) {
                noteSets.push(noteSet);
            }
        });
        
        // Store the collected data
        pageNoteSets[currentPageNumber] = noteSets;
        
        // Update the page list indicator
        updatePageListItemWithNoteIndicator(currentPageNumber);
    }
}

function populateSearchWords() {
    // Get the search words data from the data attribute
    const searchWordsData = JSON.parse($('#searchWordsSelect').attr('data-search-words') || '[]');
    
    if (!searchWordsData || searchWordsData.length === 0) {
        console.error('No search words data available');
        return;
    }
    
    // Clear existing options
    $('#searchWordsSelect').empty();
    
    // Add options for each word
    searchWordsData.forEach(wordGroup => {
        const option = $('<option>')
            .val(wordGroup.word)
            .text(wordGroup.word)
            .attr('data-representative-group', JSON.stringify(wordGroup.representative_group));
        
        $('#searchWordsSelect').append(option);
    });
    
    // Select all options by default
    $('#searchWordsSelect option').prop('selected', true);
    
    // Refresh the select picker to show the new options with all selected
    $('#searchWordsSelect').selectpicker('refresh');
}

function toggleHighlightedImage() {
    if (!currentPageNumber) return;
    
    // Find the current page data
    const page = getCurrentPageData();
    
    if (!page || !page.has_annotations) {
        // No need to toggle if page isn't highlighted
        return;
    }
    
    // Check if we have both image URLs
    if (page.image_url && page.clean_image_url) {
        const $image = $('#pageImageContent');
        
        if (showingCleanImage) {
            // Switch to original highlighted image
            $image.attr('src', page.image_url);
            $('#toggleHighlightBtn').text('Show Without Highlights');
        } else {
            // Switch to clean image
            $image.attr('src', page.clean_image_url);
            $('#toggleHighlightBtn').text('Show With Highlights');
        }
        
        // Toggle the state
        showingCleanImage = !showingCleanImage;
    }
}

function toggleWordHighlights() {
    if (!currentPageNumber || !filteredResults) return;
    
    const page = getCurrentPageData();
    if (!page || !page.image_url) return;
    
    // Get current search words
    const searchWords = filteredResults.search_information?.search_words || [];
    if (searchWords.length === 0) {
        alert('No search words to highlight');
        return;
    }
    
    const $image = $('#pageImageContent');
    const $toggleBtn = $('#toggleWordHighlightBtn');
    
    if ($toggleBtn.text().includes('Show Word Highlights')) {
        // Switch to highlighted image
        const wordsParam = searchWords.join(',');
        const highlightedUrl = `/highlighted-page-images/${currentResultId}/${currentPageNumber}?words=${encodeURIComponent(wordsParam)}`;
        
        $image.attr('src', highlightedUrl);
        $toggleBtn.text('Hide Word Highlights');
        $toggleBtn.removeClass('btn-light').addClass('btn-warning');
    } else {
        // Switch back to original image
        $image.attr('src', page.image_url);
        $toggleBtn.text('Show Word Highlights');
        $toggleBtn.removeClass('btn-warning').addClass('btn-light');
    }
}

// Helper function to get current page data
function getCurrentPageData() {
    if (!currentPageNumber || !filteredResults) return null;
    
    // Check if we should look in all_pages or filtered_pages
    const isShowingAllPages = filteredResults.search_information.filter_type === 'all';
    const pagesArray = isShowingAllPages ? filteredResults.all_pages : filteredResults.filtered_pages;
    
    // Find the page data
    return pagesArray.find(p => p.page_number === currentPageNumber);
}