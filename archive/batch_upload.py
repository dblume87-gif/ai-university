#!/usr/bin/env python3.11
"""
Batch Upload Script — AI University Kurse zu NotebookLM
Nur Notebook erstellen + Sources hochladen. Kein AI generieren.

Usage: python3.11 batch_upload.py [--course NUM]
"""
import subprocess
import re
import sys
import os
import time
import glob

WORKSPACE = "/Users/shula2/.openclaw/workspace/ai-university/library"

COURSES = {
    "1": {
        "name": "MIT-6.0001-Introduction-to-Computer-Science-and-Programming-in-Python",
        "notebook": "Introduction to Computer Science and Programming in Python (MIT 6.0001)",
        "pdf_dir": "MIT-6.0001-Introduction-to-Computer-Science-and-Programming-in-Python",
        "pdf_pattern": "MIT6_0001F16_Lec*.pdf",
        "videos_md": "LECTURE_VIDEOS.md"
    },
    "2": {
        "name": "MIT-6.0002-Introduction-to-Computational-Thinking-and-Data-Science",
        "notebook": "MIT-6.0002 Computational Thinking and Data Science",
        "pdf_dir": "MIT-6.0002-Introduction-to-Computational-Thinking-and-Data-Science",
        "pdf_pattern": "MIT6_0002F16_Lec*.pdf",
        "videos_md": "LECTURE_VIDEOS.md",
        "notebook_id": "b783ff81-777f-4def-ac19-ef824acb0621"
    },
    "3": {
        "name": "MIT-6.034-Artificial-Intelligence",
        "notebook": "Artificial Intelligence (MIT 6.034)",
        "pdf_dir": "MIT-6.034-Artificial-Intelligence",
        "pdf_pattern": "MIT6_034F10_Lec*.pdf",
        "videos_md": "LECTURE_VIDEOS.md",
        "notebook_id": "a99d5700-fffe-4e56-b251-9a3005a80ea2"
    },
    "4": {
        "name": "MIT-6.036-Introduction-to-Machine-Learning",
        "notebook": "Introduction to Machine Learning (MIT 6.036)",
        "pdf_dir": "MIT-6.036-Introduction-to-Machine-Learning",
        "pdf_pattern": "MIT6_036F20_Lec*.pdf",
        "videos_md": "LECTURE_VIDEOS.md",
        "notebook_id": "a8fa56c6-1826-4e0f-8be5-424700da4ccb"
    },
    "5": {
        "name": "MIT-6.7960-Deep-Learning",
        "notebook": "Deep Learning (MIT 6.7960)",
        "pdf_dir": "MIT-6.7960-Deep-Learning",
        "pdf_pattern": "MIT6_7960F24_Lec*.pdf",
        "videos_md": "LECTURE_VIDEOS.md"
    },
    "6": {
        "name": "MIT-6.867-Machine-Learning",
        "notebook": "Machine Learning (MIT 6.867)",
        "pdf_dir": "MIT-6.867-Machine-Learning",
        "pdf_pattern": "MIT6_867F06_Lec*.pdf",
        "videos_md": "LECTURE_VIDEOS.md"
    },
    "7": {
        "name": "MIT-6.S191-Introduction-to-Deep-Learning",
        "notebook": "Introduction to Deep Learning (MIT 6.S191)",
        "pdf_dir": "MIT-6.S191-Introduction-to-Deep-Learning",
        "pdf_pattern": "MIT6_S191IAP20_Lec*.pdf",
        "videos_md": "LECTURE_VIDEOS.md"
    },
    "8": {
        "name": "MIT-15.773-Hands-on-Deep-Learning",
        "notebook": "Hands-on Deep Learning (MIT 15.773)",
        "pdf_dir": "MIT-15.773-Hands-on-Deep-Learning",
        "pdf_pattern": "MIT15_773S24_Lec*.pdf",
        "videos_md": "LECTURE_VIDEOS.md"
    },
    "9": {
        "name": "MIT-6.8300-Advances-in-Computer-Vision",
        "notebook": "Advances in Computer Vision (MIT 6.8300)",
        "pdf_dir": "MIT-6.8300-Advances-in-Computer-Vision",
        "pdf_pattern": "MIT6_8300S25_Lec*.pdf",
        "videos_md": "LECTURE_VIDEOS.md"
    },
    "10": {
        "name": "MIT-RES.10-002-Ethics-of-AI-Bias",
        "notebook": "Ethics of AI: Bias (MIT RES.10-002)",
        "pdf_dir": "MIT-RES.10-002-Ethics-of-AI-Bias",
        "pdf_pattern": "MIT_RES*.pdf",
        "videos_md": "LECTURE_VIDEOS.md"
    }
}

