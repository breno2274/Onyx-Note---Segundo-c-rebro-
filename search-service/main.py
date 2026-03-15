from fastapi import FastAPI, HTTPException, Depends, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from markitdown import MarkItDown
import io
import os
import tempfile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import (
    adicionar_documento, pesquisar_documentos, listar_documentos, apagar_documento,
    get_db, Nota, indexar_nota_chromadb, DATA_DIR, SessionLocal, Arquivo, renomear_documento
)
from fastapi.responses import FileResponse
import uuid

app = FastAPI(title="Segundo Cérebro - Search Service")

# Mesma chave secreta dos outros serviços
SECRET_KEY = os.getenv("SECRET_KEY", "chave_padrao_insegura_para_testes")
ALGORITHM = "HS256"

# SCHEMAS PARA NOTAS 
class NotaCreate(BaseModel):
    title: str
    content: str

class NotaUpdate(BaseModel):
    title: str
    content: str
    
class SearchQuery(BaseModel):
    query: str
    n_results: int = 5

class RenameDocumentRequest(BaseModel):
    filename: str


security = HTTPBearer()


def verificar_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Token inválido")
        return username
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")


def extrair_texto(file_path: str, file_bytes: bytes) -> str:
    """Extrai texto de quase qualquer formato usando MarkItDown."""
    md = MarkItDown()
    try:
        # Usa tempfile para garantir path seguro e gravável em qualquer ambiente
        suffix = os.path.splitext(file_path)[1] or ".tmp"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file_bytes)
            temp_path = tmp.name
        
        result = md.convert(temp_path)
        os.remove(temp_path)
        return result.text_content
    except Exception as e:
        # Limpar arquivo temporário em caso de erro
        try:
            if 'temp_path' in locals():
                os.remove(temp_path)
        except OSError:
            pass
        print(f"Erro MarkItDown: {e}")
        # Fallback para texto simples se for um formato legível
        try:
            return file_bytes.decode("utf-8")
        except Exception:
            raise Exception("Não foi possível extrair texto deste formato.")


def dividir_em_chunks(texto: str, tamanho: int = 500, sobreposicao: int = 50) -> list[str]:
    """Divide o texto em pedaços menores com sobreposição."""
    chunks = []
    inicio = 0
    while inicio < len(texto):
        fim = inicio + tamanho
        chunk = texto[inicio:fim].strip()
        if chunk:
            chunks.append(chunk)
        inicio += tamanho - sobreposicao
    return chunks


# ENDPOINTS

@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    username: str = Depends(verificar_token),
):
    """Recebe um arquivo, salva em disco e extrai texto se possível para indexação."""
    conteudo = await file.read()
    
    # 1. Salvar arquivo físico no disco
    uploads_dir = os.path.join(DATA_DIR, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    
    safe_filename = file.filename.replace("/", "_").replace("\\", "_")
    unique_name = f"{uuid.uuid4().hex[:8]}_{safe_filename}"
    disk_path = os.path.join(uploads_dir, unique_name)
    
    with open(disk_path, "wb") as f:
        f.write(conteudo)

    # Tentar extrair o texto para o ChromaDB
    texto = ""
    has_text = False
    chunks = []
    try:
        texto = extrair_texto(file.filename, conteudo)
        if texto and texto.strip():
            has_text = True
            chunks = dividir_em_chunks(texto)
    except Exception as e:
        print(f"Extrato falhou para {file.filename}: {e}. Salvo como arquivo bruto.")

    # Salvar Metadata e indexar
    ext = os.path.splitext(file.filename)[1].lstrip('.').lower() or "arquivo"
    try:
        doc_id = adicionar_documento(file.filename, chunks, username, disk_path, has_text, source=ext)
    except Exception as e:
        os.remove(disk_path)
        raise HTTPException(status_code=500, detail=f"Erro banco de dados: {str(e)}")

    return {
        "mensagem": f"Arquivo '{file.filename}' processado com sucesso!",
        "doc_id": doc_id,
        "has_text": has_text,
        "total_chunks": len(chunks),
    }

@app.get("/download/{doc_id}")
async def download_file(doc_id: str, username: str = Depends(verificar_token)):
    """Baixa um arquivo armazenado."""
    db = SessionLocal()
    try:
        arquivo = db.query(Arquivo).filter(Arquivo.id == doc_id, Arquivo.username == username).first()
        if not arquivo or not arquivo.disk_path or not os.path.exists(arquivo.disk_path):
            raise HTTPException(status_code=404, detail="Arquivo não encontrado no servidor")
        
        return FileResponse(arquivo.disk_path, filename=arquivo.filename)
    finally:
        db.close()

@app.put("/documents/{doc_id}")
async def rename_document(
    doc_id: str,
    request: RenameDocumentRequest,
    username: str = Depends(verificar_token)
):
    """Renomeia um documento guardado no SQLite e metadados."""
    if not request.filename or not request.filename.strip():
        raise HTTPException(status_code=400, detail="Um novo nome de arquivo é obrigatório.")

    if not renomear_documento(doc_id, username, request.filename.strip()):
        raise HTTPException(status_code=404, detail="Documento não encontrado ou sem permissão para editá-lo.")

    return {"mensagem": "Arquivo renomeado com sucesso"}


@app.post("/search")
async def search_documents(
    request_data: dict,
    username: str = Depends(verificar_token),
):
    """Pesquisa nos documentos do utilizador por similaridade semântica."""
    query = request_data.get("query")
    if not query:
        raise HTTPException(status_code=400, detail="Campo 'query' é obrigatório!")

    n_results = request_data.get("n_results", 5)
    results = pesquisar_documentos(query, username, n_results)

    # Formatar resultados
    matches = []
    if results and results["documents"] and results["documents"][0]:
        for i, doc in enumerate(results["documents"][0]):
            matches.append({
                "texto": doc,
                "filename": results["metadatas"][0][i]["filename"] if results["metadatas"] else "desconhecido",
                "source": results["metadatas"][0][i].get("source", "pdf") if results["metadatas"] else "pdf",
                "relevancia": round(1 - results["distances"][0][i], 4) if results["distances"] else 0,
            })

    return {
        "query": query,
        "resultados": matches,
        "total": len(matches),
    }


@app.get("/documents")
async def list_documents(username: str = Depends(verificar_token)):
    """Lista todos os documentos do utilizador."""
    docs = listar_documentos(username)
    return {"documentos": docs, "total": len(docs)}


@app.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, username: str = Depends(verificar_token)):
    """Apaga um documento e todos os seus chunks."""
    sucesso = apagar_documento(doc_id, username)
    if not sucesso:
        raise HTTPException(status_code=404, detail="Documento não encontrado!")
    return {"mensagem": "Documento apagado com sucesso!"}


