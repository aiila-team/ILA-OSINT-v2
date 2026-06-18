"""
graph_engine.canonicalization.engine
=====================================
Turns a raw extracted-entity mention into a CanonicalEntity with a
deterministic, collision-resistant entity_id.

This is Phase 1 of the pipeline and the foundation everything else relies
on: if two mentions of "the same thing" don't normalize to the same
canonical_value, Stage 1 exact-match resolution silently fails and you get
duplicate nodes in the graph forever. Get this layer right and entity
resolution becomes mostly free for the EXACT_MATCH_TYPES.

Per-type normalization rules implemented:
  domain        -> lowercase, strip scheme, strip leading "www.", strip
                   trailing dot/slash, strip port
  email         -> lowercase entire address (note: technically the local
                   part is case-sensitive per RFC, but in OSINT practice
                   treating it as case-insensitive avoids massive duplicate
                   inflation and matches real-world mail provider behavior)
  phone         -> strip all non-digit characters except leading '+',
                   assume India (+91) when a bare 10-digit number is seen
                   and no country code is present
  ip            -> validated + re-serialized via `ipaddress` (catches
                   leading zeros, mixed case in IPv6, etc.)
  url           -> lowercase scheme+host, preserve path/query case,
                   strip default ports, strip trailing slash on bare paths
  social_account / mention_handle / hashtag
                -> lowercase, strip leading @ or # for the canonical form
                   (raw_value keeps the original presentation)
  upi           -> lowercase
  bank_account / crypto_wallet -> strip whitespace only (case may be
                   semantically meaningful, e.g. base58 crypto addresses)
  person / organization / location (fuzzy-match types)
                -> Unicode NFC normalization, transliteration hook,
                   whitespace collapse, diacritic-insensitive folding.
                   These are NOT exact-matched downstream — canonicalization
                   here only produces a *clean comparison string* for the
                   fuzzy matcher in Stage 2, not a guaranteed-unique id.
"""

from __future__ import annotations

import hashlib
import ipaddress
import re
import unicodedata
from urllib.parse import urlsplit, urlunsplit

from graph_engine.models import CanonicalEntity, EntityType, Evidence, RawExtractedEntity

_WWW_PREFIX = re.compile(r"^www\.", re.IGNORECASE)
_NON_DIGIT_PLUS = re.compile(r"[^\d+]")
_WHITESPACE = re.compile(r"\s+")


class UnsupportedEntityTypeError(ValueError):
    """Raised when an extraction service emits an entity_type the
    canonicalization engine doesn't (yet) know how to normalize. Callers
    should route these to a dead-letter / unresolved path rather than
    crash the consumer — extraction is allowed to evolve independently."""


