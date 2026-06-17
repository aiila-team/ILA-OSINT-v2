import json
import numpy as np
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
from IndicTransToolkit.processor import IndicProcessor
import triton_python_backend_utils as pb_utils


class TritonPythonModel:
    def initialize(self, args):
        self.model_config = json.loads(args['model_config'])
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model_name = "ai4bharat/indictrans2-indic-en-dist-200M"
        
        # Load tokenizer and model locally in Triton
        self.tokenizer = AutoTokenizer.from_pretrained(
            self.model_name,
            trust_remote_code=True
        )
        self.model = AutoModelForSeq2SeqLM.from_pretrained(
            self.model_name,
            trust_remote_code=True,
            torch_dtype=torch.float16 if self.device == "cuda" else torch.float32
        ).to(self.device)
        self.ip = IndicProcessor(inference=True)

    def execute(self, requests):
        responses = []
        for request in requests:
            in_tensor = pb_utils.get_input_tensor_by_name(request, "TEXT")
            val = in_tensor.as_numpy()[0]
            input_text = val.decode("utf-8") if isinstance(val, bytes) else str(val)
            
            # Extract request parameters robustly
            params_str = request.parameters()
            params = json.loads(params_str) if params_str else {}
            
            def get_param(param_name, default):
                val = params.get(param_name)
                if val is None:
                    return default
                if isinstance(val, dict):
                    # Handle dict wrap from Triton's protobuf parameters serialization
                    return val.get("string_value", val.get("string_param", default))
                return str(val)
                
            src_lang = get_param("src_lang", "hin_Deva")
            tgt_lang = get_param("tgt_lang", "eng_Latn")

            try:
                batch = self.ip.preprocess_batch([input_text], src_lang=src_lang, tgt_lang=tgt_lang)
                inputs = self.tokenizer(
                    batch,
                    truncation=True,
                    padding="longest",
                    max_length=1024,
                    return_tensors="pt"
                ).to(self.device)
                
                with torch.no_grad():
                    generated_tokens = self.model.generate(
                        **inputs,
                        use_cache=True,
                        min_length=0,
                        max_length=1024,
                        num_beams=1,
                        num_return_sequences=1
                    )
                
                generated_text = self.tokenizer.batch_decode(
                    generated_tokens,
                    skip_special_tokens=True,
                    clean_up_tokenization_spaces=True
                )
                translations = self.ip.postprocess_batch(generated_text, lang=tgt_lang)
                translated_text = translations[0]
            except Exception as e:
                translated_text = f"Translation error: {str(e)}"

            out_tensor = pb_utils.Tensor(
                "TRANSLATION",
                np.array([translated_text.encode("utf-8")], dtype=object)
            )
            inference_response = pb_utils.InferenceResponse(output_tensors=[out_tensor])
            responses.append(inference_response)
            
        return responses

    def finalize(self):
        pass