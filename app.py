import os
import uuid
import tempfile
import subprocess
import sys
import shutil
import json

from flask import Flask, render_template, request, send_file, jsonify
from werkzeug.utils import secure_filename
from PyPDF2 import PdfReader, PdfWriter
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
    - Windows  : docx2pdf (MS Word)
    - Linux/Mac: LibreOffice headless
    """
    try:
        if sys.platform == 'win32':
            docx2pdf_convert(docx_path, pdf_path)
        else:
            # ✅ Check LibreOffice availability (prevents silent failure)
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


# ================= ROUTES =================
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/merge', methods=['POST'])
def merge_files():
    """
    Merge PDF and DOCX files in the exact order received from UI
    (metadata-ready for future page-level control)
    """
    try:
        # ================= READ FILES =================
        files = request.files.getlist('files')
        metadata_raw = request.form.get('metadata')
        metadata = json.loads(metadata_raw) if metadata_raw else []

        if not files:
            return jsonify({'error': 'No files uploaded'}), 400

        session_id = str(uuid.uuid4())
        temp_dir = os.path.join(app.config['UPLOAD_FOLDER'], session_id)
        os.makedirs(temp_dir, exist_ok=True)

        writer = PdfWriter()
        saved_pdfs = []

        # ================= SAVE & CONVERT FILES =================
        for index, file in enumerate(files):
            if file and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                ext = filename.rsplit('.', 1)[1].lower()

                saved_path = os.path.join(temp_dir, f"{index}_{filename}")
                file.save(saved_path)

                if ext == 'pdf':
                    saved_pdfs.append(saved_path)

                elif ext == 'docx':
                    pdf_path = os.path.join(temp_dir, f"{index}_converted.pdf")
                    if not convert_docx_to_pdf(saved_path, pdf_path):
                        shutil.rmtree(temp_dir, ignore_errors=True)
                        return jsonify({'error': 'DOCX conversion failed'}), 500
                    saved_pdfs.append(pdf_path)

        if not saved_pdfs:
            shutil.rmtree(temp_dir, ignore_errors=True)
            return jsonify({'error': 'No valid PDF or DOCX files found'}), 400

        # ================= MERGE (SAFE DEFAULT: ALL PAGES) =================
        # Metadata is read but not enforced yet (no breaking change)
        for pdf_path in saved_pdfs:
            reader = PdfReader(pdf_path)
            for page in reader.pages:
                writer.add_page(page)

        output_path = os.path.join(temp_dir, f"merged_{session_id}.pdf")
        with open(output_path, "wb") as f:
            writer.write(f)

        response = send_file(
            output_path,
            as_attachment=True,
            download_name='VaultMerge_Result.pdf',
            mimetype='application/pdf'
        )

        @response.call_on_close
        def cleanup():
            shutil.rmtree(temp_dir, ignore_errors=True)

        return response

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy'}), 200


# ================= MAIN =================
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)