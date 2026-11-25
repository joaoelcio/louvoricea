"""API SQLite para Escala do Louvor, sem dependências externas."""
from contextlib import closing
from datetime import date
from hashlib import pbkdf2_hmac, sha256
from hmac import compare_digest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import re
import secrets
import sqlite3
import time
import unicodedata
from pathlib import Path

DB = os.environ.get("LOUVOR_DB", "louvor.sqlite")
ORIGIN = os.environ.get("LOUVOR_ORIGIN", "http://localhost:8765")
DOCS = Path(__file__).resolve().parents[1] / "docs"
INSTRUMENTS = {"Bateria", "Baixo elétrico", "Teclado", "Guitarra", "Violão", "Percussão"}
VOICES = {"Soprano", "Contralto", "Tenor", "Barítono", "Baixo"}
ROLES = INSTRUMENTS | {"Vocal • " + voice for voice in VOICES}
FIELDS = ("formation", "exceptions", "drafts", "published")


class Invalid(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def connect():
    db = sqlite3.connect(DB, timeout=10)
    db.row_factory = sqlite3.Row
    return db


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 600000)
    return salt + ":" + digest.hex()


def password_ok(password):
    if not isinstance(password, str) or not 8 <= len(password) <= 256:
        raise Invalid("A senha deve ter de 8 a 256 caracteres.")
    return password


