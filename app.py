import os
import uuid
import tempfile
import subprocess
import sys
import shutil
import json
import time   # ✅ ADD THIS LINE

from flask import Flask, render_template, request, send_file, jsonify
from werkzeug.utils import secure_filename
from PyPDF2 import PdfReader, PdfWriter
from pdf2image import convert_from_path
from docx2pdf import convert as docx2pdf_convert

app = Flask(__name__)

# ================= CONFIG =================
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB
app.config['UPLOAD_FOLDER'] = tempfile.gettempdir()

ALLOWED_EXTENSIONS = {'pdf', 'docx'}

# ================= HELPERS =================
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def convert_docx_to_pdf(docx_path, pdf_path):
    """
    Reliable DOCX → PDF conversion (cross-platform)
    """
    try:
        if sys.platform == 'win32':
            docx2pdf_convert(docx_path, pdf_path)
        else:
            subprocess.run(["libreoffice", "--version"], check=True)
            subprocess.run(
                [
                    "libreoffice",
                    "--headless",
                    "--convert-to", "pdf",
                    docx_path,
                    "--outdir", os.path.dirname(pdf_path)
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
        return os.path.exists(pdf_path)
    except Exception as e:
        print(f"[DOCX → PDF ERROR]: {e}")
        return False
# ✅ ADD THIS FUNCTION RIGHT HERE
def cleanup_old_sessions(max_age_minutes=30):
    now = time.time()
    for folder in os.listdir(app.config['UPLOAD_FOLDER']):
        path = os.path.join(app.config['UPLOAD_FOLDER'], folder)
        # ✅ Only clean UUID-based session folders
        if os.path.isdir(path) and len(folder) == 36:
            if now - os.path.getmtime(path) > max_age_minutes * 60:
                shutil.rmtree(path, ignore_errors=True)


# ================= ROUTES =================
@app.route('/')
def index():
    return render_template('index.html')


# ================= PAGE PREVIEW =================
@app.route('/preview', methods=['POST'])
def preview_file():
    
    """
    Upload a file and return page preview images
    """
    cleanup_old_sessions()   # ✅ ADD HERE
    try:
        file = request.files.get('file')
        if not file or not allowed_file(file.filename):
            return jsonify({'error': 'Invalid file'}), 400

        session_id = str(uuid.uuid4())
        temp_dir = os.path.join(app.config['UPLOAD_FOLDER'], session_id)
        os.makedirs(temp_dir, exist_ok=True)

        filename = secure_filename(file.filename)
        ext = filename.rsplit('.', 1)[1].lower()
        saved_path = os.path.join(temp_dir, filename)
        file.save(saved_path)

        # DOCX → PDF
        if ext == 'docx':
            pdf_path = os.path.join(temp_dir, 'converted.pdf')
            if not convert_docx_to_pdf(saved_path, pdf_path):
                shutil.rmtree(temp_dir, ignore_errors=True)
                return jsonify({'error': 'DOCX conversion failed'}), 500
            os.remove(saved_path)  # ✅ ADD THIS
        else:
            pdf_path = saved_path

        # Convert PDF → images
        #images = convert_from_path(pdf_path, dpi=120)
        # Convert PDF → images
    try:
        poppler_path = None

        # Windows needs explicit Poppler path
        if sys.platform.startswith("win"):
            poppler_path = r"C:\poppler\Library\bin"

        images = convert_from_path(
            pdf_path,
            dpi=100,
            poppler_path=poppler_path
    )

    except Exception as e:
        print("PDF PREVIEW ERROR:", e)
        return jsonify({
            "error": "PDF preview failed",
            "details": str(e)
        }), 500

        pages = []
        for i, img in enumerate(images):
            img_name = f'page_{i}.png'
            img_path = os.path.join(temp_dir, img_name)
            img.save(img_path, 'PNG')

            pages.append({
                "sessionId": session_id,
                "pageIndex": i,
                "imageUrl": f"/page_image/{session_id}/{img_name}"
            })

        return jsonify({
            "sessionId": session_id,
            "pages": pages
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/page_image/<session_id>/<filename>')
def serve_page_image(session_id, filename):
    temp_dir = os.path.join(app.config['UPLOAD_FOLDER'], session_id)
    path = os.path.join(temp_dir, filename)

    if not os.path.exists(path):
        return jsonify({'error': 'Image not found'}), 404

    return send_file(path, mimetype='image/png')


# ================= MERGE =================
@app.route('/merge', methods=['POST'])
def merge_files():
    """
    Merge pages based on user-defined order
    metadata format:
    [
      { "sessionId": "...", "pageIndex": 0 },
      { "sessionId": "...", "pageIndex": 2 }
    ]
    """
    try:
        metadata_raw = request.form.get('metadata')
        metadata = json.loads(metadata_raw) if metadata_raw else []

        if not metadata:
            return jsonify({'error': 'No page metadata provided'}), 400

        writer = PdfWriter()
        used_sessions = set()

        for item in metadata:
            session_id = item.get('sessionId')
            page_index = item.get('pageIndex')

            if session_id is None or page_index is None:
                continue

            temp_dir = os.path.join(app.config['UPLOAD_FOLDER'], session_id)
            if not os.path.exists(temp_dir):
                continue

            pdf_files = [f for f in os.listdir(temp_dir) if f.endswith('.pdf')]
            if not pdf_files:
                continue

            pdf_path = os.path.join(temp_dir, pdf_files[0])
            reader = PdfReader(pdf_path)

            if page_index < len(reader.pages):
                writer.add_page(reader.pages[page_index])
                used_sessions.add(session_id)

        if len(writer.pages) == 0:
            return jsonify({'error': 'No pages merged'}), 400

        output_dir = tempfile.mkdtemp()
        output_path = os.path.join(output_dir, 'VaultMerge_Result.pdf')

        with open(output_path, 'wb') as f:
            writer.write(f)

        response = send_file(
            output_path,
            as_attachment=True,
            download_name='VaultMerge_Result.pdf',
            mimetype='application/pdf'
        )

        @response.call_on_close
        def cleanup():
            shutil.rmtree(output_dir, ignore_errors=True)
            for sid in used_sessions:
                shutil.rmtree(os.path.join(app.config['UPLOAD_FOLDER'], sid), ignore_errors=True)

        return response

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ================= HEALTH =================
@app.route('/health')
def health():
    cleanup_old_sessions()   # ✅ ADD HERE
    return jsonify({'status': 'healthy'}), 200


# ================= MAIN =================
if __name__ == '__main__':
    app.run()