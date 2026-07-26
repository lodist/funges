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

R2 = "https://pub-9988c4492e7945f0a2ff14e35232acdf.r2.dev"

ARTIFACTS = Path(__file__).resolve().parent / "model_artifacts"
ONNX_FP32 = ARTIFACTS / "image_tower_fp32.onnx"
ONNX_INT8 = ARTIFACTS / "image_tower_int8.onnx"
ONNX_INT4 = ARTIFACTS / "image_tower_int4.onnx"

# The installed onnxruntime-web bundle is the authority on which ops the WebGPU
# backend can actually run. Read it rather than trusting release notes: the op
# set differs per version, and a mismatch here is measured in seconds per photo.
ORT_WEB_BUNDLE = (
    Path(__file__).resolve().parents[2]
    / "node_modules"
    / "onnxruntime-web"
    / "dist"
    / "ort.all.mjs"
)

# Bundled, not R2 — small enough, and keeping it in the build means it can never
# be out of step with the labels file it is index-aligned to.
#
# In src/assets rather than public/ so Vite content-hashes the emitted URL. At a
# stable filename the service worker's year-long CacheFirst would serve an old
# matrix against a new labels file, and adding one species would break the
# feature for every existing user.
PUBLIC_MODELS = Path(__file__).resolve().parents[2] / "public" / "models"
TEXT_MATRIX = Path(__file__).resolve().parents[2] / "src" / "assets" / "bioclip_text_embeddings.f16.bin"
LABELS_TS = Path(__file__).resolve().parents[2] / "src" / "data" / "bioclip-labels.ts"

OPSET = 17

# Tier-2 cap. See the sweep in the docstring of --stage verify-shipped: vocabulary
# size trades the safety gate against catalog recall and warning availability, and
# this is the chosen point on that curve.
TIER2_LIMIT = 2500
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


def stage_quantize_4bit():
    """4-bit block-quantized weights via MatMulNBits — an op WebGPU can run.

    The int8 dynamic artifact is small and accurate, but it is built out of
    MatMulInteger / DynamicQuantizeLinear, and onnxruntime-web registers NO
    WebGPU kernel for either (proven by --stage webgpu-coverage). So every heavy
    matmul falls back to the single-threaded CPU backend even when the session
    reports `webgpu`, which is why on-device inference measured 15-20s on a
    phone. Quantization chosen for download size silently cost the GPU.

    MatMulNBits does have a WebGPU kernel. Symmetric, block size 32: smaller
    blocks cost a little file size and buy back accuracy, and accuracy is the
    only real risk in this trade.
    """
    if not ONNX_FP32.exists():
        raise SystemExit("no fp32 onnx — run --stage export first")
    from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer

    print("quantizing (weight-only 4-bit MatMulNBits, block 32, symmetric)…")
    quant = MatMulNBitsQuantizer(
        model=str(ONNX_FP32),
        bits=4,
        block_size=32,
        is_symmetric=True,
    )
    quant.process()
    quant.model.save_model_to_file(str(ONNX_INT4), use_external_data_format=False)

    fp32_mb = ONNX_FP32.stat().st_size / 1e6
    int4_mb = ONNX_INT4.stat().st_size / 1e6
    print(f"fp32 {fp32_mb:.1f} MB -> int4 {int4_mb:.1f} MB ({fp32_mb / int4_mb:.1f}x smaller)")
    if ONNX_INT8.exists():
        int8_mb = ONNX_INT8.stat().st_size / 1e6
        print(f"vs shipped int8 {int8_mb:.1f} MB ({int8_mb - int4_mb:+.1f} MB)")
    print(f"wrote {ONNX_INT4}")


def _webgpu_kernels():
    """Op names with a WebGPU kernel, read out of the installed ORT web bundle."""
    import re

    if not ORT_WEB_BUNDLE.exists():
        raise SystemExit(f"no ORT web bundle at {ORT_WEB_BUNDLE} — run npm install")
    src = ORT_WEB_BUNDLE.read_text(encoding="utf8", errors="replace")

    # WEBGPU_OP_RESOLVE_RULES is the JSEP/WebGPU kernel table. Anchor on it by
    # name: the same file also holds a WebGL table with a different entry shape,
    # and matching that one instead would report ops as supported that are not.
    start = src.index("WEBGPU_OP_RESOLVE_RULES")
    depth, end = 0, None
    for i in range(src.index("[", start), len(src)):
        if src[i] == "[":
            depth += 1
        elif src[i] == "]":
            depth -= 1
            if depth == 0:
                end = i
                break
    if end is None:
        raise SystemExit("could not find the end of WEBGPU_OP_RESOLVE_RULES")
    table = src[start:end]
    ops = set(re.findall(r'\["([A-Za-z][A-Za-z0-9]*)",\s*\[', table))
    if "MatMul" not in ops or len(ops) < 50:
        raise SystemExit(f"WebGPU kernel extraction looks wrong (got {len(ops)} ops)")
    return ops


# Ops that legitimately run on the CPU without costing real time: shape algebra
# and constants, which ORT assigns to the CPU on purpose and mostly folds away.
# Anything NOT on this list which lacks a WebGPU kernel is arithmetic on the
# critical path, and is a gate failure for the WebGPU-targeted artifact.
SHAPE_OPS = {
    "Constant",
    "ConstantOfShape",
    "Shape",
    "Reshape",
    "Unsqueeze",
    "Squeeze",
    "Mod",
    "Size",
    "Range",
}

# The artifact the WebGPU path serves. int8 is deliberately exempt: it is only
# ever served to devices with no working WebGPU, where the kernel table is moot.
WEBGPU_ARTIFACT = "int4"


