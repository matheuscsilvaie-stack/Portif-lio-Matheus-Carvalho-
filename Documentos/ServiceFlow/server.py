#!/usr/bin/env python3
"""API local do MatheusFlow usando SQLite, incluído na biblioteca padrão."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from contextlib import contextmanager
import json
import os
import sqlite3

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get('SERVICEFLOW_DB', BASE_DIR / 'serviceflow.db'))
PORT = int(os.environ.get('PORT', '3000'))
STATUSES = ('Pendente', 'Em andamento', 'Concluído')
PRIORITIES = ('normal', 'alta', 'urgente')


def connect_db():
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys = ON')
    return db


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
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with database() as db:
        db.execute('PRAGMA journal_mode = WAL')
        db.executescript('''
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
        ''')


def ticket_dict(row):
    return {
        'id': str(row['id']),
        'client': row['client'],
        'name': row['name'],
        'description': row['description'],
        'priority': row['priority'],
        'status': row['status'],
        'createdAt': row['createdAt'],
    }


class Handler(SimpleHTTPRequestHandler):
    PUBLIC_FILES = {'/', '/index.html', '/style.css', '/script.js', '/media/matheusflow-logo.jpeg'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def log_message(self, fmt, *args):
        print(f'[{self.log_date_time_string()}] {fmt % args}')

    def send_json(self, status, payload=None):
        body = b'' if payload is None else json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        if body:
            self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get('Content-Length', '0'))
        if length > 20_000:
            raise ValueError('Requisição muito grande.')
        data = json.loads(self.rfile.read(length) or b'{}')
        if not isinstance(data, dict):
            raise ValueError('Corpo da requisição inválido.')
        return data

    def do_GET(self):
        path = urlparse(self.path).path
        if path != '/api/tickets':
            if path in self.PUBLIC_FILES:
                return super().do_GET()
            return self.send_error(404, 'Arquivo não encontrado.')
        try:
            with database() as db:
                rows = db.execute('''
                    SELECT t.id, c.name AS client, t.service_name AS name, t.description,
                           t.priority, t.status, t.created_at AS createdAt
                    FROM tickets t JOIN clients c ON c.id = t.client_id
                    ORDER BY t.created_at DESC, t.id DESC
                ''').fetchall()
            self.send_json(200, [ticket_dict(row) for row in rows])
        except sqlite3.Error:
            self.send_json(500, {'error': 'Erro ao ler os chamados no banco de dados.'})

    def do_HEAD(self):
        if urlparse(self.path).path in self.PUBLIC_FILES:
            return super().do_HEAD()
        return self.send_error(404, 'Arquivo não encontrado.')

    def do_POST(self):
        if urlparse(self.path).path != '/api/tickets':
            return self.send_json(404, {'error': 'Rota não encontrada.'})
        try:
            data = self.read_json()
            client = data.get('client', '').strip() if isinstance(data.get('client'), str) else ''
            name = data.get('name', '').strip() if isinstance(data.get('name'), str) else ''
            description = data.get('description', '').strip() if isinstance(data.get('description', ''), str) else None
            priority = data.get('priority', 'normal')
            description = description if description is not None else None
            if (not client or len(client) > 100 or not name or len(name) > 120
                    or description is None or len(description) > 1000
                    or not isinstance(priority, str) or priority not in PRIORITIES):
                return self.send_json(400, {'error': 'Confira os campos e tente novamente.'})
            with database() as db:
                cursor = db.execute('INSERT INTO clients (name) VALUES (?)', (client,))
                client_id = cursor.lastrowid
                cursor = db.execute('''
                    INSERT INTO tickets (client_id, service_name, description, priority)
                    VALUES (?, ?, ?, ?)
                ''', (client_id, name, description, priority))
                ticket_id = cursor.lastrowid
                row = db.execute('''
                    SELECT t.id, c.name AS client, t.service_name AS name, t.description,
                           t.priority, t.status, t.created_at AS createdAt
                    FROM tickets t JOIN clients c ON c.id = t.client_id WHERE t.id = ?
                ''', (ticket_id,)).fetchone()
            self.send_json(201, ticket_dict(row))
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(400, {'error': str(error) or 'Dados inválidos.'})
        except sqlite3.Error:
            self.send_json(500, {'error': 'Erro ao gravar o chamado no banco de dados.'})

    def do_PATCH(self):
        parts = urlparse(self.path).path.strip('/').split('/')
        if len(parts) != 3 or parts[:2] != ['api', 'tickets']:
            return self.send_json(404, {'error': 'Rota não encontrada.'})
        try:
            ticket_id = int(parts[2])
            data = self.read_json()
            status = data.get('status')
            if ticket_id < 1 or status not in STATUSES:
                return self.send_json(400, {'error': 'Identificador ou status inválido.'})
            with database() as db:
                cursor = db.execute('''
                    UPDATE tickets SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    WHERE id = ?
                ''', (status, ticket_id))
            if cursor.rowcount == 0:
                return self.send_json(404, {'error': 'Chamado não encontrado.'})
            self.send_json(200, {'id': str(ticket_id), 'status': status})
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(400, {'error': str(error) or 'Identificador ou dados inválidos.'})
        except sqlite3.Error:
            self.send_json(500, {'error': 'Erro ao atualizar o chamado no banco de dados.'})

    def do_DELETE(self):
        parts = urlparse(self.path).path.strip('/').split('/')
        if len(parts) != 3 or parts[:2] != ['api', 'tickets']:
            return self.send_json(404, {'error': 'Rota não encontrada.'})
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
        except sqlite3.Error:
            self.send_json(500, {'error': 'Erro ao excluir o chamado do banco de dados.'})


if __name__ == '__main__':
    initialize_db()
    server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    print(f'MatheusFlow disponível em http://127.0.0.1:{PORT}')
    print(f'Banco de dados: {DB_PATH}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServidor encerrado.')
    finally:
        server.server_close()
