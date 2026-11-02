"""API local do Cidade Invisível com contas e relatos da comunidade.

Execute com ``flask --app app run`` a partir desta pasta. Os registros ficam
em SQLite e o caminho pode ser configurado com URBANIX_DB_PATH.
"""

import os
import secrets
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from flask import Flask, jsonify, request, send_file, session
from werkzeug.security import check_password_hash, generate_password_hash


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("URBANIX_DB_PATH", BASE_DIR / "instance" / "urbanix.sqlite3"))
CATEGORIAS = {"infraestrutura", "acessibilidade", "iluminacao", "residuos", "outros"}

app = Flask(__name__)


def chave_sessao():
    configured = os.environ.get("URBANIX_SECRET_KEY")
    if configured:
        return configured
    key_path = DB_PATH.parent / ".session-key"
    key_path.parent.mkdir(parents=True, exist_ok=True)
    if not key_path.exists():
        key_path.write_text(secrets.token_hex(32), encoding="utf-8")
        try:
            key_path.chmod(0o600)
        except OSError:
            pass
    return key_path.read_text(encoding="utf-8").strip()


app.config.update(
    SECRET_KEY=chave_sessao(),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)


@app.before_request
def exigir_login_na_api():
    publicos = {"home", "session_atual", "entrar", "cadastrar"}
    if request.path.startswith("/api/") and request.endpoint not in publicos:
        if not session.get("usuario_id"):
            return jsonify(error="Faça login para continuar."), 401


@contextmanager
def conectar():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def inicializar_banco():
    with conectar() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS occurrences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                titulo TEXT NOT NULL,
                categoria TEXT NOT NULL,
                bairro TEXT NOT NULL,
                descricao TEXT NOT NULL DEFAULT '',
                gravidade INTEGER NOT NULL CHECK (gravidade BETWEEN 1 AND 5),
                latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
                longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
                confirmacoes INTEGER NOT NULL DEFAULT 0 CHECK (confirmacoes >= 0),
                usuario_id INTEGER REFERENCES usuarios(id),
                criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
                senha_hash TEXT NOT NULL,
                papel TEXT NOT NULL DEFAULT 'usuario' CHECK (papel IN ('admin', 'usuario')),
                criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            )"""
        )
        columns = {row[1] for row in conn.execute("PRAGMA table_info(occurrences)")}
        if "usuario_id" not in columns:
            conn.execute("ALTER TABLE occurrences ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id)")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS occurrence_confirmations (
                occurrence_id INTEGER NOT NULL REFERENCES occurrences(id) ON DELETE CASCADE,
                voter_key TEXT NOT NULL,
                criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                PRIMARY KEY (occurrence_id, voter_key)
            )"""
        )
        columns = {row[1] for row in conn.execute("PRAGMA table_info(occurrences)")}
        if "confirmacoes" not in columns:
            conn.execute(
                "ALTER TABLE occurrences ADD COLUMN confirmacoes INTEGER NOT NULL DEFAULT 0"
            )
        if conn.execute("SELECT 1 FROM usuarios WHERE usuario = 'adm' COLLATE NOCASE").fetchone() is None:
            conn.execute(
                "INSERT INTO usuarios (usuario, senha_hash, papel) VALUES (?, ?, 'admin')",
                ("adm", generate_password_hash("adm")),
            )


def serializar(row):
    return dict(row)


@app.get("/api/session")
def session_atual():
    inicializar_banco()
    usuario_id = session.get("usuario_id")
    if not usuario_id:
        return jsonify(error="Sessão não autenticada."), 401
    with conectar() as conn:
        row = conn.execute(
            "SELECT id, usuario, papel FROM usuarios WHERE id = ?", (usuario_id,)
        ).fetchone()
    if row is None:
        session.clear()
        return jsonify(error="Sessão não autenticada."), 401
    return jsonify(id=row["id"], usuario=row["usuario"], papel=row["papel"])


@app.post("/api/login")
def entrar():
    inicializar_banco()
    payload = request.get_json(silent=True) or {}
    usuario = payload.get("usuario", "")
    senha = payload.get("senha", "")
    if not isinstance(usuario, str) or not isinstance(senha, str):
        return jsonify(error="Informe usuário e senha."), 400
    with conectar() as conn:
        row = conn.execute(
            "SELECT id, usuario, senha_hash, papel FROM usuarios WHERE usuario = ? COLLATE NOCASE",
            (usuario.strip(),),
        ).fetchone()
    if row is None or not check_password_hash(row["senha_hash"], senha):
        return jsonify(error="Usuário ou senha incorretos."), 401
    session.clear()
    session["usuario_id"] = row["id"]
    return jsonify(id=row["id"], usuario=row["usuario"], papel=row["papel"])


