"""Tests for tools/bank_export.py (sanitized monthly bank transaction files).
Run: python3 -m unittest discover -s tools/tests  (from the repo root)"""
import os, shutil, sys, tempfile, unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import bank_export as be  # noqa: E402

IBAN = "IT60X0542811101000000123456"      # the standard example IBAN (checksum-valid)
CARD = "4111 1111 1111 1111"              # the standard test card number (Luhn-valid)
UUID = "3f2a9c1e-1b2c-4d5e-8f90-1a2b3c4d5e6f"


def row(**kw):
    r = {"date": "2030-01-05", "amount": "-12.50", "currency": "EUR", "counterparty": "Example Shop",
         "description": "Example Shop", "category": "", "type": "CARD_PAYMENT", "status": "BOOK", "account": "EUR-0001"}
    r.update(kw)
    return r


class Sanitize(unittest.TestCase):
    def test_iban_keeps_last4(self):
        s = be.sanitize("transfer to %s please" % IBAN)
        self.assertNotIn(IBAN, s)
        self.assertIn("IBAN ****3456", s)
        self.assertEqual(be.find_ibans(s), [])

    def test_spaced_iban(self):
        s = be.sanitize("IT60 X054 2811 1010 0000 0123 456")
        self.assertIn("****3456", s)
        self.assertNotIn("0000 0123", s)

    def test_card_masked(self):
        s = be.sanitize("card %s used" % CARD)
        self.assertIn("****1111", s)
        self.assertEqual(be.find_cards(s), [])

    def test_references_dropped(self):
        s = be.sanitize("To EUR MB:%s" % UUID)
        self.assertNotIn(UUID[:8], s)
        self.assertIn("[ref]", s)
        self.assertIn("[ref]", be.sanitize("Bonifico CRO: 0123456789ABCD"))
        self.assertIn("[ref]", be.sanitize("order A1B2C3D4E5F6G7"))

    def test_plain_text_kept(self):
        self.assertEqual(be.sanitize("Coffee bar 2030-01-05"), "Coffee bar 2030-01-05")
        self.assertEqual(be.sanitize("a | b\nc"), "a \\| b c")

    def test_detectors(self):
        self.assertTrue(be.find_ibans(IBAN, True))
        self.assertFalse(be.find_ibans(IBAN[:-1] + "7", True))
        self.assertTrue(be.find_cards(CARD, True))
        self.assertFalse(be.find_cards("4111 1111 1111 1112", True))
        self.assertFalse(be.find_cards("0000000000000000", True))
        # published examples are skipped by default (code and tests may carry them)
        self.assertEqual(be.find_ibans(IBAN) + be.find_cards(CARD), [])
        # a Luhn-valid id without a card scheme prefix (chat/group ids) is not a card
        self.assertFalse(be.find_cards("120363000000000002", True) and not be.card_brand_ok("120363000000000002"))
        self.assertFalse(be.card_brand_ok("120363000000000002"))


def read(path):
    with open(path, encoding="utf8") as fh:
        return fh.read()


class Months(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.d)

    def wf(self, path, text):
        with open(path, "w", encoding="utf8") as fh:
            fh.write(text)

    def test_write_and_idempotent(self):
        rows = [row(), row(date="2030-01-20", amount="100.00", description="From %s" % IBAN, counterparty=""),
                row(date="2030-02-01", description="card %s" % CARD, status="PDNG", account="EUR-ab12")]
        c1 = be.write_months(rows, self.d, "Example Bank", "example", self.wf, accounts={"EUR-0001": "main"})
        self.assertEqual(c1, {"2030-01": 2, "2030-02": 1})
        a = read(os.path.join(self.d, "example-2030-01.md"))
        c2 = be.write_months(list(reversed(rows)), self.d, "Example Bank", "example", self.wf,
                             accounts={"EUR-0001": "main"})
        self.assertEqual(c1, c2)
        self.assertEqual(a, read(os.path.join(self.d, "example-2030-01.md")))
        self.assertNotIn(IBAN, a)
        self.assertIn("| UNKNOWN | CARD_PAYMENT | EUR-0001 | booked |", a)
        b = read(os.path.join(self.d, "example-2030-02.md"))
        self.assertIn("pending", b)
        self.assertIn("EUR-ab12 = UNKNOWN", b)
        for t in (a, b):
            self.assertEqual(be.find_ibans(t, True) + be.find_cards(t, True), [])

    def test_unmasked_label_refused(self):
        with self.assertRaises(ValueError):
            be.write_months([row(account=IBAN)], self.d, "Example Bank", "example", self.wf)


if __name__ == "__main__":
    unittest.main()
