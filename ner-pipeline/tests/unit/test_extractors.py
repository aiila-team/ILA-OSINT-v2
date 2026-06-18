import unittest
from datetime import datetime, timezone
from app.schemas.enriched_doc import EnrichedDocument
from app.extractors.regex.phone import PhoneExtractor
from app.extractors.regex.email import EmailExtractor
from app.extractors.regex.upi import UPIExtractor
from app.extractors.regex.bank_account import BankAccountExtractor
from app.extractors.regex.crypto import CryptoExtractor
from app.extractors.regex.ip_address import IPAddressExtractor
from app.extractors.regex.domain import DomainExtractor
from app.extractors.regex.hashtag import HashtagExtractor
from app.extractors.regex.mention import MentionExtractor

class TestRegexExtractors(unittest.TestCase):
    def setUp(self):
        self.doc_kwargs = {
            "source": "test_source",
            "source_id": "doc_101",
            "published_at": datetime.now(timezone.utc),
            "collected_at": datetime.now(timezone.utc),
            "content_hash": "hash_12345",
            "is_duplicate": False,
            "translation_failed": False,
            "pipeline_version": "1.0.0"
        }

    def test_phone_extractor(self):
        extractor = PhoneExtractor()
        doc = EnrichedDocument(
            content="Get in touch via +91 98765 43210 or 09876543211 or +919876543212.",
            **self.doc_kwargs
        )
        entities = extractor.extract_all_fields(doc.get_extractable_fields())
        self.assertEqual(len(entities), 3)
        self.assertEqual(entities[0].value, "+919876543210")
        self.assertEqual(entities[1].value, "+919876543211")
        self.assertEqual(entities[2].value, "+919876543212")

    def test_email_extractor(self):
        extractor = EmailExtractor()
        doc = EnrichedDocument(
            content="Reach us at TEST@domain.COM or query@support.in.",
            **self.doc_kwargs
        )
        entities = extractor.extract_all_fields(doc.get_extractable_fields())
        self.assertEqual(len(entities), 2)
        self.assertEqual(entities[0].value, "test@domain.com")
        self.assertEqual(entities[1].value, "query@support.in")

    def test_upi_extractor(self):
        extractor = UPIExtractor()
        doc = EnrichedDocument(
            content="Transfer funds to user.name@okaxis or shop_id@paytm.",
            **self.doc_kwargs
        )
        entities = extractor.extract_all_fields(doc.get_extractable_fields())
        self.assertEqual(len(entities), 2)
        self.assertEqual(entities[0].value, "user.name@okaxis")
        self.assertEqual(entities[0].metadata["psp"], "okaxis")
        self.assertEqual(entities[1].value, "shop_id@paytm")
        self.assertEqual(entities[1].metadata["psp"], "paytm")

    def test_bank_account_extractor(self):
        extractor = BankAccountExtractor()
        doc = EnrichedDocument(
            content="Account details: A/C 123456789012 IFSC: SBIN0001234. Ignore random IFSC UTIB0000111.",
            **self.doc_kwargs
        )
        entities = extractor.extract_all_fields(doc.get_extractable_fields())
        self.assertEqual(len(entities), 1)
        self.assertEqual(entities[0].value, "SBIN0001234:123456789012")
        self.assertEqual(entities[0].metadata["ifsc"], "SBIN0001234")
        self.assertEqual(entities[0].metadata["account_number"], "123456789012")

    def test_crypto_extractor(self):
        extractor = CryptoExtractor()
        doc = EnrichedDocument(
            content="BTC: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa ETH: 0x32Be343B94f860124dC4fEe278FDCBD38C102D88 TRC20: TX9R54eC8w3vX28z9F3sX28z9f3sX28z9f",
            **self.doc_kwargs
        )
        entities = extractor.extract_all_fields(doc.get_extractable_fields())
        self.assertEqual(len(entities), 3)
        self.assertEqual(entities[0].metadata["coin"], "btc")
        self.assertEqual(entities[1].metadata["coin"], "eth")
        self.assertEqual(entities[1].value, "0x32be343b94f860124dc4fee278fdcbd38c102d88")
        self.assertEqual(entities[2].metadata["coin"], "usdt_trc20")

    def test_ip_extractor(self):
        extractor = IPAddressExtractor()
        doc = EnrichedDocument(
            content="Public IP: 8.8.8.8, Private IP: 192.168.1.5, loopback: 127.0.0.1.",
            **self.doc_kwargs
        )
        entities = extractor.extract_all_fields(doc.get_extractable_fields())
        self.assertEqual(len(entities), 1)
        self.assertEqual(entities[0].value, "8.8.8.8")

    def test_domain_extractor(self):
        extractor = DomainExtractor()
        doc = EnrichedDocument(
            content="Check portal.targetsite.com or portal.subdomain.gov.in. Exclude twitter.com and user@gmail.com.",
            **self.doc_kwargs
        )
        entities = extractor.extract_all_fields(doc.get_extractable_fields())
        values = [e.value for e in entities]
        self.assertIn("targetsite.com", values)
        self.assertNotIn("twitter.com", values)
        self.assertNotIn("gmail.com", values)

    def test_hashtag_extractor(self):
        extractor = HashtagExtractor()
        doc = EnrichedDocument(
            content="Social trends: #DelhiPolice, #bengali_hashtag #भारत_सरकार.",
            **self.doc_kwargs
        )
        entities = extractor.extract_all_fields(doc.get_extractable_fields())
        values = [e.value for e in entities]
        self.assertIn("#delhipolice", values)
        self.assertIn("#भारत_सरकार", values)

    def test_mention_extractor(self):
        extractor = MentionExtractor()
        
        # Twitter context
        doc_tw = EnrichedDocument(
            content="Twitter mention @DelhiPolice and user@domain.com.",
            **self.doc_kwargs
        )
        doc_tw.source = "twitter"
        entities_tw = extractor.extract_all_fields(doc_tw.get_extractable_fields())
        self.assertEqual(len(entities_tw), 1)
        self.assertEqual(entities_tw[0].value, "@delhipolice")
        self.assertEqual(entities_tw[0].metadata["platform"], "twitter")

        # Telegram context
        doc_tg = EnrichedDocument(
            content="Telegram username @DelhiPoliceTelegram.",
            **self.doc_kwargs
        )
        doc_tg.source = "telegram"
        entities_tg = extractor.extract_all_fields(doc_tg.get_extractable_fields())
        self.assertEqual(len(entities_tg), 1)
        self.assertEqual(entities_tg[0].value, "@delhipolicetelegram")
        self.assertEqual(entities_tg[0].metadata["platform"], "telegram")
