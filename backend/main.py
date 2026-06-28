import os
import shutil
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from celery.result import AsyncResult
from dotenv import load_dotenv
import chromadb

load_dotenv()

from tasks import process_pdf
from celery_app import celery

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "./uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

chroma_client = chromadb.PersistentClient(path="./chroma_db")


class AskRequest(BaseModel):
    question: str
    pdf_name: str


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    pdf_name = file.filename
    file_path = os.path.join(UPLOAD_DIR, pdf_name)

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    task = process_pdf.delay(file_path, pdf_name)

    return {"job_id": task.id, "pdf_name": pdf_name, "status": "processing"}


@app.get("/job/{job_id}")
def get_job_status(job_id: str):
    result = AsyncResult(job_id, app=celery)

    if result.state == "PENDING" or result.state == "STARTED":
        status = "processing"
    elif result.state == "SUCCESS":
        status = "complete"
    else:
        status = "failed"

    return {"job_id": job_id, "status": status}


@app.get("/pdfs")
def list_pdfs():
    try:
        collection = chroma_client.get_or_create_collection("pdf_chunks")
        all_results = collection.get(include=["metadatas"])
        metadatas = all_results.get("metadatas") or []
        sources = list({m["source"] for m in metadatas if m and "source" in m})
        return {"pdfs": sources}
    except Exception:
        return {"pdfs": []}


@app.post("/ask")
def ask_question(body: AskRequest):
    from rag import search_and_answer
    result = search_and_answer(body.question, body.pdf_name)
    return {"answer": result["answer"], "sources": result["sources"]}
