import threading
import time
from flask_socketio import SocketIO
from flask import current_app

# Global dict to store progress for each session
processing_status = {}
socketio = None

def init_socketio(app):
    """Initialize SocketIO with the Flask app."""
    global socketio
    # Configure SocketIO with correct CORS settings and async mode
    socketio = SocketIO(app, 
                       cors_allowed_origins="*",    # Allow connections from any origin
                       async_mode='threading',      # Use threading mode for better compatibility
                       logger=True,                # Enable logging to help debug connection issues
                       engineio_logger=True)       # Log the engineio events too
    return socketio

def start_progress_tracking(session_id, total_pages):
    """
    Initialize progress tracking for a session.
    
    Args:
        session_id: Unique identifier for the processing session
        total_pages: Total number of pages to process
    """
    processing_status[session_id] = {
        'current_page': 0,
        'total_pages': total_pages,
        'percentage': 0,
        'status': 'initializing',
        'message': 'Processing PDF...',
        'errors': []
    }
    # Start background thread to clean up old sessions
    cleanup_thread = threading.Thread(target=cleanup_old_sessions, daemon=True)
    cleanup_thread.start()

def update_progress(session_id, current_page, status='processing', message=None, error=None):
    """
    Update progress for a session.
    
    Args:
        session_id: Unique identifier for the processing session
        current_page: Current page being processed
        status: Status string ('initializing', 'processing', 'completed', 'error')
        message: Optional status message
        error: Optional error message
    """
    if session_id in processing_status:
        status_data = processing_status[session_id]
        status_data['current_page'] = current_page
        status_data['status'] = status
        
        # Calculate percentage
        if status_data['total_pages'] > 0:
            status_data['percentage'] = int((current_page / status_data['total_pages']) * 100)
        
        # Update message if provided
        if message:
            status_data['message'] = message
        
        # Add error if provided
        if error:
            status_data['errors'].append(error)
            status_data['status'] = 'error'
        
        # Log the update (for debugging)
        print(f"Progress update for {session_id}: {current_page}/{status_data['total_pages']} ({status_data['percentage']}%) - {status}")
        
        # Emit update via SocketIO if available
        if socketio:
            try:
                # Check if we're in application context, if not, emit won't use Flask features
                # that require application context (which is fine for basic progress updates)
                socketio.emit('progress_update', {
                    'session_id': session_id,
                    'data': status_data
                })
                print(f"SocketIO event emitted: progress_update for {session_id}")
            except Exception as e:
                print(f"Error emitting SocketIO event: {str(e)}")

def get_progress(session_id):
    """
    Get current progress for a session.
    
    Args:
        session_id: Unique identifier for the processing session
        
    Returns:
        Dict containing progress information or None if session not found
    """
    return processing_status.get(session_id)

def complete_progress(session_id, success=True):
    """
    Mark a session as completed.
    
    Args:
        session_id: Unique identifier for the processing session
        success: Whether processing completed successfully
    """
    if session_id in processing_status:
        status_data = processing_status[session_id]
        status_data['status'] = 'completed' if success else 'error'
        status_data['percentage'] = 100 if success else status_data['percentage']
        
        # Log completion
        print(f"Processing completed for {session_id}: {'success' if success else 'failure'}")
        
        # Emit final update
        if socketio:
            try:
                # Same approach for completion event
                socketio.emit('progress_update', {
                    'session_id': session_id,
                    'data': status_data
                })
                print(f"Final SocketIO event emitted for {session_id}")
            except Exception as e:
                print(f"Error emitting final SocketIO event: {str(e)}")

def cleanup_old_sessions():
    """Clean up old sessions after 1 hour to prevent memory leaks."""
    time.sleep(3600)  # Wait for 1 hour
    # Remove sessions older than 1 hour (implement proper timestamp tracking for production)
    # This is a simplified version
    global processing_status
    processing_status = {k: v for k, v in processing_status.items() if v['status'] != 'completed'}