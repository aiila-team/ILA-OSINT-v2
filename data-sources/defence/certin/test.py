from parser import extract_advisories

advisories = extract_advisories()

print(str(advisories)[:3000])