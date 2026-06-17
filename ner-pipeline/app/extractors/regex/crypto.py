import re
import structlog

from app.extractors.base import EntityExtractor
from app.schemas.extracted_entity import ExtractedEntity

log = structlog.get_logger()


# ── Address patterns per coin ─────────────────────────────────────────────────

# Bitcoin — P2PKH (1...), P2SH (3...), Bech32 (bc1...)
_BTC_P2PKH  = re.compile(r"\b(1[a-km-zA-HJ-NP-Z1-9]{25,34})\b")
_BTC_P2SH   = re.compile(r"\b(3[a-km-zA-HJ-NP-Z1-9]{25,34})\b")
_BTC_BECH32 = re.compile(r"\b(bc1[a-zA-HJ-NP-Z0-9]{6,87})\b")

# Ethereum and ERC-20 tokens — 0x prefix + 40 hex chars
_ETH_PATTERN = re.compile(r"\b(0x[a-fA-F0-9]{40})\b")

# USDT TRC-20 (Tron network) — T prefix + 33 base58 chars
_TRON_PATTERN = re.compile(r"\b(T[A-Za-z1-9]{33})\b")

# USDT ERC-20 — same as ETH pattern (captured under ETH)

# Ripple (XRP) — r prefix + 24-34 base58 chars
_XRP_PATTERN = re.compile(r"\b(r[a-km-zA-HJ-NP-Z1-9]{24,34})\b")

# Litecoin — L or M prefix + 25-34 base58 chars
_LTC_PATTERN = re.compile(r"\b([LM][a-km-zA-HJ-NP-Z1-9]{25,34})\b")

# Monero — 4 prefix + 94 base58 chars (privacy coin — high ILA relevance)
_XMR_PATTERN = re.compile(r"\b(4[a-zA-Z0-9]{94})\b")

# Bitcoin Cash — q prefix (CashAddr format)
_BCH_PATTERN = re.compile(r"\b(q[a-z0-9]{41})\b")

# Consolidated registry
_COIN_PATTERNS: list[tuple[re.Pattern, str]] = [
    (_BTC_P2PKH,  "BTC"),
    (_BTC_P2SH,   "BTC"),
    (_BTC_BECH32, "BTC"),
    (_ETH_PATTERN, "ETH"),
    (_TRON_PATTERN, "USDT_TRC20"),
    (_XRP_PATTERN,  "XRP"),
    (_LTC_PATTERN,  "LTC"),
    (_XMR_PATTERN,  "XMR"),
    (_BCH_PATTERN,  "BCH"),
]

# Context keywords that raise confidence when found near a crypto address
_CRYPTO_KEYWORDS: frozenset[str] = frozenset({
    "bitcoin", "btc", "ethereum", "eth", "usdt", "tether",
    "crypto", "wallet", "blockchain", "transaction", "txid",
    "transfer", "send", "receive", "address", "monero", "xmr",
    "tron", "trx", "ripple", "xrp", "litecoin", "ltc",
    "क्रिप्टो", "वॉलेट",    # Hindi: crypto, wallet
})


class CryptoExtractor(EntityExtractor):

    def __init__(self):
        super().__init__(entity_type="crypto")

    def extract(
        self,
        text: str,
        source_field: str,
    ) -> list[ExtractedEntity]:
        if not text:
            return []

        results: list[ExtractedEntity] = []
        text_lower = text.lower()

        # pre-compute whether crypto context exists in the full text
        has_crypto_context = any(kw in text_lower for kw in _CRYPTO_KEYWORDS)

        try:
            seen_values: set[str] = set()

            for pattern, coin_type in _COIN_PATTERNS:
                for match in pattern.finditer(text):
                    raw   = match.group(1)
                    
                    # Normalization: lower EVM addresses (ETH) and Bech32/BCH (case-insensitive),
                    # preserve case for Base58 (BTC P2PKH/P2SH, TRON, XRP, LTC, XMR)
                    if coin_type == "ETH":
                        value = raw.lower()
                    elif coin_type == "BCH":
                        value = raw.lower()
                    elif coin_type == "BTC" and raw.lower().startswith("bc1"):
                        value = raw.lower()
                    else:
                        value = raw

                    # deduplicate within the same document field
                    if value in seen_values:
                        continue
                    seen_values.add(value)

                    # confidence: 1.0 with context keyword nearby, 0.8 without
                    window_start = max(0, match.start() - 100)
                    window_end   = min(len(text), match.end() + 100)
                    window_lower = text[window_start:window_end].lower()
                    local_context = any(
                        kw in window_lower for kw in _CRYPTO_KEYWORDS
                    )

                    confidence = 1.0 if (has_crypto_context or local_context) else 0.8

                    results.append(
                        ExtractedEntity(
                            entity_type="crypto",
                            value=value,
                            raw_value=raw,
                            confidence=confidence,
                            low_confidence=confidence < 0.75,
                            source_field=source_field,
                            char_start=match.start(1),
                            char_end=match.end(1),
                            metadata={
                                "coin":           coin_type.lower(),
                                "coin_type":      coin_type,
                                "has_context":    local_context,
                            },
                        )
                    )

        except Exception as exc:
            log.error(
                "extractor.crypto.failed",
                source_field=source_field,
                error=str(exc),
            )

        return results
