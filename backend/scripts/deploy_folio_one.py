#!/usr/bin/env python3
"""Deploy Folio-One to Beget VPS."""
from __future__ import annotations

import secrets
import sys
import time
from pathlib import Path

import paramiko

HOST = "155.212.132.213"
USER = "root"
PASSWORD = "Wcb12345@!"
REPO = "https://github.com/Ivan050904/petrushka87.git"
APP_DIR = "/opt/folio-one"
DOMAIN = "folio-one.worldcashboxvl.ru"
BACKEND_PORT = 8010
FRONTEND_PORT = 3010
LOCAL_DB = Path(__file__).resolve().parents[1] / "storage" / "folio_one.db"
LOCAL_ENV = Path(__file__).resolve().parents[1] / ".env"
NGINX_CONF = "/root/-Mobile-application-for-expense-tracking/backend/nginx.conf"


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 600) -> tuple[int, str, str]:
    print(f"\n$ {cmd[:120]}{'...' if len(cmd) > 120 else ''}")
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    if out.strip():
        print(out[-4000:] if len(out) > 4000 else out)
    if err.strip() and exit_code != 0:
        print("ERR:", err[-2000:])
    return exit_code, out, err


def read_local_env() -> dict[str, str]:
    values: dict[str, str] = {}
    if not LOCAL_ENV.exists():
        return values
    for line in LOCAL_ENV.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def build_backend_env(local_env: dict[str, str]) -> str:
    gh = local_env.get("ASSISTANT_API_KEY") or local_env.get("NOTES_AI_API_KEY", "")
    secret = secrets.token_urlsafe(48)
    lines = [
        f"DATABASE_URL=sqlite:///{APP_DIR}/backend/storage/folio_one.db",
        "ENVIRONMENT=production",
        f"SECRET_KEY={secret}",
        "ACCESS_TOKEN_EXPIRE_MINUTES=10080",
        "REGISTRATION_ENABLED=false",
        "TRUST_PROXY_HEADERS=true",
        f"CORS_ORIGINS=https://{DOMAIN}",
        "AI_PROVIDER=openai-compatible",
        "AI_CLASSIFICATION_ENABLED=false",
        "USER_TIMEZONE=Asia/Vladivostok",
        "OPENAI_COMPATIBLE_BASE_URL=http://127.0.0.1:11434/v1",
        "OPENAI_COMPATIBLE_API_KEY=ollama",
        "OPENAI_COMPATIBLE_MODEL=qwen2.5:3b",
        "DIGEST_ENABLED=true",
        "DIGEST_TOPICS=ии агенты,cursor ai,claude codex,claude агент,cursor ide",
        "DIGEST_MAX_ARTICLES=5",
        "DIGEST_SCHEDULE_HOUR=8",
        "DIGEST_USER_EMAIL=petr@petr.local",
        "DIGEST_LLM_BASE_URL=http://127.0.0.1:11434/v1",
        "DIGEST_LLM_API_KEY=ollama",
        "DIGEST_LLM_MODEL=qwen2.5:3b",
        "DIGEST_SEARCH_PROVIDER=habr",
        "DIGEST_SCHEDULER_ENABLED=true",
        "AI_DIGEST_TUNED_QUERIES_MAX_AGE_DAYS=7",
        "AI_DIGEST_TUNE_MIN_FEEDBACK=3",
        "NOTES_AI_ENABLED=true",
        "NOTES_AI_PROVIDER=auto",
        "NOTES_AI_BASE_URL=https://models.github.ai/inference",
        f"NOTES_AI_API_KEY={gh}",
        "NOTES_AI_MODEL=openai/gpt-4o-mini",
        "FINANCE_AI_ENABLED=true",
        "FINANCE_AI_BASE_URL=https://models.github.ai/inference",
        f"FINANCE_AI_API_KEY={gh}",
        "FINANCE_AI_MODEL=openai/gpt-4o-mini",
        "ASSISTANT_ENABLED=true",
        "ASSISTANT_BASE_URL=https://models.github.ai/inference",
        f"ASSISTANT_API_KEY={gh}",
        "ASSISTANT_MODEL=openai/gpt-4o-mini",
        "SPEECH_ENABLED=true",
        "WHISPER_MODEL=small",
        "WHISPER_DEVICE=cpu",
        "WHISPER_COMPUTE_TYPE=int8",
        "CONTEXT_EMBEDDINGS_PROVIDER=hash",
        "FILE_STORAGE_PROVIDER=local",
        f"LOCAL_STORAGE_PATH={APP_DIR}/backend/storage/files",
        "TRANSCRIPTION_URL_PREFIX=/transcription",
        f"TRANSCRIPTION_DATA_DIR={APP_DIR}/backend/storage/transcription",
        f"TRANSCRIPTION_LLM_BASE_URL=https://models.github.ai/inference",
        f"TRANSCRIPTION_LLM_API_KEY={gh}",
        "TRANSCRIPTION_LLM_MODEL=openai/gpt-4o-mini",
        "THERAPY_SESSIONS_ENABLED=true",
    ]
    return "\n".join(lines) + "\n"


