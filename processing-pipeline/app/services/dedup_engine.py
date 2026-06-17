# app/services/dedup_engine.py
import hashlib
from functools import lru_cache

import numpy as np
import redis
import structlog
from datasketch import MinHash

from app.config import settings

logger = structlog.get_logger()


@lru_cache(maxsize=1)
def _get_redis_client() -> redis.Redis:
    """Returns a cached Redis client instance configured with the dedicated dedup database."""
    # Ensure we use the separate DB for deduplication keys to isolate eviction risk
    return redis.Redis.from_url(
        settings.REDIS_URL,
        db=settings.REDIS_DEDUP_DB,
        decode_responses=False  # Must be False to handle binary signature serialization
    )


class DedupEngine:
    """
    Production-grade Engine for exact and near-duplicate document detection.
    Implements a three-layer deduplication hierarchy optimized for performance (cheapest first):
      1. Exact source/id key check   — O(1) Redis GET/EXISTS
      2. SHA-256 content hash check  — O(1) Redis GET
      3. MinHash LSH near-duplicate  — O(1) bucketing via LSH bands, avoiding blocking KEYS scan.
    """

    def __init__(self) -> None:
        self.redis_client = _get_redis_client()
        self.ttl = settings.DEDUP_TTL_DAYS * 24 * 60 * 60
        self.num_perm = settings.DEDUP_NUM_PERM
        self.threshold = settings.DEDUP_JACCARD_THRESHOLD
        
        # Partition permutations into 20 bands of 6 rows (120 permutations total)
        self.b = 20
        self.r = 6

    def _get_shingles(self, text: str) -> set[str]:
        """Convert text into characteristic shingles (3-character and bigram combinations)."""
        cleaned = "".join(c.lower() for c in text if c.isalnum() or c.isspace())
        words = cleaned.split()
        shingles = set()
        
        # 3-char shingles
        for i in range(len(cleaned) - 2):
            shingles.add(cleaned[i : i + 3])
            
        # 2-word shingles (bigrams) for semantic structure
        for i in range(len(words) - 1):
            shingles.add(f"{words[i]}_{words[i+1]}")
            
        return shingles

    def compute_minhash(self, text: str) -> MinHash:
        """Compute the MinHash signature of the given text."""
        shingles = self._get_shingles(text)
        m = MinHash(num_perm=self.num_perm)
        for s in shingles:
            m.update(s.encode("utf-8"))
        return m

    def check_exact_duplicate(self, source: str, source_id: str) -> bool:
        """Layer 1: Check if an exact idempotency key exists in Redis."""
        key = f"dedup:exact:{source}:{source_id}"
        return bool(self.redis_client.exists(key))

    def check_near_duplicate(self, source: str, source_id: str, text: str) -> str | None:
        """
        Check for duplicates using Layer 2 (content hash) and Layer 3 (MinHash LSH).
        Returns the ID of the matched duplicate document if found, else None.
        """
        if not text.strip():
            return None

        # Layer 2: Fast SHA-256 Content Hash check
        content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
        hash_key = f"dedup:hash:{content_hash}"
        existing_match = self.redis_client.get(hash_key)
        if existing_match:
            match_str = (
                existing_match.decode("utf-8")
                if isinstance(existing_match, bytes)
                else str(existing_match)
            )
            logger.info(
                "Exact content hash duplicate detected",
                source_id=source_id,
                duplicate_of=match_str
            )
            return match_str

        # Layer 3: MinHash LSH check using bands/buckets
        m = self.compute_minhash(text)
        current_id = f"{source}:{source_id}"
        
        # Calculate bucket keys for each band
        bucket_keys = []
        for i in range(self.b):
            band_values = m.hashvalues[i * self.r : (i + 1) * self.r]
            band_hash = hashlib.md5(band_values.tobytes()).hexdigest()
            bucket_keys.append(f"dedup:lsh:band:{i}:bucket:{band_hash}")

        # Query all bucket candidates using a Redis pipeline
        pipe = self.redis_client.pipeline()
        for key in bucket_keys:
            pipe.smembers(key)
        results = pipe.execute()

        # Gather unique candidate IDs (excluding the current document)
        candidates = set()
        for members in results:
            if members:
                for member in members:
                    member_str = member.decode("utf-8") if isinstance(member, bytes) else member
                    if member_str != current_id:
                        candidates.add(member_str)

        if not candidates:
            return None

        # Fetch minhash signatures for candidates using a Redis pipeline
        pipe = self.redis_client.pipeline()
        candidate_list = list(candidates)
        for cand_id in candidate_list:
            pipe.get(f"dedup:signature:{cand_id}")
        signatures_raw = pipe.execute()

        best_cand = None
        best_sim = 0.0

        for cand_id, sig_bytes in zip(candidate_list, signatures_raw):
            if not sig_bytes:
                continue
            try:
                # Reconstruct candidate MinHash from binary data
                cand_hashvalues = np.frombuffer(sig_bytes, dtype=np.uint64)
                cand_minhash = MinHash(num_perm=self.num_perm, hashvalues=cand_hashvalues)
                sim = m.jaccard(cand_minhash)
                
                if sim >= self.threshold and sim > best_sim:
                    best_sim = sim
                    best_cand = cand_id
            except Exception as e:
                logger.warning(
                    "Failed to compute similarity for candidate",
                    candidate=cand_id,
                    error=str(e)
                )

        if best_cand:
            # Extract clean source_id from formatted candidate "source:source_id"
            clean_duplicate_of = best_cand.split(":", 1)[1] if ":" in best_cand else best_cand
            logger.info(
                "Near duplicate detected",
                doc_id=current_id,
                duplicate_of=clean_duplicate_of,
                similarity=best_sim
            )
            return clean_duplicate_of

        return None

    def register_exact_document(self, source: str, source_id: str, content_hash: str) -> None:
        """Register exact keys in Redis with expiration TTL."""
        pipe = self.redis_client.pipeline()
        
        # Layer 1 key (exact source/id lookup)
        exact_key = f"dedup:exact:{source}:{source_id}"
        pipe.setex(exact_key, self.ttl, content_hash)

        # Layer 2 key (exact content hash lookup mapping to source_id)
        hash_key = f"dedup:hash:{content_hash}"
        pipe.setex(hash_key, self.ttl, source_id)

        pipe.execute()

    def register_lsh_document(self, source: str, source_id: str, text: str) -> None:
        """Register the document's MinHash and LSH bands in Redis with expiration TTL."""
        if not text.strip():
            return

        m = self.compute_minhash(text)
        current_id = f"{source}:{source_id}"

        # Write signature and insert into LSH buckets in a single pipeline
        pipe = self.redis_client.pipeline()
        
        # Save MinHash signature bytes
        sig_key = f"dedup:signature:{current_id}"
        pipe.setex(sig_key, self.ttl, m.hashvalues.tobytes())

        # Insert into buckets for LSH indexing
        for i in range(self.b):
            band_values = m.hashvalues[i * self.r : (i + 1) * self.r]
            band_hash = hashlib.md5(band_values.tobytes()).hexdigest()
            bucket_key = f"dedup:lsh:band:{i}:bucket:{band_hash}"
            pipe.sadd(bucket_key, current_id)
            pipe.expire(bucket_key, self.ttl)

        pipe.execute()


# Alias for compatibility if imported as DeduplicationEngine
DeduplicationEngine = DedupEngine


@lru_cache(maxsize=1)
def get_dedup_engine() -> DedupEngine:
    return DedupEngine()
