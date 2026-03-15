from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import declarative_base, sessionmaker
import os

# Diretório gravável para o banco de dados
# No HF Spaces usa /home/user/data/auth, localmente usa o diretório atual
DB_DIR = os.getenv("AUTH_DB_DIR", ".")
os.makedirs(DB_DIR, exist_ok=True)

# O endereço do nosso banco de dados
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_DIR}/usuarios.db"

# O motor que liga o Python ao SQLite
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})

# A "fábrica" de conexões com o banco
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# A base para desenharmos as nossas tabelas
Base = declarative_base()

# O Molde da nossa Tabela ( O Python cria a tabela por nós)
class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password = Column(String)