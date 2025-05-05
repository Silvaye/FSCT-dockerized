import subprocess
import threading
import signal
import sys
import os
import time
import GPUtil
import uuid
import shutil
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_socketio import SocketIO

app = Flask(__name__)
socketio = SocketIO(app, async_mode='threading')  # Use threading to avoid greenlet issues with subprocess

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'.las', '.txt'}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def cleanup_and_exit():
    """Removes the entire 'uploads' folder, then exits."""
    print("Cleaning up uploads directory...")
    shutil.rmtree(UPLOAD_FOLDER, ignore_errors=True)
    print("Exiting.")
    sys.exit(0)

def handle_sigint(sig, frame):
    """
    Signal handler for Ctrl + C (SIGINT).
    Remove the uploads folder and exit.
    """
    cleanup_and_exit()

# Register the signal handler
signal.signal(signal.SIGINT, handle_sigint)

@app.route('/')
def index():
    return render_template('index.html')

# JS Modules
@app.route('/modules/<path:filename>', methods=['GET'])
def modules(filename):
    safe_base = os.path.abspath('./templates/modules')
    requested_path = os.path.abspath(os.path.join('./templates/modules/', filename))
    
    if not requested_path.startswith(safe_base):
        return jsonify({"error": "Unauthorized access"}), 403

    directory = os.path.dirname(requested_path)
    file = os.path.basename(requested_path)
    return send_from_directory(directory, file)

def gpu_stats():
    """
    Returns a list of dictionaries, one per GPU, containing usage stats:
      [
        {
          "id": 0,
          "name": "GeForce RTX 2080 Ti",
          "load": 12.3,
          "memUtil": 45.6,
          "temperature": 67
        },
        ...
      ]
    If no GPUs found, returns an empty list.
    """
    gpus = GPUtil.getGPUs()
    stats = []
    for gpu in gpus:
        stats.append({
            "id": gpu.id,
            "name": gpu.name,
            "load": round(gpu.load * 100, 1),        # GPU load % 
            "memUtil": round(gpu.memoryUtil * 100, 1),  # Memory usage %
            "temperature": gpu.temperature
        })
    return stats

def gpu_stats_emitter(sid):
    while True:
        stats = gpu_stats()  # Replace with your function
        socketio.emit('gpu_stats', stats, to=sid)
        time.sleep(0.5)

@socketio.on('start_gpu_stats')
def handle_start_gpu_stats():
    sid = request.sid
    thread = threading.Thread(target=gpu_stats_emitter, args=(sid,))
    thread.start()

@app.route('/upload', methods=['POST'])
def upload_file():
    """
    Handle file upload. Expects a form field "lasfile".
    Saves it in a unique subfolder (UUID) under UPLOAD_FOLDER.
    Returns JSON with { "success": True, "uuid": <unique_id>, "filename": <filename> }.
    """
    if 'lasfile' not in request.files:
        return jsonify({'success': False, 'error': 'No file part'}), 400
    
    file = request.files['lasfile']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No file selected'}), 400
    
    # Check extension if needed
    _, ext = os.path.splitext(file.filename)
    if ext.lower() not in ALLOWED_EXTENSIONS:
        return jsonify({'success': False, 'error': f'Only .las files allowed. Got {ext}'}), 400

    unique_id = str(uuid.uuid4())
    subfolder_path = os.path.join(UPLOAD_FOLDER, unique_id)
    os.makedirs(subfolder_path, exist_ok=True)

    saved_path = os.path.join(subfolder_path, file.filename)
    file.save(saved_path)

    return jsonify({
        'success': True,
        'uuid': unique_id,
        'filename': file.filename
    })

# Socket implementation of uploads list
@socketio.on('request_uploads_list')
def handle_uploads_list():
    data = list_uploads()  # Your existing logic to generate listing
    socketio.emit('uploads_list', data)

