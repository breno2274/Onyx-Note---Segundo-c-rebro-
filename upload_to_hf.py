import os
from huggingface_hub import HfApi

api = HfApi()

repo_id = "breno2274/onyxnote"
folder_path = "."

ignore_patterns = [
    ".git",
    ".git/*",
    ".env",
    "venv",
    ".venv",
    "__pycache__",
    "*.pyc",
    "*.db",
    "chroma_data",
    ".vscode",
    "upload_to_hf.py",
    ".gemini*"
]

print(f"Uploading {folder_path} to {repo_id}...")

api.upload_folder(
    folder_path=folder_path,
    repo_id=repo_id,
    repo_type="space",
    ignore_patterns=ignore_patterns,
    commit_message="chore: secure environment variables and remove sensitive files for public release"
)

print("Upload complete!")
