"""Export all models to ONNX format for runtime inference.

Exports:
  1. skills_lgbm.onnx — LightGBM skills scorer
  2. embedding_encoder.onnx — MiniLM sentence encoder for cosine sim
  3. reranker.onnx — MiniLM cross-encoder for shortlist reranking

Usage: python3 export_onnx.py
"""

import json
import pickle
from pathlib import Path

import numpy as np

from config import MODELS_DIR
from features import FEATURE_NAMES

EXPORT_DIR = MODELS_DIR / "onnx"


def export_lightgbm():
    print("Exporting LightGBM skills model...")
    import onnxmltools
    from onnxmltools.convert.lightgbm.convert import convert as convert_lgbm
    from onnxconverter_common import FloatTensorType

    with open(MODELS_DIR / "skills_model.pkl", "rb") as f:
        model = pickle.load(f)

    n_features = len(FEATURE_NAMES)
    initial_type = [("features", FloatTensorType([None, n_features]))]
    onnx_model = convert_lgbm(model, initial_types=initial_type, target_opset=11)

    path = EXPORT_DIR / "skills_lgbm.onnx"
    onnxmltools.utils.save_model(onnx_model, str(path))
    print(f"  Saved: {path} ({path.stat().st_size / 1024:.1f} KB)")

    # Also export calibration as JSON (isotonic regression — not a neural net)
    with open(MODELS_DIR / "skills_calibration.pkl", "rb") as f:
        iso = pickle.load(f)
    cal_data = {
        "X_thresholds": iso.X_thresholds_.tolist(),
        "y_thresholds": iso.y_thresholds_.tolist(),
        "X_min": float(iso.X_min_),
        "X_max": float(iso.X_max_),
        "y_min": 50.0,
        "y_max": 100.0,
    }
    cal_path = EXPORT_DIR / "skills_calibration.json"
    with open(cal_path, "w") as f:
        json.dump(cal_data, f, indent=2)
    print(f"  Saved: {cal_path}")


def export_embedding_encoder():
    print("Exporting MiniLM embedding encoder...")
    from sentence_transformers import SentenceTransformer
    import torch

    model = SentenceTransformer("all-MiniLM-L6-v2", device="cpu")
    transformer = model[0].auto_model.cpu()
    tokenizer = model.tokenizer

    dummy = tokenizer("test skills text", return_tensors="pt", max_length=128,
                       truncation=True, padding="max_length")

    path = EXPORT_DIR / "embedding_encoder.onnx"
    torch.onnx.export(
        transformer,
        (dummy["input_ids"], dummy["attention_mask"]),
        str(path),
        input_names=["input_ids", "attention_mask"],
        output_names=["last_hidden_state"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq"},
            "attention_mask": {0: "batch", 1: "seq"},
            "last_hidden_state": {0: "batch", 1: "seq"},
        },
        opset_version=14,
    )
    print(f"  Saved: {path} ({path.stat().st_size / 1024 / 1024:.1f} MB)")

    tokenizer.save_pretrained(str(EXPORT_DIR / "embedding_tokenizer"))
    print(f"  Saved tokenizer: {EXPORT_DIR / 'embedding_tokenizer'}")


def export_reranker():
    print("Exporting MiniLM cross-encoder reranker...")
    from sentence_transformers import CrossEncoder
    import torch

    reranker_dir = MODELS_DIR / "reranker"
    if not (reranker_dir / "model.safetensors").exists():
        print("  Reranker model not found — skipping")
        return

    model = CrossEncoder(str(reranker_dir), device="cpu")
    transformer = model.model.cpu()
    tokenizer = model.tokenizer

    dummy = tokenizer("profile text", "job text", return_tensors="pt",
                       max_length=384, truncation=True, padding="max_length")

    path = EXPORT_DIR / "reranker.onnx"
    torch.onnx.export(
        transformer,
        (dummy["input_ids"], dummy["attention_mask"]),
        str(path),
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq"},
            "attention_mask": {0: "batch", 1: "seq"},
            "logits": {0: "batch"},
        },
        opset_version=14,
    )
    print(f"  Saved: {path} ({path.stat().st_size / 1024 / 1024:.1f} MB)")

    tokenizer.save_pretrained(str(EXPORT_DIR / "reranker_tokenizer"))
    print(f"  Saved tokenizer: {EXPORT_DIR / 'reranker_tokenizer'}")


def export_config():
    """Export runtime config — feature names, weights, thresholds."""
    config = {
        "feature_names": FEATURE_NAMES,
        "composite_weights": {
            "skills": 0.50,
            "location": 0.25,
            "seniority": 0.15,
            "domain": 0.10,
        },
        "shortlist_threshold": 60,
        "overqualified_threshold": 2,
        "score_range": {"min": 50, "max": 100},
        "models": {
            "skills_lgbm": "skills_lgbm.onnx",
            "skills_calibration": "skills_calibration.json",
            "embedding_encoder": "embedding_encoder.onnx",
            "embedding_tokenizer": "embedding_tokenizer/",
            "reranker": "reranker.onnx",
            "reranker_tokenizer": "reranker_tokenizer/",
        },
    }
    path = EXPORT_DIR / "config.json"
    with open(path, "w") as f:
        json.dump(config, f, indent=2)
    print(f"  Saved: {path}")


def main():
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    export_lightgbm()
    export_embedding_encoder()
    export_reranker()
    export_config()

    print(f"\n{'='*60}")
    print(f"All models exported to {EXPORT_DIR}")
    total_size = sum(f.stat().st_size for f in EXPORT_DIR.rglob("*") if f.is_file())
    print(f"Total size: {total_size / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