def normalize_youtube(url):
    """Normalize any YouTube URL to youtube.com/watch format"""
    if 'youtu.be/' in url:
        vid = url.split('youtu.be/')[1].split('?')[0]
        return f'https://www.youtube.com/watch?v={vid}'
    if '/embed/' in url and 'youtube.com' in url:
        vid = url.split('/embed/')[1].split('?')[0]
        return f'https://www.youtube.com/watch?v={vid}'
    return url

def run(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ❌ {result.stderr.strip()[:100]}")
        return None
    return result.stdout.strip()

def get_video_urls(pdf_dir, videos_md):
    """Extract YouTube URLs from LECTURE_VIDEOS.md — all formats, normalized + deduped"""
    path = os.path.join(WORKSPACE, pdf_dir, videos_md)
    if not os.path.exists(path):
        return []
    with open(path) as f:
        content = f.read()
    pattern = r'https://(?:www\.youtube\.com/(?:watch\?v=|embed/)|youtu\.be/)[a-zA-Z0-9_-]+'
    found = re.findall(pattern, content)
    seen = set()
    urls = []
    for url in found:
        normalized = normalize_youtube(url)
        if normalized not in seen:
            seen.add(normalized)
            urls.append(normalized)
    return urls

def get_pdfs(pdf_dir, pattern):
    path = os.path.join(WORKSPACE, pdf_dir, pattern)
    return sorted(glob.glob(path))

def upload_course(num):
    course = COURSES[num]
    print(f"\n{'='*60}")
    print(f"Kurs {num}: {course['notebook']}")
    print(f"{'='*60}")

    if "notebook_id" in course:
        notebook_id = course["notebook_id"]
        print(f"✅ Notebook bereits vorhanden: {notebook_id}")
    else:
        print("📝 Erstelle Notebook...")
        output = run(["python3.11", "-m", "notebooklm", "create", course["notebook"]])
        if not output:
            print("  ❌ Notebook erstellen fehlgeschlagen")
            return None
        notebook_id = output.split("Created notebook: ")[1].split(" - ")[0]
        print(f"  ✅ Notebook erstellt: {notebook_id}")

    # Upload PDFs
    pdfs = get_pdfs(course["pdf_dir"], course["pdf_pattern"])
    print(f"📄 Lade {len(pdfs)} PDFs hoch...")
    for i, pdf in enumerate(pdfs, 1):
        print(f"  [{i}/{len(pdfs)}] {os.path.basename(pdf)}", end="", flush=True)
        out = run(["python3.11", "-m", "notebooklm", "source", "add", pdf, "--notebook", notebook_id])
        if out and "Added source" in out:
            print(" ✅")
        else:
            print(f" ❌ ({out[:50] if out else 'error'})")
        time.sleep(0.5)

    # Upload Videos
    video_urls = get_video_urls(course["pdf_dir"], course["videos_md"])
    print(f"🎬 Lade {len(video_urls)} YouTube Videos hoch...")
    for i, url in enumerate(video_urls, 1):
        print(f"  [{i}/{len(video_urls)}] {url}", end="", flush=True)
        out = run(["python3.11", "-m", "notebooklm", "source", "add", url, "--notebook", notebook_id])
        if out and "Added source" in out:
            print(" ✅")
        else:
            print(f" ❌ ({out[:50] if out else 'error'})")
        time.sleep(1)

    print(f"\n✅ Kurs {num} fertig: {len(pdfs)} PDFs, {len(video_urls)} Videos")
    return notebook_id

if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1].startswith("--course="):
        num = sys.argv[1].split("=")[1]
    elif len(sys.argv) == 2:
        num = sys.argv[1]
    else:
        for num in COURSES:
            result = upload_course(num)
            if result:
                print(f"   Notebook ID: {result}")
            time.sleep(2)
        print("\n🎉 Alle Kurse hochgeladen!")
        sys.exit(0)

    result = upload_course(num)
    if result:
        print(f"\n✅ Notebook ID: {result}")
