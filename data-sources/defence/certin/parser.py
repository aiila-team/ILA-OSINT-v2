import requests
from bs4 import BeautifulSoup
import re
from urllib.parse import urljoin

BASE_URL = "https://www.cert-in.org.in"

LIST_URL = (
    BASE_URL +
    "/s2cMainServlet?pageid=PUBADVLIST02&year=2026"
)

def _extract_advisory_body(soup, advisory_id, title):
    content_area = soup.find("div", id="print_content") or soup
    raw_text = content_area.get_text(separator="\n", strip=True)
    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]

    unwanted_patterns = [
        r"^Home - Advisories",
        r"^CERT-In Advisory",
        r"^CIAD-\d{4}-\d{4}$",
        r"^Original Issue Date:",
        r"^Severity Rating:",
        r"^Software Affected",
        r"^Target Audience:",
        r"^Apply appropriate fixes as mentioned in SAP Security Advisory:",
        r"^SAP https?://",
    ]

    body_lines = []
    for line in lines:
        if advisory_id and advisory_id.group(1) in line:
            continue
        if title and line == title:
            continue
        if any(re.search(pattern, line) for pattern in unwanted_patterns):
            continue
        body_lines.append(line)

    return "\n\n".join(body_lines).strip()


def parse_advisory_page(url):

    response = requests.get(
        url,
        headers={"User-Agent": "ILA-OSINT"},
        timeout=30
    )

    soup = BeautifulSoup(
        response.text,
        "html.parser"
    )

    text = soup.get_text(
        separator="\n",
        strip=True
    )

    advisory_id = re.search(
        r"(CIAD-\d{4}-\d+)",
        text
    )

    date_match = re.search(
        r"Original Issue Date:\s*(.+)",
        text
    )

    severity_match = re.search(
        r"Severity Rating:\s*(.+)",
        text
    )

    lines = text.split("\n")

    title = ""

    for i, line in enumerate(lines):
        if advisory_id and advisory_id.group(1) in line:
            if i + 1 < len(lines):
                title = lines[i + 1].strip()
                break

    content = _extract_advisory_body(soup, advisory_id, title)
    if not content:
        content = title

    return {
        "id": advisory_id.group(1) if advisory_id else "",
        "title": title,
        "content": content,
        "date": date_match.group(1).strip() if date_match else "",
        "severity": severity_match.group(1).strip() if severity_match else "Unknown",
        "url": url
    }


def extract_advisories():

    response = requests.get(
        LIST_URL,
        headers={"User-Agent": "ILA-OSINT"},
        timeout=30
    )

    soup = BeautifulSoup(
        response.text,
        "html.parser"
    )

    advisories = []

    for link in soup.find_all("a"):

        text = link.get_text(strip=True)

        if "CIAD-2026" not in text:
            continue

        href = link.get("href")

        if not href:
            continue

        advisory_url = urljoin(BASE_URL, href)

        advisories.append(
            parse_advisory_page(
                advisory_url
            )
        )

    return advisories