def nginx_block(cert_ready: bool) -> str:
    if not cert_ready:
        return f"""
# Folio-One ({DOMAIN}) HTTP + ACME
    server {{
        listen 80;
        server_name {DOMAIN};

        location /.well-known/acme-challenge/ {{
            root /var/www/certbot;
        }}

        location /api/v1/ {{
            proxy_pass http://172.19.0.1:{BACKEND_PORT}/api/v1/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 300s;
        }}

        location = /transcription {{
            return 301 https://$host/transcribe;
        }}

        location /transcription/ {{
            proxy_pass http://172.19.0.1:{BACKEND_PORT}/transcription/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 600s;
        }}

        location / {{
            proxy_pass http://172.19.0.1:{FRONTEND_PORT};
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }}
    }}
"""
    return f"""
# Folio-One ({DOMAIN})
    server {{
        listen 80;
        server_name {DOMAIN};
        location /.well-known/acme-challenge/ {{ root /var/www/certbot; }}
        location / {{ return 301 https://$host$request_uri; }}
    }}

    server {{
        listen 443 ssl http2;
        server_name {DOMAIN};

        ssl_certificate /etc/letsencrypt/live/{DOMAIN}/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/{DOMAIN}/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;
        client_max_body_size 50M;

        location /api/v1/ {{
            proxy_pass http://172.19.0.1:{BACKEND_PORT}/api/v1/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 300s;
        }}

        location = /transcription {{
            return 301 https://$host/transcribe;
        }}

        location /transcription/ {{
            proxy_pass http://172.19.0.1:{BACKEND_PORT}/transcription/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 600s;
        }}

        location / {{
            proxy_pass http://172.19.0.1:{FRONTEND_PORT};
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }}
    }}
"""


