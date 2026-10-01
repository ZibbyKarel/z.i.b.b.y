"""Batch driver: loads an mflux model ONCE, generates every item, one JSON line per finished item.

stdin:  {"model","quantize","steps","loras":[],"items":[{"key","prompt","seed","width","height","out"}]}
stdout: {"key","file","durationMs"}   (other stdout noise is ignored by the caller)
Run with the mflux tool venv python (see PF_MFLUX_PYTHON).
"""

import json
import os
import sys
import time

import mlx.core as mx

from mflux.models.common.config.model_config import AVAILABLE_MODELS


def main() -> None:
    job = json.load(sys.stdin)
    model_name = job["model"]
    config = AVAILABLE_MODELS[model_name]
    loras = job.get("loras") or []
    kwargs = {"model_config": config, "quantize": job.get("quantize")}
    if loras:
        kwargs.update(lora_paths=loras, lora_scales=[1.0] * len(loras))

    if model_name.startswith("flux2-"):
        from mflux.models.flux2.variants import Flux2Klein

        model = Flux2Klein(**kwargs)
        extra = {"guidance": 1.0, "scheduler": "flow_match_euler_discrete"}
    elif model_name == "z-image-turbo":
        from mflux.models.z_image.variants.z_image import ZImage

        model = ZImage(**kwargs)
        extra = {"guidance": 0.0}
    else:
        raise SystemExit(f"unsupported model {model_name}")

    for it in job["items"]:
        t0 = time.time()
        image = model.generate_image(
            seed=it["seed"],
            prompt=it["prompt"],
            width=it["width"],
            height=it["height"],
            num_inference_steps=job["steps"],
            **extra,
        )
        if os.path.exists(it["out"]):
            os.unlink(it["out"])  # mflux would otherwise rename to _1.png
        image.save(path=it["out"])
        del image
        mx.clear_cache()  # keeps later images as fast as the first on 24 GB
        print(json.dumps({"key": it["key"], "file": it["out"], "durationMs": round((time.time() - t0) * 1000)}), flush=True)


if __name__ == "__main__":
    main()
