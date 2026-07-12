import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[2]
out = root / "backend" / "storage" / "folio_one_from_git.db"
data = subprocess.check_output(["git", "show", "HEAD:backend/storage/folio_one.db"], cwd=root)
out.write_bytes(data)
print("written", len(data), "bytes to", out)
