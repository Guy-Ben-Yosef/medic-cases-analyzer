// Sticky Notes and Navigation JavaScript Module

// Global variables for sticky functionality
let stickyScrollThreshold = 100;
let isNotesMinimized = false;
let scrollTimeout;
let lastScrollTop = 0;

// Initialize sticky functionality
function initializeStickyFeatures() {
    // Wrap notes container and navigation with sticky wrappers
    wrapStickyElements();
    
    // Add scroll event listener with throttling
    let scrolling = false;
    $(window).on('scroll', function() {
        if (!scrolling) {
            window.requestAnimationFrame(function() {
                handleStickyScroll();
                scrolling = false;
            });
            scrolling = true;
        }
    });
    
    // Add resize event listener for responsive behavior
    $(window).on('resize', debounce(handleResponsiveSticky, 250));
    
    // Initialize mobile floating button if needed
    if ($(window).width() <= 576) {
        createFloatingNotesButton();
    }
}

// Wrap elements with sticky containers
function wrapStickyElements() {
    // Check if elements exist and haven't been wrapped already
    if ($('#noteSetsContainer').length && !$('#noteSetsContainer').parent().hasClass('sticky-notes-wrapper')) {
        $('#noteSetsContainer').wrap('<div class="sticky-notes-wrapper"></div>');
    }
    
    if ($('#pageNavigationButtons').length && !$('#pageNavigationButtons').parent().hasClass('sticky-nav-wrapper')) {
        $('#pageNavigationButtons').wrap('<div class="sticky-nav-wrapper"></div>');
    }
}

// Handle scroll events for sticky behavior
function handleStickyScroll() {
    const scrollTop = $(window).scrollTop();
    const notesWrapper = $('.sticky-notes-wrapper');
    const navWrapper = $('.sticky-nav-wrapper');
    
    // Check if we're in the results section
    if (!$('#resultsSection').hasClass('d-none')) {
        const resultsTop = $('#resultsSection').offset().top;
        const triggerPoint = resultsTop - 100;
        
        // Check navigation wrapper position
        if (navWrapper.length) {
            const navOriginalTop = navWrapper.offset().top - scrollTop;
            
            if (scrollTop > triggerPoint && navOriginalTop <= 10) {
                activateStickyNav(navWrapper);
            } else if (scrollTop <= triggerPoint) {
                deactivateStickyNav(navWrapper);
            }
        }
        
        // Check notes wrapper position
        if (notesWrapper.length) {
            const notesOriginalTop = notesWrapper.offset().top - scrollTop;
            
            if (scrollTop > triggerPoint && notesOriginalTop <= 100) {
                activateStickyNotes(notesWrapper);
            } else if (scrollTop <= triggerPoint) {
                deactivateStickyNotes(notesWrapper);
            }
        }
    }
    
    lastScrollTop = scrollTop;
}

// Activate sticky navigation
function activateStickyNav(navWrapper) {
    if (!navWrapper.hasClass('sticky-active')) {
        navWrapper.addClass('sticky-active');
        
        // Position the navigation relative to the image container
        positionStickyNav(navWrapper);
        
        // Add page counter if not exists
        if (!navWrapper.find('.sticky-page-counter').length) {
            addPageCounter(navWrapper);
        }
        
        // Update page counter
        updatePageCounter();
        
        // Add tooltips for accessibility
        addNavigationTooltips();
    }
}

// Add page counter to sticky navigation
function addPageCounter(navWrapper) {
    const pageCounter = $('<div>')
        .addClass('sticky-page-counter')
        .html(`
            <div class="page-counter-display">
                <span class="current-page">1</span>
                <span class="page-separator">/</span>
                <span class="total-pages">1</span>
            </div>
        `);
    
    // Insert counter at the top of the navigation
    navWrapper.find('#pageNavigationButtons').prepend(pageCounter);
}

// Update page counter with current values
function updatePageCounter() {
    const counter = $('.sticky-page-counter');
    if (counter.length && typeof currentPageNumber !== 'undefined' && typeof allPageNumbers !== 'undefined') {
        counter.find('.current-page').text(currentPageNumber || 1);
        counter.find('.total-pages').text(allPageNumbers.length || 1);
    }
}

