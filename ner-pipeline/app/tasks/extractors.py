import structlog
from celery.exceptions import SoftTimeLimitExceeded

from app.celery_app import celery_app
from app.schemas.enriched_doc import EnrichedDocument

log = structlog.get_logger()


# ── Shared helpers ────────────────────────────────────────────────────────────

def _parse_document(doc: dict, extractor_name: str) -> EnrichedDocument | None:
    """Validate and deserialize EnrichedDocument. Returns None on validation failure."""
    try:
        return EnrichedDocument.model_validate(doc)
    except Exception as exc:
        log.error("extractors.field_parse_failed", extractor=extractor_name, error=str(exc))
        return None


def _short_circuit(doc: dict, extractor_name: str) -> bool:
    """Returns True if extraction should be skipped."""
    if not isinstance(doc, dict):
        log.error("extractors.invalid_document_type", extractor=extractor_name, doc_type=type(doc).__name__)
        return True
    if doc.get("is_duplicate"):
        log.debug(f"{extractor_name}.skipped_duplicate",
                  source_id=doc.get("source_id"))
        return True
    return False


def _write_partial_result(source_id: str, task_name: str, results: list) -> None:
    """Writes task extraction results to Redis for partial chord recovery."""
    if not results:
        return
    try:
        from app.services.muril_client import redis_client
        import json
        key = f"ner:partial:{source_id}:{task_name}"
        data = [e.model_dump() for e in results]
        redis_client.setex(key, 300, json.dumps(data)) # TTL 5 minutes
    except Exception as exc:
        log.error("extractors.write_partial_failed", task=task_name, error=str(exc))


# ── Regex extractor tasks ─────────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    name="app.tasks.extractors.extract_phones",
    max_retries=3,
    queue="ner-fast",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
)
def extract_phones(self, doc: dict) -> list[dict]:
    if _short_circuit(doc, "extract_phones"):
        return []
    try:
        enriched = _parse_document(doc, "extract_phones")
        if not enriched:
            return []
        from app.extractors.regex.phone import PhoneExtractor
        extractor = PhoneExtractor()
        fields    = enriched.get_extractable_fields()
        results   = extractor.extract_all_fields(fields)
        _write_partial_result(enriched.source_id, self.name, results)
        log.debug("extract_phones.done",
                  source_id=enriched.source_id,
                  count=len(results))
        return [e.model_dump() for e in results]
    except SoftTimeLimitExceeded:
        log.error("extract_phones.soft_time_limit")
        return []


@celery_app.task(
    bind=True,
    name="app.tasks.extractors.extract_emails",
    max_retries=3,
    queue="ner-fast",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
)
def extract_emails(self, doc: dict) -> list[dict]:
    if _short_circuit(doc, "extract_emails"):
        return []
    try:
        enriched = _parse_document(doc, "extract_emails")
        if not enriched:
            return []
        from app.extractors.regex.email import EmailExtractor
        extractor = EmailExtractor()
        fields    = enriched.get_extractable_fields()
        results   = extractor.extract_all_fields(fields)
        _write_partial_result(enriched.source_id, self.name, results)
        log.debug("extract_emails.done",
                  source_id=enriched.source_id,
                  count=len(results))
        return [e.model_dump() for e in results]
    except SoftTimeLimitExceeded:
        log.error("extract_emails.soft_time_limit")
        return []


@celery_app.task(
    bind=True,
    name="app.tasks.extractors.extract_upi",
    max_retries=3,
    queue="ner-fast",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
)
def extract_upi(self, doc: dict) -> list[dict]:
    if _short_circuit(doc, "extract_upi"):
        return []
    try:
        enriched = _parse_document(doc, "extract_upi")
        if not enriched:
            return []
        from app.extractors.regex.upi import UPIExtractor
        extractor = UPIExtractor()
        fields    = enriched.get_extractable_fields()
        results   = extractor.extract_all_fields(fields)
        _write_partial_result(enriched.source_id, self.name, results)
        log.debug("extract_upi.done",
                  source_id=enriched.source_id,
                  count=len(results))
        return [e.model_dump() for e in results]
    except SoftTimeLimitExceeded:
        log.error("extract_upi.soft_time_limit")
        return []