def stage_webgpu_coverage():
    """Gate: the WebGPU-targeted artifact must have a GPU kernel for every compute op.

    This is the check that was missing when the int8 artifact shipped. Every
    accuracy gate passed green while `MatMulInteger` — 97 nodes, all of the heavy
    matmuls — had no WebGPU kernel at all, so the model ran on one CPU core and
    measured 15-20s per photo on a phone while reporting `webgpu`. Accuracy
    verification cannot see that; only the kernel table can.
    """
    import collections

    import onnx

    kernels = _webgpu_kernels()
    print(f"onnxruntime-web WebGPU kernels: {len(kernels)} ops\n")

    failures = []
    for variant, path in (
        ("fp32", ONNX_FP32),
        ("int8", ONNX_INT8),
        ("int4", ONNX_INT4),
    ):
        if not path.exists():
            print(f"{path.name}: absent, skipped")
            continue
        model = onnx.load(str(path))
        counts = collections.Counter(n.op_type for n in model.graph.node)
        missing = {op: n for op, n in counts.items() if op not in kernels}
        compute_missing = {
            op: n for op, n in missing.items() if op not in SHAPE_OPS
        }
        size_mb = path.stat().st_size / 1e6
        gated = " [GATED: served to WebGPU devices]" if variant == WEBGPU_ARTIFACT else ""
        print(f"=== {path.name} ({size_mb:.0f} MB, {sum(counts.values())} nodes){gated} ===")
        if compute_missing:
            print("  COMPUTE ops with no WebGPU kernel (these run on one CPU core):")
            for op, n in sorted(compute_missing.items(), key=lambda kv: -kv[1]):
                print(f"    {n:5d}  {op}")
            if variant == WEBGPU_ARTIFACT:
                failures.append((variant, compute_missing))
        else:
            print("  every compute op has a WebGPU kernel")
        if missing:
            shape_only = {op: n for op, n in missing.items() if op in SHAPE_OPS}
            if shape_only:
                print(
                    f"  ({sum(shape_only.values())} shape/constant nodes on CPU, "
                    "expected — ORT assigns these to CPU by design)"
                )
        print()

    if failures:
        for variant, missing in failures:
            ops = ", ".join(f"{op} x{n}" for op, n in sorted(missing.items()))
            print(f"{variant}: {ops}")
        raise SystemExit(
            f"the {WEBGPU_ARTIFACT} artifact has compute ops with no WebGPU "
            "kernel, so it would run on a single CPU core while reporting "
            "`webgpu`. Re-quantize into ops the WebGPU backend implements "
            "(MatMulNBits, not MatMulInteger) before publishing."
        )
    print(f"{WEBGPU_ARTIFACT} artifact is fully GPU-resident on the compute path")


SELFCHECK_TS = (
    Path(__file__).resolve().parents[2] / "src" / "data" / "bioclip-selfcheck.ts"
)
PROBE_ONNX = PUBLIC_MODELS / "matmulnbits_probe.onnx"
PROBE_TS = Path(__file__).resolve().parents[2] / "src" / "data" / "bioclip-probe.ts"

# Shapes for the probe. K matches the real tower's inner dimension because the
# dequantize-and-accumulate loop runs along K, which is where a broken
# MatMulNBits kernel goes wrong. N and M are kept small: they only affect how
# many workgroups are dispatched, and the artifact has to stay small enough to
# bundle. At these numbers the file is ~41KB against the 280MB it can now save.
PROBE_K = 1024
PROBE_N = 64
PROBE_M = 8
PROBE_BLOCK = 32
PROBE_BITS = 4


def _deterministic_bytes(n, numpy):
    idx = numpy.arange(n, dtype=numpy.int64)
    return ((idx * 7 + 3) % 251).astype(numpy.uint8)


def _probe_input(numpy):
    """Same integer-only recipe as the self-check input, sized for the probe."""
    n = PROBE_M * PROBE_K
    idx = numpy.arange(n, dtype=numpy.int64)
    raw = ((idx % 251) * 7 + (idx % 17)) % 256
    return (raw / 255.0 * 2.0 - 1.0).astype(numpy.float32).reshape(PROBE_M, PROBE_K)


def stage_verify_shipped():
    """Re-run the safety gate against the shipped text matrix and labels file.

    Distinct from --stage verify, which reconstructs the text side from the spike
    cache. This one reads the two artifacts the browser actually loads:
    src/assets/bioclip_text_embeddings.f16.bin and src/data/bioclip-labels.ts,
    paired with the int8 image embeddings that ship. So it measures the shipped
    configuration end to end rather than a faithful reproduction of it.

    This is the gate for a VOCABULARY change. Adding an edible label widens the
    false-edible surface, and promoting a species from tier 2 to toxic narrows it;
    neither is visible without re-scoring, because both change the softmax for
    every photo.
    """
    import re

    import numpy as np

    from bioclip_spike import (
        CATALOG_NAMES,
        TOXIC_NAMES,
        _predictions,
        false_edible_rate,
        top_k_accuracy,
    )

    if not TEXT_MATRIX.exists():
        raise SystemExit("no text matrix — run --stage text-matrix first")

    # Read the label order from the GENERATED file, so a drift between it and the
    # matrix shows up here rather than as mislabelled predictions on a phone.
    ts = LABELS_TS.read_text(encoding="utf-8")
    # Quote-agnostic: a provisional name containing an apostrophe makes Python's
    # repr emit double quotes, and a parser that only accepted single quotes
    # under-counted the labels and reported drift that did not exist.
    labels = [
        (name[1:-1], kind)
        for name, kind in re.findall(
            r"\{ scientificName: ('[^']*'|\"[^\"]*\"), kind: '([^']*)' \}", ts
        )
    ]
    if not labels:
        raise SystemExit(f"could not parse labels out of {LABELS_TS.name}")
    names = [n for n, _ in labels]
    dim_match = re.search(r"BIOCLIP_EMBEDDING_DIM = (\d+)", ts)
    dim = int(dim_match.group(1))

    raw = np.frombuffer(TEXT_MATRIX.read_bytes(), dtype=np.float16)
    if raw.size != len(names) * dim:
        raise SystemExit(
            f"matrix holds {raw.size} halves, labels file declares "
            f"{len(names)} x {dim} = {len(names) * dim}. They have drifted."
        )
    text = raw.astype(np.float32).reshape(len(names), dim)

    order = json.loads((CACHE / "embed_order.json").read_text())
    photos = order["photos"]
    vectors = np.load(CACHE / "embeddings_int8.npy")
    if len(vectors) != len(photos):
        raise SystemExit("cached embeddings do not match embed_order.json")

    idx = [i for i, p in enumerate(photos) if p["split"] == "test"]
    rows = [photos[i] for i in idx]
    preds = _predictions(vectors[idx] @ text.T, names, rows)

    kinds = {}
    for name, kind in labels:
        kinds.setdefault(kind, 0)
        kinds[kind] += 1
    rate = false_edible_rate(preds, CATALOG_NAMES, k=1)
    toxic_rows = [p for p in preds if p["truth"] not in CATALOG_NAMES]

    # Reported together, deliberately. Vocabulary size moves these in OPPOSITE
    # directions, so false-edible alone can show a 7x improvement while the
    # catalog gets materially worse and warnings go missing.
    catalog_1 = top_k_accuracy(preds, 1)
    catalog_3 = top_k_accuracy(preds, 3)
    warned = sum(
        1 for p in toxic_rows if any(n in TOXIC_NAMES for n in p["ranked"][:3])
    ) / max(1, len(toxic_rows))

    print(f"labels: {len(names)} ({kinds})")
    print(f"test photos: {len(rows)}, of which toxic: {len(toxic_rows)}")
    print(f"false-edible@1 (SHIPPED artifacts): {rate:.2%}")
    print(f"catalog top-1: {catalog_1:.1%}   catalog top-3: {catalog_3:.1%}")
    print(f"toxic label in top-3 of a toxic photo: {warned:.1%}")

    # Warning availability gets its own floor. A toxic photo whose three
    # candidates carry no toxic label shows the user three neutral rows, which is
    # a missing warning rather than a false one - not caught by false-edible at
    # all, and the failure this feature exists to prevent.
    WARN_FLOOR = 0.92
    if warned < WARN_FLOOR:
        raise SystemExit(
            f"a toxic label reaches the top 3 for only {warned:.1%} of toxic "
            f"photos, under the {WARN_FLOOR:.0%} floor. The vocabulary is "
            "crowding warnings out of the candidate list."
        )

    # Same ceiling the feature originally shipped under. Stated as an absolute
    # rather than a delta because the vocabulary is no longer the one the spike
    # measured, so a delta would compare two different label sets.
    CEILING = 0.02
    if rate > CEILING:
        raise SystemExit(
            f"false-edible@1 is {rate:.2%}, over the {CEILING:.0%} ceiling. "
            "A vocabulary change made the top-1 edible claim less safe."
        )
    print(f"within the {CEILING:.0%} ceiling")


