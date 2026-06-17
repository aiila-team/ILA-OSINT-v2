import json
import numpy as np
import torch
from transformers import pipeline
import triton_python_backend_utils as pb_utils


class TritonPythonModel:
    def initialize(self, args):
        self.model_config = json.loads(args['model_config'])
        self.device = 0 if torch.cuda.is_available() else -1
        
        # We load the L3Cube Indic-NER model based on MuRIL
        # You can change this to any Hugging Face token-classification model ID
        self.model_name = "ai4bharat/IndicNER"
        
        # Load token classification pipeline locally in Triton
        self.nlp = pipeline(
            "ner",
            model=self.model_name,
            tokenizer=self.model_name,
            aggregation_strategy="simple",
            device=self.device
        )

    def execute(self, requests):
        responses = []
        for request in requests:
            in_tensor = pb_utils.get_input_tensor_by_name(request, "TEXT")
            val = in_tensor.as_numpy()[0]
            input_text = val.decode("utf-8") if isinstance(val, bytes) else str(val)

            try:
                # Perform inference
                ner_results = self.nlp(input_text)
                
                # Format to the keys expected by muril_client.py
                outputs_list = []
                for res in ner_results:
                    outputs_list.append({
                        "word": res["word"],
                        "entity": res["entity_group"], # e.g. "PER", "ORG", "LOC"
                        "score": float(res["score"]),
                        "start": int(res["start"]),
                        "end": int(res["end"])
                    })
                
                output_str = json.dumps(outputs_list)
            except Exception as e:
                output_str = json.dumps([{"error": str(e)}])

            out_tensor = pb_utils.Tensor(
                "NER_TAGS",
                np.array([output_str.encode("utf-8")], dtype=object)
            )
            inference_response = pb_utils.InferenceResponse(output_tensors=[out_tensor])
            responses.append(inference_response)
            
        return responses

    def finalize(self):
        pass