def patch_nginx(client: paramiko.SSHClient, snippet: str) -> None:
    sftp = client.open_sftp()
    with sftp.file("/tmp/folio-nginx.snippet", "w") as f:
        f.write(snippet)
    sftp.close()
    marker = f"# Folio-One ({DOMAIN})"
    py = f"""
from pathlib import Path
marker = {marker!r}
path = Path({NGINX_CONF!r})
text = path.read_text(encoding='utf-8')
snippet = Path('/tmp/folio-nginx.snippet').read_text(encoding='utf-8')
if marker in text:
    start = text.index(marker)
    i = start
    depth = 0
    end = len(text)
    while i < len(text):
        ch = text[i]
        if ch == '{{':
            depth += 1
        elif ch == '}}':
            depth -= 1
            if depth == 0:
                end = i + 1
                break
        i += 1
    text = text[:start] + snippet + text[end:]
else:
    text = text.rstrip()
    if text.endswith('}}'):
        text = text[:-1] + snippet + '\\n}}\\n'
    else:
        text += snippet
path.write_text(text, encoding='utf-8')
print('nginx patched')
"""
    run(client, f"python3 - <<'PY'\n{py}\nPY")
    run(client, "docker exec billing-nginx nginx -t && docker exec billing-nginx nginx -s reload")


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if not LOCAL_DB.exists():
        print("Local DB missing:", LOCAL_DB)
        return 1

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print("Connecting...")
    client.connect(HOST, username=USER, password=PASSWORD, timeout=20)

    run(client, f"rm -rf {APP_DIR} && git clone --depth 1 {REPO} {APP_DIR}")

    print("Uploading folio_one.db (~25MB)...")
    sftp = client.open_sftp()
    remote_db = f"{APP_DIR}/backend/storage/folio_one.db"
    run(client, f"mkdir -p {APP_DIR}/backend/storage/files {APP_DIR}/backend/storage/transcription {APP_DIR}/backend/storage/logs")
    sftp.put(str(LOCAL_DB), remote_db)
    sftp.close()
    print("DB uploaded.")

    env_content = build_backend_env(read_local_env())
    sftp = client.open_sftp()
    with sftp.file(f"{APP_DIR}/backend/.env", "w") as f:
        f.write(env_content)
    with sftp.file(f"{APP_DIR}/frontend/.env.local", "w") as f:
        f.write(f"NEXT_PUBLIC_API_URL=https://{DOMAIN}/api/v1\n")
    sftp.close()

    run(
        client,
        f"cd {APP_DIR}/backend && python3 -m venv .venv && .venv/bin/pip install -U pip && .venv/bin/pip install -e '.[dev]'",
        timeout=900,
    )
    run(client, f"cd {APP_DIR}/backend && .venv/bin/alembic upgrade head")
    run(client, f"cd {APP_DIR}/frontend && npm ci && npm run build", timeout=1800)

    backend_service = f"""[Unit]
Description=Folio-One Backend
After=network.target

[Service]
Type=simple
WorkingDirectory={APP_DIR}/backend
EnvironmentFile={APP_DIR}/backend/.env
ExecStart={APP_DIR}/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port {BACKEND_PORT}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
"""
    frontend_service = f"""[Unit]
Description=Folio-One Frontend
After=network.target

[Service]
Type=simple
WorkingDirectory={APP_DIR}/frontend
Environment=PORT={FRONTEND_PORT}
Environment=HOSTNAME=127.0.0.1
ExecStart=/usr/bin/npm run start -- -p {FRONTEND_PORT} -H 127.0.0.1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
"""
    sftp = client.open_sftp()
    with sftp.file("/etc/systemd/system/folio-one-backend.service", "w") as f:
        f.write(backend_service)
    with sftp.file("/etc/systemd/system/folio-one-frontend.service", "w") as f:
        f.write(frontend_service)
    sftp.close()

    run(client, "systemctl daemon-reload && systemctl enable folio-one-backend folio-one-frontend && systemctl restart folio-one-backend folio-one-frontend")
    time.sleep(3)
    run(client, f"curl -sf http://127.0.0.1:{BACKEND_PORT}/health && echo BACKEND_OK")
    run(client, f"curl -sf -I http://127.0.0.1:{FRONTEND_PORT} | head -1")

    run(client, f"cp {NGINX_CONF} {NGINX_CONF}.bak.folio")
    patch_nginx(client, nginx_block(cert_ready=False))

    run(
        client,
        f"certbot certonly --webroot -w /var/www/certbot -d {DOMAIN} --non-interactive --agree-tos -m admin@worldcashboxvl.ru --keep-until-expiring || true",
        timeout=300,
    )
    _, cert_out, _ = run(client, f"test -f /etc/letsencrypt/live/{DOMAIN}/fullchain.pem && echo CERT_OK || echo NO_CERT")
    if "CERT_OK" in cert_out:
        patch_nginx(client, nginx_block(cert_ready=True))

    run(client, f"curl -sfI http://{DOMAIN}/ | head -3 || true")
    run(client, "systemctl is-active folio-one-backend folio-one-frontend")

    client.close()
    print("\nDEPLOY DONE")
    print(f"URL: https://{DOMAIN}")
    print("Login: petr@petr.local / petr12345")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
