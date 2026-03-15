from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.responses import RedirectResponse
from jose import jwt
from datetime import datetime, timedelta
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.orm import Session
from fastapi_mail import FastMail, ConnectionConfig, MessageSchema, MessageType
import httpx
import os
import re

# Importações do nosso novo cofre de dados
from database import Base, engine, SessionLocal, Usuario

app = FastAPI()

# Cria as tabelas no banco de dados quando o sistema liga
Base.metadata.create_all(bind=engine)

# Chaves e Algoritmos do Token de Segurança
SECRET_KEY = os.getenv("SECRET_KEY", "chave_padrao_insegura_para_testes")
ALGORITHM = "HS256"

# Configurações Essenciais do Google OAuth2
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "COLOQUE_SEU_CLIENT_ID_AQUI")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "COLOQUE_SEU_CLIENT_SECRET_AQUI")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8080/api/auth/google/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# Configurações de E-mail (SMTP) — Pode falhar se variáveis não estiverem definidas
try:
    conf = ConnectionConfig(
        MAIL_USERNAME = os.getenv("MAIL_USERNAME", ""),
        MAIL_PASSWORD = os.getenv("MAIL_PASSWORD", ""),
        MAIL_FROM = os.getenv("MAIL_FROM", os.getenv("MAIL_USERNAME", "noreply@example.com")),
        MAIL_PORT = int(os.getenv("MAIL_PORT", 587)),
        MAIL_SERVER = os.getenv("MAIL_SERVER", "smtp.gmail.com"),
        MAIL_FROM_NAME = os.getenv("MAIL_FROM_NAME", "Onyx Note"),
        MAIL_STARTTLS = os.getenv("MAIL_STARTTLS", "True") == "True",
        MAIL_SSL_TLS = os.getenv("MAIL_SSL_TLS", "False") == "True",
        USE_CREDENTIALS = True,
        VALIDATE_CERTS = True
    )
except Exception as e:
    print(f"AVISO: Configuração de e-mail falhou ({e}). E-mail desativado.")
    conf = None

# Banco de dados simulado para Tokens de Recuperação de Senha em memória
recovery_tokens_db = {}

# Função para abrir e fechar a gaveta do banco de dados a cada pedido
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Molde da informação que o utilizador vai enviar (Pydantic v2)
class UserAuth(BaseModel):
    username: EmailStr 
    password: str
    
    @field_validator("password")
    @classmethod
    def password_must_be_secure(cls, v):
        if len(v) < 8:
            raise ValueError("A senha deve ter pelo menos 8 caracteres.")
        if not re.search(r"[A-Z]", v):
            raise ValueError("A senha deve ter pelo menos 1 letra maiúscula.")
        if not re.search(r"\d", v):
            raise ValueError("A senha deve ter pelo menos 1 número.")
        return v

class ForgotPasswordReq(BaseModel):
    email: EmailStr

class ResetPasswordReq(BaseModel):
    token: str
    new_password: str

def create_token(username: str):
    expire = datetime.utcnow() + timedelta(minutes=30)
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

# --- ROTAS DO NOSSO NAVIO ---

