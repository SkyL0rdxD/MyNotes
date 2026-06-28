# PDF RAG

A full-stack PDF question-answering app. Upload PDFs, ask questions, get AI answers backed by the actual source text.

## Stack

- **Backend**: FastAPI + Celery + ChromaDB + OpenAI
- **Queue/Cache**: Redis (Docker)
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS

## Setup

1. Clone the repo:
   ```bash
   git clone <repo-url>
   cd pdf-rag
   ```

2. Add your OpenAI API key:
   ```bash
   cp backend/.env.example backend/.env
   # Edit backend/.env and set OPENAI_API_KEY=sk-...
   ```

3. Start Redis, FastAPI, and the Celery worker:
   ```bash
   docker-compose up --build
   ```

4. Install and start the frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000)

## Usage

1. Drag and drop a PDF onto the left panel (or click to browse)
2. Wait for processing to complete (the worker extracts text, chunks it, and stores embeddings in ChromaDB)
3. Click the PDF name to select it
4. Type a question in the right panel and press Enter or Send
5. Expand "Sources" under any answer to see the exact chunks used
