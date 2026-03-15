import chromadb
from chromadb.config import Settings
import os
import uuid
from sqlalchemy import create_engine, Column, Integer, String, DateTime, text
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime

# ==========================================
# 1. Configuração do SQLite (Para as Notas)
# ==========================================
# Diretório gravável para dados persistentes
# No HF Spaces: /home/user/data/search, localmente: ./chroma_data
DATA_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_data")
os.makedirs(DATA_DIR, exist_ok=True)

SQLALCHEMY_DATABASE_URL = f"sqlite:///{DATA_DIR}/notas.db"
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
    has_text = Column(Integer, default=1)  # 1 (True) or 0 (False)
    created_at = Column(DateTime, default=datetime.utcnow)

# Criar a tabela de notas e arquivos
Base.metadata.create_all(bind=engine)

# ==========================================
# GATILHO DE MIGRAÇÃO (Auto-Update do SQLite)
# ==========================================
try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE arquivos ADD COLUMN has_text INTEGER DEFAULT 1"))
        conn.commit()
except Exception:
    pass  # Ignora se a coluna já existir


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ==========================================
# 2. Configuração do ChromaDB (Para Pesquisa)
# ==========================================
# Cliente persistente do ChromaDB (usa o mesmo diretório)
CHROMA_PERSIST_DIR = DATA_DIR

client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)

# Coleção principal de documentos (PDFs e Notas em conjunto!)
collection = client.get_or_create_collection(
    name="documentos",
    metadata={"hnsw:space": "cosine"}
)


# --- Funções para PDFs ---
def adicionar_documento(nome_ficheiro: str, chunks: list[str], username: str, disk_path: str, has_text: bool, source: str = "arquivo"):
    """Adiciona registro ao SQLite e, se tiver texto, ao ChromaDB."""
    doc_id = str(uuid.uuid4())
    
    # 1. Salvar no SQLite
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

    # 2. Salvar no ChromaDB apenas se tiver texto (chunks válidos)
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
    """Lista todos os ficheiros (raw) inseridos via SQLite."""
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
    """Apaga os chunks do ChromaDB, o arquivo em disco e o registro SQLite."""
    # 1. Tentar apagar do ChromaDB (independente de ser arquivo ou nota)
    try:
        results = collection.get(
            where={"$and": [{"doc_id": doc_id}, {"username": username}]},
        )
        if results and results["ids"]:
            collection.delete(ids=results["ids"])
    except Exception as e:
        print(f"Erro ao apagar ChromaDB (talvez não tivesse texto): {e}")

    if is_nota:
        return True # Notas são apagadas da DB pela rota main.py

    # 2. Apagar do SQLite e arquivo físico
    db = SessionLocal()
    try:
        arquivo = db.query(Arquivo).filter(Arquivo.id == doc_id, Arquivo.username == username).first()
        if arquivo:
            # Apagar físico
            if arquivo.disk_path and os.path.exists(arquivo.disk_path):
                try:
                    os.remove(arquivo.disk_path)
                except OSError as e:
                    print(f"Erro ao apagar ficheiro no disco: {e}")
            # Apagar linha SQLite
            db.delete(arquivo)
            db.commit()
            return True
        return False
    finally:
        db.close()

def renomear_documento(doc_id: str, username: str, novo_nome: str):
    """Renomeia o arquivo no SQLite e as entradas no ChromaDB caso existam."""
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
            print(f"Aviso ao tentar atualizar metadatas no ChromaDB (pode não existir): {e}")
            
    return sucesso


# --- Funções para Notas ---
def indexar_nota_chromadb(note_id: str, title: str, chunks: list[str], username: str):
    """Indexa os chunks de uma nota no ChromaDB para serem pesquisáveis."""
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


# --- Função de Pesquisa Unificada ---
def pesquisar_documentos(query: str, username: str, n_results: int = 5):
    """Pesquisa documentos e notas similares à query no ChromaDB."""
    results = collection.query(
        query_texts=[query],
        n_results=n_results,
        where={"username": username},
    )
    return results
