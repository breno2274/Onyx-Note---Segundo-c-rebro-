"""
API Gateway - Versão para Hugging Face Spaces (container único).
Idêntico ao main.py, mas com URLs apontando para localhost ao invés de
nomes de serviço Docker (auth-service, user-service, search-service).
"""
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse, Response
import httpx
from jose import jwt

app = FastAPI(title="Segundo Cérebro - API Gateway (HF)")

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SECRET_KEY = os.getenv("SECRET_KEY", "chave_padrao_insegura_para_testes")
ALGORITHM = "HS256"
security = HTTPBearer()

# URLs internas (localhost no container único)
AUTH_URL = "http://localhost:8000"
USER_URL = "http://localhost:8001"
SEARCH_URL = "http://localhost:8002"


def verificar_token(credenciais: HTTPAuthorizationCredentials = Depends(security)):
    token = credenciais.credentials
    try:
        jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return token
    except Exception:
        raise HTTPException(status_code=401, detail="Token falso ou expirado, pirata!")


# --- HEALTH CHECK ---

@app.get("/api/health")
async def health_check():
    """Endpoint de health check para verificar se todos os serviços estão ativos."""
    status = {"gateway": "ok"}
    
    async with httpx.AsyncClient(timeout=5.0) as client:
        for name, url in [("auth", AUTH_URL), ("user", USER_URL), ("search", SEARCH_URL)]:
            try:
                resp = await client.get(f"{url}/docs")
                status[name] = "ok" if resp.status_code == 200 else "error"
            except Exception:
                status[name] = "starting"
    
    all_ok = all(v == "ok" for v in status.values())
    return JSONResponse(
        content={"status": "healthy" if all_ok else "degraded", "services": status},
        status_code=200 if all_ok else 503
    )


# --- ROTAS PÚBLICAS ---

@app.post("/api/register")
async def proxy_register(request_data: dict):
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(f"{AUTH_URL}/register", json=request_data)
            if response.status_code != 200:
                detail = response.json().get("detail", "Erro no servidor de autenticação")
                raise HTTPException(status_code=response.status_code, detail=detail)
            return response.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Serviço de autenticação ainda está iniciando. Tente novamente em alguns segundos.")

@app.post("/api/login")
async def proxy_login(request_data: dict):
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(f"{AUTH_URL}/login", json=request_data)
            if response.status_code != 200:
                detail = response.json().get("detail", "Erro no servidor de autenticação")
                raise HTTPException(status_code=response.status_code, detail=detail)
            return response.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Serviço de autenticação ainda está iniciando. Tente novamente em alguns segundos.")

@app.get("/api/auth/google/login")
async def proxy_google_login():
    try:
        async with httpx.AsyncClient(follow_redirects=False, timeout=10.0) as client:
            response = await client.get(f"{AUTH_URL}/auth/google/login")
            if "location" in response.headers:
                return RedirectResponse(url=response.headers["location"])
            raise HTTPException(status_code=500, detail="Erro ao contatar Google")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Serviço de autenticação ainda está iniciando.")

@app.get("/api/auth/google/callback")
async def proxy_google_callback(code: str):
    try:
        async with httpx.AsyncClient(follow_redirects=False, timeout=15.0) as client:
            response = await client.get(f"{AUTH_URL}/auth/google/callback?code={code}")
            if "location" in response.headers:
                return RedirectResponse(url=response.headers["location"])
            return RedirectResponse(url="/?error=google_auth_failed")
    except httpx.ConnectError:
        return RedirectResponse(url="/?error=google_auth_failed")

@app.post("/api/auth/forgot-password")
async def proxy_forgot_password(request_data: dict):
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(f"{AUTH_URL}/auth/forgot-password", json=request_data)
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=response.json())
            return response.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Serviço de autenticação ainda está iniciando.")

@app.post("/api/auth/reset-password")
async def proxy_reset_password(request_data: dict):
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(f"{AUTH_URL}/auth/reset-password", json=request_data)
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=response.json())
            return response.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Serviço de autenticação ainda está iniciando.")

