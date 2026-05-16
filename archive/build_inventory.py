#!/usr/bin/env python3
"""Generate complete course inventory for AI University"""
import re
from pathlib import Path

WORKSPACE = Path("/Users/shula2/.openclaw/workspace/ai-university/library")
OUT = Path("/Users/shula2/.openclaw/workspace/ai-university/INVENTORY.md")

COURSES = [
    ("MIT-6.0001", "6.0001 — Introduction to Computer Science and Programming in Python", "Python Programming", "Ana Bell, Eric Grimson, John Guttag", "Fall 2016", "https://ocw.mit.edu/courses/6-0001", "e9b29f80-838e-43d3-989d-e40bfe2f9eb1", "MIT-6.0001-Introduction-to-Computer-Science-and-Programming-in-Python"),
    ("MIT-6.0002", "6.0002 — Introduction to Computational Thinking and Data Science", "Computational Thinking", "Eric Grimson, John Guttag", "Fall 2016", "https://ocw.mit.edu/courses/6-0002", "b783ff81-777f-4def-ac19-ef824acb0621", "MIT-6.0002-Introduction-to-Computational-Thinking-and-Data-Science"),
    ("MIT-6.034", "6.034 — Artificial Intelligence", "AI", "Patrick Winston", "Fall 2010", "https://ocw.mit.edu/courses/6-034", "a99d5700-fffe-4e56-b251-9a3005a80ea2", "MIT-6.034-Artificial-Intelligence"),
    ("MIT-6.036", "6.036 / 6.390 — Introduction to Machine Learning", "Machine Learning", "Tamara Broderick", "Fall 2020", "https://ocw.mit.edu/courses/6-036", "a8fa56c6-1826-4e0f-8be5-424700da4ccb", "MIT-6.036-Introduction-to-Machine-Learning"),
    ("MIT-6.7960", "6.7960 — Deep Learning", "Deep Learning", "Tomaso Poggio", "Fall 2024", "https://ocw.mit.edu/courses/6-7960", "079e535f-f79a-4d12-8815-223e6c3b3e71", "MIT-6.7960-Deep-Learning"),
    ("MIT-6.867", "6.867 — Machine Learning", "Advanced ML", "Tomaso Poggio", "Fall 2006", "https://ocw.mit.edu/courses/6-867", "8e9259ed-8648-491b-8164-6efb0f1df61d", "MIT-6.867-Machine-Learning"),
    ("MIT-6.S191", "6.S191 — Introduction to Deep Learning", "Intro DL", "Alexander Amini, Ava Soleimany", "January IAP 2020", "https://ocw.mit.edu/courses/6-s191", "41265126-caaa-4378-affe-95e3cb6f6cbd", "MIT-6.S191-Introduction-to-Deep-Learning"),
    ("MIT-15.773", "15.773 — Hands-on Deep Learning", "Hands-on DL", "Rama Ramakrishnan", "Spring 2024", "https://ocw.mit.edu/courses/15-773", "d9203b2c-389e-4246-bfaf-7e3dd60c60e0", "MIT-15.773-Hands-on-Deep-Learning"),
    ("MIT-6.8300", "6.8300 — Advances in Computer Vision", "Computer Vision", "Toksoz, Shafiq Jaitly", "Spring 2025", "https://ocw.mit.edu/courses/6-8300", "b29cef54-6882-4645-9395-2985e1b7e7d3", "MIT-6.8300-Advances-in-Computer-Vision"),
    ("MIT-RES.10-002", "RES.10-002 — Ethics of AI: Bias", "AI Ethics", "MIT", "Spring 2023", "https://ocw.mit.edu/courses/res-10-002", "37a656de-dea4-44a1-8d04-7ef76d3e0b1ae", "MIT-RES.10-002-Ethics-of-AI-Bias"),
]

def get_videos(folder):
    path = folder / "LECTURE_VIDEOS.md"
    if not path.exists(): return []
    txt = path.read_text()
    urls = re.findall(r'https://(?:www\.)?youtube\.com/(?:watch\?v=|embed/|youtu\.be/)([a-zA-Z0-9_-]+)', txt)
    return list(dict.fromkeys(urls))  # dedupe

def get_lectures(folder):
    path = folder / "FILELIST.md"
    if not path.exists(): return []
    txt = path.read_text()
    # 4-column table: | # | filename | size | topic |
    rows = re.findall(r'\|\s*(\d+)\s*\|\s*([^\|]+?)\s*\|\s*([^\|]+?)\s*\|\s*([^\|]+?)\s*\|', txt)
    return [{'num': int(r[0].strip()), 'filename': r[1].strip(), 'size': r[2].strip(), 'topic': r[3].strip()} for r in rows]

def get_pdfs(folder):
    pdfs = list(folder.glob("*.pdf"))
    return [p.name for p in pdfs if p.is_file()]

