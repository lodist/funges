#!/usr/bin/env python3
"""Export BioCLIP's image tower to ONNX and verify the artifact that SHIPS.

The spike measured a PyTorch fp32 model. What ships to a browser is a quantized
ONNX graph. Those are not the same thing, so every number that gated the feature
is re-measured here against the actual artifact.

Only the image tower is exported. Text prompts are embedded once, offline, into a
small matrix (`--stage text-matrix`), so the text tower never reaches a device.

    python backend/tools/bioclip_export.py --stage export        # ONNX fp32 + parity vs PyTorch
    python backend/tools/bioclip_export.py --stage quantize      # int8 dynamic
    python backend/tools/bioclip_export.py --stage verify        # re-run the gate on int8
    python backend/tools/bioclip_export.py --stage text-matrix   # fp16 label matrix + labels file

Prompt construction is imported from bioclip_spike, never reimplemented: a
divergence there would ship a text matrix that is not the one that was measured.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from bioclip_spike import (  # noqa: E402
    CACHE,
    MODEL_HUB_ID,
    evaluate_embeddings,
    load_model,
    taxonomic_prompt,
)

ARTIFACTS = Path(__file__).resolve().parent / "model_artifacts"
ONNX_FP32 = ARTIFACTS / "image_tower_fp32.onnx"
ONNX_INT8 = ARTIFACTS / "image_tower_int8.onnx"

# Bundled, not R2 — small enough, and keeping it in the build means it can never
# be out of step with the labels file it is index-aligned to.
PUBLIC_MODELS = Path(__file__).resolve().parents[2] / "public" / "models"
TEXT_MATRIX = PUBLIC_MODELS / "bioclip_text_embeddings.f16.bin"
LABELS_TS = Path(__file__).resolve().parents[2] / "src" / "data" / "bioclip-labels.ts"

OPSET = 17
PARITY_IMAGES = 8


class ImageTower:
    """Wraps model.visual and bakes in L2 normalisation.

    Normalising inside the graph removes one more place the browser and Python
    can disagree. Whether `.visual` alone reproduces `encode_image` is ASSERTED,
    not assumed — some CLIP variants keep a projection outside `.visual`, and a
    silent mismatch there would shift every embedding the feature ever computes.
    """

    @staticmethod
    def build(model, torch):
        import torch.nn as nn

        class _Tower(nn.Module):
            def __init__(self, visual):
                super().__init__()
                self.visual = visual

            def forward(self, pixel_values):
                feats = self.visual(pixel_values)
                return feats / feats.norm(dim=-1, keepdim=True)

        return _Tower(model.visual).eval()


def _sample_images(n):
    """A few real cached photos — export parity must be checked on real inputs."""
    order = json.loads((CACHE / "embed_order.json").read_text())
    files = [row["file"] for row in order["photos"][:n]]
    return [CACHE / "images" / f for f in files]


def _preprocess_batch(paths, preprocess, torch):
    from PIL import Image

    tensors = [
        preprocess(Image.open(p).convert("RGB")) for p in paths
    ]
    return torch.stack(tensors)


def stage_export():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    model, preprocess, _tokenizer, torch = load_model()
    batch = _preprocess_batch(_sample_images(PARITY_IMAGES), preprocess, torch)

    tower = ImageTower.build(model, torch)

    # ASSERT the wrapper reproduces encode_image before exporting anything.
    with torch.no_grad():
        reference = model.encode_image(batch)
        reference = reference / reference.norm(dim=-1, keepdim=True)
        got = tower(batch)
    max_diff = (reference - got).abs().max().item()
    print(f"wrapper vs encode_image: max abs diff {max_diff:.2e}")
    if not torch.allclose(reference, got, atol=1e-5):
        raise SystemExit(
            "model.visual does not reproduce encode_image for this checkpoint "
            f"(max diff {max_diff:.2e}). There is likely a projection outside "
            ".visual. Exporting anyway would ship a subtly different model than "
            "the one the gate was measured on."
        )

    print(f"exporting opset {OPSET} -> {ONNX_FP32.name}")
    torch.onnx.export(
        tower,
        batch[:1],
        str(ONNX_FP32),
        input_names=["pixel_values"],
        output_names=["embedding"],
        dynamic_axes={"pixel_values": {0: "batch"}, "embedding": {0: "batch"}},
        opset_version=OPSET,
        do_constant_folding=True,
    )

    # Validate the exported graph against PyTorch before quantization, so an
    # export bug cannot be mistaken for quantization error later.
    import numpy as np
    import onnxruntime as ort

    sess = ort.InferenceSession(str(ONNX_FP32), providers=["CPUExecutionProvider"])
    onnx_out = sess.run(None, {"pixel_values": batch.numpy()})[0]
    diff = np.abs(reference.numpy() - onnx_out).max()
    cos = float(
        (reference.numpy() * onnx_out).sum(axis=1).min()
    )  # rows are unit-norm
    print(f"onnx fp32 vs pytorch: max abs diff {diff:.2e}, min cosine {cos:.6f}")
    if diff > 1e-4:
        raise SystemExit(f"ONNX fp32 export diverges from PyTorch ({diff:.2e} > 1e-4)")
    print(f"wrote {ONNX_FP32} ({ONNX_FP32.stat().st_size / 1e6:.1f} MB)")


def stage_quantize():
    if not ONNX_FP32.exists():
        raise SystemExit("no fp32 onnx — run --stage export first")
    from onnxruntime.quantization import QuantType, quantize_dynamic

    # Weight-only dynamic int8. ONNX Runtime's own guidance is dynamic for
    # transformers (static is for CNNs), and ViT LayerNorm/Softmax activations
    # are quantization-sensitive enough that static QDQ commonly tanks accuracy.
    print("quantizing (dynamic, weight-only int8)…")
    quantize_dynamic(
        model_input=str(ONNX_FP32),
        model_output=str(ONNX_INT8),
        weight_type=QuantType.QInt8,
    )
    fp32_mb = ONNX_FP32.stat().st_size / 1e6
    int8_mb = ONNX_INT8.stat().st_size / 1e6
    print(f"fp32 {fp32_mb:.1f} MB -> int8 {int8_mb:.1f} MB ({fp32_mb / int8_mb:.1f}x smaller)")
    print(f"wrote {ONNX_INT8}")


def _embed_all_onnx(onnx_path, batch_size=16):
    """Re-embed every cached photo through the ONNX session, in manifest order."""
    import numpy as np
    import onnxruntime as ort
    from PIL import Image

    _model, preprocess, _tok, torch = load_model()
    order = json.loads((CACHE / "embed_order.json").read_text())
    photos = order["photos"]

    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    out, kept = [], []
    for start in range(0, len(photos), batch_size):
        chunk = photos[start : start + batch_size]
        tensors, chunk_kept = [], []
        for row in chunk:
            try:
                img = Image.open(CACHE / "images" / row["file"]).convert("RGB")
            except Exception:
                continue
            tensors.append(preprocess(img))
            chunk_kept.append(row)
        if not tensors:
            continue
        batch = torch.stack(tensors).numpy()
        out.append(sess.run(None, {"pixel_values": batch})[0])
        kept.extend(chunk_kept)
        if start % (batch_size * 20) == 0:
            print(f"  embedded {len(kept)}/{len(photos)}")
    return np.concatenate(out), kept, order["text_labels"]


def stage_verify():
    """Re-run the gate using int8 image embeddings and fp32 text — what ships."""
    import numpy as np

    if not ONNX_INT8.exists():
        raise SystemExit("no int8 onnx — run --stage quantize first")

    baseline = json.loads((CACHE / "report.json").read_text())
    text_vectors = np.load(CACHE / "text_embeddings.npy")

    print("re-embedding all cached photos through the int8 ONNX graph…")
    vectors, photos, text_labels = _embed_all_onnx(ONNX_INT8)
    np.save(CACHE / "embeddings_int8.npy", vectors)

    # Text side stays fp32: that is the shipped configuration (fp16-narrowed
    # matrix on the client, but never int8), so quantizing it here would measure
    # something we do not ship.
    results = evaluate_embeddings(vectors, text_vectors, photos, text_labels)

    print(f"\n=== 53-label vocabulary (what the spike measured) ===")
    print(f"{'metric':<32} {'fp32 (spike)':>13} {'int8 (ships)':>13} {'delta':>8}")
    print("-" * 70)
    worst_at_1 = 0.0
    for method in ("text", "gallery"):
        for key in ("false_edible_1", "false_edible_3", "top1", "top3"):
            a = baseline["methods"][method][key]
            b = results["methods"][method][key]
            print(f"{method + '.' + key:<32} {a:>12.1%} {b:>12.1%} {b - a:>+7.1%}")
            if key == "false_edible_1":
                worst_at_1 = max(worst_at_1, b - a)

    (CACHE / "report_int8.json").write_text(json.dumps(results, indent=2))

    # The gate is false-edible@1, per the plan. @3 is reported but NOT gated: at
    # 53 labels its random baseline is 93.4% (31 of 53 labels are edible, so an
    # edible fills a top-3 slot almost by arithmetic), and at the shipping
    # vocabulary it falls to ~28%. A 1.5pp move on that is noise, not a safety
    # signal. See addendum 2 of the spike results.
    print(f"\nworst false-edible@1 regression: {worst_at_1:+.2%} (ceiling +1.00%)")

    wide_delta = _verify_wide(vectors, photos, text_labels)

    worst = max(worst_at_1, wide_delta)
    if worst > 0.01:
        raise SystemExit(
            f"int8 quantization moved false-edible@1 by {worst:+.2%}, over the "
            "+1.00% ceiling. Fall back to static QDQ with LayerNorm/Softmax "
            "excluded, or fp16, before shipping."
        )
    print("\nint8 artifact is within the gate ceiling at both vocabulary sizes")


def _verify_wide(int8_vectors, photos, tier1_labels):
    """Also gate at the vocabulary that SHIPS (1053 labels), not just 53.

    The 53-label comparison is the like-for-like check against the spike. But the
    feature ships a wide vocabulary, and quantization error interacts with the
    number of competing labels — so the shipping configuration gets its own gate.
    Returns the false-edible@1 delta (fp32 -> int8) at the wide vocabulary.
    """
    import numpy as np

    wide_path = CACHE / "wide_vocab.json"
    if not wide_path.exists():
        print("\nno wide_vocab.json — skipping the shipping-vocabulary gate")
        return 0.0

    from bioclip_spike import CATALOG_NAMES, _predictions, false_edible_rate

    wide = json.loads(wide_path.read_text())
    tier2 = sorted(set(wide) - set(tier1_labels))

    model, _preprocess, tokenizer, torch = load_model()
    prompts = [taxonomic_prompt(wide[n]) for n in tier2]
    chunks = []
    for start in range(0, len(prompts), 256):
        with torch.no_grad():
            feats = model.encode_text(tokenizer(prompts[start : start + 256]))
            feats /= feats.norm(dim=-1, keepdim=True)
        chunks.append(feats.cpu().numpy())
    text = np.concatenate(
        [np.load(CACHE / "text_embeddings.npy"), np.concatenate(chunks)]
    )
    labels = tier1_labels + tier2

    idx = [i for i, p in enumerate(photos) if p["split"] == "test"]
    rows = [photos[i] for i in idx]

    print(f"\n=== {len(labels)}-label vocabulary (what ships) ===")
    print(f"{'source':<22} {'false-edible@1':>15}")
    print("-" * 40)
    rates = {}
    for name, vecs in (
        ("fp32 (spike)", np.load(CACHE / "embeddings.npy")[idx]),
        ("int8 (ships)", int8_vectors[idx]),
    ):
        preds = _predictions(vecs @ text.T, labels, rows)
        rates[name] = false_edible_rate(preds, CATALOG_NAMES, k=1)
        print(f"{name:<22} {rates[name]:>14.2%}")

    delta = rates["int8 (ships)"] - rates["fp32 (spike)"]
    print(f"{'delta':<22} {delta:>+14.2%}")
    return delta


def stage_text_matrix():
    """All labels -> fp16 matrix + index-aligned TS labels file.

    Emitted in ONE pass so the binary and the labels file cannot drift: they are
    joined by row index at runtime, and a mismatch would silently pair every
    photo with the wrong species name.
    """
    import numpy as np

    order = json.loads((CACHE / "embed_order.json").read_text())
    tier1 = order["text_labels"]
    lineages = json.loads((CACHE / "lineages.json").read_text())

    wide_path = CACHE / "wide_vocab.json"
    tier2_lineages = json.loads(wide_path.read_text()) if wide_path.exists() else {}
    tier2 = sorted(set(tier2_lineages) - set(tier1))
    if not tier2:
        print("no wide_vocab.json — emitting tier 1 only")

    from bioclip_spike import CATALOG, CATALOG_NAMES, TOXIC_NAMES

    overlap = set(tier2) & (CATALOG_NAMES | TOXIC_NAMES)
    if overlap:
        raise SystemExit(f"tier-2 overlaps tier-1: {sorted(overlap)[:5]}")

    # Drop tier-2 names sharing a genus with a genus-level catalog entry.
    #
    # Two labels, one species: the catalog carries the bare genus ("Boletus"),
    # and the regional list independently contains "Boletus edulis" — which the
    # app's genus allow-list resolves to that same catalog entry. Keeping both
    # means one porcini photo can return the same species twice and burn two of
    # three candidate slots, and the generated `kind` would disagree with the
    # app's (caught by src/test/photo-id.test.ts). Same-genus names that are NOT
    # the catalog species render identically whether they are 'other' or
    # 'unknown', so dropping them costs nothing visible.
    genus_level = {name for name, rank in CATALOG if rank == "genus"}
    ambiguous = [n for n in tier2 if n.split(" ")[0] in genus_level]
    if ambiguous:
        tier2 = [n for n in tier2 if n not in set(ambiguous)]
        tier2_lineages = {k: v for k, v in tier2_lineages.items() if k in set(tier2)}
        print(
            f"dropped {len(ambiguous)} tier-2 names sharing a genus with a "
            f"genus-level catalog entry: {ambiguous[:6]}"
        )

    all_lineages = {**{n: lineages[n] for n in tier1 if n in lineages}, **tier2_lineages}
    labels = [n for n in tier1 if n in lineages] + tier2
    missing = [n for n in tier1 if n not in lineages]
    if missing:
        raise SystemExit(f"tier-1 labels have no lineage: {missing}")

    model, _preprocess, tokenizer, torch = load_model()
    prompts = [taxonomic_prompt(all_lineages[n]) for n in labels]
    print(f"embedding {len(prompts)} prompts…")
    chunks = []
    for start in range(0, len(prompts), 256):
        with torch.no_grad():
            feats = model.encode_text(tokenizer(prompts[start : start + 256]))
            feats /= feats.norm(dim=-1, keepdim=True)
        chunks.append(feats.cpu().numpy())
    matrix = np.concatenate(chunks).astype(np.float32)

    # fp16 keeps the file under workbox's 2 MiB precache default (fp32 at this
    # label count is 3.25MB and would make `vite build` throw). Verify the
    # narrowing does not move the classifier's decisions.
    matrix16 = matrix.astype(np.float16)
    widened = matrix16.astype(np.float32)
    cos = (matrix * widened).sum(axis=1) / (
        np.linalg.norm(matrix, axis=1) * np.linalg.norm(widened, axis=1)
    )
    print(f"fp16 narrowing: min cosine vs fp32 {cos.min():.6f}")
    if cos.min() < 0.9999:
        raise SystemExit(f"fp16 narrowing lost too much precision ({cos.min():.6f})")

    PUBLIC_MODELS.mkdir(parents=True, exist_ok=True)
    TEXT_MATRIX.write_bytes(matrix16.tobytes())
    size_mb = TEXT_MATRIX.stat().st_size / 1e6
    print(f"wrote {TEXT_MATRIX} ({size_mb:.2f} MB, {matrix16.shape})")
    if TEXT_MATRIX.stat().st_size > 2 * 1024 * 1024:
        print("  WARNING: over 2 MiB — vite-plugin-pwa will throw unless "
              "maximumFileSizeToCacheInBytes is raised or this moves to R2")

    catalog, toxic = CATALOG_NAMES, TOXIC_NAMES
    rows = []
    for name in labels:
        kind = "toxic" if name in toxic else ("catalog" if name in catalog else "other")
        rows.append(f"  {{ scientificName: {name!r}, kind: {kind!r} }},".replace("'", "'"))
    LABELS_TS.write_text(
        "// GENERATED by backend/tools/bioclip_export.py --stage text-matrix\n"
        "// DO NOT EDIT. Row order is index-aligned with\n"
        "// public/models/bioclip_text_embeddings.f16.bin — editing one without\n"
        "// regenerating the other pairs every photo with the wrong species.\n\n"
        "export type BioclipLabelKind = 'catalog' | 'toxic' | 'other';\n\n"
        "export interface BioclipLabel {\n"
        "  scientificName: string;\n"
        "  kind: BioclipLabelKind;\n"
        "}\n\n"
        f"export const BIOCLIP_EMBEDDING_DIM = {matrix16.shape[1]};\n\n"
        "export const BIOCLIP_LABELS: BioclipLabel[] = [\n"
        + "\n".join(rows)
        + "\n];\n",
        encoding="utf-8",
    )
    counts = {}
    for name in labels:
        k = "toxic" if name in toxic else ("catalog" if name in catalog else "other")
        counts[k] = counts.get(k, 0) + 1
    print(f"wrote {LABELS_TS} ({counts})")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--stage",
        choices=["export", "quantize", "verify", "text-matrix"],
        required=True,
    )
    args = ap.parse_args()
    print(f"model: {MODEL_HUB_ID}")
    {
        "export": stage_export,
        "quantize": stage_quantize,
        "verify": stage_verify,
        "text-matrix": stage_text_matrix,
    }[args.stage]()


if __name__ == "__main__":
    main()
