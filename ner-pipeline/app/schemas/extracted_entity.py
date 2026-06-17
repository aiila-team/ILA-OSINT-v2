from pydantic import BaseModel, Field, field_validator

class ExtractedEntity(BaseModel):
    # ── core fields ───────────────────────────────────────────────────────────
    entity_type: str          # "phone"|"email"|"upi"|"bank_account"|"crypto"|"ip"|"domain"|"hashtag"|"mention"|"person"|"org"|"location"
    value: str                # normalized canonical value
    raw_value: str            # original string as found in text

    # ── confidence ────────────────────────────────────────────────────────────
    confidence: float         # 1.0 for regex, 0.0–1.0 for ML
    low_confidence: bool      # True if confidence < threshold (0.75)

    # ── provenance ────────────────────────────────────────────────────────────
    source_field: str         # "content"|"translated_content"|"ocr_text"
    char_start: int | None = None
    char_end: int | None = None

    # ── type-specific extras ──────────────────────────────────────────────────
    metadata: dict = Field(default_factory=dict)
    # phone     → {"carrier": str, "country_code": str, "number_type": str}
    # location  → {"latitude": float, "longitude": float, "country": str}
    # crypto    → {"coin_type": str}
    # bank      → {"ifsc": str, "bank_name": str}
    # domain    → {"tld": str, "registered_domain": str}

    @field_validator("entity_type", mode="before")
    @classmethod
    def lowercase_type(cls, v: str) -> str:
        if isinstance(v, str):
            return v.lower().strip()
        return str(v).lower().strip()

    @field_validator("value", "raw_value", mode="before")
    @classmethod
    def strip_values(cls, v: str) -> str:
        return str(v).strip()

    @field_validator("confidence", mode="before")
    @classmethod
    def clamp_confidence(cls, v: float) -> float:
        try:
            val = float(v)
            return round(max(0.0, min(1.0, val)), 4)
        except (ValueError, TypeError):
            return 1.0

    @field_validator("source_field", mode="before")
    @classmethod
    def validate_source_field(cls, v: str) -> str:
        allowed = {"content", "translated_content", "ocr_text"}
        if isinstance(v, str):
            val_clean = v.strip().lower()
            if val_clean in allowed:
                return val_clean
        return "content"