def pack(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def init():
    with closing(connect()) as db, db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS person (
              id TEXT PRIMARY KEY, login TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
              profile TEXT NOT NULL, force INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS session (
              token TEXT PRIMARY KEY, person TEXT NOT NULL, expires INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS availability (
              person TEXT, month TEXT, dates TEXT NOT NULL, PRIMARY KEY(person,month)
            );
            CREATE TABLE IF NOT EXISTS schedule (
              id INTEGER PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS login_attempt (
              scope TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires INTEGER NOT NULL
            );
        """)
        db.execute("INSERT OR IGNORE INTO schedule VALUES(1,0,?)", (pack(dict.fromkeys(FIELDS, {})),))
        if not db.execute("SELECT 1 FROM person WHERE id='admin'").fetchone():
            password = os.environ.get("LOUVOR_INITIAL_PASSWORD")
            if not password:
                raise SystemExit("Defina LOUVOR_INITIAL_PASSWORD para criar o administrador.")
            if password != "icea":
                password_ok(password)
            profile = dict(id="admin", name="Administração", email="", role="admin", voice="", instruments=[], talk=False, active=True)
            db.execute("INSERT INTO person VALUES(?,?,?,?,1)", ("admin", "admin", hash_password(password), pack(profile)))


def authenticate(db, token):
    row = db.execute("""SELECT person.* FROM session JOIN person ON person.id=session.person
                       WHERE token=? AND expires>?""", (token, int(time.time()))).fetchone()
    if not row or not json.loads(row["profile"])["active"]:
        raise Invalid("Entre novamente para continuar.", 401)
    return row


def sunday(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value) or date.fromisoformat(value).weekday() != 6:
        raise Invalid("Informe um domingo válido.")


def availability(db, person=None):
    query = "SELECT person,month,dates FROM availability"
    rows = db.execute(query + " WHERE person=?", (person,)) if person else db.execute(query)
    available, responded = {}, {}
    for row in rows:
        month = row["month"]
        available.setdefault(row["person"], []).extend(json.loads(row["dates"]))
        responded.setdefault(row["person"], []).extend(value for day in range(1,32)
            if (value := f"{month}-{day:02}") and valid_sunday(value))
    return available, responded


def valid_sunday(value):
    try:
        return date.fromisoformat(value).weekday() == 6
    except ValueError:
        return False


def instrument_key(name):
    return "".join(char for char in unicodedata.normalize("NFD", name.casefold())
                   if not unicodedata.combining(char))


def catalog(custom):
    taken = {instrument_key(name) for name in INSTRUMENTS} | {"baixo","talkback","constructor","prototype","__proto__"}
    if not isinstance(custom,list) or len(custom) > 100:
        raise Invalid("Catálogo de instrumentos inválido.")
    for name in custom:
        if not isinstance(name,str) or not 1 <= len(name) <= 60 or name != " ".join(name.split()) or not any(char.isalnum() for char in name):
            raise Invalid("Informe um nome válido para o instrumento.")
        key = instrument_key(name)
        if key in taken or name.startswith("Vocal • "):
            raise Invalid("Instrumento duplicado ou inválido.")
        taken.add(key)
    return INSTRUMENTS | set(custom)


def check_formation(value, roles):
    if not isinstance(value, dict) or any(role not in roles or type(count) is not int or not 0 <= count <= 12 for role,count in value.items()):
        raise Invalid("Formação inválida.")


def verified_day(day, key, people, available, roles):
    sunday(key)
    if day["date"] != key or len(day["slots"]) > len(roles)*12:
        raise Invalid("Escala inválida.")
    assignments = {}
    public_slots = []
    for slot in day["slots"]:
        role, person_id = slot["role"], slot["person"]
        if role not in roles:
            raise Invalid("Função inválida.")
        name = ""
        if person_id:
            person = people.get(person_id)
            eligible = person and (role in person["instruments"] or role == "Vocal • " + person["voice"])
            if not eligible or not person["active"] or key not in available.get(person_id, []):
                raise Invalid("A escala inclui um integrante indisponível ou sem a função exigida. Revise o rascunho.")
            assignments.setdefault(person_id, []).append(role)
            name = person["name"]
        public_slots.append(dict(role=role,name=name,isTalkback=bool(person_id and person_id == day["talk"] and role in roles and not role.startswith("Vocal • "))))
    for assigned in assignments.values():
        if len(assigned) > 1 and not (len(assigned) == 2 and "Violão" in assigned and any(role.startswith("Vocal • ") for role in assigned)):
            raise Invalid("Cada integrante pode ocupar uma função, com exceção de vocal e violão.")
    talk = day["talk"]
    if talk and (talk not in assignments or not people[talk]["talk"] or any(role.startswith("Vocal • ") for role in assignments[talk])):
        raise Invalid("O talkback exige um músico habilitado escalado somente no instrumento.")
    return dict(date=key,slots=public_slots,talkName=people[talk]["name"] if talk else "")


def save_schedule(db, body):
    row = db.execute("SELECT * FROM schedule WHERE id=1").fetchone()
    if body["version"] != row["version"]:
        raise Invalid("Outro acesso alterou a escala. Atualize a tela e revise antes de salvar.",409)
    previous = json.loads(row["data"])
    data = {key: body[key] for key in FIELDS}
    custom = body.get("customInstruments", [])
    instruments = catalog(custom)
    if not set(previous.get("customInstruments", [])) <= instruments:
        raise Invalid("O catálogo deve manter os instrumentos já cadastrados.")
    data["customInstruments"] = custom
    roles = ROLES | instruments
    check_formation(data["formation"], roles)
    for key, value in data["exceptions"].items():
        sunday(key)
        check_formation(value, roles)
    people = {person["id"]:json.loads(person["profile"]) for person in db.execute("SELECT id,profile FROM person")}
    available, _ = availability(db)
    for key, day in data["drafts"].items():
        if day != previous["drafts"].get(key):
            verified_day(day,key,people,available,roles)
    removed = set(previous["drafts"]) - set(data["drafts"])
    published = previous["published"]
    for key in removed:
        published[key] = verified_day(previous["drafts"][key],key,people,available,roles)
    if set(data["published"]) != set(published):
        raise Invalid("Publique apenas domingos com rascunho salvo.")
    data["published"] = published
    db.execute("UPDATE schedule SET data=?,version=version+1 WHERE id=1",(pack(data),))


def delete_schedules(db, body):
    row = db.execute("SELECT * FROM schedule WHERE id=1").fetchone()
    if body["version"] != row["version"]:
        raise Invalid("Outro acesso alterou a escala. Atualize a tela e revise antes de salvar.",409)
    kind, dates = body["kind"], body["dates"]
    if kind not in {"drafts","published"} or not isinstance(dates,list) or not dates:
        raise Invalid("Selecione as escalas para excluir.")
    data = json.loads(row["data"])
    for day in dates:
        sunday(day)
        data[kind].pop(day,None)
    db.execute("UPDATE schedule SET data=?,version=version+1 WHERE id=1",(pack(data),))


def save_person(db, body, admin):
    identifier = body["id"]
    if not re.fullmatch(r"[0-9a-f-]{36}", identifier):
        raise Invalid("Cadastro inválido.")
    old = db.execute("SELECT * FROM person WHERE id=?", (identifier,)).fetchone()
    if (old and json.loads(old["profile"])["role"] != "integrante" and not admin) or body["role"] not in ({"lider","integrante"} if admin else {"integrante"}):
        raise Invalid("Você não pode editar este perfil.",403)
    profile = {key:body[key] for key in ("id","name","email","role","voice","instruments","talk","active")}
    profile["email"] = profile["email"].strip().lower()
    profile["name"] = profile["name"].strip()
    if not 1 <= len(profile["name"]) <= 120 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", profile["email"]):
        raise Invalid("Informe nome e e-mail válidos.")
    schedule = json.loads(db.execute("SELECT data FROM schedule WHERE id=1").fetchone()["data"])
    instruments = catalog(schedule.get("customInstruments", []))
    if profile["voice"] not in VOICES | {""} or not set(profile["instruments"]) <= instruments or (profile["talk"] and not profile["instruments"]):
        raise Invalid("Confira os instrumentos, a classificação vocal e o talkback.")
    try:
        if old:
            db.execute("UPDATE person SET login=?,profile=? WHERE id=?", (profile["email"],pack(profile),identifier))
            if not profile["active"] or json.loads(old["profile"])["role"] != profile["role"]:
                db.execute("DELETE FROM session WHERE person=?", (identifier,))
        else:
            db.execute("INSERT INTO person VALUES(?,?,?,?,1)", (identifier,profile["email"],hash_password(password_ok(body["password"])),pack(profile)))
    except sqlite3.IntegrityError as exc:
        raise Invalid("Este e-mail já está em uso.") from exc


def check_login(db, body, client):
    login = body["login"].strip().lower()
    now = int(time.time())
    scopes = ("ip:" + client, "login:" + login)
    db.execute("DELETE FROM login_attempt WHERE expires<=?", (now,))
    for scope, limit in zip(scopes,(60,12)):
        row = db.execute("SELECT attempts FROM login_attempt WHERE scope=?", (scope,)).fetchone()
        if row and row["attempts"] >= limit:
            db.commit()
            raise Invalid("Muitas tentativas. Tente novamente em 10 minutos.",429)
    row = db.execute("SELECT * FROM person WHERE login=?", (login,)).fetchone()
    stored = row["password"] if row else "0"*32 + ":" + "0"*64
    password = body["password"]
    valid = isinstance(password,str) and len(password) <= 256 and compare_digest(stored,hash_password(password,stored.split(":")[0]))
    if not valid or not row or not json.loads(row["profile"])["active"]:
        for scope in scopes:
            db.execute("""INSERT INTO login_attempt VALUES(?,1,?)
                          ON CONFLICT(scope) DO UPDATE SET attempts=attempts+1""", (scope,now+600))
        db.commit()
        raise Invalid("Usuário ou senha inválidos.",401)
    db.execute("DELETE FROM login_attempt WHERE scope=?", (scopes[1],))
    db.execute("DELETE FROM session WHERE expires<=?", (now,))
    token = secrets.token_urlsafe(32)
    db.execute("INSERT INTO session VALUES(?,?,?)", (sha256(token.encode()).hexdigest(),row["id"],now+12*3600))
    return {"token":token}


class Handler(BaseHTTPRequestHandler):
    def cors(self):
        if self.headers.get("Origin") == ORIGIN:
            self.send_header("Access-Control-Allow-Origin",ORIGIN)
        self.send_header("Vary","Origin")

    def answer(self, data, status=200):
        raw = pack(data).encode()
        self.send_response(status)
        self.cors()
        self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Cache-Control","no-store")
        self.send_header("Content-Length",str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Access-Control-Allow-Headers","Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods","GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/"):
            self.route()
            return
        name = self.path.split("?")[0].lstrip("/") or "index.html"
        allowed = {"index.html","style.css","app.js","engine.js","excel.js","pdf.js","config.js"}
        if name not in allowed:
            self.send_error(404)
            return
        content = b"export const API_URL = location.origin;" if name == "config.js" else (DOCS / name).read_bytes()
        mime = {"html":"text/html","js":"text/javascript","css":"text/css"}[name.rsplit(".",1)[-1]]
        self.send_response(200)
        self.send_header("Content-Type",mime + "; charset=utf-8")
        self.send_header("Content-Length",str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self):
        self.route()

    def route(self):
        try:
            path = self.path.removeprefix("/api/")
            post = self.command == "POST"
            size = int(self.headers.get("Content-Length",0))
            if size < 0 or size > 2_000_000:
                raise Invalid("Solicitação muito grande.",413)
            body = json.loads(self.rfile.read(size)) if post else {}
            if post and not isinstance(body, dict):
                raise Invalid("Solicitação inválida.")
            token = sha256(self.headers.get("Authorization","").removeprefix("Bearer ").encode()).hexdigest()
            with closing(connect()) as db, db:
                if post:
                    db.execute("BEGIN IMMEDIATE")
                result = self.dispatch(db,path,post,body,token)
        except Invalid as error:
            self.answer({"error":str(error)},error.status)
        except (KeyError, TypeError, ValueError, AttributeError):
            self.answer({"error":"Solicitação inválida."},400)
        except sqlite3.OperationalError:
            self.answer({"error":"Banco de dados temporariamente ocupado. Tente novamente."},503)
        else:
            self.answer(result)

    def dispatch(self, db, path, post, body, token):
        if post and path == "login":
            return check_login(db,body,self.client_address[0])
        row = authenticate(db,token)
        profile = json.loads(row["profile"])
        admin = profile["role"] == "admin"
        leader = admin or profile["role"] == "lider"
        if not post and path == "state":
            record = db.execute("SELECT * FROM schedule WHERE id=1").fetchone()
            state = json.loads(record["data"])
            if not leader or row["force"]:
                state = {"published": {} if row["force"] else state["published"]}
            if not row["force"]:
                state["availability"],state["responded"] = availability(db,None if leader else row["id"])
                if leader:
                    state["people"] = [json.loads(item["profile"]) for item in db.execute("SELECT profile FROM person")]
            state["version"] = record["version"]
            return {"me": {**profile,"force":bool(row["force"])},"state":state}
        if not post:
            raise Invalid("Página não encontrada.",404)
        if path == "logout":
            db.execute("DELETE FROM session WHERE token=?", (token,))
        elif path == "password":
            stored = row["password"]
            if not compare_digest(stored,hash_password(body["current"],stored.split(":")[0])):
                raise Invalid("Senha atual incorreta.")
            password = password_ok(body["password"])
            db.execute("UPDATE person SET password=?,force=0 WHERE id=?", (hash_password(password),row["id"]))
            db.execute("DELETE FROM session WHERE person=? AND token<>?", (row["id"],token))
        elif row["force"]:
            raise Invalid("Troque sua senha temporária para continuar.",403)
        elif path == "availability":
            month, dates = body["month"],body["dates"]
            if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])",month) or not isinstance(dates,list) or len(dates)>5:
                raise Invalid("Mês inválido.")
            for day in dates:
                sunday(day)
                if not day.startswith(month + "-"):
                    raise Invalid("A data está fora do mês selecionado.")
            db.execute("INSERT OR REPLACE INTO availability VALUES(?,?,?)", (row["id"],month,pack(sorted(set(dates)))))
            db.execute("UPDATE schedule SET version=version+1 WHERE id=1")
        elif path == "schedule" and leader:
            save_schedule(db,body)
        elif path == "delete-schedules" and leader:
            delete_schedules(db,body)
        elif path == "person" and leader:
            save_person(db,body,admin)
            db.execute("UPDATE schedule SET version=version+1 WHERE id=1")
        elif path == "reset" and admin:
            identifier = body["id"]
            if identifier == "admin" or not db.execute("SELECT 1 FROM person WHERE id=?", (identifier,)).fetchone():
                raise Invalid("Conta inválida.")
            db.execute("UPDATE person SET password=?,force=1 WHERE id=?", (hash_password(password_ok(body["password"])),identifier))
            db.execute("DELETE FROM session WHERE person=?", (identifier,))
        else:
            raise Invalid("Você não tem permissão para esta ação.",403)
        return {"ok":True}


if __name__ == "__main__":
    init()
    port = int(os.environ.get("PORT",8765))
    print(f"Escala do Louvor na porta {port}",flush=True)
    ThreadingHTTPServer((os.environ.get("LOUVOR_HOST","127.0.0.1"),port),Handler).serve_forever()