// Position sticky navigation relative to content
function positionStickyNav(navWrapper) {
    // Get the main image container (the actual content area)
    const imageMainContainer = $('.image-main-container');
    
    if (imageMainContainer.length) {
        const containerOffset = imageMainContainer.offset();
        const containerWidth = imageMainContainer.outerWidth();
        const containerHeight = imageMainContainer.outerHeight();
        const navWidth = navWrapper.outerWidth();
        const navHeight = navWrapper.outerHeight();
        
        // Calculate position to align with right edge of image container
        const scrollTop = $(window).scrollTop();
        const leftPosition = containerOffset.left + containerWidth + 15; // 15px gap from container
        const topPosition = containerOffset.top - scrollTop + (containerHeight / 2) - (navHeight / 2);
        
        // Ensure navigation stays within viewport bounds
        const minTop = 20;
        const maxTop = $(window).height() - navHeight - 20;
        const finalTop = Math.max(minTop, Math.min(topPosition, maxTop));
        
        // Ensure navigation doesn't go off-screen horizontally
        const maxLeft = $(window).width() - navWidth - 20;
        const finalLeft = Math.min(leftPosition, maxLeft);
        
        // Update CSS to position correctly
        navWrapper.css({
            'position': 'fixed',
            'top': finalTop + 'px',
            'left': finalLeft + 'px',
            'transform': 'none'
        });
    }
}

// Update position on scroll
function handleStickyScroll() {
    const scrollTop = $(window).scrollTop();
    const notesWrapper = $('.sticky-notes-wrapper');
    const navWrapper = $('.sticky-nav-wrapper');
    
    // Check if we're in the results section
    if (!$('#resultsSection').hasClass('d-none')) {
        const resultsTop = $('#resultsSection').offset().top;
        const triggerPoint = resultsTop - 100;
        
        // Check navigation wrapper position
        if (navWrapper.length) {
            const navOriginalTop = navWrapper.offset().top - scrollTop;
            
            if (scrollTop > triggerPoint && navOriginalTop <= 10) {
                activateStickyNav(navWrapper);
                // Update position on scroll
                if (navWrapper.hasClass('sticky-active')) {
                    positionStickyNav(navWrapper);
                }
            } else if (scrollTop <= triggerPoint) {
                deactivateStickyNav(navWrapper);
            }
        }
        
        // Check notes wrapper position
        if (notesWrapper.length) {
            const notesOriginalTop = notesWrapper.offset().top - scrollTop;
            
            if (scrollTop > triggerPoint && notesOriginalTop <= 100) {
                activateStickyNotes(notesWrapper);
            } else if (scrollTop <= triggerPoint) {
                deactivateStickyNotes(notesWrapper);
            }
        }
    }
    
    lastScrollTop = scrollTop;
}

// Deactivate sticky navigation
function deactivateStickyNav(navWrapper) {
    navWrapper.removeClass('sticky-active');
    // Remove page counter
    navWrapper.find('.sticky-page-counter').remove();
    // Reset inline styles
    navWrapper.css({
        'position': '',
        'top': '',
        'left': '',
        'transform': ''
    });
}

// Activate sticky notes
function activateStickyNotes(notesWrapper) {
    if (!notesWrapper.hasClass('sticky-active')) {
        notesWrapper.addClass('sticky-active');
        
        // Check if content is scrollable
        checkNotesScrollability(notesWrapper);
        
        // Add minimize button if not exists
        if (!notesWrapper.find('.sticky-minimize-btn').length) {
            addMinimizeButton(notesWrapper);
        }
    }
}

// Deactivate sticky notes
function deactivateStickyNotes(notesWrapper) {
    notesWrapper.removeClass('sticky-active');
    notesWrapper.find('.sticky-minimize-btn').remove();
}

// Add minimize/expand button to sticky notes
function addMinimizeButton(notesWrapper) {
    const minimizeBtn = $('<button>')
        .addClass('btn btn-sm btn-link sticky-minimize-btn')
        .attr('title', 'Minimize notes')
        .css({
            position: 'absolute',
            top: '5px',
            right: '5px',
            zIndex: '10'
        })
        .html('<i class="bi bi-dash-lg"></i>')
        .on('click', function() {
            toggleNotesMinimize(notesWrapper);
        });
    
    notesWrapper.prepend(minimizeBtn);
}

// Toggle notes minimize state
function toggleNotesMinimize(notesWrapper) {
    if (isNotesMinimized) {
        // Expand notes
        notesWrapper.find('#noteSetsContainer').show();
        notesWrapper.find('.sticky-notes-minimized').remove();
        notesWrapper.find('.sticky-minimize-btn').html('<i class="bi bi-dash-lg"></i>');
        isNotesMinimized = false;
    } else {
        // Minimize notes
        const noteCount = $('#dynamicNoteSets .note-set').length;
        const minimizedDiv = $('<div>')
            .addClass('sticky-notes-minimized')
            .html(`
                <span>
                    <i class="bi bi-journal-text"></i> Notes
                    ${noteCount > 0 ? `<span class="notes-count-badge">${noteCount}</span>` : ''}
                </span>
                <i class="bi bi-chevron-down"></i>
            `)
            .on('click', function() {
                toggleNotesMinimize(notesWrapper);
            });
        
        notesWrapper.find('#noteSetsContainer').hide();
        notesWrapper.append(minimizedDiv);
        notesWrapper.find('.sticky-minimize-btn').html('<i class="bi bi-plus-lg"></i>');
        isNotesMinimized = true;
    }
}

