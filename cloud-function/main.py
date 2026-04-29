import functions_framework
import base64
import subprocess
import tempfile
import os
import json
from flask import jsonify
from PyPDF2 import PdfReader, PdfWriter, PdfMerger
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from io import BytesIO
from datetime import datetime

@functions_framework.http
def process_pdf_complete(request):
    """
    Cloud Function que procesa COMPLETAMENTE los PDFs:
    1. Descomprime PDFs base64
    2. Comprime PDFs dinámicos con Ghostscript
    3. Inyecta datos dinámicos
    4. Unifica todos los PDFs
    5. Agrega páginas en blanco
    6. Aplana formularios
    7. Agrega pie de página
    8. Retorna PDF final comprimido
    """
    
    # CORS
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)
    
    headers = {'Access-Control-Allow-Origin': '*'}
    
    try:
        request_json = request.get_json(silent=True)
        
        if not request_json:
            return (jsonify({'error': 'Missing request body'}), 400, headers)
        
        pdfs_data = request_json.get('pdfs', [])
        form_data = request_json.get('formData', {})
        coords = request_json.get('coords', {})
        user_name = request_json.get('userName', 'Usuario')
        order_no = request_json.get('orderNo', '')
        
        # Crear merger para unificar PDFs
        merger = PdfMerger()
        total_pages = 0
        
        # Procesar cada PDF
        for idx, pdf_item in enumerate(pdfs_data):
            key = pdf_item.get('key', '')
            base64_pdf = pdf_item.get('base64', '')
            copies = pdf_item.get('copies', 1)
            
            print(f"Procesando {key} ({copies} copias)...")
            
            # Decodificar PDF
            pdf_bytes = base64.b64decode(base64_pdf)
            
            # Comprimir si es dinámico
            if key in ['TPL_ORDEN', 'DOC_ANALISIS']:
                print(f"  Comprimiendo {key}...")
                pdf_bytes = compress_pdf_ghostscript(pdf_bytes)
            
            # Procesar copias
            for copy_num in range(copies):
                # Inyectar datos si es necesario
                if key == 'TPL_ORDEN':
                    processed_pdf = inject_text_overlay(pdf_bytes, form_data, coords)
                elif key != 'DOC_ANALISIS':
                    processed_pdf = flatten_form_fields(pdf_bytes, form_data)
                else:
                    processed_pdf = pdf_bytes
                
                # Agregar al merger
                pdf_reader = PdfReader(BytesIO(processed_pdf))
                num_pages = len(pdf_reader.pages)
                
                merger.append(BytesIO(processed_pdf))
                total_pages += num_pages
                
                # Agregar página en blanco si es impar
                if num_pages % 2 != 0:
                    blank_pdf = create_blank_page()
                    merger.append(BytesIO(blank_pdf))
                    total_pages += 1
                    print(f"  Página en blanco agregada después de {key}")
        
        # Escribir PDF unificado
        unified_output = BytesIO()
        merger.write(unified_output)
        merger.close()
        unified_output.seek(0)
        
        # Agregar pie de página
        print("Agregando pie de página...")
        final_pdf = add_footer_to_pdf(
            unified_output.read(),
            user_name,
            order_no,
            total_pages
        )
        
        # Comprimir PDF final
        print("Compresión final...")
        final_compressed = compress_pdf_ghostscript(final_pdf, quality='ebook')
        
        # Calcular tamaños
        original_size = sum(len(base64.b64decode(p['base64'])) for p in pdfs_data)
        final_size = len(final_compressed)
        reduction = ((original_size - final_size) / original_size) * 100
        
        print(f"✓ Procesamiento completo: {original_size/1024:.0f}KB → {final_size/1024:.0f}KB ({reduction:.1f}% reducción)")
        
        # Retornar PDF final
        response_data = {
            'pdf_base64': base64.b64encode(final_compressed).decode('utf-8'),
            'total_pages': total_pages,
            'original_size_kb': round(original_size / 1024, 2),
            'final_size_kb': round(final_size / 1024, 2),
            'reduction_percent': round(reduction, 2)
        }
        
        return (jsonify(response_data), 200, headers)
        
    except Exception as e:
        print(f"ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return (jsonify({'error': str(e)}), 500, headers)


def compress_pdf_ghostscript(pdf_bytes, quality='ebook'):
    """Comprime PDF usando Ghostscript"""
    with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as input_file:
        input_file.write(pdf_bytes)
        input_path = input_file.name
    
    output_path = tempfile.mktemp(suffix='.pdf')
    
    gs_command = [
        'gs', '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.4',
        f'-dPDFSETTINGS=/{quality}', '-dNOPAUSE', '-dQUIET', '-dBATCH',
        '-dDetectDuplicateImages=true', '-dCompressFonts=true',
        '-dSubsetFonts=true', '-dColorImageDownsampleType=/Bicubic',
        '-dColorImageResolution=150', '-dGrayImageDownsampleType=/Bicubic',
        '-dGrayImageResolution=150', '-dMonoImageDownsampleType=/Bicubic',
        '-dMonoImageResolution=150', f'-sOutputFile={output_path}', input_path
    ]
    
    subprocess.run(gs_command, capture_output=True, check=True)
    
    with open(output_path, 'rb') as f:
        compressed = f.read()
    
    os.unlink(input_path)
    os.unlink(output_path)
    
    return compressed


def inject_text_overlay(pdf_bytes, form_data, coords):
    """Inyecta texto sobre PDF usando overlay"""
    reader = PdfReader(BytesIO(pdf_bytes))
    writer = PdfWriter()
    
    # Crear overlay para primera página
    overlay_buffer = BytesIO()
    c = canvas.Canvas(overlay_buffer, pagesize=letter)
    
    for field_name, coord in coords.items():
        text = form_data.get(field_name, '')
        if text:
            c.drawString(coord['x'], coord['y'], str(text))
    
    c.save()
    overlay_buffer.seek(0)
    overlay_pdf = PdfReader(overlay_buffer)
    
    # Aplicar overlay a primera página
    first_page = reader.pages[0]
    first_page.merge_page(overlay_pdf.pages[0])
    writer.add_page(first_page)
    
    # Agregar resto de páginas
    for i in range(1, len(reader.pages)):
        writer.add_page(reader.pages[i])
    
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def flatten_form_fields(pdf_bytes, form_data):
    """Rellena y aplana campos de formulario"""
    # PyPDF2 no soporta rellenar formularios directamente
    # Usamos pdfrw para esto
    try:
        from pdfrw import PdfReader as PdfrwReader, PdfWriter as PdfrwWriter
        
        reader = PdfrwReader(BytesIO(pdf_bytes))
        
        # Rellenar campos si existen
        if reader.Root.AcroForm:
            for field in reader.Root.AcroForm.Fields:
                field_name = field.T
                if field_name and field_name[1:-1] in form_data:
                    field.V = f'({form_data[field_name[1:-1]]})'
        
        output = BytesIO()
        PdfrwWriter(output, trailer=reader).write()
        return output.getvalue()
    except:
        # Si falla, retornar original
        return pdf_bytes


def create_blank_page():
    """Crea página en blanco con texto centrado"""
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    
    text = "Esta página fue dejada en blanco de manera intencional"
    c.setFillColorRGB(0.4, 0.4, 0.4)
    c.setFont("Helvetica", 11)
    
    # Centrar texto
    text_width = c.stringWidth(text, "Helvetica", 11)
    x = (letter[0] - text_width) / 2
    y = letter[1] / 2
    
    c.drawString(x, y, text)
    c.save()
    
    return buffer.getvalue()


def add_footer_to_pdf(pdf_bytes, user_name, order_no, total_pages):
    """Agrega pie de página a todas las páginas"""
    reader = PdfReader(BytesIO(pdf_bytes))
    writer = PdfWriter()
    
    now = datetime.now()
    formatted_date = now.strftime("%d/%m/%Y %H:%M")
    
    for page_num, page in enumerate(reader.pages, 1):
        # Crear overlay con pie de página
        overlay_buffer = BytesIO()
        c = canvas.Canvas(overlay_buffer, pagesize=(page.mediabox.width, page.mediabox.height))
        
        footer_left = f"Impreso por: {user_name} el {formatted_date}   |   No. Orden: {order_no}"
        footer_right = f"Pág. {page_num} de {total_pages}"
        
        c.setFont("Helvetica", 8)
        c.setFillColorRGB(0, 0, 0)
        c.drawString(35, 20, footer_left)
        c.drawRightString(float(page.mediabox.width) - 35, 20, footer_right)
        
        c.save()
        overlay_buffer.seek(0)
        
        # Aplicar overlay
        overlay_pdf = PdfReader(overlay_buffer)
        page.merge_page(overlay_pdf.pages[0])
        writer.add_page(page)
    
    output = BytesIO()
    writer.write(output)
    return output.getvalue()
