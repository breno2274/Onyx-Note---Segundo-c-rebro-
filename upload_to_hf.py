from huggingface_hub import HfApi

api = HfApi()
repo_id = "breno2274/OnyxNote"

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

print(f"Uploading . to {repo_id}...")
api.upload_folder(
    folder_path=".",
    repo_id=repo_id,
    repo_type="space",
    ignore_patterns=ignore_patterns,
    commit_message="refactor: clean up comments and code structure"
)
print("Upload complete!")
