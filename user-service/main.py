import os
from fastapi import FastAPI, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

app = FastAPI(title="Onyx Note User Service")

SECRET_KEY = os.getenv("SECRET_KEY", "chave_padrao_insegura_para_testes")
ALGORITHM = "HS256"
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

@app.get("/users/me")
def ler_meus_dados(username: str = Depends(verificar_token)):
    return {
        "usuario": username,
        "mensagem": "Acesso autenticado com sucesso.",
        "status": "Autorizado"
    }