@celery_app.task(
    bind=True,
    name="app.tasks.extractors.extract_bank_accounts",
    max_retries=3,
    queue="ner-fast",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
)
def extract_bank_accounts(self, doc: dict) -> list[dict]:
    if _short_circuit(doc, "extract_bank_accounts"):
        return []
    try:
        enriched = _parse_document(doc, "extract_bank_accounts")
        if not enriched:
            return []
        from app.extractors.regex.bank_account import BankAccountExtractor
        extractor = BankAccountExtractor()
        fields    = enriched.get_extractable_fields()
        results   = extractor.extract_all_fields(fields)
        _write_partial_result(enriched.source_id, self.name, results)
        log.debug("extract_bank_accounts.done",
                  source_id=enriched.source_id,
                  count=len(results))
        return [e.model_dump() for e in results]
    except SoftTimeLimitExceeded:
        log.error("extract_bank_accounts.soft_time_limit")
        return []


@celery_app.task(
    bind=True,
    name="app.tasks.extractors.extract_crypto",
    max_retries=3,
    queue="ner-fast",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
)
def extract_crypto(self, doc: dict) -> list[dict]:
    if _short_circuit(doc, "extract_crypto"):
        return []
    try:
        enriched = _parse_document(doc, "extract_crypto")
        if not enriched:
            return []
        from app.extractors.regex.crypto import CryptoExtractor
        extractor = CryptoExtractor()
        fields    = enriched.get_extractable_fields()
        results   = extractor.extract_all_fields(fields)
        _write_partial_result(enriched.source_id, self.name, results)
        log.debug("extract_crypto.done",
                  source_id=enriched.source_id,
                  count=len(results))
        return [e.model_dump() for e in results]
    except SoftTimeLimitExceeded:
        log.error("extract_crypto.soft_time_limit")
        return []


@celery_app.task(
    bind=True,
    name="app.tasks.extractors.extract_ip_addresses",
    max_retries=3,
    queue="ner-fast",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
)
def extract_ip_addresses(self, doc: dict) -> list[dict]:
    if _short_circuit(doc, "extract_ip_addresses"):
        return []
    try:
        enriched = _parse_document(doc, "extract_ip_addresses")
        if not enriched:
            return []
        from app.extractors.regex.ip_address import IPAddressExtractor
        extractor = IPAddressExtractor()
        fields    = enriched.get_extractable_fields()
        results   = extractor.extract_all_fields(fields)
        _write_partial_result(enriched.source_id, self.name, results)
        log.debug("extract_ip_addresses.done",
                  source_id=enriched.source_id,
                  count=len(results))
        return [e.model_dump() for e in results]
    except SoftTimeLimitExceeded:
        log.error("extract_ip_addresses.soft_time_limit")
        return []


@celery_app.task(
    bind=True,
    name="app.tasks.extractors.extract_domains",
    max_retries=3,
    queue="ner-fast",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
)
def extract_domains(self, doc: dict) -> list[dict]:
    if _short_circuit(doc, "extract_domains"):
        return []
    try:
        enriched = _parse_document(doc, "extract_domains")
        if not enriched:
            return []
        from app.extractors.regex.domain import DomainExtractor
        extractor = DomainExtractor()
        fields    = enriched.get_extractable_fields()
        results   = extractor.extract_all_fields(fields)
        _write_partial_result(enriched.source_id, self.name, results)
        log.debug("extract_domains.done",
                  source_id=enriched.source_id,
                  count=len(results))
        return [e.model_dump() for e in results]
    except SoftTimeLimitExceeded:
        log.error("extract_domains.soft_time_limit")
        return []


@celery_app.task(
    bind=True,
    name="app.tasks.extractors.extract_hashtags",
    max_retries=3,
    queue="ner-fast",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
)
def extract_hashtags(self, doc: dict) -> list[dict]:
    if _short_circuit(doc, "extract_hashtags"):
        return []
    try:
        enriched = _parse_document(doc, "extract_hashtags")
        if not enriched:
            return []
        from app.extractors.regex.hashtag import HashtagExtractor
        extractor = HashtagExtractor()
        fields    = enriched.get_extractable_fields()
        results   = extractor.extract_all_fields(fields)
        _write_partial_result(enriched.source_id, self.name, results)
        log.debug("extract_hashtags.done",
                  source_id=enriched.source_id,
                  count=len(results))
        return [e.model_dump() for e in results]
    except SoftTimeLimitExceeded:
        log.error("extract_hashtags.soft_time_limit")
        return []