@app.post("/register")
def register_user(user: UserAuth, db: Session = Depends(get_db)):
    db_user = db.query(Usuario).filter(Usuario.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Este utilizador / e-mail já existe!")
    
    novo_usuario = Usuario(username=user.username, password=user.password)
    db.add(novo_usuario)
    db.commit()
    
    return {"mensagem": f"Bem-vindo a bordo, {user.username}! Conta criada com sucesso."}

@app.post("/login")
def login(user: UserAuth, db: Session = Depends(get_db)):
    db_user = db.query(Usuario).filter(Usuario.username == user.username).first()
    
    if not db_user or db_user.password != user.password:
        raise HTTPException(status_code=401, detail="Credenciais inválidas, marujo!")
        
    token = create_token(db_user.username)
    return {"access_token": token}

# --- RECUPERAÇÃO DE SENHA ---

@app.post("/auth/forgot-password")
async def forgot_password(req: ForgotPasswordReq, db: Session = Depends(get_db)):
    db_user = db.query(Usuario).filter(Usuario.username == req.email).first()
    if not db_user:
        return {"mensagem": "Se o e-mail existir, um link de recuperação foi enviado."}
    
    import uuid
    reset_token = str(uuid.uuid4())
    recovery_tokens_db[reset_token] = req.email
    
    html = f"""
    <div style="font-family: 'Times New Roman', serif; max-width: 600px; margin: 0 auto; border: 1px solid #000; padding: 40px; color: #000; background: #fff;">
        <h1 style="text-align: center; font-size: 32px; letter-spacing: 2px;">ONYX NOTE</h1>
        <p style="font-size: 18px; margin-top: 30px;">Olá,</p>
        <p style="font-size: 16px; line-height: 1.6;">Recebemos um pedido para redefinir a senha da sua conta no Onyx Note.</p>
        <div style="text-align: center; margin: 40px 0;">
            <a href="{FRONTEND_URL}/?reset_token={reset_token}" 
               style="background: #000; color: #fff; padding: 15px 30px; text-decoration: none; font-size: 16px; border: 1px solid #000; transition: all 0.3s ease;">
               Redefinir Minha Senha
            </a>
        </div>
        <p style="font-size: 14px; color: #666; margin-top: 30px;">
            Se você não solicitou esta alteração, ignore este e-mail. O link é válido por 30 minutos.
        </p>
        <hr style="border: 0; border-top: 1px solid #eee; margin-top: 40px;">
        <p style="font-size: 12px; color: #888; text-align: center;">Onyx Note - O Seu Segundo Cérebro</p>
    </div>
    """

    if conf is None:
        print(f"E-mail desativado. Reset link: {FRONTEND_URL}/?reset_token={reset_token}")
        return {"mensagem": "Se o e-mail existir, um link de recuperação foi enviado.", "debug_link": f"{FRONTEND_URL}/?reset_token={reset_token}"}

    message = MessageSchema(
        subject="Onyx Note - Recuperação de Senha",
        recipients=[req.email],
        body=html,
        subtype=MessageType.html
    )

    fm = FastMail(conf)
    try:
        await fm.send_message(message)
    except Exception as e:
        print(f"ERRO AO ENVIAR EMAIL: {str(e)}")
        return {"mensagem": "Erro no servidor de e-mail. Link simulado no terminal.", "debug_link": f"{FRONTEND_URL}/?reset_token={reset_token}"}

    return {"mensagem": "Link de recuperação enviado para o seu e-mail!"}

@app.post("/auth/reset-password")
def reset_password(req: ResetPasswordReq, db: Session = Depends(get_db)):
    email = recovery_tokens_db.get(req.token)
    if not email:
        raise HTTPException(status_code=400, detail="Token de recuperação inválido ou expirado!")
    
    v = req.new_password
    if len(v) < 8 or not re.search(r"[A-Z]", v) or not re.search(r"\d", v):
        raise HTTPException(status_code=400, detail="A senha deve ter pelo menos 8 caracteres, 1 maiúscula e 1 número.")

    db_user = db.query(Usuario).filter(Usuario.username == email).first()
    if db_user:
        db_user.password = req.new_password
        db.commit()
    
    recovery_tokens_db.pop(req.token, None)
    
    return {"mensagem": "A sua senha foi redefinida com sucesso! Pode iniciar sessão."}


# --- INTEGRAÇÃO GOOGLE ---

@app.get("/auth/google/login")
def google_login():
    url = f"https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id={GOOGLE_CLIENT_ID}&redirect_uri={GOOGLE_REDIRECT_URI}&scope=openid%20profile%20email&access_type=offline"
    return RedirectResponse(url)

@app.get("/auth/google/callback")
async def google_callback(code: str, db: Session = Depends(get_db)):
    token_url = "https://oauth2.googleapis.com/token"
    token_data = {
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }
    
    async with httpx.AsyncClient() as client:
        token_response = await client.post(token_url, data=token_data)
        token_json = token_response.json()
        
        if "error" in token_json:
            raise HTTPException(status_code=400, detail="O Google não autorizou o seu login ou as chaves Secretas/ID estão erradas.")
        
        access_token = token_json["access_token"]
        
        user_info_url = "https://www.googleapis.com/oauth2/v1/userinfo?alt=json"
        user_info_response = await client.get(user_info_url, headers={"Authorization": f"Bearer {access_token}"})
        user_info = user_info_response.json()
    
    google_email = user_info.get("email")
    if not google_email:
        raise HTTPException(status_code=400, detail="Não foi possível ler o seu email do Google.")
    
    db_user = db.query(Usuario).filter(Usuario.username == google_email).first()
    
    if not db_user:
        novo_usuario = Usuario(username=google_email, password=f"google_sso_{code[:10]}")
        db.add(novo_usuario)
        db.commit()
    
    meu_token = create_token(google_email)
    
    return RedirectResponse(f"{FRONTEND_URL}/?token={meu_token}")