# Genera and species with a serious, well-documented poisoning risk in Europe and
# North America. Genus-level entries where enough of the genus is dangerous that
# a member landing in tier 2 deserves a human look.
#
# This is a SCREEN, not a determination. It over-flags on purpose: Amanita
# caesarea, A. fulva, A. rubescens, Cortinarius violaceus and Entoloma abortivum
# are all edible, and the screen still surfaces them. Under-flagging is the
# failure that matters, because an unflagged lethal species renders as "not in
# this app's catalog - no safety information", which is how a yew and a
# jack-o'-lantern reached a real result set looking neutral.
DANGER_TAXA = [
    # Fungi
    "Amanita", "Galerina", "Cortinarius", "Lepiota", "Conocybe", "Pholiotina",
    "Inocybe", "Inosperma", "Clitocybe", "Gyromitra", "Paxillus", "Hypholoma",
    "Entoloma", "Omphalotus", "Scleroderma", "Chlorophyllum", "Ramaria",
    "Rubroboletus", "Neoboletus", "Russula emetica", "Agaricus xanthodermus",
    "Tricholoma equestre", "Pleurocybella", "Hapalopilus", "Pseudosperma",
    "Leucocoprinus", "Leucoagaricus", "Sarcosphaera", "Verpa", "Turbinellus",
    # Plants
    "Taxus", "Aconitum", "Conium", "Digitalis", "Colchicum", "Datura",
    "Hyoscyamus", "Veratrum", "Cicuta", "Ricinus", "Nerium", "Daphne",
    "Laburnum", "Bryonia", "Atropa", "Solanum", "Prunus laurocerasus",
    "Heracleum", "Helleborus", "Oenanthe", "Chelidonium", "Euonymus",
    "Ligustrum", "Hedera helix", "Ilex aquifolium", "Arum", "Convallaria",
    "Aethusa", "Narcissus", "Galanthus", "Euphorbia", "Rhododendron", "Kalmia",
    "Phytolacca", "Mercurialis", "Actaea", "Paris quadrifolia", "Aristolochia",
    "Dieffenbachia", "Ranunculus", "Caltha", "Anemone", "Symphytum",
    "Chaerophyllum", "Anthriscus", "Torilis", "Scandix", "Myrrhis",
]


def stage_audit_danger():
    """Which tier-2 species carry a serious risk and no warning attached?

    Run this after EVERY vocabulary expansion. Adding regional species is cheap
    and safe; adding dangerous regional species without a toxic entry is neither,
    because tier 2 renders as "no safety information" and a lethal plant shown
    neutrally is worse than one not named at all.

    Reports rather than fails: which of the candidates deserve promotion is a
    judgement about severity and confusion risk, not something a genus list can
    decide. What it guarantees is that the decision is never skipped silently.
    """
    from bioclip_spike import CATALOG_NAMES, CULTIVATED_NAMES, TOXIC_NAMES

    wide_path = CACHE / "wide_vocab.json"
    if not wide_path.exists():
        raise SystemExit("no wide_vocab.json — run bioclip_wide_vocab.py --stage taxa")
    wide = json.loads(wide_path.read_text())

    tier1 = CATALOG_NAMES | TOXIC_NAMES
    # Parenthesised: `-` binds tighter than `|`, so without them this would
    # subtract tier 1 from CULTIVATED only and leave it in `wide`.
    tier2 = sorted((set(wide) | CULTIVATED_NAMES) - tier1)

    flagged = []
    for name in tier2:
        if name in tier1:
            continue
        for taxon in DANGER_TAXA:
            if name == taxon or name.startswith(taxon + " ") or name.startswith(taxon):
                flagged.append((name, taxon))
                break

    print(f"tier-2 labels screened: {len(tier2)}")
    print(f"already flagged as toxic: {len(TOXIC_NAMES)}")
    print()
    if not flagged:
        print("no tier-2 species matched the danger screen")
        return

    print(f"{len(flagged)} tier-2 species matching the danger screen, all currently")
    print('rendering as "no safety information":')
    print()
    by_taxon = {}
    for name, taxon in flagged:
        by_taxon.setdefault(taxon, []).append(name)
    for taxon in sorted(by_taxon):
        names = by_taxon[taxon]
        print(f"  {taxon:24s} {', '.join(names)}")
    print()
    print("Promote the ones whose severity and confusion risk warrant it into")
    print("TOXIC in bioclip_spike.py, add a toxic-species.ts entry with severity,")
    print("mechanism and checks, then re-run --stage text-matrix and")
    print("--stage verify-shipped. The screen over-flags: some of the above are")
    print("edible and should stay in tier 2.")


