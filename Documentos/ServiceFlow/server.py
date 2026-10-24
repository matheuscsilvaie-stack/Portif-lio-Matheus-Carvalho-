#!/usr/bin/env python3
"""MatheusFlow: API local (SQLite) e hospedada (PostgreSQL), com sessão privada."""

from contextlib import contextmanager
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
import base64
import getpass
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import sys
import threading
import time

def load_local_env():
    """Load ignored local secrets without requiring python-dotenv."""
    env_file = Path(__file__).resolve().parent / '.env'
    if not env_file.is_file():
        return
    for line in env_file.read_text(encoding='utf-8').splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith('#') or '=' not in stripped:
            continue
        key, value = stripped.split('=', 1)
        key = key.strip()
        if key and key not in os.environ:
            os.environ[key] = value.strip().strip('"').strip("'")


load_local_env()

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get('SERVICEFLOW_DB', BASE_DIR / 'serviceflow.db'))
DATABASE_URL = os.environ.get('DATABASE_URL', '').strip()
USE_POSTGRES = DATABASE_URL.startswith(('postgres://', 'postgresql://'))
PORT = int(os.environ.get('PORT', '3000'))
STATUSES = ('Pendente', 'Em andamento', 'Concluído')
PRIORITIES = ('normal', 'alta', 'urgente')
SESSION_COOKIE = 'matheusflow_session'
SESSION_TTL = 8 * 60 * 60
APP_USERNAME = os.environ.get('APP_USERNAME', '')
APP_PASSWORD_HASH = os.environ.get('APP_PASSWORD_HASH', '')
SESSION_SECRET = os.environ.get('SESSION_SECRET', '')
AUTH_ENABLED = USE_POSTGRES or bool(APP_USERNAME or APP_PASSWORD_HASH or SESSION_SECRET)
COOKIE_SECURE = os.environ.get('COOKIE_SECURE', 'true' if USE_POSTGRES else 'false').lower() == 'true'
PUBLIC_FORM_ORIGINS = {
    origin.strip().rstrip('/') for origin in
    os.environ.get('PUBLIC_FORM_ORIGINS', 'https://matheuscsilvaie-stack.github.io').split(',')
    if origin.strip()
}
PUBLIC_RATE_LIMIT = 5
PUBLIC_RATE_WINDOW = 15 * 60
public_submissions = {}
public_submissions_lock = threading.Lock()

try:
    import psycopg
    from psycopg.rows import dict_row
    DB_ERRORS = (sqlite3.Error, psycopg.Error)
except ImportError:
    psycopg = None
    dict_row = None
    DB_ERRORS = (sqlite3.Error,)


class Database:
    def __init__(self, connection, postgres=False):
        self.connection = connection
        self.postgres = postgres

    def execute(self, statement, parameters=()):
        if self.postgres:
            statement = statement.replace('?', '%s')
        return self.connection.execute(statement, parameters)

    def executescript(self, script):
        if not self.postgres:
            return self.connection.executescript(script)
        for statement in script.split(';'):
            if statement.strip():
                self.execute(statement)

    def commit(self):
        self.connection.commit()

    def rollback(self):
        self.connection.rollback()

    def close(self):
        self.connection.close()


def connect_db():
    if USE_POSTGRES:
        if psycopg is None:
            raise RuntimeError('Instale as dependências do servidor com pip install -r requirements.txt.')
        return Database(psycopg.connect(DATABASE_URL, connect_timeout=10, row_factory=dict_row), postgres=True)
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys = ON')
    return Database(db)


