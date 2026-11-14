#!/usr/bin/env python3
"""
College of Keys — Issue #78: Optical Music Recognition (OMR) CLI
Converts a printed sheet music PDF or image scan into MusicXML using homr + pypdfium2,
emitting structured [OMR_STATUS] JSON lines for the Electron Review Modal.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

SUPPORTED_IMAGE_EXTS = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff'}
SUPPORTED_PDF_EXTS = {'.pdf'}


def emit_status(stage, percent, message, *, page=None, total_pages=None, warnings=None, output_path=None):
    payload = {
        'stage': stage,
        'percent': max(0, min(100, int(round(percent)))),
        'message': str(message),
    }
    if page is not None:
        payload['page'] = int(page)
    if total_pages is not None:
        payload['totalPages'] = int(total_pages)
    if warnings:
        payload['warnings'] = list(warnings)
    if output_path:
        payload['outputPath'] = str(output_path)
    print(f"[OMR_STATUS] {json.dumps(payload)}", flush=True)


def stitch_musicxml_pages(xml_paths, warnings):
    """Merge per-page MusicXML files into a single score-partwise XML string."""
    if not xml_paths:
        raise RuntimeError("No MusicXML pages were produced by OMR.")

    if len(xml_paths) == 1:
        return Path(xml_paths[0]).read_text(encoding='utf-8', errors='replace')

    base_tree = ET.parse(xml_paths[0])
    base_root = base_tree.getroot()
    base_parts = base_root.findall('part')
    if not base_parts:
        return Path(xml_paths[0]).read_text(encoding='utf-8', errors='replace')

    # Track current measure count per part
    part_measure_counts = [len(p.findall('measure')) for p in base_parts]

    for page_idx, xml_path in enumerate(xml_paths[1:], start=2):
        try:
            page_tree = ET.parse(xml_path)
            page_root = page_tree.getroot()
            page_parts = page_root.findall('part')
            if not page_parts:
                warnings.append(f"Page {page_idx} produced no musical parts and was skipped.")
                continue

            for p_idx, base_part in enumerate(base_parts):
                if p_idx >= len(page_parts):
                    continue
                for m in page_parts[p_idx].findall('measure'):
                    part_measure_counts[p_idx] += 1
                    m.set('number', str(part_measure_counts[p_idx]))
                    base_part.append(m)
        except Exception as exc:
            warnings.append(f"Page {page_idx} MusicXML stitch warning: {exc}")

    return ET.tostring(base_root, encoding='unicode', xml_declaration=True)


def build_self_test_musicxml():
    return """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>OMR Self-Test Etude</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>5</voice><type>whole</type><staff>2</staff></note>
    </measure>
    <measure number="2">
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>4</duration><voice>5</voice><type>whole</type><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>
"""


def main():
    parser = argparse.ArgumentParser(description="College of Keys OMR Importer (PDF / Scan -> MusicXML)")
    parser.add_argument('input_path', nargs='?', help='Path to input PDF or sheet music image')
    parser.add_argument('--out', required=True, help='Output .musicxml file path')
    parser.add_argument('--dpi', type=int, default=300, help='PDF rasterization DPI (default: 300)')
    parser.add_argument('--max-pages', type=int, default=20, help='Maximum PDF pages to process (default: 20)')
    parser.add_argument('--tempo', type=int, default=0, help='Optional BPM hint for homr --output-tempo')
    parser.add_argument('--no-title', action='store_true', help='Skip OCR title detection for faster inference')
    parser.add_argument('--self-test', action='store_true', help='Write a valid self-test MusicXML and exit')
    args = parser.parse_args()

    out_path = Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    warnings = []

    if args.self_test:
        emit_status('initializing', 20, 'Running OMR pipeline self-test...')
        out_path.write_text(build_self_test_musicxml(), encoding='utf-8')
        emit_status('done', 100, 'OMR self-test complete.', page=1, total_pages=1, output_path=str(out_path))
        return 0

    if not args.input_path:
        emit_status('error', 0, 'No input PDF or image path provided.')
        return 1

    in_path = Path(args.input_path).resolve()
    if not in_path.is_file():
        emit_status('error', 0, f'Input file not found: {in_path}')
        return 1

    ext = in_path.suffix.lower()
    if ext not in SUPPORTED_PDF_EXTS and ext not in SUPPORTED_IMAGE_EXTS:
        emit_status('error', 0, f'Unsupported sheet music format "{ext}". Use PDF, PNG, JPG, WEBP, or TIFF.')
        return 1

    try:
        import homr  # noqa: F401
    except ImportError:
        emit_status(
            'error',
            0,
            'Python OMR package "homr" is not installed in python_ml/.venv. Run: pip install homr pypdfium2 onnxruntime'
        )
        return 1

    with tempfile.TemporaryDirectory(prefix='cok_omr_') as tmp_dir_str:
        tmp_dir = Path(tmp_dir_str)
        page_images = []

        if ext in SUPPORTED_PDF_EXTS:
            try:
                import pypdfium2 as pdfium
            except ImportError:
                emit_status('error', 0, 'Missing "pypdfium2" in python_ml/.venv for PDF rasterization.')
                return 1

            emit_status('rasterizing', 5, f'Opening PDF "{in_path.name}"...')
            doc = pdfium.PdfDocument(str(in_path))
            total_doc_pages = len(doc)
            if total_doc_pages == 0:
                emit_status('error', 0, 'PDF contains 0 pages.')
                return 1

            pages_to_run = min(total_doc_pages, max(1, args.max_pages))
            if total_doc_pages > pages_to_run:
                warnings.append(f'PDF has {total_doc_pages} pages; capped at first {pages_to_run} pages.')

            scale = max(150, min(400, args.dpi)) / 72.0
            for idx in range(pages_to_run):
                emit_status(
                    'rasterizing',
                    5 + (15 * (idx + 1) / pages_to_run),
                    f'Rendering PDF page {idx + 1}/{pages_to_run} at {args.dpi} DPI...',
                    page=idx + 1,
                    total_pages=pages_to_run
                )
                bitmap = doc[idx].render(scale=scale)
                pil_img = bitmap.to_pil()
                if pil_img.width < 400 or pil_img.height < 400:
                    warnings.append(f'Page {idx + 1} resolution is low ({pil_img.width}x{pil_img.height}); accuracy may suffer.')
                img_path = tmp_dir / f'page_{idx + 1:03d}.png'
                pil_img.save(img_path)
                page_images.append(img_path)
        else:
            try:
                from PIL import Image
            except ImportError:
                emit_status('error', 0, 'Missing "Pillow" in python_ml/.venv for image loading.')
                return 1

            emit_status('rasterizing', 10, f'Preparing sheet image "{in_path.name}"...', page=1, total_pages=1)
            img = Image.open(in_path).convert('RGB')
            if img.width < 600 or img.height < 600:
                warnings.append(f'Image resolution is low ({img.width}x{img.height}); scan at >=300 DPI for best results.')
            img_path = tmp_dir / 'page_001.png'
            img.save(img_path)
            page_images.append(img_path)

        total_pages = len(page_images)
        xml_outputs = []

        for idx, img_path in enumerate(page_images, start=1):
            base_pct = 20 + (70 * (idx - 1) / total_pages)
            emit_status(
                'recognizing',
                base_pct,
                f'Recognizing notation on page {idx}/{total_pages} (homr)...',
                page=idx,
                total_pages=total_pages,
                warnings=warnings
            )
            cmd = [sys.executable, '-m', 'homr.main', str(img_path)]
            if args.no_title or idx > 1:
                cmd.append('--no-title')
            if args.tempo and args.tempo > 0:
                cmd.extend(['--output-tempo', str(args.tempo)])

            proc = subprocess.run(cmd, capture_output=True, text=True)
            expected_xml = img_path.with_suffix('.musicxml')
            if proc.returncode != 0 or not expected_xml.is_file():
                err_tail = (proc.stderr or proc.stdout or '').strip().splitlines()[-1:] or ['Unknown OMR failure']
                warnings.append(f'Page {idx} failed OMR ({err_tail[0]}).')
                continue
            xml_outputs.append(expected_xml)

        if not xml_outputs:
            emit_status(
                'error',
                0,
                'OMR could not recognize any playable notation from the input. Try a cleaner, higher-DPI printed score.',
                warnings=warnings
            )
            return 1

        emit_status('stitching', 94, f'Assembling MusicXML ({len(xml_outputs)}/{total_pages} pages)...', warnings=warnings)
        merged_xml = stitch_musicxml_pages(xml_outputs, warnings)
        out_path.write_text(merged_xml, encoding='utf-8')
        emit_status(
            'done',
            100,
            f'OMR complete ({len(xml_outputs)}/{total_pages} pages recognized).',
            page=total_pages,
            total_pages=total_pages,
            warnings=warnings,
            output_path=str(out_path)
        )
    return 0


if __name__ == '__main__':
    sys.exit(main())