# --- ROTAS PROTEGIDAS ---

@app.get("/api/users/me")
async def proxy_users_me(token: str = Depends(verificar_token)):
    cabecalhos = {"Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{USER_URL}/users/me", headers=cabecalhos)
            return response.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Serviço de utilizador ainda está iniciando.")


# --- ROTAS DO SEARCH-SERVICE ---

@app.post("/api/upload")
async def proxy_upload(file: UploadFile = File(...), token: str = Depends(verificar_token)):
    cabecalhos = {"Authorization": f"Bearer {token}"}
    file_content = await file.read()
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            files = {"file": (file.filename, file_content, file.content_type)}
            response = await client.post(
                f"{SEARCH_URL}/upload",
                files=files,
                headers=cabecalhos,
            )
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=response.json())
            return response.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Serviço de pesquisa ainda está iniciando.")

@app.post("/api/search")
async def proxy_search(request_data: dict, token: str = Depends(verificar_token)):
    cabecalhos = {"Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{SEARCH_URL}/search",
                json=request_data,
                headers=cabecalhos,
            )
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=response.json())
            return response.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Serviço de pesquisa ainda está iniciando.")

@app.get("/api/documents")
async def proxy_documents(token: str = Depends(verificar_token)):
    cabecalhos = {"Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{SEARCH_URL}/documents",
                headers=cabecalhos,
            )
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=response.json())
            return response.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Serviço de pesquisa ainda está iniciando.")

@app.delete("/api/documents/{doc_id}")
async def proxy_delete_document(doc_id: str, token: str = Depends(verificar_token)):
    cabecalhos = {"Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.delete(
                f"{SEARCH_URL}/documents/{doc_id}",
                headers=cabecalhos,
            )
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=response.json())
            return response.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Serviço de pesquisa ainda está iniciando.")

@app.put("/api/documents/{doc_id}")
async def proxy_rename_document(doc_id: str, request_data: dict, token: str = Depends(verificar_token)):
    cabecalhos = {"Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.put(
                f"{SEARCH_URL}/documents/{doc_id}",
                json=request_data,
                headers=cabecalhos,
            )
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=response.text[:200])
            return response.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Serviço de pesquisa ainda está iniciando.")

@app.get("/api/download/{doc_id}")
async def proxy_download(doc_id: str, token: str = Depends(verificar_token)):
    cabecalhos = {"Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.get(
                f"{SEARCH_URL}/download/{doc_id}",
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
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Serviço de pesquisa ainda está iniciando.")

# --- ROTAS DE NOTAS ---

@app.post("/api/notes")
async def proxy_create_note(request_data: dict, token: str = Depends(verificar_token)):
    cabecalhos = {"Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{SEARCH_URL}/notes",
                json=request_data,
                headers=cabecalhos,
            )
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=response.json())
            return response.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Serviço de pesquisa ainda está iniciando.")

@app.get("/api/notes")
async def proxy_list_notes(token: str = Depends(verificar_token)):
    cabecalhos = {"Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{SEARCH_URL}/notes",
                headers=cabecalhos,
            )
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=response.json())
            return response.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Serviço de pesquisa ainda está iniciando.")

@app.put("/api/notes/{note_id}")
async def proxy_update_note(note_id: int, request_data: dict, token: str = Depends(verificar_token)):
    cabecalhos = {"Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.put(
                f"{SEARCH_URL}/notes/{note_id}",
                json=request_data,
                headers=cabecalhos,
            )
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=response.json())
            return response.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Serviço de pesquisa ainda está iniciando.")

@app.delete("/api/notes/{note_id}")
async def proxy_delete_note(note_id: int, token: str = Depends(verificar_token)):
    cabecalhos = {"Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.delete(
                f"{SEARCH_URL}/notes/{note_id}",
                headers=cabecalhos,
            )
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=response.json())
            return response.json()
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Serviço de pesquisa ainda está iniciando.")