@contextmanager
def database():
    db = connect_db()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def initialize_db():
    if USE_POSTGRES:
        schema = '''
            CREATE TABLE IF NOT EXISTS clients (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS tickets (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                client_id BIGINT NOT NULL REFERENCES clients(id),
                service_name VARCHAR(120) NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                priority VARCHAR(10) NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('normal', 'alta', 'urgente')),
                status VARCHAR(20) NOT NULL DEFAULT 'Pendente'
                    CHECK (status IN ('Pendente', 'Em andamento', 'Concluído')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS tickets_status_created_at_idx ON tickets (status, created_at DESC);
            CREATE INDEX IF NOT EXISTS tickets_client_id_idx ON tickets (client_id);
            ALTER TABLE tickets ADD COLUMN IF NOT EXISTS phone VARCHAR(30) NOT NULL DEFAULT '';
        '''
    else:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        schema = '''
            CREATE TABLE IF NOT EXISTS clients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL CHECK(length(name) <= 100),
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );
            CREATE TABLE IF NOT EXISTS tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id INTEGER NOT NULL REFERENCES clients(id),
                service_name TEXT NOT NULL CHECK(length(service_name) <= 120),
                description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 1000),
                priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal', 'alta', 'urgente')),
                status TEXT NOT NULL DEFAULT 'Pendente' CHECK(status IN ('Pendente', 'Em andamento', 'Concluído')),
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );
            CREATE INDEX IF NOT EXISTS tickets_status_created_at_idx ON tickets(status, created_at DESC);
            CREATE INDEX IF NOT EXISTS tickets_client_id_idx ON tickets(client_id);
        '''
    with database() as db:
        if not USE_POSTGRES:
            db.execute('PRAGMA journal_mode = WAL')
        db.executescript(schema)
        if not USE_POSTGRES:
            columns = {row['name'] for row in db.execute('PRAGMA table_info(tickets)').fetchall()}
            if 'phone' not in columns:
                db.execute("ALTER TABLE tickets ADD COLUMN phone TEXT NOT NULL DEFAULT '' CHECK(length(phone) <= 30)")


def encode_urlsafe(data):
    return base64.urlsafe_b64encode(data).decode('ascii').rstrip('=')


def decode_urlsafe(value):
    return base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))


