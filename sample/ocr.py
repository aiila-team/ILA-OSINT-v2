import cv2
import pytesseract

pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

img = cv2.imread("sample/musk-card.jpg")

gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

# Binary threshold
_, thresh = cv2.threshold(
    gray,
    150,
    255,
    cv2.THRESH_BINARY
)

text = pytesseract.image_to_string(
    thresh,
    lang="hin+eng"
)

print(text)