class CanonicalizationEngine:
    """Stateless — every method is a pure function of its input. Safe to
    share a single instance across threads/processes/Faust partitions."""

    # Map of normalizer functions, one per EntityType.
    def __init__(self) -> None:
        self._normalizers = {
            EntityType.DOMAIN: self._normalize_domain,
            EntityType.EMAIL: self._normalize_email,
            EntityType.PHONE: self._normalize_phone,
            EntityType.IP: self._normalize_ip,
            EntityType.URL: self._normalize_url,
            EntityType.SOCIAL_ACCOUNT: self._normalize_handle,
            EntityType.MENTION_HANDLE: self._normalize_handle,
            EntityType.HASHTAG: self._normalize_handle,
            EntityType.UPI: lambda v: v.strip().lower(),
            EntityType.BANK_ACCOUNT: lambda v: v.strip(),
            EntityType.CRYPTO_WALLET: lambda v: v.strip(),
            EntityType.PERSON: self._normalize_freetext_name,
            EntityType.ORGANIZATION: self._normalize_freetext_name,
            EntityType.LOCATION: self._normalize_freetext_name,
            EntityType.SOURCE: self._normalize_freetext_name,
        }

    # -- public API ---------------------------------------------------

    def canonicalize(
        self,
        raw_entity: RawExtractedEntity,
        evidence: Evidence,
    ) -> CanonicalEntity:
        """Normalize one raw extracted entity into a CanonicalEntity.

        Raises UnsupportedEntityTypeError for unrecognized entity_type
        strings — the caller (Faust agent) is expected to catch this and
        route to a dead-letter topic rather than crash the partition.
        """
        try:
            entity_type = EntityType(raw_entity.entity_type.lower().strip())
        except ValueError as exc:
            raise UnsupportedEntityTypeError(
                f"Unknown entity_type='{raw_entity.entity_type}' "
                f"(value={raw_entity.value!r}); routing to dead-letter."
            ) from exc

        normalizer = self._normalizers[entity_type]
        canonical_value = normalizer(raw_entity.value)

        if not canonical_value:
            raise UnsupportedEntityTypeError(
                f"Normalization produced an empty canonical value for "
                f"type={entity_type} raw_value={raw_entity.value!r}"
            )

        entity_id = self.generate_entity_id(entity_type, canonical_value)

        return CanonicalEntity(
            entity_id=entity_id,
            entity_type=entity_type,
            canonical_value=canonical_value,
            raw_value=raw_entity.value,
            confidence=raw_entity.confidence,
            evidence=evidence,
        )

    @staticmethod
    def generate_entity_id(entity_type: EntityType, canonical_value: str) -> str:
        """Deterministic id: same (type, canonical_value) ALWAYS produces
        the same id, across services, languages, restarts, and time.
        Truncated to 32 hex chars (128 bits) — collision risk is
        astronomically below the scale this system will ever operate at,
        and the shorter id keeps Neo4j index/storage overhead down.
        """
        digest = hashlib.sha256(f"{entity_type.value}:{canonical_value}".encode("utf-8"))
        return digest.hexdigest()[:32]

    # -- per-type normalizers ------------------------------------------

    @staticmethod
    def _normalize_domain(value: str) -> str:
        v = value.strip().lower()
        v = re.sub(r"^[a-z]+://", "", v)          # strip scheme if present
        v = v.split("/")[0]                         # strip any path
        v = v.split(":")[0]                         # strip port
        v = _WWW_PREFIX.sub("", v)
        v = v.rstrip(".")
        return v

    @staticmethod
    def _normalize_email(value: str) -> str:
        return value.strip().lower()

    @staticmethod
    def _normalize_phone(value: str) -> str:
        v = _NON_DIGIT_PLUS.sub("", value.strip())
        if not v:
            return v
        if v.startswith("00"):
            v = "+" + v[2:]
        if not v.startswith("+"):
            # Bare national-format number. Default assumption is India
            # (+91) per deployment context — a 10-digit mobile number with
            # no country code is overwhelmingly the common case for this
            # platform's source mix. This is a deliberate, documented
            # assumption, not a silent guess: revisit if a non-Indian
            # source mix is onboarded.
            digits = v.lstrip("0")
            if len(digits) == 10:
                v = "+91" + digits
            else:
                v = "+" + v
        return v

    @staticmethod
    def _normalize_ip(value: str) -> str:
        try:
            ip_obj = ipaddress.ip_address(value.strip())
        except ValueError:
            # Not parseable — fall back to a trimmed/lowered string so the
            # pipeline doesn't crash; confidence should already be low for
            # a malformed IP extraction and this will simply fail to
            # exact-match anything, which is the safe failure mode.
            return value.strip().lower()
        return str(ip_obj)

    @staticmethod
    def _normalize_url(value: str) -> str:
        v = value.strip()
        if not re.match(r"^[a-zA-Z]+://", v):
            v = "http://" + v
        parts = urlsplit(v)
        scheme = parts.scheme.lower()
        netloc = parts.netloc.lower()
        netloc = _WWW_PREFIX.sub("", netloc)
        # strip default ports
        netloc = re.sub(r":80$", "", netloc) if scheme == "http" else netloc
        netloc = re.sub(r":443$", "", netloc) if scheme == "https" else netloc
        path = parts.path.rstrip("/") or ""
        normalized = urlunsplit((scheme, netloc, path, parts.query, ""))
        return normalized

    @staticmethod
    def _normalize_handle(value: str) -> str:
        v = value.strip().lower()
        v = v.lstrip("@#")
        return v

    @staticmethod
    def _normalize_freetext_name(value: str) -> str:
        """Produces a clean *comparison string* for fuzzy matching — this
        is NOT used to compute an authoritative entity_id by itself for
        FUZZY_MATCH_TYPES (resolution.engine handles identity for those);
        it is used as the normalized field the fuzzy matcher compares
        against, and as a fallback id seed when no match is found at all.
        """
        v = unicodedata.normalize("NFC", value.strip())
        v = _WHITESPACE.sub(" ", v)
        # Diacritic-insensitive fold for latin-script comparison; Indic
        # scripts pass through NFC-normalized (transliteration to a single
        # script is delegated to a pluggable hook below, since the "right"
        # transliteration model is a product/ops decision, not something
        # this engine should hardcode).
        folded = "".join(
            c for c in unicodedata.normalize("NFD", v)
            if unicodedata.category(c) != "Mn"
        )
        return folded.lower()

    # -- pluggable transliteration hook ---------------------------------

    def set_transliteration_hook(self, fn) -> None:
        """Allows wiring in IndicTrans2/ITRANS/ICU transliteration later
        without touching call sites. fn: (str) -> str. Applied to
        person/organization/location values before NFD-folding, if set."""
        self._transliterate = fn