def password_hash(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode('utf-8'), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return 'scrypt$16384$8$1$' + encode_urlsafe(salt) + '$' + encode_urlsafe(digest)


def verify_password(password, stored_hash):
    try:
        algorithm, n, r, p, salt, expected = stored_hash.split('$')
        if algorithm != 'scrypt':
            return False
        actual = hashlib.scrypt(
            password.encode('utf-8'), salt=decode_urlsafe(salt),
            n=int(n), r=int(r), p=int(p), dklen=len(decode_urlsafe(expected))
        )
        return hmac.compare_digest(actual, decode_urlsafe(expected))
    except (ValueError, TypeError):
        return False


def create_session(username):
    payload = encode_urlsafe(json.dumps({
        'user': username,
        'expires': int(time.time()) + SESSION_TTL,
        'nonce': secrets.token_urlsafe(12),
    }, separators=(',', ':')).encode('utf-8'))
    signature = encode_urlsafe(hmac.new(SESSION_SECRET.encode(), payload.encode(), hashlib.sha256).digest())
    return f'{payload}.{signature}'


def session_username(cookie_header):
    if not SESSION_SECRET:
        return None
    try:
        cookies = SimpleCookie(cookie_header or '')
        token = cookies[SESSION_COOKIE].value
        payload, signature = token.split('.', 1)
        expected = encode_urlsafe(hmac.new(SESSION_SECRET.encode(), payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            return None
        content = json.loads(decode_urlsafe(payload))
        if content['expires'] < int(time.time()):
            return None
        return content['user']
    except (KeyError, ValueError, TypeError, json.JSONDecodeError):
        return None


def ticket_dict(row):
    created = row['createdAt']
    if hasattr(created, 'isoformat'):
        created = created.isoformat()
    return {
        'id': str(row['id']),
        'client': row['client'],
        'name': row['name'],
        'description': row['description'],
        'phone': row['phone'],
        'priority': row['priority'],
        'status': row['status'],
        'createdAt': created,
    }


def parse_ticket(data):
    def text(key, default=''):
        value = data.get(key, default)
        return value.strip() if isinstance(value, str) else None

    client, name, description, phone = text('client'), text('name'), text('description'), text('phone')
    priority = data.get('priority', 'normal')
    if (not client or len(client) > 100 or not name or len(name) > 120
            or description is None or len(description) > 1000
            or phone is None or len(phone) > 30
            or not isinstance(priority, str) or priority not in PRIORITIES):
        return None
    return client, name, description, phone, priority


def create_ticket(client, name, description, phone, priority):
    with database() as db:
        client_id = db.execute(
            'INSERT INTO clients (name) VALUES (?) RETURNING id', (client,)
        ).fetchone()['id']
        ticket_id = db.execute('''
            INSERT INTO tickets (client_id, service_name, description, phone, priority)
            VALUES (?, ?, ?, ?, ?) RETURNING id
        ''', (client_id, name, description, phone, priority)).fetchone()['id']
        row = db.execute('''
            SELECT t.id, c.name AS client, t.service_name AS name, t.description, t.phone,
                   t.priority, t.status, t.created_at AS "createdAt"
            FROM tickets t JOIN clients c ON c.id = t.client_id WHERE t.id = ?
        ''', (ticket_id,)).fetchone()
    return ticket_dict(row)


def allow_public_submission(address):
    now = time.monotonic()
    with public_submissions_lock:
        for key in [key for key, times in public_submissions.items() if not times or now - times[-1] > PUBLIC_RATE_WINDOW]:
            del public_submissions[key]
        recent = [moment for moment in public_submissions.get(address, []) if now - moment < PUBLIC_RATE_WINDOW]
        if len(recent) >= PUBLIC_RATE_LIMIT:
            public_submissions[address] = recent
            return False
        recent.append(now)
        public_submissions[address] = recent
        return True


class Handler(SimpleHTTPRequestHandler):
    PUBLIC_FILES = {'/', '/index.html', '/login.html', '/style.css', '/script.js', '/media/matheusflow-logo.jpeg'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def log_message(self, fmt, *args):
        print(f'[{self.log_date_time_string()}] {fmt % args}')

    def authenticated(self):
        if not AUTH_ENABLED:
            return True
        username = session_username(self.headers.get('Cookie'))
        return bool(username and hmac.compare_digest(username, APP_USERNAME))

    def send_json(self, status, payload=None, headers=()):
        body = b'' if payload is None else json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        for key, value in headers:
            self.send_header(key, value)
        self.end_headers()
        if body:
            self.wfile.write(body)

    def send_login_redirect(self):
        self.send_response(303)
        self.send_header('Location', '/login.html')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()

    def cors_headers(self):
        origin = (self.headers.get('Origin') or '').rstrip('/')
        if origin not in PUBLIC_FORM_ORIGINS:
            return []
        return [('Access-Control-Allow-Origin', origin), ('Vary', 'Origin')]

    def client_address_key(self):
        forwarded = self.headers.get('X-Forwarded-For', '')
        return forwarded.split(',')[0].strip() or self.client_address[0]

    def do_OPTIONS(self):
        if urlparse(self.path).path != '/api/public/tickets' or not self.cors_headers():
            return self.send_json(404, {'error': 'Rota não encontrada.'})
        self.send_json(204, None, self.cors_headers() + [
            ('Access-Control-Allow-Methods', 'POST, OPTIONS'),
            ('Access-Control-Allow-Headers', 'Content-Type'),
            ('Access-Control-Max-Age', '86400'),
        ])

    def handle_public_ticket(self, data):
        cors = self.cors_headers()
        if not cors:
            return self.send_json(403, {'error': 'Origem não autorizada.'})
        if data.get('website'):
            return self.send_json(201, {'ok': True}, cors)
        fields = parse_ticket(data)
        if fields is None:
            return self.send_json(400, {'error': 'Confira os campos e tente novamente.'}, cors)
        if not allow_public_submission(self.client_address_key()):
            return self.send_json(429, {'error': 'Muitos chamados enviados. Tente novamente mais tarde.'}, cors)
        try:
            ticket = create_ticket(*fields)
            self.send_json(201, {'ok': True, 'id': ticket['id']}, cors)
        except DB_ERRORS:
            self.send_json(500, {'error': 'Erro ao gravar o chamado no banco de dados.'}, cors)

    def read_json(self):
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError as error:
            raise ValueError('Tamanho de requisição inválido.') from error
        if length < 0 or length > 20_000:
            raise ValueError('Requisição muito grande.')
        data = json.loads(self.rfile.read(length) or b'{}')
        if not isinstance(data, dict):
            raise ValueError('Corpo da requisição inválido.')
        return data

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/api/health':
            try:
                with database() as db:
                    db.execute('SELECT 1')
                self.send_json(200, {'ok': True})
            except DB_ERRORS:
                self.send_json(503, {'ok': False})
            return
        if path == '/api/session':
            if not AUTH_ENABLED:
                return self.send_json(200, {'authenticated': True, 'loginRequired': False})
            username = session_username(self.headers.get('Cookie'))
            if username and hmac.compare_digest(username, APP_USERNAME):
                return self.send_json(200, {'authenticated': True, 'loginRequired': True})
            return self.send_json(401, {'authenticated': False, 'loginRequired': True})
        if path == '/api/tickets':
            if not self.authenticated():
                return self.send_json(401, {'error': 'Faça login para acessar os chamados.'})
            try:
                with database() as db:
                    rows = db.execute('''
                        SELECT t.id, c.name AS client, t.service_name AS name, t.description, t.phone,
                               t.priority, t.status, t.created_at AS "createdAt"
                        FROM tickets t JOIN clients c ON c.id = t.client_id
                        ORDER BY t.created_at DESC, t.id DESC
                    ''').fetchall()
                self.send_json(200, [ticket_dict(row) for row in rows])
            except DB_ERRORS:
                self.send_json(500, {'error': 'Erro ao ler os chamados no banco de dados.'})
            return
        if path in self.PUBLIC_FILES:
            if path in {'/', '/index.html'} and not self.authenticated():
                return self.send_login_redirect()
            return super().do_GET()
        self.send_error(404, 'Arquivo não encontrado.')

    def do_HEAD(self):
        path = urlparse(self.path).path
        if path in self.PUBLIC_FILES and (path not in {'/', '/index.html'} or self.authenticated()):
            return super().do_HEAD()
        self.send_error(404, 'Arquivo não encontrado.')

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            data = self.read_json()
        except (ValueError, json.JSONDecodeError) as error:
            return self.send_json(400, {'error': str(error) or 'Dados inválidos.'})

        if path == '/api/login':
            if not AUTH_ENABLED:
                return self.send_json(400, {'error': 'Login não configurado neste modo local.'})
            username = data.get('username') if isinstance(data.get('username'), str) else ''
            password = data.get('password') if isinstance(data.get('password'), str) else ''
            user_ok = bool(APP_USERNAME) and hmac.compare_digest(username, APP_USERNAME)
            pass_ok = bool(APP_PASSWORD_HASH) and verify_password(password, APP_PASSWORD_HASH)
            if not (user_ok and pass_ok):
                return self.send_json(401, {'error': 'Usuário ou senha incorretos.'})
            cookie = f'{SESSION_COOKIE}={create_session(username)}; Path=/; HttpOnly; SameSite=Strict; Max-Age={SESSION_TTL}'
            if COOKIE_SECURE:
                cookie += '; Secure'
            return self.send_json(200, {'ok': True}, [('Set-Cookie', cookie)])

        if path == '/api/logout':
            if not self.authenticated():
                return self.send_json(401, {'error': 'Sessão encerrada.'})
            cookie = f'{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'
            if COOKIE_SECURE:
                cookie += '; Secure'
            return self.send_json(200, {'ok': True}, [('Set-Cookie', cookie)])

        if path == '/api/public/tickets':
            return self.handle_public_ticket(data)

        if path != '/api/tickets':
            return self.send_json(404, {'error': 'Rota não encontrada.'})
        if not self.authenticated():
            return self.send_json(401, {'error': 'Faça login para cadastrar chamados.'})

        fields = parse_ticket(data)
        if fields is None:
            return self.send_json(400, {'error': 'Confira os campos e tente novamente.'})
        try:
            self.send_json(201, create_ticket(*fields))
        except DB_ERRORS:
            self.send_json(500, {'error': 'Erro ao gravar o chamado no banco de dados.'})

    def do_PATCH(self):
        parts = urlparse(self.path).path.strip('/').split('/')
        if len(parts) != 3 or parts[:2] != ['api', 'tickets']:
            return self.send_json(404, {'error': 'Rota não encontrada.'})
        if not self.authenticated():
            return self.send_json(401, {'error': 'Faça login para atualizar chamados.'})
        try:
            ticket_id = int(parts[2])
            status = self.read_json().get('status')
            if ticket_id < 1 or status not in STATUSES:
                return self.send_json(400, {'error': 'Identificador ou status inválido.'})
            updated_at = 'NOW()' if USE_POSTGRES else "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
            with database() as db:
                cursor = db.execute(
                    f'UPDATE tickets SET status = ?, updated_at = {updated_at} WHERE id = ?',
                    (status, ticket_id)
                )
            if cursor.rowcount == 0:
                return self.send_json(404, {'error': 'Chamado não encontrado.'})
            self.send_json(200, {'id': str(ticket_id), 'status': status})
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(400, {'error': str(error) or 'Identificador ou dados inválidos.'})
        except DB_ERRORS:
            self.send_json(500, {'error': 'Erro ao atualizar o chamado no banco de dados.'})

    def do_DELETE(self):
        parts = urlparse(self.path).path.strip('/').split('/')
        if len(parts) != 3 or parts[:2] != ['api', 'tickets']:
            return self.send_json(404, {'error': 'Rota não encontrada.'})
        if not self.authenticated():
            return self.send_json(401, {'error': 'Faça login para excluir chamados.'})
        try:
            ticket_id = int(parts[2])
            if ticket_id < 1:
                raise ValueError
            with database() as db:
                cursor = db.execute('DELETE FROM tickets WHERE id = ?', (ticket_id,))
            if cursor.rowcount == 0:
                return self.send_json(404, {'error': 'Chamado não encontrado.'})
            self.send_json(204)
        except ValueError:
            self.send_json(400, {'error': 'Identificador inválido.'})
        except DB_ERRORS:
            self.send_json(500, {'error': 'Erro ao excluir o chamado do banco de dados.'})


def configure_auth():
    if not AUTH_ENABLED:
        return
    if USE_POSTGRES and psycopg is None:
        raise RuntimeError('Dependência PostgreSQL ausente. Execute pip install -r requirements.txt.')
    if not APP_USERNAME or not APP_PASSWORD_HASH or not SESSION_SECRET:
        raise RuntimeError('Configure APP_USERNAME, APP_PASSWORD_HASH e SESSION_SECRET nas variáveis do serviço.')
    if len(SESSION_SECRET) < 32:
        raise RuntimeError('SESSION_SECRET deve ter pelo menos 32 caracteres aleatórios.')
    try:
        algorithm, n, r, p, salt, expected = APP_PASSWORD_HASH.split('$')
        if (algorithm != 'scrypt' or int(n) != 16384 or int(r) != 8 or int(p) != 1
                or len(decode_urlsafe(salt)) != 16 or len(decode_urlsafe(expected)) != 32):
            raise ValueError
    except (ValueError, TypeError):
        raise RuntimeError('APP_PASSWORD_HASH inválido; gere um com python server.py --hash-password.')
    if not APP_USERNAME.isascii():
        raise RuntimeError('APP_USERNAME deve conter apenas caracteres ASCII.')


def main():
    if sys.argv[1:] == ['--configure-admin']:
        username = input('Usuário administrativo [adm]: ').strip() or 'adm'
        if not username.isascii() or len(username) > 100:
            raise SystemExit('O usuário deve ter até 100 caracteres ASCII.')
        password = getpass.getpass('Senha administrativa: ')
        confirmation = getpass.getpass('Repita a senha: ')
        if len(password) < 6 or password != confirmation:
            raise SystemExit('As senhas devem ser iguais e ter pelo menos 6 caracteres.')
        env_file = BASE_DIR / '.env'
        values = {}
        if env_file.is_file():
            for line in env_file.read_text(encoding='utf-8').splitlines():
                if '=' in line and not line.lstrip().startswith('#'):
                    key, value = line.split('=', 1)
                    values[key.strip()] = value.strip()
        values.update({
            'APP_USERNAME': username,
            'APP_PASSWORD_HASH': password_hash(password),
            'SESSION_SECRET': secrets.token_urlsafe(48),
            'COOKIE_SECURE': 'false',
        })
        env_file.write_text(''.join(f'{key}={value}\n' for key, value in values.items()), encoding='utf-8')
        try:
            os.chmod(env_file, 0o600)
        except OSError:
            pass
        print(f'Credenciais locais configuradas em {env_file.name}. Não compartilhe esse arquivo.')
        return

    if sys.argv[1:] == ['--hash-password']:
        password = getpass.getpass('Nova senha de acesso: ')
        confirmation = getpass.getpass('Repita a senha: ')
        if len(password) < 12 or password != confirmation:
            raise SystemExit('As senhas devem ser iguais e ter pelo menos 12 caracteres.')
        print(password_hash(password))
        return

    if not USE_POSTGRES and not AUTH_ENABLED:
        raise SystemExit('Configure o acesso administrativo primeiro: python server.py --configure-admin')

    configure_auth()
    initialize_db()
    host = '0.0.0.0' if USE_POSTGRES else '127.0.0.1'
    server = ThreadingHTTPServer((host, PORT), Handler)
    print(f'MatheusFlow disponível em http://{host}:{PORT}')
    print(f'Banco: {"PostgreSQL hospedado" if USE_POSTGRES else DB_PATH}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServidor encerrado.')
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