@celery_app.task(
    bind=True,
    name="app.tasks.extractors.extract_mentions",
    max_retries=3,
    queue="ner-fast",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
)
def extract_mentions(self, doc: dict) -> list[dict]:
    if _short_circuit(doc, "extract_mentions"):
        return []
    try:
        enriched = _parse_document(doc, "extract_mentions")
        if not enriched:
            return []
        from app.extractors.regex.mention import MentionExtractor
        extractor = MentionExtractor(source=enriched.source)
        fields    = enriched.get_extractable_fields()
        results   = extractor.extract_all_fields(fields)
        _write_partial_result(enriched.source_id, self.name, results)
        log.debug("extract_mentions.done",
                  source_id=enriched.source_id,
                  count=len(results))
        return [e.model_dump() for e in results]
    except SoftTimeLimitExceeded:
        log.error("extract_mentions.soft_time_limit")
        return []


# ── ML extractor tasks ────────────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    name="app.tasks.extractors.extract_persons",
    max_retries=3,
    queue="ner-ml",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=30,
    retry_jitter=True,
)
def extract_persons(self, doc: dict) -> list[dict]:
    if _short_circuit(doc, "extract_persons"):
        return []
    try:
        enriched = _parse_document(doc, "extract_persons")
        if not enriched:
            return []
        from app.extractors.ml.person import PersonExtractor
        extractor          = PersonExtractor(
            source_id=enriched.source_id,
            translation_failed=enriched.translation_failed
        )
        fields             = enriched.get_extractable_fields()
        results            = extractor.extract_all_fields(fields)
        _write_partial_result(enriched.source_id, self.name, results)
        log.debug("extract_persons.done",
                  source_id=enriched.source_id,
                  count=len(results))
        return [e.model_dump() for e in results]
    except SoftTimeLimitExceeded:
        log.error("extract_persons.soft_time_limit")
        return []


@celery_app.task(
    bind=True,
    name="app.tasks.extractors.extract_orgs",
    max_retries=3,
    queue="ner-ml",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=30,
    retry_jitter=True,
)
def extract_orgs(self, doc: dict) -> list[dict]:
    if _short_circuit(doc, "extract_orgs"):
        return []
    try:
        enriched = _parse_document(doc, "extract_orgs")
        if not enriched:
            return []
        from app.extractors.ml.organisation import OrganisationExtractor
        extractor          = OrganisationExtractor(
            source_id=enriched.source_id,
            translation_failed=enriched.translation_failed
        )
        fields             = enriched.get_extractable_fields()
        results            = extractor.extract_all_fields(fields)
        _write_partial_result(enriched.source_id, self.name, results)
        log.debug("extract_orgs.done",
                  source_id=enriched.source_id,
                  count=len(results))
        return [e.model_dump() for e in results]
    except SoftTimeLimitExceeded:
        log.error("extract_orgs.soft_time_limit")
        return []


@celery_app.task(
    bind=True,
    name="app.tasks.extractors.extract_locations",
    max_retries=3,
    queue="ner-ml",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=30,
    retry_jitter=True,
)
def extract_locations(self, doc: dict) -> list[dict]:
    if _short_circuit(doc, "extract_locations"):
        return []
    try:
        enriched = _parse_document(doc, "extract_locations")
        if not enriched:
            return []
        from app.extractors.ml.location import LocationExtractor
        extractor          = LocationExtractor(
            source_id=enriched.source_id,
            translation_failed=enriched.translation_failed
        )
        fields             = enriched.get_extractable_fields()
        results            = extractor.extract_all_fields(fields)
        _write_partial_result(enriched.source_id, self.name, results)
        log.debug("extract_locations.done",
                  source_id=enriched.source_id,
                  count=len(results))
        return [e.model_dump() for e in results]
    except SoftTimeLimitExceeded:
        log.error("extract_locations.soft_time_limit")
        return []


# ── Legacy backward compatibility aliases ────────────────────────────────────

extract_phone = extract_phones
extract_email = extract_emails
extract_bank_account = extract_bank_accounts
extract_ip_address = extract_ip_addresses
extract_domain = extract_domains
extract_hashtag = extract_hashtags
extract_mention = extract_mentions
extract_person = extract_persons
extract_organisation = extract_orgs
extract_location = extract_locations
