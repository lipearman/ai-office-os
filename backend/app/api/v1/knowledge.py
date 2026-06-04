import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.models.document import Document, DocumentChunk
from app.models.user import User
from app.api.deps import get_current_user
from app.rag.embeddings import embed_text, cosine, chunk_text

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


class DocCreate(BaseModel):
    workspace_id: uuid.UUID
    title: str
    content: str
    source: str = "text"


class SearchIn(BaseModel):
    workspace_id: uuid.UUID
    query: str
    top_k: int = 5


async def _index_document(doc: Document, db: AsyncSession):
    chunks = chunk_text(doc.content)
    for i, c in enumerate(chunks):
        emb = await embed_text(c)
        db.add(DocumentChunk(
            document_id=doc.id, workspace_id=doc.workspace_id,
            chunk_index=i, content=c, embedding=emb,
        ))
    doc.chunk_count = len(chunks)
    doc.is_indexed = True


@router.post("/documents")
async def create_document(
    data: DocCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = Document(workspace_id=data.workspace_id, title=data.title,
                   content=data.content, source=data.source)
    db.add(doc)
    await db.flush()
    await _index_document(doc, db)
    await db.flush()
    return {"id": str(doc.id), "title": doc.title, "chunk_count": doc.chunk_count}


@router.post("/documents/upload")
async def upload_document(
    workspace_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    raw = await file.read()
    name = file.filename or "document"
    source = "text"
    content = ""

    if name.lower().endswith(".pdf"):
        source = "pdf"
        try:
            from pypdf import PdfReader
            import io
            reader = PdfReader(io.BytesIO(raw))
            content = "\n".join((p.extract_text() or "") for p in reader.pages)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"PDF parse failed: {e}")
    else:
        source = "md" if name.lower().endswith(".md") else "text"
        content = raw.decode("utf-8", errors="ignore")

    if not content.strip():
        raise HTTPException(status_code=400, detail="No extractable text")

    doc = Document(workspace_id=workspace_id, title=name, content=content, source=source)
    db.add(doc)
    await db.flush()
    await _index_document(doc, db)
    await db.flush()
    return {"id": str(doc.id), "title": doc.title, "chunk_count": doc.chunk_count, "source": source}


@router.get("/documents/workspace/{workspace_id}")
async def list_documents(
    workspace_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(Document.workspace_id == workspace_id)
        .order_by(Document.created_at.desc())
    )
    docs = result.scalars().all()
    return {"documents": [
        {"id": str(d.id), "title": d.title, "source": d.source,
         "chunk_count": d.chunk_count, "is_indexed": d.is_indexed,
         "created_at": d.created_at.isoformat()}
        for d in docs
    ]}


@router.delete("/documents/{document_id}")
async def delete_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    await db.delete(doc)
    return {"deleted": str(document_id)}


@router.post("/search")
async def search(
    data: SearchIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q_emb = await embed_text(data.query)
    result = await db.execute(
        select(DocumentChunk).where(DocumentChunk.workspace_id == data.workspace_id)
    )
    chunks = result.scalars().all()

    scored = []
    for c in chunks:
        if c.embedding:
            scored.append((cosine(q_emb, c.embedding), c))
    scored.sort(key=lambda x: x[0], reverse=True)

    # fetch doc titles
    top = scored[:data.top_k]
    doc_ids = {c.document_id for _, c in top}
    titles = {}
    if doc_ids:
        dres = await db.execute(select(Document).where(Document.id.in_(doc_ids)))
        titles = {d.id: d.title for d in dres.scalars().all()}

    return {"results": [
        {"score": round(score, 4), "content": c.content,
         "document_id": str(c.document_id), "document_title": titles.get(c.document_id, "?"),
         "chunk_index": c.chunk_index}
        for score, c in top
    ]}
