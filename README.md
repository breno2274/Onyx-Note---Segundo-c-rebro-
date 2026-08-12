

# Onyx Note - Segundo Cérebro



**Onyx Note** é uma plataforma minimalista de gestão de conhecimento projetada para organizar informações, processar documentos e expandir as capacidades cognitivas através da inteligência artificial.

---

## A Missão
Transformar fragmentos de informação em conhecimento estruturado e pesquisável, proporcionando uma interface limpa, moderna e focada no que importa: a sua produtividade.

## O que o Projeto Faz?
- **Interface Premium P&B**: Design minimalista com suporte nativo a temas Claro/Escuro e animações fluidas.
- **Segundo Cérebro com IA**: Ingestão de PDFs e documentos que se tornam fontes pesquisáveis.
- **Busca Semântica**: Utiliza banco de dados vetorial para encontrar conexões entre as suas notas e documentos.
- **Anotações Dinâmicas**: Crie e edite notas que são indexadas automaticamente para pesquisa instantânea.
- **Segurança Avançada**: Sistema de autenticação robusto com validação de e-mail, políticas de senha forte e recuperação de conta.

## Tecnologias Usadas
A arquitetura é baseada em **Microsserviços** para garantir escalabilidade e independência:

- **Frontend**: HTML5, CSS3 (Vanilla) e JavaScript. Foco em performance e responsividade extrema.
- **Backend**: Python com **FastAPI** (Alta performance e tipagem assíncrona).
- **Inteligência Artificial**: **ChromaDB** para armazenamento vetorial e processamento de linguagem natural.
- **Proxy & Integração**: **Nginx** e **API Gateway** centralizado.
- **Containerização**: **Docker** e **Docker Compose** para orquestração simplificada.
- **Banco de Dados**: SQLite para persistência rápida e leve.

## Como Ligar os Motores (Instalação Local)

Certifique-se de que tem o **Docker** e o **Docker Compose** instalados na sua máquina.

1. **Clonar o Repositório**:
   ```bash
   git clone <link-do-repositorio>
   cd microservices-fastapi
   ```

2. **Subir os Microsserviços**:
   ```powershell
   docker compose up --build
   ```

3. **Aceder à Aplicação**:
    **http://localhost:3000**

---

##  Configurações de Autenticação (Opcional)
Para habilitar o Login com Google, configure as variáveis `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` como Secrets no painel do HF Spaces (ou no `.env` para execução local).

---
*Desenvolvido com foco em minimalismo e eficiência.*
