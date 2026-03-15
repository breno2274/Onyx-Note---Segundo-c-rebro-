from fastapi import FastAPI, HTTPException, Depends, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response
import httpx
from jose import jwt

app = FastAPI(title="Segundo Cérebro - API Gateway")

# --- CORS: Permite o frontend comunicar com a API ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. As chaves do reino (têm de ser iguais às do auth-service!)
SECRET_KEY = os.getenv("SECRET_KEY", "chave_padrao_insegura_para_testes")
ALGORITHM = "HS256"

# 2. O detetor de Tokens do FastAPI (isto vai criar um cadeado no Swagger!)
security = HTTPBearer()

# 3. A Função do Porteiro: Verifica se o Token é verdadeiro
def verificar_token(credenciais: HTTPAuthorizationCredentials = Depends(security)):
    token = credenciais.credentials
    try:
        jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return token 
    except Exception:
        raise HTTPException(status_code=401, detail="Token falso ou expirado, pirata!")


# --- ROTAS PÚBLICAS (A porta da rua, qualquer um entra) ---

@app.post("/api/register")
async def proxy_register(request_data: dict):
    async with httpx.AsyncClient() as client:
        response = await client.post("http://auth-service:8000/register", json=request_data)
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.json())
        return response.json()

@app.post("/api/login")
async def proxy_login(request_data: dict):
    async with httpx.AsyncClient() as client:
        response = await client.post("http://auth-service:8000/login", json=request_data)
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.json())
        return response.json()

@app.get("/api/auth/google/login")
async def proxy_google_login():
    async with httpx.AsyncClient(follow_redirects=False) as client:
        response = await client.get("http://auth-service:8000/auth/google/login")
        if "location" in response.headers:
            return RedirectResponse(url=response.headers["location"])
        raise HTTPException(status_code=500, detail="Erro ao contatar Google")

@app.get("/api/auth/google/callback")
async def proxy_google_callback(code: str):
    async with httpx.AsyncClient(follow_redirects=False) as client:
        response = await client.get(f"http://auth-service:8000/auth/google/callback?code={code}")
        if "location" in response.headers:
            return RedirectResponse(url=response.headers["location"])
        return RedirectResponse(url="http://localhost:3000/?error=google_auth_failed")

@app.post("/api/auth/forgot-password")
async def proxy_forgot_password(request_data: dict):
    async with httpx.AsyncClient() as client:
        response = await client.post("http://auth-service:8000/auth/forgot-password", json=request_data)
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.json())
        return response.json()

@app.post("/api/auth/reset-password")
async def proxy_reset_password(request_data: dict):
    async with httpx.AsyncClient() as client:
        response = await client.post("http://auth-service:8000/auth/reset-password", json=request_data)
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.json())
        return response.json()

# --- ROTAS PROTEGIDAS (O cofre, só entra quem tem Token) ---

@app.get("/api/users/me")
async def proxy_users_me(token: str = Depends(verificar_token)):
    cabecalhos = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as client:
        response = await client.get("http://user-service:8001/users/me", headers=cabecalhos)
        return response.json()


# --- ROTAS DO SEARCH-SERVICE (Banco Vetorial) ---

@app.post("/api/upload")
async def proxy_upload(file: UploadFile = File(...), token: str = Depends(verificar_token)):
    cabecalhos = {"Authorization": f"Bearer {token}"}
    file_content = await file.read()
    async with httpx.AsyncClient(timeout=60.0) as client:
        files = {"file": (file.filename, file_content, file.content_type)}
        response = await client.post(
            "http://search-service:8002/upload",
            files=files,
            headers=cabecalhos,
        )
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.json())
        return response.json()

@app.post("/api/search")
async def proxy_search(request_data: dict, token: str = Depends(verificar_token)):
    cabecalhos = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "http://search-service:8002/search",
            json=request_data,
            headers=cabecalhos,
        )
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.json())
        return response.json()

@app.get("/api/documents")
async def proxy_documents(token: str = Depends(verificar_token)):
    cabecalhos = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "http://search-service:8002/documents",
            headers=cabecalhos,
        )
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.json())
        return response.json()

@app.delete("/api/documents/{doc_id}")
async def proxy_delete_document(doc_id: str, token: str = Depends(verificar_token)):
    cabecalhos = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as client:
        response = await client.delete(
            f"http://search-service:8002/documents/{doc_id}",
            headers=cabecalhos,
        )
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.json())
        return response.json()

@app.put("/api/documents/{doc_id}")
async def proxy_rename_document(doc_id: str, request_data: dict, token: str = Depends(verificar_token)):
    cabecalhos = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as client:
        response = await client.put(
            f"http://search-service:8002/documents/{doc_id}",
            json=request_data,
            headers=cabecalhos,
        )
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.json())
        return response.json()

@app.get("/api/download/{doc_id}")
async def proxy_download(doc_id: str, token: str = Depends(verificar_token)):
    cabecalhos = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.get(
            f"http://search-service:8002/download/{doc_id}",
            headers=cabecalhos,
        )
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text[:200])
        
        response_headers = {}
        if "content-disposition" in response.headers:
            response_headers["Content-Disposition"] = response.headers["content-disposition"]
            
        return Response(
            content=response.content,
            media_type=response.headers.get("content-type"),
            headers=response_headers,
        )

# --- ROTAS DE NOTAS (Search Service) ---

@app.post("/api/notes")
async def proxy_create_note(request_data: dict, token: str = Depends(verificar_token)):
    cabecalhos = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "http://search-service:8002/notes",
            json=request_data,
            headers=cabecalhos,
        )
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.json())
        return response.json()

@app.get("/api/notes")
async def proxy_list_notes(token: str = Depends(verificar_token)):
    cabecalhos = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            "http://search-service:8002/notes",
            headers=cabecalhos,
        )
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.json())
        return response.json()

@app.put("/api/notes/{note_id}")
async def proxy_update_note(note_id: int, request_data: dict, token: str = Depends(verificar_token)):
    cabecalhos = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.put(
            f"http://search-service:8002/notes/{note_id}",
            json=request_data,
            headers=cabecalhos,
        )
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.json())
        return response.json()

@app.delete("/api/notes/{note_id}")
async def proxy_delete_note(note_id: int, token: str = Depends(verificar_token)):
    cabecalhos = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.delete(
            f"http://search-service:8002/notes/{note_id}",
            headers=cabecalhos,
        )
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.json())
        return response.json()