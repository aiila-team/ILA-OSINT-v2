import re
import structlog

from app.extractors.base import EntityExtractor
from app.schemas.extracted_entity import ExtractedEntity

log = structlog.get_logger()

# IFSC code — 4 letter bank code + 0 + 6 alphanumeric branch code
# Examples: SBIN0001234, HDFC0000001, ICIC0000123
_IFSC_PATTERN = re.compile(
    r"\b([A-Z]{4}0[A-Z0-9]{6})\b"
)

# Bank account number — 9 to 18 digits
# Must appear near an IFSC or keywords to reduce false positives
_ACCOUNT_PATTERN = re.compile(
    r"\b(\d{9,18})\b"
)

# Context keywords that must appear within 200 chars of an account number
# Reduces false positives from phone numbers, OTPs, and other digit sequences
_CONTEXT_KEYWORDS: frozenset[str] = frozenset({
    "account", "acc", "a/c", "ac no", "account no",
    "account number", "bank", "ifsc", "neft", "rtgs",
    "imps", "transfer", "खाता", "बैंक",   # Hindi: account, bank
    "ব্যাংক", "অ্যাকাউন্ট",               # Bengali: bank, account
    "బ్యాంక్", "ఖాతా",                    # Telugu: bank, account
})

# IFSC prefix → bank name mapping (top 30 Indian banks)
_IFSC_BANK_MAP: dict[str, str] = {
    "SBIN": "State Bank of India",
    "HDFC": "HDFC Bank",
    "ICIC": "ICICI Bank",
    "AXIS": "Axis Bank",
    "PUNB": "Punjab National Bank",
    "UBIN": "Union Bank of India",
    "BKID": "Bank of India",
    "CNRB": "Canara Bank",
    "BARB": "Bank of Baroda",
    "IOBA": "Indian Overseas Bank",
    "ANDB": "Andhra Bank",
    "CORP": "Corporation Bank",
    "VIJB": "Vijaya Bank",
    "IDIB": "Indian Bank",
    "ALLA": "Allahabad Bank",
    "UCBA": "UCO Bank",
    "MAHB": "Bank of Maharashtra",
    "PSIB": "Punjab & Sind Bank",
    "UTBI": "United Bank of India",
    "SIBL": "South Indian Bank",
    "FDRL": "Federal Bank",
    "KARB": "Karnataka Bank",
    "KVBL": "Karur Vysya Bank",
    "LACB": "Lakshmi Vilas Bank",
    "CITI": "Citibank",
    "HSBC": "HSBC",
    "DEUT": "Deutsche Bank",
    "RATN": "RBL Bank",
    "YESB": "Yes Bank",
    "IDFC": "IDFC First Bank",
    "KKBK": "Kotak Mahindra Bank",
    "INDB": "IndusInd Bank",
    "PAYTM": "Paytm Payments Bank",
    "AIRP": "Airtel Payments Bank",
    "FINO": "Fino Payments Bank",
}


class BankAccountExtractor(EntityExtractor):
    def __init__(self):
        super().__init__(entity_type="bank_account")

    def extract(
        self,
        text: str,
        source_field: str,
    ) -> list[ExtractedEntity]:
        if not text:
            return []

        results: list[ExtractedEntity] = []
        text_lower = text.lower()

        try:
            ifsc_matches = list(_IFSC_PATTERN.finditer(text))
            account_matches = list(_ACCOUNT_PATTERN.finditer(text))

            paired_accounts: set[str] = set()

            # ── Step 1: Try to pair each account number with the closest IFSC code ──
            for acc_match in account_matches:
                account_number = acc_match.group(1)

                # skip phone-number-like sequences (10 digits starting with Indian mobile prefixes)
                if len(account_number) == 10 and account_number.startswith(
                    ("6", "7", "8", "9")
                ):
                    continue

                best_ifsc_match = None
                min_distance = float("inf")

                for ifsc_match in ifsc_matches:
                    # distance is the distance between start of account number and start of IFSC
                    distance = abs(ifsc_match.start() - acc_match.start())
                    if distance < min_distance:
                        min_distance = distance
                        best_ifsc_match = ifsc_match

                # If closest IFSC is within 150 characters, we pair them
                if best_ifsc_match and min_distance <= 150:
                    ifsc_code = best_ifsc_match.group(1)
                    bank_prefix = ifsc_code[:4]
                    bank_name = _IFSC_BANK_MAP.get(bank_prefix, "")
                    value = f"{ifsc_code}:{account_number}"

                    results.append(
                        ExtractedEntity(
                            entity_type=self.entity_type,
                            value=value,
                            raw_value=f"{ifsc_code} {account_number}",
                            confidence=1.0,
                            low_confidence=False,
                            source_field=source_field,
                            char_start=best_ifsc_match.start(),
                            char_end=best_ifsc_match.end(),
                            metadata={
                                "ifsc":           ifsc_code,
                                "account_number": account_number,
                                "bank_prefix":    bank_prefix,
                                "bank_name":      bank_name,
                            },
                        )
                    )
                    paired_accounts.add(account_number)

            # ── Step 2: Unpaired account numbers (only with nearby context keywords) ──
            for acc_match in account_matches:
                account_number = acc_match.group(1)

                # skip if already paired
                if account_number in paired_accounts:
                    continue

                # skip phone-number-like sequences
                if len(account_number) == 10 and account_number.startswith(
                    ("6", "7", "8", "9")
                ):
                    continue

                # skip OTP-like short sequences without bank context
                if len(account_number) < 11:
                    continue

                # search window: 150 chars before and after account number for context keywords
                window_start = max(0, acc_match.start() - 150)
                window_end = min(len(text), acc_match.end() + 150)
                window_lower = text[window_start:window_end].lower()

                has_local_context = any(kw in window_lower for kw in _CONTEXT_KEYWORDS)

                if has_local_context:
                    results.append(
                        ExtractedEntity(
                            entity_type=self.entity_type,
                            value=account_number,
                            raw_value=account_number,
                            confidence=0.8,    # lower confidence — no IFSC pairing
                            low_confidence=False,
                            source_field=source_field,
                            char_start=acc_match.start(1),
                            char_end=acc_match.end(1),
                            metadata={
                                "ifsc":           "",
                                "account_number": account_number,
                                "bank_prefix":    "",
                                "bank_name":      "",
                            },
                        )
                    )

        except Exception as exc:
            log.error(
                "extractor.bank_account.failed",
                source_field=source_field,
                error=str(exc),
            )

        return results
