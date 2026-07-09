import zipfile
import xml.etree.ElementTree as ET

docx = r"c:\Users\Dmitry\Desktop\Диплом\Диплом Лаумец Д. М. итог.docx"
with zipfile.ZipFile(docx) as z:
    xml = z.read("word/document.xml")
root = ET.fromstring(xml)
ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
paras = []
for p in root.iter(ns + "p"):
    parts = [node.text for node in p.iter() if node.tag == ns + "t" and node.text]
    text = "".join(parts).strip()
    if text:
        paras.append(text)

keys = [
    "архитектур", "FastAPI", "Next", "PostgreSQL", "контрольн",
    "интеллект", "1,28", "5,29", "39650", "39 650", "Saner",
    "REST", "модуль", "заключение", "результат", "веб-прилож",
]
out = r"C:\Users\Dmitry\Documents\LetsCore MVP\docs\docx-extract.txt"
with open(out, "w", encoding="utf-8") as f:
    for p in paras:
        if any(k.lower() in p.lower() for k in keys) and 40 < len(p) < 700:
            f.write(p + "\n\n")
