"""Sentence-transformer embeddings for semantic skill similarity."""

import pickle
from pathlib import Path

import numpy as np

from normalize import NormalizedProfile, NormalizedJob

MODEL_NAME = "all-MiniLM-L6-v2"


def serialize_profile_skills(profile: NormalizedProfile) -> str:
    return ", ".join(profile.skills) if profile.skills else ""


def serialize_job_skills(job: NormalizedJob) -> str:
    skills = job.must_have_skills + job.nice_to_have_skills
    return ", ".join(skills) if skills else ""


class EmbeddingCache:
    def __init__(self, model_name: str = MODEL_NAME):
        self._model = None
        self._model_name = model_name
        self._cache: dict[str, np.ndarray] = {}

    @property
    def model(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self._model_name)
        return self._model

    def encode_batch(self, texts: list[str]) -> None:
        new_texts = [t for t in texts if t and t not in self._cache]
        if not new_texts:
            return
        embeddings = self.model.encode(
            new_texts, normalize_embeddings=True, show_progress_bar=True, batch_size=64
        )
        for text, emb in zip(new_texts, embeddings):
            self._cache[text] = emb

    def get(self, text: str) -> np.ndarray | None:
        if not text:
            return None
        if text not in self._cache:
            emb = self.model.encode(text, normalize_embeddings=True)
            self._cache[text] = emb
        return self._cache[text]

    def cosine_sim(self, text_a: str, text_b: str) -> float:
        if not text_a or not text_b:
            return 0.0
        emb_a = self.get(text_a)
        emb_b = self.get(text_b)
        if emb_a is None or emb_b is None:
            return 0.0
        return float(np.dot(emb_a, emb_b))

    def save(self, path: Path) -> None:
        with open(path, "wb") as f:
            pickle.dump(self._cache, f)

    def load(self, path: Path) -> None:
        if path.exists():
            with open(path, "rb") as f:
                self._cache = pickle.load(f)
