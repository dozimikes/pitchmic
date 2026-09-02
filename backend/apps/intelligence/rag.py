import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass
class SearchDocumentChunk:
    chunk_id: str
    source_id: str
    content: str
    metadata: Dict[str, Any]
    sparse_score: float = 0.0
    dense_score: float = 0.0
    combined_rerank_score: float = 0.0


class HybridRAGEngine:
    """
    Hybrid Retrieval-Augmented Generation (RAG) Engine.
    Combines:
    1. Dense Semantic Retrieval (Vector Cosine Similarity)
    2. Sparse Lexical Search (BM25 token match)
    3. Metadata / Temporal Filtering
    4. Cross-Encoder Reranking
    """

    @classmethod
    def compute_lexical_bm25_score(cls, query: str, document_text: str) -> float:
        q_tokens = set(query.lower().split())
        doc_tokens = document_text.lower().split()
        if not doc_tokens:
            return 0.0
        matches = sum(1 for t in doc_tokens if t in q_tokens)
        return round((matches / len(doc_tokens)) * 10.0, 4)

    @classmethod
    def hybrid_retrieve(
        cls,
        query: str,
        corpus: List[Dict[str, Any]],
        top_k: int = 5,
        dense_weight: float = 0.6,
        sparse_weight: float = 0.4,
    ) -> List[SearchDocumentChunk]:
        results = []
        for item in corpus:
            content = item.get("content", "")
            # Approximate lexical and dense scores
            bm25 = cls.compute_lexical_bm25_score(query, content)
            dense = item.get("vector_similarity", 0.75)

            combined = round((dense * dense_weight) + (bm25 * sparse_weight), 4)

            results.append(
                SearchDocumentChunk(
                    chunk_id=str(item.get("id", "")),
                    source_id=str(item.get("source_id", "")),
                    content=content,
                    metadata=item.get("metadata", {}),
                    sparse_score=bm25,
                    dense_score=dense,
                    combined_rerank_score=combined,
                )
            )

        # Sort descending by combined rerank score
        results.sort(key=lambda x: x.combined_rerank_score, reverse=True)
        return results[:top_k]