def stage_probe_model():
    """Build a tiny MatMulNBits model plus its reference output.

    Why this exists: an Android GPU ran the 280MB int4 artifact under
    `engine: webgpu` and returned garbage, because ORT's WebGPU MatMulNBits
    shader is wrong on it. The session self-check catches that — but only AFTER
    the user has downloaded 280MB to find out. This probe moves the same test
    before the download, so a device with that GPU is offered int8 immediately.

    The old probe was `tiny_matmul.onnx`, a plain MatMul. It could only answer
    "does a WebGPU session initialise", which was never the question: the broken
    op is MatMulNBits, and the old probe never executed one.

    Correctness does not depend on this being perfectly representative. If a
    device slips through, the post-download self-check still refuses to show
    wrong results — the probe only saves bandwidth.
    """
    import base64

    import numpy as np
    import onnx
    import onnxruntime as ort
    from onnx import TensorProto, helper, numpy_helper

    n_blocks = PROBE_K // PROBE_BLOCK
    blob_size = PROBE_BLOCK // 8 * PROBE_BITS

    b = _deterministic_bytes(PROBE_N * n_blocks * blob_size, np).reshape(
        PROBE_N, n_blocks, blob_size
    )
    # Small positive scales; symmetric, so no zero_points input is supplied.
    scale_idx = np.arange(PROBE_N * n_blocks, dtype=np.int64)
    scales = (((scale_idx % 13) + 1) / 1000.0).astype(np.float32)

    node = helper.make_node(
        "MatMulNBits",
        inputs=["A", "B", "scales"],
        outputs=["Y"],
        domain="com.microsoft",
        K=PROBE_K,
        N=PROBE_N,
        bits=PROBE_BITS,
        block_size=PROBE_BLOCK,
    )
    graph = helper.make_graph(
        [node],
        "matmulnbits_probe",
        [helper.make_tensor_value_info("A", TensorProto.FLOAT, [PROBE_M, PROBE_K])],
        [helper.make_tensor_value_info("Y", TensorProto.FLOAT, [PROBE_M, PROBE_N])],
        [
            numpy_helper.from_array(b, "B"),
            numpy_helper.from_array(scales, "scales"),
        ],
    )
    model = helper.make_model(
        graph,
        opset_imports=[
            helper.make_opsetid("", OPSET),
            helper.make_opsetid("com.microsoft", 1),
        ],
    )
    PROBE_ONNX.parent.mkdir(parents=True, exist_ok=True)
    onnx.save(model, str(PROBE_ONNX))

    # Reference from the CPU provider — the same kernel the accuracy gate used.
    sess = ort.InferenceSession(str(PROBE_ONNX), providers=["CPUExecutionProvider"])
    out = sess.run(None, {"A": _probe_input(np)})[0].astype(np.float32).reshape(-1)

    # A degenerate reference (all zeros, or constant) would make the client's
    # cosine comparison meaningless — it would pass for any broken backend.
    if float(np.abs(out).max()) < 1e-6 or float(out.std()) < 1e-6:
        raise SystemExit(
            f"probe reference is degenerate (max |y| {np.abs(out).max():.2e}, "
            f"std {out.std():.2e}); a comparison against it would prove nothing"
        )

    b64 = base64.b64encode(out.tobytes()).decode("ascii")
    PROBE_TS.write_text(
        "// GENERATED by backend/tools/bioclip_export.py --stage probe-model\n"
        "// Do not edit. Regenerate together with public/models/matmulnbits_probe.onnx.\n"
        "//\n"
        "// Reference output of a single MatMulNBits node, from ONNX Runtime's CPU\n"
        "// provider. The client runs the same node on its GPU before committing to\n"
        "// a ~280MB download: if the numbers disagree, that GPU cannot be trusted\n"
        "// with the 4-bit artifact and gets the int8 one instead.\n"
        f"export const PROBE_M = {PROBE_M};\n"
        f"export const PROBE_K = {PROBE_K};\n"
        f"export const PROBE_OUTPUT_BASE64 =\n  '{b64}';\n",
        encoding="utf-8",
        newline="\n",
    )
    size_kb = PROBE_ONNX.stat().st_size / 1024
    print(f"wrote {PROBE_ONNX} ({size_kb:.1f} KB)")
    print(f"wrote {PROBE_TS} (reference {out.shape[0]} floats)")
    print(f"reference: mean {out.mean():.6f}, std {out.std():.6f}")


def _selfcheck_input(numpy):
    """A deterministic 1x3x224x224 input, reproducible bit-for-bit in JS.

    Uses only small-integer arithmetic before a single float divide, so Python
    and JavaScript cannot disagree: both evaluate `((i % 251) * 7 + (i % 17)) %
    256` in exact integers and then one IEEE-754 double division. An LCG would
    have been the obvious choice and is a trap — 1103515245 * i exceeds 2^53 and
    silently diverges between the two languages.
    """
    n = 3 * 224 * 224
    idx = numpy.arange(n, dtype=numpy.int64)
    raw = ((idx % 251) * 7 + (idx % 17)) % 256
    return (raw / 255.0 * 2.0 - 1.0).astype(numpy.float32).reshape(1, 3, 224, 224)


