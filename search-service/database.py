import os
import uuid
from datetime import datetime
import chromadb
from sqlalchemy import create_engine, Column, Integer, String, DateTime, text
from sqlalchemy.orm import declarative_base, sessionmaker

DATA_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_data")
os.makedirs(DATA_DIR, exist_ok=True)

SQLALCHEMY_DATABASE_URL = f"sqlite:///{os.path.join(DATA_DIR, 'notas.db')}"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Nota(Base):
    __tablename__ = "notas"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, index=True)
    title = Column(String)
    content = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Arquivo(Base):
    __tablename__ = "arquivos"

    id = Column(String, primary_key=True, index=True)
    username = Column(String, index=True)
    filename = Column(String)
    disk_path = Column(String)
    has_text = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(bind=engine)

try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE arquivos ADD COLUMN has_text INTEGER DEFAULT 1"))
        conn.commit()
except Exception:
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

client = chromadb.PersistentClient(path=DATA_DIR)
collection = client.get_or_create_collection(
    name="documentos",
    metadata={"hnsw:space": "cosine"}
)

def adicionar_documento(nome_ficheiro: str, chunks: list[str], username: str, disk_path: str, has_text: bool, source: str = "arquivo"):
    doc_id = str(uuid.uuid4())
    db = SessionLocal()
    try:
        novo_arquivo = Arquivo(
            id=doc_id,
            username=username,
            filename=nome_ficheiro,
            disk_path=disk_path,
            has_text=1 if has_text else 0
        )
        db.add(novo_arquivo)
        db.commit()
    finally:
        db.close()

    if has_text and chunks:
        ids = [f"{doc_id}_chunk_{i}" for i in range(len(chunks))]
        metadatas = [
            {
                "doc_id": doc_id,
                "filename": nome_ficheiro,
                "chunk_index": i,
                "username": username,
                "source": source
            }
            for i in range(len(chunks))
        ]
        collection.add(documents=chunks, ids=ids, metadatas=metadatas)

    return doc_id

def listar_documentos(username: str):
    db = SessionLocal()
    try:
        arquivos = db.query(Arquivo).filter(Arquivo.username == username).order_by(Arquivo.created_at.desc()).all()
        return [
            {
                "doc_id": a.id,
                "filename": a.filename,
                "has_text": bool(a.has_text)
            }
            for a in arquivos
        ]
    finally:
        db.close()

def apagar_documento(doc_id: str, username: str, is_nota: bool = False):
    try:
        results = collection.get(
            where={"$and": [{"doc_id": doc_id}, {"username": username}]},
        )
        if results and results["ids"]:
            collection.delete(ids=results["ids"])
    except Exception as e:
        print(f"ChromaDB delete exception: {e}")

    if is_nota:
        return True

    db = SessionLocal()
    try:
        arquivo = db.query(Arquivo).filter(Arquivo.id == doc_id, Arquivo.username == username).first()
        if arquivo:
            if arquivo.disk_path and os.path.exists(arquivo.disk_path):
                try:
                    os.remove(arquivo.disk_path)
                except OSError as e:
                    print(f"Error removing disk file: {e}")
            db.delete(arquivo)
            db.commit()
            return True
        return False
    finally:
        db.close()

def renomear_documento(doc_id: str, username: str, novo_nome: str):
    db = SessionLocal()
    sucesso = False
    try:
        arquivo = db.query(Arquivo).filter(Arquivo.id == doc_id, Arquivo.username == username).first()
        if arquivo:
            arquivo.filename = novo_nome
            db.commit()
            sucesso = True
    finally:
        db.close()

    if sucesso:
        try:
            results = collection.get(where={"$and": [{"doc_id": doc_id}, {"username": username}]})
            if results and results["ids"] and results["metadatas"]:
                novos_metadatas = []
                for meta in results["metadatas"]:
                    meta["filename"] = novo_nome
                    novos_metadatas.append(meta)
                collection.update(ids=results["ids"], metadatas=novos_metadatas)
        except Exception as e:
            print(f"ChromaDB update exception: {e}")

    return sucesso

def indexar_nota_chromadb(note_id: str, title: str, chunks: list[str], username: str):
    apagar_documento(note_id, username, is_nota=True)
    if not chunks:
        return

    ids = [f"{note_id}_chunk_{i}" for i in range(len(chunks))]
    metadatas = [
        {
            "doc_id": note_id,
            "filename": title,
            "chunk_index": i,
            "username": username,
            "source": "nota"
        }
        for i in range(len(chunks))
    ]
    collection.add(documents=chunks, ids=ids, metadatas=metadatas)

def pesquisar_documentos(query: str, username: str, n_results: int = 5):
    return collection.query(
        query_texts=[query],
        n_results=n_results,
        where={"username": username},
    )
