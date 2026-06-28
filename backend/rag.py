import os
import fitz
import chromadb
from openai import OpenAI
from langchain_text_splitters import RecursiveCharacterTextSplitter
from dotenv import load_dotenv

load_dotenv()

_openai_client = None
chroma_client = chromadb.PersistentClient(path="./chroma_db")


def get_client():
    global _openai_client
    if _openai_client is None:
        _openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    return _openai_client


def extract_text(pdf_path: str) -> str:
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text()
    doc.close()
    return text


def chunk_text(text: str) -> list[str]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=400,
        chunk_overlap=50,
    )
    return splitter.split_text(text)


def embed_and_store(chunks: list[str], pdf_name: str) -> None:
    collection = chroma_client.get_or_create_collection("pdf_chunks")

    batch_size = 50
    for batch_start in range(0, len(chunks), batch_size):
        batch = chunks[batch_start : batch_start + batch_size]

        response = get_client().embeddings.create(
            model="text-embedding-3-small",
            input=batch,
            timeout=30,
        )
        embeddings = [item.embedding for item in response.data]

        ids = [f"{pdf_name}_{batch_start + i}" for i in range(len(batch))]
        metadatas = [
            {"source": pdf_name, "chunk_index": batch_start + i}
            for i in range(len(batch))
        ]

        collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=batch,
            metadatas=metadatas,
        )


def search_and_answer(question: str, pdf_name: str) -> dict:
    collection = chroma_client.get_or_create_collection("pdf_chunks")

    response = get_client().embeddings.create(
        model="text-embedding-3-small",
        input=[question],
    )
    question_embedding = response.data[0].embedding

    count = collection.count()
    if count == 0:
        return {"answer": "This PDF has not been processed yet. Please wait and try again.", "sources": []}

    results = collection.query(
        query_embeddings=[question_embedding],
        n_results=min(5, count),
        where={"source": pdf_name},
    )

    source_chunks = results["documents"][0] if results["documents"] else []

    context = "\n".join(source_chunks)
    prompt = (
        "Answer the question using only the context below.\n"
        "If the answer isn't in the context, say so.\n\n"
        f"Context:\n{context}\n\n"
        f"Question: {question}\n\n"
        "Answer:"
    )

    chat_response = get_client().chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
    )
    answer = chat_response.choices[0].message.content

    return {"answer": answer, "sources": source_chunks}
