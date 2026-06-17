import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
from IndicTransToolkit.processor import IndicProcessor

# Device
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Language codes
src_lang = "tel_Telu"   # Telugu
tgt_lang = "eng_Latn"   # English

# Model
model_name = "ai4bharat/indictrans2-indic-en-dist-200M"

# Load tokenizer
tokenizer = AutoTokenizer.from_pretrained(
    model_name,
    trust_remote_code=True
)

# Load model
model = AutoModelForSeq2SeqLM.from_pretrained(
    model_name,
    trust_remote_code=True,
    torch_dtype=torch.float16 if DEVICE == "cuda" else torch.float32
).to(DEVICE)

# Indic Processor
ip = IndicProcessor(inference=True)

# Telugu text
input_sentences = [
    """
    ఇంటర్నెట్‌ డెస్క్‌: బంగారం ధరలు ఆకాశాన్ని తాకుతున్న వేళ పసిడి బాండ్లలో పెట్టుబడులు పెట్టినవారికి కాసుల వర్షం కురుస్తోంది. 2019-20 సిరీస్‌- VII సార్వభౌమ పసిడి బాండ్ల ప్రీమెచ్యూర్‌ రిడెంప్షన్‌ తేదీని ఆర్‌బీఐ తాజాగా ప్రకటించింది (Sovereign Gold Bonds). దీంతో అప్పట్లో ఈ బాండ్లు కొన్నవారికి ఇప్పుడు ఏకంగా 307.87% లాభం రావడం విశేషం.\n\n2019-20 సిరీస్‌-7 గోల్డ్‌ బాండ్లకు సంబంధించి తుది రిడెంప్షన్‌ తేదీని ఆర్‌బీఐ జూన్‌ 10గా ప్రకటించింది. 2019 డిసెంబర్‌ 10లో జారీ చేసిన బాండ్లకు ఇది వర్తిస్తుంది. 999 స్వచ్ఛత కలిగిన గ్రాము బంగారం ధరను రూ.15,275గా నిర్ణయించింది. నాటి గ్రాము బంగారం ధర రూ.3,745 ఉండగా.. ఈ లెక్కన పెట్టుబడిదారులు గ్రాము పసిడిపై 307.87% లాభాన్ని ఆర్జించారు. అంటే ఒక్కో గ్రాముపై రూ.11,530 లాభం వచ్చినట్టే. దీనికి ఏటా చెల్లించే 2.5 శాతం వడ్డీ దీనికి అదనం. అప్పట్లో డిజిటల్‌ లావాదేవీల్లో చెల్లింపులు చేసినవారికి అదనంగా గ్రాముపై మరో రూ.50 డిస్కౌంట్‌ లభిస్తుంది. ఈ లెక్కన చూస్తే అప్పట్లో పసిడి బాండ్లలో పెట్టుబడిన పెట్టినవారు 313.39% లాభాలు పొందినట్టే.\n\nప్రీమెచ్యూర్‌ బాండ్లు అంటే..?\nసావరిన్‌ గోల్డ్‌ బాండ్ల కాలపరిమితి 8 ఏళ్లు అయినప్పటికీ, మదుపర్లు ఐదో సంవత్సరం తర్వాత నుంచి ముందస్తు ఉపసంహరణ చేసుకునే వెసులుబాటు ఉంటుంది. ఈ బాండ్లపై ఏటా 2.5% వడ్డీ లభిస్తుంది. మెచ్యూరిటీ వరకు ఉంచుకుంటే వచ్చే లాభాలపై పన్ను మినహాయింపు ఉంటుంది. గడువు ముగియకముందే నగదు కావాలనుకునే పెట్టుబడిదారుల కోసం ప్రీమెచ్యూర్‌ తేదీని ఎప్పటికప్పుడు ఆర్‌బీఐ ప్రకటిస్తుంది. గ్రాము ధరను నిర్ణయించేందుకు రిడెంప్షన్‌ ముందు వారం చివరి మూడు రోజుల ఇండియా బులియన్‌ అండ్‌ జ్యువెల్లర్స్‌ అసోసియేషన్‌ (IBJA) నిర్ణయించిన సగటు ధరను పరిగణనలోకి తీసుకుంటుంది. ఆ విధంగా గ్రాము ధర రూ.15,275గా నిర్ణయించింది.
    """
]

# Preprocess
batch = ip.preprocess_batch(
    input_sentences,
    src_lang=src_lang,
    tgt_lang=tgt_lang
)

# Tokenize
inputs = tokenizer(
    batch,
    truncation=True,
    padding="longest",
    max_length=1024,
    return_tensors="pt",
    return_attention_mask=True,
).to(DEVICE)

# Translate
with torch.no_grad():
    generated_tokens = model.generate(
        **inputs,
        use_cache=True,
        min_length=0,
        max_length=1024,
        num_beams=5,
        num_return_sequences=1,
    )

# Decode
generated_text = tokenizer.batch_decode(
    generated_tokens,
    skip_special_tokens=True,
    clean_up_tokenization_spaces=True,
)

# Postprocess
translations = ip.postprocess_batch(
    generated_text,
    lang=tgt_lang
)

# Print results
for src, tgt in zip(input_sentences, translations):
    print("\n===== SOURCE (TELUGU) =====\n")
    print(src)

    print("\n===== TRANSLATION (ENGLISH) =====\n")
    print(tgt)