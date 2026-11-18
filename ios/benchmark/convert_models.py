"""Convert the three visual encoders into fixed-shape iOS 17 Core ML packages."""

import argparse
from pathlib import Path

import coremltools as ct
import torch
from torch import nn
from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small
from transformers import Dinov2Model


class Encoder(nn.Module):
    def __init__(self, name):
        super().__init__()
        self.mobile = name == "mobilenet-v3-small"
        if self.mobile:
            self.model = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.IMAGENET1K_V1)
        else:
            self.model = Dinov2Model.from_pretrained(f"facebook/{name}", attn_implementation="eager")
        self.register_buffer("mean", torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1))
        self.register_buffer("std", torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1))

    def forward(self, image):
        standardized = (image - self.mean) / self.std
        if self.mobile:
            return self.model.avgpool(self.model.features(standardized)).flatten(1)
        return self.model(pixel_values=standardized, return_dict=False)[0][:, 0, :]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("model", choices=["mobilenet-v3-small", "dinov2-small", "dinov2-base"])
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    torch.manual_seed(42)
    example = torch.rand(1, 3, 224, 224)
    encoder = Encoder(args.model).eval()
    with torch.no_grad():
        traced = torch.jit.trace(encoder, example)
    converted = ct.convert(
        traced,
        convert_to="mlprogram",
        inputs=[ct.ImageType(name="image", shape=example.shape, scale=1 / 255,
                             color_layout=ct.colorlayout.RGB)],
        outputs=[ct.TensorType(name="embedding")],
        minimum_deployment_target=ct.target.iOS17,
        compute_precision=ct.precision.FLOAT16,
    )
    converted.save(str(args.output / (args.model + ".mlpackage")))


if __name__ == "__main__":
    main()