def stage_selfcheck_reference():
    """Bake a reference embedding so the client can detect a lying backend.

    An Android GPU returned a garbage embedding for a correctly decoded photo:
    same int4 artifact, same `engine: webgpu`, 6/5/3% over 1053 labels where
    desktop gave 97% on the right species. ORT's WebGPU MatMulNBits shader is
    wrong on that device. Nothing in the app could tell — a wrong embedding still
    produces a confident-looking ranked list of species, which for a toxicity
    feature is the most dangerous way to fail.

    So the client runs this fixed input at session creation and compares. The
    reference comes from the CPU provider, which is the same kernel the accuracy
    gate was measured with.
    """
    import base64

    import numpy as np
    import onnxruntime as ort

    if not ONNX_INT4.exists():
        raise SystemExit("no int4 onnx — run --stage quantize-4bit first")

    sess = ort.InferenceSession(str(ONNX_INT4), providers=["CPUExecutionProvider"])
    x = _selfcheck_input(np)
    out = sess.run(None, {"pixel_values": x})[0][0].astype(np.float32)

    norm = float(np.linalg.norm(out))
    print(f"reference embedding: dim {out.shape[0]}, L2 norm {norm:.6f}")
    # The graph bakes in L2 normalisation, so anything but ~1 means the export or
    # the quantization changed shape and this reference would be meaningless.
    if abs(norm - 1.0) > 1e-3:
        raise SystemExit(f"expected a unit-norm embedding, got {norm}")

    b64 = base64.b64encode(out.tobytes()).decode("ascii")
    SELFCHECK_TS.write_text(
        "// GENERATED by backend/tools/bioclip_export.py --stage selfcheck-reference\n"
        "// Do not edit. Regenerate whenever the int4 artifact changes.\n"
        "//\n"
        "// Reference embedding for a fixed synthetic input, computed with ONNX\n"
        "// Runtime's CPU provider — the same kernel the accuracy gate used. The\n"
        "// client recomputes it at session creation and refuses to show results\n"
        "// if its backend disagrees. See stage_selfcheck_reference for why.\n"
        f"export const SELFCHECK_MODEL_VARIANT = 'int4';\n"
        f"export const SELFCHECK_EMBEDDING_BASE64 =\n  '{b64}';\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"wrote {SELFCHECK_TS} ({len(b64)} base64 chars)")


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


def stage_verify(artifact=None, tag="int8"):
    """Re-run the gate using quantized image embeddings and fp32 text — what ships.

    Parameterised by artifact so every candidate quantization is measured by
    byte-identical metric code. Two artifacts scored by two code paths is not a
    comparison.
    """
    import numpy as np

    artifact = artifact or ONNX_INT8
    if not artifact.exists():
        raise SystemExit(f"no {artifact.name} — run the matching quantize stage first")

    baseline = json.loads((CACHE / "report.json").read_text())
    text_vectors = np.load(CACHE / "text_embeddings.npy")

    print(f"re-embedding all cached photos through the {tag} ONNX graph…")
    vectors, photos, text_labels = _embed_all_onnx(artifact)
    np.save(CACHE / f"embeddings_{tag}.npy", vectors)

    # Text side stays fp32: that is the shipped configuration (fp16-narrowed
    # matrix on the client, but never int8), so quantizing it here would measure
    # something we do not ship.
    results = evaluate_embeddings(vectors, text_vectors, photos, text_labels)

    print(f"\n=== 53-label vocabulary (what the spike measured) ===")
    print(f"{'metric':<32} {'fp32 (spike)':>13} {tag:>13} {'delta':>8}")
    print("-" * 70)
    worst_at_1 = 0.0
    for method in ("text", "gallery"):
        for key in ("false_edible_1", "false_edible_3", "top1", "top3"):
            a = baseline["methods"][method][key]
            b = results["methods"][method][key]
            print(f"{method + '.' + key:<32} {a:>12.1%} {b:>12.1%} {b - a:>+7.1%}")
            if key == "false_edible_1":
                worst_at_1 = max(worst_at_1, b - a)

    (CACHE / f"report_{tag}.json").write_text(json.dumps(results, indent=2))

    # The gate is false-edible@1, per the plan. @3 is reported but NOT gated: at
    # 53 labels its random baseline is 93.4% (31 of 53 labels are edible, so an
    # edible fills a top-3 slot almost by arithmetic), and at the shipping
    # vocabulary it falls to ~28%. A 1.5pp move on that is noise, not a safety
    # signal. See addendum 2 of the spike results.
    print(f"\nworst false-edible@1 regression: {worst_at_1:+.2%} (ceiling +1.00%)")

    wide_delta = _verify_wide(vectors, photos, text_labels, tag=tag)

    worst = max(worst_at_1, wide_delta)
    if worst > 0.01:
        raise SystemExit(
            f"{tag} quantization moved false-edible@1 by {worst:+.2%}, over the "
            "+1.00% ceiling. Fall back to static QDQ with LayerNorm/Softmax "
            "excluded, or fp16, before shipping."
        )
    print(f"\n{tag} artifact is within the gate ceiling at both vocabulary sizes")


def _verify_wide(quant_vectors, photos, tier1_labels, tag="int8"):
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
        (tag, quant_vectors[idx]),
    ):
        preds = _predictions(vecs @ text.T, labels, rows)
        rates[name] = false_edible_rate(preds, CATALOG_NAMES, k=1)
        print(f"{name:<22} {rates[name]:>14.2%}")

    delta = rates[tag] - rates["fp32 (spike)"]
    print(f"{'delta':<22} {delta:>+14.2%}")
    return delta


