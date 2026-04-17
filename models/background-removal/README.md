---
license: cc-by-sa-4.0
pipeline_tag: image-segmentation
language: []
base_model: isnet-general-use.pth
model_type: bg_removal
tags:
  - computer-vision
  - image-background-removal
  - image-matting
  - e-commerce
  - is-net
---

# Background Removal

_Background Removal is an IS-Net–based human segmentation and background-removal model designed to automatically detect and isolate people in images. It produces high-quality binary/alpha masks and trimmed RGBA composites intended for downstream editing, compositing, and automated image pipelines. Although optimized for fashion photography, it is suitable for any application where the image contains human and the goal is to separate them cleanly from the background._

## Model Details

- **Architecture**: IS-Net
- **Objective**: Fine-tuning isnet-general-use model with TY fashion images to better performance of fashion images
- **Training Data**: Large-scale Trendyol fashion product image dataset containing human models
- **Hardware**: Multi-GPU training with PyTorch
- **Framework**: PyTorch

## Intended Use

- Automatically remove backgrounds from images containing human, isolating the subject for further editing, compositing, or analysis.

- Designed for use in applications such as e-commerce product photography, fashion catalogs, profile pictures, and creative media projects where the human subject needs to be cleanly separated from the background.

- Optimized for images with clear human presence; not intended for objects, animals, or scenes without people.

- Can be used as a preprocessing step for downstream tasks like virtual try-on, background replacement, and image-based content generation.

## Usage

Complete example to load the model, remove background of an image, and save the results:

```python
"""
ONNX inference script for image segmentation model.

This script loads an ONNX model and performs inference on an input image to generate
an alpha mask. The mask is combined with the RGB image and saved as output.
"""

import onnxruntime as ort
from utils import process_image

if __name__ == "__main__":
  MODEL_PATH = "model.onnx"
  SRC = "https://cdn.dsmcdn.com/ty184/product/media/images/20210924/23/136268224/224296134/1/1_org_zoom.jpg"
  OUTPUT_FILE = "out.png"

  # Initialize ONNX runtime session with CUDA and CPU providers
  ort_session = ort.InferenceSession(
      MODEL_PATH,
      providers=["CUDAExecutionProvider", "CPUExecutionProvider"]
  )
  
  process_image(SRC, ort_session, MODEL_PATH, OUTPUT_FILE)
```

## Model Performance

- **Achieve high-accuracy image matting**: Especially for intricate details on human models, such as hair and clothing textures.

### Training Configuration

- **Backbone**: IS-Net general use model trained on DIS dataset V1.0: DIS5K
- **Model Input Size**: 1800x1200
- **Training Framework**: Torch 1.13.1

## Limitations

- **Domain Specificity**: Optimized for e-commerce fashion product images with human models included; may not generalize well to other image domains
- **Image Quality**: Performance may degrade on low-quality, heavily compressed, or significantly distorted images
- **Category Bias**: Performance may vary across different product categories based on training data distribution

## Ethical Considerations

- **Commercial Use**: Designed for e-commerce applications; consider potential impacts on market competition
- **Privacy**: Ensure compliance with data protection regulations when processing product images
- **Fairness**: Monitor for biased similarity judgments across different product categories or brands

## Citation

```bibtex
@misc{trendyol2025backgroundremoval,
  title={Trendyol Background Removal},
  author={Trendyol Data Science Team},
  year={2025},
  howpublished={\url{https://huggingface.co/trendyol/background-removal}}
}
```

## Model Card Authors

- Trendyol Data Science Team

## License

This model is released by Trendyol as a source-available, non-open-source model.

### You are allowed to:

- View, download, and evaluate the model weights.
- Use the model for non-commercial research and internal testing.
- Use the model or its derivatives for commercial purposes, provided that:
  - You cite Trendyol as the original model creator.
  - You notify Trendyol in advance via cqm.datascience@trendyol.com or other designated contact.

### You are not allowed to:

- Redistribute or host the model or its derivatives on third-party platforms without prior written consent from Trendyol.
- Use the model in applications violating ethical standards, including but not limited to surveillance, misinformation, or harm to individuals or groups.

By downloading or using this model, you agree to the terms above.

© 2025 Trendyol Group. All rights reserved.

See the [LICENSE](LICENSE) file for more details.

---

_For technical support or questions about this model, please contact the Trendyol Data Science team._