def get_extras(folder):
    path = folder / "EXTRAS.md"
    if not path.exists(): return None
    txt = path.read_text()
    return {
        'problem_sets': re.findall(r'hw\d+[_-]?(?:soln)?\.pdf', txt, re.I),
        'midterms': re.findall(r'(?:F0\d+|Midterm)[^|]*\.pdf', txt, re.I),
        'exams': re.findall(r'(?:Final|F0\d)[^|]*\.pdf', txt, re.I),
        'solutions': re.findall(r'soln[^|]*\.pdf', txt, re.I),
    }

lines = []
lines.append("# AI University — Komplette Kursmaterialien Inventar\n")
lines.append("*Generiert: 2026-05-02 | 10 MIT Kurse + How2AI*\n")

total_pdfs = 0
total_videos = 0

for key, full_name, short, instructor, semester, url, nb_id, folder in COURSES:
    f = WORKSPACE / folder
    lectures = get_lectures(f)
    video_ids = get_videos(f)
    pdfs = get_pdfs(f)
    extras = get_extras(f)
    
    total_pdfs += len(pdfs)
    total_videos += len(video_ids)
    
    lines.append(f"## {full_name}\n")
    lines.append(f"**Kurz:** {short} | **Instructor:** {instructor} | **Semester:** {semester}\n")
    lines.append(f"**OCW:** {url}\n")
    lines.append(f"**Notebook:** `{nb_id}`\n")
    lines.append(f"**Materialien:** {len(lectures)} Lectures, {len(video_ids)} Videos, {len(pdfs)} PDFs\n")
    
    if extras and (extras['problem_sets'] or extras['midterms'] or extras['exams']):
        ps = list(dict.fromkeys(extras['problem_sets']))
        if ps: lines.append(f"**Problem Sets:** {len(ps)} ({', '.join(ps[:5])}{'...' if len(ps)>5 else ''})\n")
        mt = list(dict.fromkeys(extras['midterms']))
        if mt: lines.append(f"**Midterms:** {len(mt)}\n")
        ex = list(dict.fromkeys(extras['exams']))
        if ex: lines.append(f"**Exams:** {len(ex)}\n")
        sol = list(dict.fromkeys(extras['solutions']))
        if sol: lines.append(f"**Solutions:** {len(sol)}\n")
    
    if lectures:
        n_videos = len(video_ids)
        lines.append(f"\n### Lectures\n")
        lines.append("| # | Thema | Grösse | Slides | Video |\n")
        lines.append("|---|-------|--------|--------|-------|\n")
        for lec in lectures:
            has_vid = "🎬" if lec['num'] <= n_videos else "—"
            lines.append(f"| {lec['num']:02d} | {lec['topic']} | {lec['size']} | `{lec['filename']}` | {has_vid} |\n")
    
    lines.append("\n---\n")

# How2AI
how2ai = WORKSPACE / "MAS.S60-How2AI-Spring2025"
if how2ai.exists():
    lines.append("## MAS.S60 — How2AI Spring 2025\n")
    lines.append("**Typ:** Eigenproduktion (MIT-MI)\n")
    lines.append("**Notebook:** `d9648f39-95c4-4267-a636-3e62b4eed301`\n")
    lines.append("**Quelle:** https://mit-mi.github.io/how2ai-course/spring2025/schedule/\n")
    lines.append("**Inhalt:** 13 Weeks (Slides + Videos + Papers)\n\n")
    
    weeks = sorted([d for d in how2ai.iterdir() if d.is_dir() and d.name.startswith("Week")])
    for w in weeks:
        readme = w / "README.md"
        slides = sorted([p.name for p in w.glob("*.pdf") if not p.name.startswith("arxiv_")])
        papers = sorted([p.name for p in w.glob("arxiv_*.pdf")])
        videos = []
        if readme.exists():
            txt = readme.read_text()
            videos = re.findall(r'https://(?:www\.)?youtube\.com/(?:watch\?v=|embed/|youtu\.be/)([a-zA-Z0-9_-]+)', txt)
        
        vid_icon = f"🎬 ({len(videos)})" if videos else "—"
        slide_str = ', '.join(slides) if slides else "—"
        paper_str = f"{len(papers)} Papers" if papers else ""
        
        lines.append(f"**{w.name.replace('_', ' ')}** | Slides: {slide_str} | {vid_icon} | {paper_str}\n")
    
    lines.append("\n---\n")

lines.append(f"\n**Total: 10 MIT Kurse + How2AI | ~{total_pdfs} PDFs | {total_videos} Videos**\n")
lines.append("\n*AI University — Powered by MIT OCW + NotebookLM + OpenClaw*\n")

OUT.write_text(''.join(lines))
print(f"Done! {len(COURSES)} Kurse, {total_pdfs} PDFs, {total_videos} Videos")
print(f"Written to: {OUT}")
