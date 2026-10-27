"""Batch driver: loads an mflux model ONCE, generates every item, one JSON line per finished item.

stdin:  {"model","quantize","steps","loras":[],"items":[{"key","prompt","seed","width","height","out","images"?}]}
stdout: {"key","file","durationMs"}   (other stdout noise is ignored by the caller)
Items with `images` (reference PNGs) run through FLUX.2 klein edit (image-conditioned); the
text-only items run first, then the model is swapped, so only one model is resident on 24 GB.
Run with the mflux tool venv python (see PF_MFLUX_PYTHON).
"""

import gc
import json
import os
import sys
import time

import mlx.core as mx

from mflux.models.common.config.model_config import AVAILABLE_MODELS


def load(model_name, kwargs, edit):
    if model_name.startswith("flux2-"):
        from mflux.models.flux2.variants import Flux2Klein, Flux2KleinEdit

        if edit:
            return Flux2KleinEdit(**kwargs), {"guidance": 1.0}
        return Flux2Klein(**kwargs), {"guidance": 1.0, "scheduler": "flow_match_euler_discrete"}
    if edit:
        raise SystemExit(f"{model_name} has no reference-image editing (use a flux2- model)")
    if model_name == "z-image-turbo":
        from mflux.models.z_image.variants.z_image import ZImage

        return ZImage(**kwargs), {"guidance": 0.0}
    raise SystemExit(f"unsupported model {model_name}")


def main() -> None:
    job = json.load(sys.stdin)
    model_name = job["model"]
    loras = job.get("loras") or []
    kwargs = {"model_config": AVAILABLE_MODELS[model_name], "quantize": job.get("quantize")}
    if loras:
        kwargs.update(lora_paths=loras, lora_scales=[1.0] * len(loras))

    for edit in (False, True):
        items = [it for it in job["items"] if bool(it.get("images")) == edit]
        if not items:
            continue
        model, extra = load(model_name, kwargs, edit)
        for it in items:
            t0 = time.time()
            refs = {"image_paths": it["images"]} if edit else {}
            image = model.generate_image(
                seed=it["seed"],
                prompt=it["prompt"],
                width=it["width"],
                height=it["height"],
                num_inference_steps=job["steps"],
                **extra,
                **refs,
            )
            if os.path.exists(it["out"]):
                os.unlink(it["out"])  # mflux would otherwise rename to _1.png
            image.save(path=it["out"])
            del image
            mx.clear_cache()  # keeps later images as fast as the first on 24 GB
            print(json.dumps({"key": it["key"], "file": it["out"], "durationMs": round((time.time() - t0) * 1000)}), flush=True)
        del model
        gc.collect()
        mx.clear_cache()


if __name__ == "__main__":
    main()
