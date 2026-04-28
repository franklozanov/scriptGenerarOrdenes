import functions_framework
import base64
import subprocess
import tempfile
import os
from flask import jsonify

@functions_framework.http
def compress_pdf(request):
    """
    Cloud Function para comprimir PDFs usando Ghostscript
    Reduce tamaño de 2MB a ~0.3-0.5MB sin perder layout
    """
    
    # Configurar CORS para Apps Script
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)
    
    headers = {
        'Access-Control-Allow-Origin': '*'
    }
    
    try:
        request_json = request.get_json(silent=True)
        
        if not request_json or 'pdf_base64' not in request_json:
            return (jsonify({'error': 'Missing pdf_base64 parameter'}), 400, headers)
        
        # Decodificar PDF de base64
        pdf_data = base64.b64decode(request_json['pdf_base64'])
        
        # Nivel de compresión (default, screen, ebook, printer, prepress)
        quality = request_json.get('quality', 'ebook')  # ebook = buena calidad, buen tamaño
        
        # Crear archivos temporales
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as input_file:
            input_file.write(pdf_data)
            input_path = input_file.name
        
        output_path = tempfile.mktemp(suffix='.pdf')
        
        # Comando Ghostscript optimizado para compresión agresiva
        gs_command = [
            'gs',
            '-sDEVICE=pdfwrite',
            '-dCompatibilityLevel=1.4',
            f'-dPDFSETTINGS=/{quality}',
            '-dNOPAUSE',
            '-dQUIET',
            '-dBATCH',
            '-dDetectDuplicateImages=true',
            '-dCompressFonts=true',
            '-dSubsetFonts=true',
            '-dColorImageDownsampleType=/Bicubic',
            '-dColorImageResolution=150',
            '-dGrayImageDownsampleType=/Bicubic',
            '-dGrayImageResolution=150',
            '-dMonoImageDownsampleType=/Bicubic',
            '-dMonoImageResolution=150',
            f'-sOutputFile={output_path}',
            input_path
        ]
        
        # Ejecutar Ghostscript
        result = subprocess.run(gs_command, capture_output=True, text=True)
        
        if result.returncode != 0:
            raise Exception(f"Ghostscript error: {result.stderr}")
        
        # Leer PDF comprimido
        with open(output_path, 'rb') as output_file:
            compressed_pdf = output_file.read()
        
        # Limpiar archivos temporales
        os.unlink(input_path)
        os.unlink(output_path)
        
        # Calcular reducción de tamaño
        original_size = len(pdf_data)
        compressed_size = len(compressed_pdf)
        reduction_percent = ((original_size - compressed_size) / original_size) * 100
        
        # Retornar PDF comprimido en base64
        response_data = {
            'compressed_pdf': base64.b64encode(compressed_pdf).decode('utf-8'),
            'original_size_kb': round(original_size / 1024, 2),
            'compressed_size_kb': round(compressed_size / 1024, 2),
            'reduction_percent': round(reduction_percent, 2)
        }
        
        return (jsonify(response_data), 200, headers)
        
    except Exception as e:
        return (jsonify({'error': str(e)}), 500, headers)
