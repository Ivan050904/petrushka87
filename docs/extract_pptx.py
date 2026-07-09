import zipfile
import xml.etree.ElementTree as ET
import re

def extract_pptx(path):
    slides = []
    with zipfile.ZipFile(path) as z:
        slide_files = sorted(
            [f for f in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml", f)],
            key=lambda x: int(re.search(r"slide(\d+)", x).group(1)),
        )
        for sf in slide_files:
            root = ET.fromstring(z.read(sf))
            texts = []
            for t in root.iter("{http://schemas.openxmlformats.org/drawingml/2006/main}t"):
                if t.text and t.text.strip():
                    texts.append(t.text.strip())
                if t.tail and t.tail.strip():
                    texts.append(t.tail.strip())
            slides.append("\n".join(texts))
    return slides

pptx = r"c:\Users\Dmitry\Desktop\Диплом\Диплом.pptx"
slides = extract_pptx(pptx)
out = r"C:\Users\Dmitry\Documents\LetsCore MVP\docs\pptx-slides.txt"
with open(out, "w", encoding="utf-8") as f:
    for i, s in enumerate(slides, 1):
        f.write(f"=== SLIDE {i} ===\n{s}\n\n")
print(len(slides))