@app.route('/list_uploads', methods=['GET'])
def list_uploads():
    """
    Returns a JSON listing of all subdirectories and files under 'uploads/'.
    """
    uploads_info = []

    # If 'uploads' folder might be missing, ensure it exists or handle gracefully
    if not os.path.exists(UPLOAD_FOLDER):
        return jsonify({"uploads": []})

    for root, dirs, files in os.walk(UPLOAD_FOLDER):
        # 'root' is the full path. We want a relative path (e.g. 'uploads/...' )
        relative_path = os.path.relpath(root, start=UPLOAD_FOLDER)
        # If 'root' == UPLOAD_FOLDER, relative_path would be '.' for the top folder;
        # we can make it 'uploads' or just '.' to keep it consistent.
        if relative_path == '.':
            relative_path = 'uploads'
        else:
            relative_path = os.path.join('uploads', relative_path)

        uploads_info.append({
            "path": relative_path,
            "subdirs": sorted(dirs),
            "files": sorted(files)
        })

    return {"uploads": uploads_info}

@app.route('/uploads/<path:filename>', methods=['GET'])
def serve_uploaded_file(filename):
    safe_base = os.path.abspath(UPLOAD_FOLDER)
    requested_path = os.path.abspath(os.path.join(UPLOAD_FOLDER, filename))
    
    if not requested_path.startswith(safe_base):
        return jsonify({"error": "Unauthorized access"}), 403

    directory = os.path.dirname(requested_path)
    file = os.path.basename(requested_path)
    return send_from_directory(directory, file)


@app.route('/delete/<unique_id>', methods=['POST', 'DELETE'])
def delete_file(unique_id):
    """
    Remove the entire directory for the given unique_id (if it exists).
    """
    subfolder_path = os.path.join(UPLOAD_FOLDER, unique_id)
    if os.path.exists(subfolder_path):
        shutil.rmtree(subfolder_path)
        return jsonify({'success': True})
    else:
        return jsonify({'success': False, 'error': 'File not found'}), 404

def stream_output(pipe, event_name):
    """
    Reads lines from a subprocess pipe (stdout or stderr)
    and emits them via Socket.IO to the client.
    """
    for line in iter(pipe.readline, ''):
        line = line.strip()
        if line:
            print(f"{event_name}:", line)  # Debug print to server console
            socketio.emit(event_name, {'data': line})
            # Let Socket.IO handle concurrency
            socketio.sleep(0)
    pipe.close()

@socketio.on('start_process')
def handle_start_process(data):
    """
    Called when the client emits 'start_process' with { "uuid":..., "filename":... }.
    """
    print("Starting process...")

    # Extract the UUID and filename from the data
    unique_id = data.get('uuid')
    filename = data.get('filename')

    if not unique_id or not filename:
        socketio.emit('stderr', {'data': 'Error: Missing uuid or filename.'})
        return

    # Build the full path to the uploaded file
    subfolder_path = os.path.join(UPLOAD_FOLDER, unique_id)
    file_path = os.path.join(subfolder_path, filename)
    full_file_path = os.path.abspath(file_path)

    if not os.path.exists(file_path):
        socketio.emit('stderr', {'data': f'Error: File not found ({file_path}).'})
        return

    # Run FSCT
    process = subprocess.Popen(
        ["python", "-u", "scripts/run.py", full_file_path],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd='/forest_tool/FSCT'
    )

    # Stream stdout and stderr in separate threads
    stdout_thread = threading.Thread(target=stream_output, args=(process.stdout, 'stdout'))
    stderr_thread = threading.Thread(target=stream_output, args=(process.stderr, 'stderr'))
    stdout_thread.start()
    stderr_thread.start()

if __name__ == '__main__':
    print("I, the user of this service, understand that this service is insecure, etc. (Y/N)?", end=' ')
    if input().lower() != 'y':
        exit()
    socketio.run(app, host='0.0.0.0', port=5000)