# ENDPOINTS NOTAS   

@app.post("/notes")
async def create_note(
    note: NotaCreate,
    username: str = Depends(verificar_token),
    db: Session = Depends(get_db)
):
    """Cria uma nota no SQLite e indexa o conteúdo no ChromaDB."""
    nova_nota = Nota(title=note.title, content=note.content, username=username)
    db.add(nova_nota)
    db.commit()
    db.refresh(nova_nota)
    
    chunks = dividir_em_chunks(note.content, tamanho=300, sobreposicao=50)
    if chunks:
        indexar_nota_chromadb(str(nova_nota.id), note.title, chunks, username)
        
    return {"mensagem": "Nota salva com sucesso!", "nota": nova_nota}


@app.get("/notes")
async def list_notes(
    username: str = Depends(verificar_token),
    db: Session = Depends(get_db)
):
    """Lista as notas do utilizador ordenadas da mais recente para a mais antiga."""
    notas = db.query(Nota).filter(Nota.username == username).order_by(Nota.updated_at.desc()).all()
    return {"notas": notas, "total": len(notas)}


@app.put("/notes/{note_id}")
async def update_note(
    note_id: int,
    note_update: NotaUpdate,
    username: str = Depends(verificar_token),
    db: Session = Depends(get_db)
):
    """Atualiza a nota no SQLite e re-indexa no ChromaDB."""
    nota = db.query(Nota).filter(Nota.id == note_id, Nota.username == username).first()
    if not nota:
        raise HTTPException(status_code=404, detail="Nota não encontrada!")
        
    nota.title = note_update.title
    nota.content = note_update.content
    db.commit()
    db.refresh(nota)
    
    chunks = dividir_em_chunks(note_update.content, tamanho=300, sobreposicao=50)
    indexar_nota_chromadb(str(nota.id), note_update.title, chunks, username)
        
    return {"mensagem": "Nota atualizada e indexada com sucesso!", "nota": nota}


@app.delete("/notes/{note_id}")
async def delete_note(
    note_id: int,
    username: str = Depends(verificar_token),
    db: Session = Depends(get_db)
):
    """Apaga a nota do SQLite e os seus chunks correspondentes do ChromaDB."""
    nota = db.query(Nota).filter(Nota.id == note_id, Nota.username == username).first()
    if not nota:
        raise HTTPException(status_code=404, detail="Nota não encontrada!")
        
    db.delete(nota)
    db.commit()
    
    apagar_documento(str(note_id), username)
    return {"mensagem": "Nota apagada com sucesso!"}
