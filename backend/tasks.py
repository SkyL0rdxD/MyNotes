import logging
from celery_app import celery
from rag import extract_text, chunk_text, embed_and_store

logger = logging.getLogger(__name__)


@celery.task(bind=True)
def process_pdf(self, file_path: str, pdf_name: str):
    try:
        logger.warning(f"[1] Extracting text from {file_path}")
        text = extract_text(file_path)
        logger.warning(f"[2] Chunking text ({len(text)} chars)")
        chunks = chunk_text(text)
        logger.warning(f"[3] Embedding and storing {len(chunks)} chunks")
        embed_and_store(chunks, pdf_name)
        logger.warning(f"[4] Done processing {pdf_name}")
        return {"status": "complete", "pdf_name": pdf_name}
    except Exception as exc:
        logger.error(f"Error processing {pdf_name}: {exc}")
        self.update_state(state="FAILURE", meta={"error": str(exc)})
        raise