@app.post("/api/register")
def cadastrar():
    inicializar_banco()
    payload = request.get_json(silent=True) or {}
    usuario = payload.get("usuario", "")
    senha = payload.get("senha", "")
    if not isinstance(usuario, str) or not isinstance(senha, str):
        return jsonify(error="Informe usuário e senha."), 400
    usuario = usuario.strip()
    if not 3 <= len(usuario) <= 32 or not usuario.replace("_", "").isalnum():
        return jsonify(error="Use de 3 a 32 letras, números ou sublinhados no usuário."), 400
    if len(senha) < 8:
        return jsonify(error="A senha deve ter pelo menos 8 caracteres."), 400
    try:
        with conectar() as conn:
            cursor = conn.execute(
                "INSERT INTO usuarios (usuario, senha_hash, papel) VALUES (?, ?, 'usuario')",
                (usuario, generate_password_hash(senha)),
            )
            usuario_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        return jsonify(error="Esse usuário já existe."), 409
    session.clear()
    session["usuario_id"] = usuario_id
    return jsonify(id=usuario_id, usuario=usuario, papel="usuario"), 201


@app.post("/api/logout")
def sair():
    session.clear()
    return jsonify(ok=True)


@app.get("/")
def home():
    return send_file(BASE_DIR / "index.html")


@app.get("/api/occurrences")
def listar_ocorrencias():
    inicializar_banco()
    with conectar() as conn:
        rows = conn.execute("SELECT * FROM occurrences ORDER BY id DESC").fetchall()
    return jsonify([serializar(row) for row in rows])


@app.post("/api/occurrences")
def criar_ocorrencia():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(error="Envie um objeto JSON válido."), 400

    titulo = payload.get("titulo")
    categoria = payload.get("categoria")
    bairro = payload.get("bairro")
    descricao = payload.get("descricao", "")
    if not all(isinstance(value, str) and value.strip() for value in (titulo, categoria, bairro)):
        return jsonify(error="Título, categoria e bairro são obrigatórios."), 400
    if len(titulo.strip()) > 100 or len(bairro.strip()) > 100:
        return jsonify(error="Título ou bairro excede o limite de caracteres."), 400
    if categoria not in CATEGORIAS:
        return jsonify(error="Categoria inválida."), 400
    if not isinstance(descricao, str) or len(descricao) > 1000:
        return jsonify(error="Descrição inválida ou muito longa."), 400

    try:
        gravidade = int(payload.get("gravidade"))
        latitude = float(payload.get("latitude"))
        longitude = float(payload.get("longitude"))
    except (TypeError, ValueError):
        return jsonify(error="Gravidade e coordenadas devem ser numéricas."), 400
    if not 1 <= gravidade <= 5:
        return jsonify(error="Gravidade deve estar entre 1 e 5."), 400
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        return jsonify(error="Coordenadas fora dos limites válidos."), 400

    inicializar_banco()
    with conectar() as conn:
        cursor = conn.execute(
            """INSERT INTO occurrences
               (titulo, categoria, bairro, descricao, gravidade, latitude, longitude, usuario_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (titulo.strip(), categoria, bairro.strip(), descricao.strip(), gravidade, latitude, longitude, session["usuario_id"]),
        )
        row = conn.execute("SELECT * FROM occurrences WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(serializar(row)), 201


@app.post("/api/occurrences/<int:occurrence_id>/confirm")
def confirmar_ocorrencia(occurrence_id):
    voter_key = str(session["usuario_id"])
    inicializar_banco()
    with conectar() as conn:
        exists = conn.execute(
            "SELECT 1 FROM occurrences WHERE id = ?", (occurrence_id,)
        ).fetchone()
        if exists is None:
            return jsonify(error="Ocorrência não encontrada."), 404
        cursor = conn.execute(
            "INSERT OR IGNORE INTO occurrence_confirmations (occurrence_id, voter_key) VALUES (?, ?)",
            (occurrence_id, voter_key),
        )
        if cursor.rowcount == 0:
            row = conn.execute(
                "SELECT * FROM occurrences WHERE id = ?", (occurrence_id,)
            ).fetchone()
            return jsonify(error="Esta conta já confirmou este relato.", occurrence=serializar(row)), 409
        conn.execute(
            "UPDATE occurrences SET confirmacoes = confirmacoes + 1 WHERE id = ?",
            (occurrence_id,),
        )
        row = conn.execute(
            "SELECT * FROM occurrences WHERE id = ?", (occurrence_id,)
        ).fetchone()
    return jsonify(serializar(row))


if __name__ == "__main__":
    app.run(debug=True)
