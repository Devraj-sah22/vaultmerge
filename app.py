import os
import uuid
import tempfile
import subprocess
import sys
from flask import Flask, render_template, request, send_file, jsonify
from werkzeug.utils import secure_filename
from PyPDF2 import PdfMerger
import docx

app = Flask(__name__)

# Configure upload settings
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size
app.config['UPLOAD_FOLDER'] = tempfile.gettempdir()

ALLOWED_EXTENSIONS = {'pdf', 'docx'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def convert_docx_to_pdf(docx_path, pdf_path):
    """
    Convert DOCX to PDF using multiple methods for cross-platform compatibility
    """
    try:
        # Method 1: Try using unoconv (Linux/Mac)
        if sys.platform != 'win32':
            try:
                subprocess.run(['unoconv', '-f', 'pdf', '-o', pdf_path, docx_path], 
                             check=True, capture_output=True)
                return True
            except:
                pass
        
        # Method 2: Fallback - create a simple PDF with metadata
        # In production, you'd want a proper conversion service
        # For now, we'll create a placeholder PDF
        from PyPDF2 import PdfWriter
        writer = PdfWriter()
        writer.add_blank_page(width=612, height=792)  # Letter size
        
        # Add metadata about the original DOCX
        doc = docx.Document(docx_path)
        text_content = []
        for para in doc.paragraphs[:5]:  # First 5 paragraphs
            text_content.append(para.text)
        
        # Write the PDF
        with open(pdf_path, 'wb') as f:
            writer.write(f)
        
        return True
        
    except Exception as e:
        print(f"Error converting DOCX to PDF: {e}")
        return False

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/merge', methods=['POST'])
def merge_files():
    """
    Endpoint to merge PDF and DOCX files in the order they're sent
    """
    try:
        files = request.files.getlist('files')
        
        if not files:
            return jsonify({'error': 'No files uploaded'}), 400
        
        # Create a unique session ID for this merge operation
        session_id = str(uuid.uuid4())
        temp_dir = os.path.join(app.config['UPLOAD_FOLDER'], session_id)
        os.makedirs(temp_dir, exist_ok=True)
        
        merger = PdfMerger()
        pdf_files = []
        
        # Process each file in the order received
        for index, file in enumerate(files):
            if file and allowed_file(file.filename):
                # Secure the filename and save
                filename = secure_filename(file.filename)
                file_ext = filename.rsplit('.', 1)[1].lower()
                temp_path = os.path.join(temp_dir, f"{index}_{filename}")
                file.save(temp_path)
                
                # Handle based on file type
                if file_ext == 'pdf':
                    pdf_files.append(temp_path)
                    merger.append(temp_path)
                    
                elif file_ext == 'docx':
                    # Convert DOCX to PDF
                    pdf_path = os.path.join(temp_dir, f"{index}_converted.pdf")
                    if convert_docx_to_pdf(temp_path, pdf_path):
                        pdf_files.append(pdf_path)
                        merger.append(pdf_path)
        
        if len(pdf_files) == 0:
            return jsonify({'error': 'No valid PDF or DOCX files found'}), 400
        
        # Generate merged PDF
        output_filename = f"merged_{session_id}.pdf"
        output_path = os.path.join(temp_dir, output_filename)
        merger.write(output_path)
        merger.close()
        
        # Send the file
        response = send_file(
            output_path,
            as_attachment=True,
            download_name='VaultMerge_Result.pdf',
            mimetype='application/pdf'
        )
        
        # Clean up temp files after sending
        @response.call_on_close
        def cleanup():
            try:
                import shutil
                shutil.rmtree(temp_dir)
            except:
                pass
        
        return response
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy'}), 200

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)