def stage_text_matrix():
    """All labels -> fp16 matrix + index-aligned TS labels file.

    Emitted in ONE pass so the binary and the labels file cannot drift: they are
    joined by row index at runtime, and a mismatch would silently pair every
    photo with the wrong species name.
    """
    import numpy as np

    from bioclip_spike import (
        CATALOG,
        CATALOG_NAMES,
        CULTIVATED,
        CULTIVATED_NAMES,
        TOXIC,
        TOXIC_NAMES,
        resolve_taxon,
    )

    # Tier 1 comes from the CODE lists, not from embed_order.json.
    #
    # embed_order.json records whatever the last spike run happened to embed, so
    # taking tier 1 from it pinned the SHIPPED vocabulary to a stale measurement:
    # promoting a species from tier 2 into TOXIC left the label file unchanged
    # and surfaced only as a confusing "tier-2 overlaps tier-1" error. What ships
    # is defined by CATALOG and TOXIC, here.
    tier1 = sorted(CATALOG_NAMES | TOXIC_NAMES)

    lineages = json.loads((CACHE / "lineages.json").read_text())
    wide_path = CACHE / "wide_vocab.json"
    wide_lineages = json.loads(wide_path.read_text()) if wide_path.exists() else {}
    if not wide_lineages:
        print("no wide_vocab.json — emitting tier 1 only")

    # A species promoted out of tier 2 already has its lineage in wide_vocab, so
    # only a genuinely new name costs an API call.
    ranks = {name: rank for name, rank in list(CATALOG) + list(TOXIC)}
    resolved = dict(lineages)
    for name in tier1:
        if name in resolved:
            continue
        if name in wide_lineages:
            resolved[name] = wide_lineages[name]
            continue
        print(f"fetching lineage for new tier-1 label {name!r}...")
        resolved[name] = resolve_taxon(name, ranks.get(name, "species"))["lineage"]
    if len(resolved) != len(lineages):
        (CACHE / "lineages.json").write_text(json.dumps(resolved, indent=2))
        print(f"cached {len(resolved) - len(lineages)} new lineage(s)")
    lineages = resolved

    # Cultivated and culinary species join tier 2. They are not in the regional
    # observation data (nobody logs a supermarket champignon on iNaturalist), but
    # people photograph them, and without a label of their own the closed-set
    # model forces them onto their nearest neighbour - which for parsley and
    # champignon is a species flagged as toxic.
    cultivated_ranks = {name: rank for name, rank in CULTIVATED}
    failed = []
    for name in sorted(CULTIVATED_NAMES - set(wide_lineages)):
        if name in lineages:
            wide_lineages[name] = lineages[name]
            continue
        try:
            print(f"fetching lineage for cultivated label {name!r}...")
            wide_lineages[name] = resolve_taxon(
                name, cultivated_ranks.get(name, "species")
            )["lineage"]
        except Exception as exc:  # noqa: BLE001 - reported in full below
            failed.append(f"{name}: {exc}")
    if failed:
        # All at once rather than one per run: a taxon renamed by iNaturalist is
        # a data fix, and finding them one round trip at a time is wasteful.
        raise SystemExit(
            "could not resolve cultivated labels:\n  " + "\n  ".join(failed)
        )

    # Drop provisional / undescribed taxa: iNaturalist carries these as
    # Amanita sp. 'flavoconia-01' and similar. A user gains nothing from one of
    # three candidate slots reading "Anthracoporus sp. 'AL01'", and the quotes
    # break naive parsing of the generated labels file.
    def _provisional(name):
        return " sp. " in name or name.endswith(" sp.") or "'" in name or '"' in name

    provisional = sorted(n for n in wide_lineages if _provisional(n))
    if provisional:
        for n in provisional:
            wide_lineages.pop(n, None)
        print(f"dropped {len(provisional)} provisional taxa: {provisional[:4]}")

    # Real observation counts, written next to the vocabulary by
    # bioclip_wide_vocab.py. Insertion order was used here before and was wrong:
    # wide_vocab.json is written in per-region blocks, so the first region filled
    # the entire quota and the last contributed nothing.
    counts_path = CACHE / "wide_vocab_counts.json"
    observations = (
        json.loads(counts_path.read_text()) if counts_path.exists() else {}
    )
    if not observations:
        print(
            "no wide_vocab_counts.json - the cap will keep an ARBITRARY subset "
            "rather than the most observed; re-run bioclip_wide_vocab.py "
            "--stage taxa to record counts"
        )

    tier2 = sorted(set(wide_lineages) - set(tier1))
    tier2_lineages = {k: v for k, v in wide_lineages.items() if k in set(tier2)}

    # Structurally impossible now that tier2 is wide-minus-tier1, but asserted
    # anyway: a tier-1 species leaking into tier 2 would render as "no safety
    # information" for a species we hold warnings for.
    overlap = set(tier2) & (CATALOG_NAMES | TOXIC_NAMES)
    if overlap:
        raise SystemExit(f"tier-2 overlaps tier-1: {sorted(overlap)}")

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

    # Cap tier 2. Applied after the genus-ambiguity drop so the limit counts
    # labels that actually ship, and by observation count so what falls off the
    # end is the least-photographed rather than the alphabetically unlucky.
    # Curated labels are EXEMPT from the cap. They are absent from
    # wide_vocab.json by definition - nobody logs a supermarket champignon on
    # iNaturalist - so ranking them by observation count sent every one to the
    # back and the cap deleted them. That silently undid the previous commit:
    # Agaricus bisporus vanished while Agaricus xanthodermus stayed toxic, so a
    # champignon photo came back as the yellow-stainer with a toxic warning.
    curated = [n for n in tier2 if n in CULTIVATED_NAMES]
    regional = [n for n in tier2 if n not in CULTIVATED_NAMES]
    if len(regional) > TIER2_LIMIT:
        dropped = len(regional) - TIER2_LIMIT
        regional = sorted(regional, key=lambda n: -observations.get(n, 0))[
            :TIER2_LIMIT
        ]
        kept_min = min(observations.get(n, 0) for n in regional)
        print(
            f"capped regional tier 2 at the {TIER2_LIMIT} most observed "
            f"({dropped} dropped; fewest observations kept: {kept_min}); "
            f"{len(curated)} curated labels exempt"
        )
    tier2 = sorted(set(regional) | set(curated))
    tier2_lineages = {k: v for k, v in tier2_lineages.items() if k in set(tier2)}

    # Nothing curated may go missing. The bug above was invisible in the label
    # totals, because regional names arrived to replace exactly what was lost.
    lost = sorted(CULTIVATED_NAMES - set(tier2) - set(tier1))
    if lost:
        raise SystemExit(f"curated labels missing from the vocabulary: {lost}")

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
    # Budget note rather than a build hazard. `.bin` is absent from workbox's
    # globPatterns, so this is runtime-cached and cannot trip the 2 MiB precache
    # ceiling. What the size does cost is a one-off download and, once decoded to
    # fp32 in the browser, twice this in RAM alongside a ~307MB model. The
    # practical ceiling on a phone is tens of MB, not hundreds.
    decoded_mb = matrix16.size * 4 / 1e6
    print(f"  decoded in the browser: {decoded_mb:.1f} MB fp32")
    if decoded_mb > 60:
        print("  WARNING: over 60 MB decoded — verify on a low-end phone before "
              "shipping; this sits in memory next to the model")

    catalog, toxic = CATALOG_NAMES, TOXIC_NAMES
    rows = []
    for name in labels:
        kind = "toxic" if name in toxic else ("catalog" if name in catalog else "other")
        rows.append(f"  {{ scientificName: {name!r}, kind: {kind!r} }},".replace("'", "'"))
    LABELS_TS.write_text(
        "// GENERATED by backend/tools/bioclip_export.py --stage text-matrix\n"
        "// DO NOT EDIT. Row order is index-aligned with\n"
        "// src/assets/bioclip_text_embeddings.f16.bin - editing one without\n"
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


PARITY_DIR = Path(__file__).resolve().parents[2] / "e2e" / "fixtures" / "bioclip-parity"


def stage_parity_fixtures():
    """Emit fixtures + reference PREPROCESSED TENSORS for the browser parity test.

    Scope note: this compares the preprocessed 3x224x224 tensor, not the final
    embedding. That is deliberate and sufficient — `--stage export` already
    asserts the ONNX graph matches PyTorch to 8.5e-07, so tensor parity composes
    with graph parity to give embedding parity, without needing a 306MB model
    inside a Playwright run.

    The risk being isolated is real and specific: open_clip resizes with PIL
    bicubic (antialiased), and a browser canvas does not. If the pixel pipelines
    diverge, every embedding shifts and accuracy degrades with no error anywhere.
    """
    import numpy as np
    from PIL import Image

    _model, preprocess, _tok, torch = load_model()
    order = json.loads((CACHE / "embed_order.json").read_text())
    imgs = CACHE / "images"

    # Chosen for the cases where resize-then-crop diverges most: extreme aspect
    # ratios, upscaling (shortest side < 224), and the lethal Lepiota/parasol
    # pair whose decision boundary the spike measured at 13%.
    picks, seen_labels = [], set()
    wanted = {"portrait": 2, "landscape": 1, "square": 1, "small": 2}
    critical = {"Lepiota brunneoincarnata", "Macrolepiota procera"}
    for row in order["photos"]:
        path = imgs / row["file"]
        try:
            w, h = Image.open(path).size
        except Exception:
            continue
        ar = w / h
        if min(w, h) < 224:
            bucket = "small"
        elif ar > 1.4:
            bucket = "landscape"
        elif ar < 0.72:
            bucket = "portrait"
        elif 0.98 < ar < 1.02:
            bucket = "square"
        else:
            bucket = None
        if bucket and wanted.get(bucket):
            wanted[bucket] -= 1
            picks.append((row, w, h, bucket))
        elif row["label"] in critical and row["label"] not in seen_labels:
            seen_labels.add(row["label"])
            picks.append((row, w, h, "critical"))

    PARITY_DIR.mkdir(parents=True, exist_ok=True)
    for old in PARITY_DIR.glob("*"):
        old.unlink()

    manifest = []
    for row, w, h, bucket in picks:
        src = imgs / row["file"]
        (PARITY_DIR / row["file"]).write_bytes(src.read_bytes())

        tensor = preprocess(Image.open(src).convert("RGB"))
        arr = tensor.numpy().astype(np.float16)  # (3, 224, 224), CHW, normalised
        ref_name = row["file"].rsplit(".", 1)[0] + ".tensor.f16.bin"
        (PARITY_DIR / ref_name).write_bytes(arr.tobytes())

        manifest.append(
            {
                "image": row["file"],
                "referenceTensor": ref_name,
                "label": row["label"],
                "kind": row["kind"],
                "sourceWidth": w,
                "sourceHeight": h,
                "case": bucket,
                "shape": list(arr.shape),
            }
        )
        print(f"  {bucket:9s} {w}x{h}  {row['file'][:52]}")

    (PARITY_DIR / "reference.json").write_text(
        json.dumps(
            {
                "model": MODEL_HUB_ID,
                "note": (
                    "Reference tensors are open_clip's own preprocess() output: "
                    "PIL bicubic resize of the shortest side to 224, centre crop, "
                    "then normalise. float16, CHW. Regenerate with "
                    "bioclip_export.py --stage parity-fixtures."
                ),
                "mean": [0.48145466, 0.4578275, 0.40821073],
                "std": [0.26862954, 0.26130258, 0.27577711],
                "fixtures": manifest,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    total = sum(f.stat().st_size for f in PARITY_DIR.glob("*"))
    print(f"\nwrote {len(manifest)} fixtures to {PARITY_DIR} ({total / 1e6:.2f} MB)")


# Must match MODEL_VERSION / MODEL_URL in src/lib/modelCache.ts. The upload
# stage asserts this rather than trusting it, because a mismatch means the app
# fetches a 404 and the only symptom is a download that never starts.
# Per-variant versions, matching src/lib/bioclip/variant.ts. Independent versions
# mean publishing int4 did not require re-uploading the already-verified int8
# object under a new shared key.
VARIANTS = {
    "int8": ("bioclip2-int8-2026-07", ONNX_INT8),
    "int4": ("bioclip2-int4-2026-07", ONNX_INT4),
}
VARIANT_TS = Path(__file__).resolve().parents[2] / "src" / "lib" / "bioclip" / "variant.ts"


def _r2_key(variant):
    version, _ = VARIANTS[variant]
    return f"models/bioclip/{version}/image_tower_{variant}.onnx"


def stage_upload(only=None):
    """Publish the quantized artifacts to R2 under their versioned keys.

    Refuses to overwrite. The key carries a version precisely so that publishing
    is append-only: the service worker caches this CacheFirst for a year, so
    replacing bytes at an existing URL would leave everyone who already
    downloaded on the old model with nothing to signal it. An already-published
    variant is skipped rather than treated as an error, so this stage is
    re-runnable after adding a variant.
    """
    import boto3

    wanted = [only] if only else list(VARIANTS)

    # Keep the app's constants and these keys in lockstep. A mismatch would have
    # the app request a key that does not exist, and the failure would surface as
    # a download error rather than a build error.
    ts = VARIANT_TS.read_text(encoding="utf-8")
    for variant in wanted:
        version, path = VARIANTS[variant]
        if not path.exists():
            raise SystemExit(f"no {path.name} — run the matching quantize stage first")
        if f"'{version}'" not in ts:
            raise SystemExit(
                f"version mismatch: {version!r} is not in {VARIANT_TS.name}. "
                "The app would request a key that does not exist."
            )
        if _r2_key(variant) not in ts:
            raise SystemExit(
                f"{VARIANT_TS.name} does not contain the key {_r2_key(variant)}"
            )

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from build_season_curves import get_required_env, load_dotenv

    root = Path(__file__).resolve().parents[2]
    load_dotenv(root / ".env")
    load_dotenv(root / ".env.secret")

    bucket = get_required_env("R2_BUCKET_NAME")
    client = boto3.client(
        "s3",
        endpoint_url=get_required_env("R2_ENDPOINT_URL"),
        aws_access_key_id=get_required_env("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=get_required_env("R2_SECRET_ACCESS_KEY"),
    )

    for variant in wanted:
        _, path = VARIANTS[variant]
        key = _r2_key(variant)
        size = path.stat().st_size

        try:
            existing = client.head_object(Bucket=bucket, Key=key)
            remote = existing["ContentLength"]
            if remote != size:
                raise SystemExit(
                    f"{key} already exists with DIFFERENT bytes ({remote} remote "
                    f"vs {size} local). Publishing is append-only — bump this "
                    "variant's version in both variant.ts and this file instead "
                    "of overwriting, or the service worker will serve stale "
                    "bytes forever."
                )
            print(f"{variant}: already published, {remote} bytes — skipping")
            continue
        except client.exceptions.ClientError as e:
            if e.response["Error"]["Code"] not in ("404", "NoSuchKey", "NotFound"):
                raise

        print(f"\nuploading {variant}: {size / 1e6:.1f} MB -> s3://{bucket}/{key}")
        seen = {"bytes": 0, "pct": -5}

        def progress(chunk, seen=seen, size=size):
            seen["bytes"] += chunk
            pct = int(seen["bytes"] * 100 / size)
            if pct >= seen["pct"] + 5:
                seen["pct"] = pct
                print(f"  {pct:3d}%  {seen['bytes'] / 1e6:.0f} MB")

        client.upload_file(
            str(path),
            bucket,
            key,
            ExtraArgs={"ContentType": "application/octet-stream"},
            Callback=progress,
        )

        # Verify what landed, rather than trusting the upload's exit status: a
        # truncated object would be cached by the client as a corrupt model.
        head = client.head_object(Bucket=bucket, Key=key)
        remote = head["ContentLength"]
        print(f"remote size {remote} bytes, local {size} bytes")
        if remote != size:
            raise SystemExit(f"size mismatch after upload: {remote} != {size}")
        print(f"verified. public URL:\n  {R2}/{key}")


SYNTH_DIR = Path(__file__).resolve().parents[2] / "src" / "test" / "fixtures"

# Source sizes chosen to exercise the arithmetic edges of resize-then-crop.
# 219x500 is the one that matters most: it resizes to 224x511, giving a crop
# offset of (511-224)/2 = 143.5, where Python's round-half-to-EVEN gives 144 but
# Math.floor gives 143. That one-pixel shift is invisible on every other size
# and cost a cosine of 0.964 when the TS port used floor.
SYNTH_SIZES = [
    (219, 500),  # -> 224x511, crop offset 143.5 (round-half-to-even == 144)
    (225, 500),  # -> 224x497, crop offset 136.5 (round-half-to-even == 136)
    (500, 222),  # -> 504x224, upscales the short side
    (500, 333),  # -> 336x224, ordinary landscape downscale
    (281, 500),  # -> 224x398, integer crop offset
    (500, 500),  # -> 224x224, square, no crop at all
    (100, 140),  # -> 224x313, heavy upscale from below 224 on both axes
]


def _synth_rgb(width, height):
    """Deterministic pseudo-random RGB, reproducible byte-for-byte in TS.

    A plain 32-bit LCG (glibc constants) so the browser test can regenerate the
    identical input without committing megabytes of raw pixels. Structured noise
    rather than a smooth gradient: a resampling bug shows up in high-frequency
    detail and can hide entirely in a smooth ramp.
    """
    import numpy as np

    n = width * height * 3
    out = np.empty(n, dtype=np.uint8)
    state = 12345
    for i in range(n):
        state = (1103515245 * state + 12345) & 0x7FFFFFFF
        out[i] = (state >> 16) & 0xFF
    return out.reshape(height, width, 3)


def stage_parity_synthetic():
    """Synthetic-input reference tensors for src/test/bioclip-preprocess.test.ts.

    Why synthetic rather than the real photos: the browser's JPEG decoder and
    PIL's are not guaranteed identical, so a photo-based test conflates decode
    differences with resize differences. Feeding both sides identical generated
    pixels isolates the resampling algorithm, which is the part we wrote and the
    part that can regress. It also keeps the committed fixtures at tens of KB
    instead of megabytes of raw pixel dumps.
    """
    import numpy as np
    from PIL import Image

    _model, preprocess, _tok, _torch = load_model()
    SYNTH_DIR.mkdir(parents=True, exist_ok=True)

    manifest = []
    for width, height in SYNTH_SIZES:
        arr = _synth_rgb(width, height)
        tensor = preprocess(Image.fromarray(arr, mode="RGB")).numpy().astype(np.float16)
        name = f"preprocess_{width}x{height}.f16.bin"
        (SYNTH_DIR / name).write_bytes(tensor.tobytes())
        manifest.append(
            {"width": width, "height": height, "reference": name, "shape": list(tensor.shape)}
        )
        print(f"  {width}x{height} -> {tensor.shape}  {name}")

    (SYNTH_DIR / "preprocess-reference.json").write_text(
        json.dumps(
            {
                "note": (
                    "GENERATED by bioclip_export.py --stage parity-synthetic. "
                    "Reference output of open_clip's preprocess() on deterministic "
                    "LCG-generated RGB. The TS test regenerates the same input and "
                    "must reproduce these tensors."
                ),
                "lcg": {"seed": 12345, "mul": 1103515245, "add": 12345, "mod": 2147483648},
                "cases": manifest,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    total = sum(f.stat().st_size for f in SYNTH_DIR.glob("preprocess*"))
    print(f"\nwrote {len(manifest)} reference tensors ({total / 1e3:.0f} KB)")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--stage",
        choices=[
            "export",
            "quantize",
            "quantize-4bit",
            "selfcheck-reference",
            "probe-model",
            "verify",
            "verify-4bit",
            "webgpu-coverage",
            "verify-shipped",
            "audit-danger",
            "text-matrix",
            "parity-fixtures",
            "parity-synthetic",
            "upload",
        ],
        required=True,
    )
    args = ap.parse_args()
    print(f"model: {MODEL_HUB_ID}")
    {
        "export": stage_export,
        "quantize": stage_quantize,
        "quantize-4bit": stage_quantize_4bit,
        "selfcheck-reference": stage_selfcheck_reference,
        "probe-model": stage_probe_model,
        "verify": stage_verify,
        "verify-4bit": lambda: stage_verify(ONNX_INT4, tag="int4"),
        "webgpu-coverage": stage_webgpu_coverage,
        "verify-shipped": stage_verify_shipped,
        "audit-danger": stage_audit_danger,
        "text-matrix": stage_text_matrix,
        "parity-fixtures": stage_parity_fixtures,
        "parity-synthetic": stage_parity_synthetic,
        "upload": stage_upload,
    }[args.stage]()


if __name__ == "__main__":
    main()