// Check if notes content is scrollable
function checkNotesScrollability(notesWrapper) {
    const container = notesWrapper.find('#noteSetsContainer');
    if (container[0].scrollHeight > container[0].clientHeight) {
        notesWrapper.addClass('has-scroll');
    } else {
        notesWrapper.removeClass('has-scroll');
    }
}

// Add tooltips to navigation buttons
function addNavigationTooltips() {
    $('#prevPageBtn').attr('title', 'Previous Page (Alt+Left)');
    $('#nextPageBtn').attr('title', 'Next Page (Alt+Right)');
    $('#prevMatchingPageBtn').attr('title', 'Previous Match (Shift+Left)');
    $('#nextMatchingPageBtn').attr('title', 'Next Match (Shift+Right)');
    
    // Initialize Bootstrap tooltips if available
    if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
        $('#pageNavigationButtons .btn').each(function() {
            new bootstrap.Tooltip(this);
        });
    }
}

// Handle responsive sticky behavior
function handleResponsiveSticky() {
    const windowWidth = $(window).width();
    
    // Mobile floating button
    if (windowWidth <= 576) {
        if (!$('.floating-notes-toggle').length) {
            createFloatingNotesButton();
        }
    } else {
        $('.floating-notes-toggle').remove();
    }
    
    // Reset sticky states on resize
    if (windowWidth > 768) {
        isNotesMinimized = false;
        $('.sticky-notes-minimized').remove();
        $('#noteSetsContainer').show();
    }
}

// Create floating notes button for mobile
function createFloatingNotesButton() {
    const noteCount = $('#dynamicNoteSets .note-set').length;
    const hasNotes = noteCount > 0;
    
    const floatingBtn = $('<button>')
        .addClass('floating-notes-toggle')
        .addClass(hasNotes ? 'has-notes' : '')
        .html(`
            <i class="bi bi-journal-text"></i>
            ${hasNotes ? `<span class="floating-notes-badge">${noteCount}</span>` : ''}
        `)
        .on('click', function() {
            showMobileNotesModal();
        });
    
    $('body').append(floatingBtn);
}

// Show notes in a modal for mobile
function showMobileNotesModal() {
    // Check if modal exists, if not create it
    if (!$('#mobileNotesModal').length) {
        const modal = $(`
            <div class="modal fade" id="mobileNotesModal" tabindex="-1">
                <div class="modal-dialog modal-fullscreen-sm-down">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Page Notes</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <!-- Notes content will be cloned here -->
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `);
        
        $('body').append(modal);
    }
    
    // Clone notes content into modal
    const notesClone = $('#noteSetsContainer').clone();
    $('#mobileNotesModal .modal-body').html(notesClone);
    
    // Show modal
    const modalInstance = new bootstrap.Modal('#mobileNotesModal');
    modalInstance.show();
}

// Utility function: Debounce
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Update floating button when notes change
function updateFloatingNotesButton() {
    const noteCount = $('#dynamicNoteSets .note-set').length;
    const hasNotes = noteCount > 0;
    const floatingBtn = $('.floating-notes-toggle');
    
    if (floatingBtn.length) {
        floatingBtn.toggleClass('has-notes', hasNotes);
        
        if (hasNotes) {
            if (!floatingBtn.find('.floating-notes-badge').length) {
                floatingBtn.append(`<span class="floating-notes-badge">${noteCount}</span>`);
            } else {
                floatingBtn.find('.floating-notes-badge').text(noteCount);
            }
        } else {
            floatingBtn.find('.floating-notes-badge').remove();
        }
    }
}

// Add keyboard shortcuts for navigation
function addKeyboardShortcuts() {
    $(document).on('keydown', function(e) {
        // Only work if not typing in an input field
        if ($(e.target).is('input, textarea, select')) return;
        
        // Alt + Arrow keys for page navigation
        if (e.altKey) {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                $('#prevPageBtn').click();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                $('#nextPageBtn').click();
            }
        }
        
        // Shift + Arrow keys for matching page navigation
        if (e.shiftKey) {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                $('#prevMatchingPageBtn').click();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                $('#nextMatchingPageBtn').click();
            }
        }
    });
}

// Export functions to be called from main.js
window.stickyFeatures = {
    initialize: initializeStickyFeatures,
    updateFloatingButton: updateFloatingNotesButton,
    addKeyboardShortcuts: addKeyboardShortcuts,
    updatePageCounter: updatePageCounter
};