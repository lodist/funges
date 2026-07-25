import pytest

from bioclip_spike import (
    false_edible_rate,
    split_by_observation,
    taxonomic_prompt,
    threshold_sweep,
    top_k_accuracy,
    worst_confusions,
)


def _obs(obs_id, n_photos):
    return {
        "observation_id": obs_id,
        "photo_urls": [f"https://x/{obs_id}_{i}.jpg" for i in range(n_photos)],
    }


def test_split_never_shares_an_observation():
    # 10 observations, 3 photos each
    # quotas deliberately NOT a multiple of photos-per-observation: with 9/9
    # a flatten-then-slice implementation splits cleanly by coincidence and
    # this test would pass a leaking impl. If you change photos-per-obs below,
    # re-check the quotas share no common factor with it, or the teeth go away.
    obs = [_obs(i, 3) for i in range(10)]
    gallery, test = split_by_observation(obs, gallery_n=10, test_n=10)

    gallery_obs = {p["observation_id"] for p in gallery}
    test_obs = {p["observation_id"] for p in test}
    assert gallery_obs & test_obs == set(), "observation leaked across the split"

    # cap is a HARD ceiling even when it falls mid-observation (10 is not a
    # multiple of 3, so two observations here are truncated)
    assert len(gallery) == 10
    assert len(test) == 10


def test_split_respects_requested_counts():
    obs = [_obs(i, 3) for i in range(10)]
    gallery, test = split_by_observation(obs, gallery_n=9, test_n=9)
    assert len(gallery) == 9
    assert len(test) == 9


def test_split_is_deterministic():
    obs = [_obs(i, 3) for i in range(10)]
    a = split_by_observation(obs, gallery_n=9, test_n=9)
    b = split_by_observation(obs, gallery_n=9, test_n=9)
    assert a == b


def test_split_returns_what_it_can_when_data_is_thin():
    # only 2 observations, 1 photo each -> cannot fill 9+9
    obs = [_obs(i, 1) for i in range(2)]
    gallery, test = split_by_observation(obs, gallery_n=9, test_n=9)
    assert len(gallery) == 1
    assert len(test) == 1
    assert {p["observation_id"] for p in gallery} & {
        p["observation_id"] for p in test
    } == set()


def test_split_prefers_filling_test_set_over_gallery():
    # 3 observations, 1 photo each, want 2 gallery + 2 test.
    # Test set is what the metrics are computed from, so it wins.
    obs = [_obs(i, 1) for i in range(3)]
    gallery, test = split_by_observation(obs, gallery_n=2, test_n=2)
    assert len(test) == 2
    assert len(gallery) == 1


CATALOG_SET = {"Cantharellus cibarius", "Allium ursinum", "Boletus"}


def _pred(truth, kind, ranked, confidence=0.9):
    return {
        "truth": truth,
        "truth_kind": kind,
        "ranked": ranked,
        "confidence": confidence,
    }


def test_top_k_accuracy_ignores_toxic_predictions():
    preds = [
        # catalog, correct at rank 1
        _pred("Boletus", "catalog", ["Boletus", "Amanita muscaria"]),
        # catalog, correct at rank 2
        _pred(
            "Allium ursinum",
            "catalog",
            ["Colchicum autumnale", "Allium ursinum"],
        ),
        # toxic photo — must not count toward catalog accuracy at all
        _pred("Amanita phalloides", "toxic", ["Amanita phalloides"]),
    ]
    assert top_k_accuracy(preds, k=1) == 0.5
    assert top_k_accuracy(preds, k=2) == 1.0


def test_false_edible_rate_counts_only_toxic_photos():
    preds = [
        # toxic photo ranked as an edible -> DANGEROUS, counts
        _pred(
            "Omphalotus olearius",
            "toxic",
            ["Cantharellus cibarius", "Omphalotus olearius"],
        ),
        # toxic photo ranked as toxic at 1, edible at 2 -> safe at k=1, bad at k=2
        _pred(
            "Colchicum autumnale",
            "toxic",
            ["Colchicum autumnale", "Allium ursinum"],
        ),
        # catalog photo -> irrelevant to this metric
        _pred("Boletus", "catalog", ["Cantharellus cibarius"]),
    ]
    assert false_edible_rate(preds, CATALOG_SET, k=1) == 0.5
    assert false_edible_rate(preds, CATALOG_SET, k=2) == 1.0


def test_false_edible_rate_is_zero_with_no_toxic_photos():
    preds = [_pred("Boletus", "catalog", ["Boletus"])]
    assert false_edible_rate(preds, CATALOG_SET, k=1) == 0.0


def test_worst_confusions_ranks_toxic_to_edible_pairs():
    preds = [
        _pred("Omphalotus olearius", "toxic", ["Cantharellus cibarius"]),
        _pred("Omphalotus olearius", "toxic", ["Cantharellus cibarius"]),
        _pred("Omphalotus olearius", "toxic", ["Omphalotus olearius"]),
        _pred("Colchicum autumnale", "toxic", ["Allium ursinum"]),
    ]
    out = worst_confusions(preds, CATALOG_SET, limit=5)

    assert out[0]["toxic"] == "Omphalotus olearius"
    assert out[0]["predicted"] == "Cantharellus cibarius"
    assert out[0]["rate"] == 2 / 3    # 2 of that species' 3 photos
    assert out[0]["n"] == 3
    # Colchicum -> Allium is 1/1 = 1.0 but has fewer photos; both present
    assert {row["toxic"] for row in out} == {
        "Omphalotus olearius",
        "Colchicum autumnale",
    }


def test_threshold_sweep_trades_coverage_for_safety():
    preds = [
        # low-confidence dangerous call — a cutoff should suppress it
        _pred(
            "Omphalotus olearius",
            "toxic",
            ["Cantharellus cibarius"],
            confidence=0.30,
        ),
        # high-confidence safe call — should survive every cutoff
        _pred(
            "Amanita phalloides",
            "toxic",
            ["Amanita phalloides"],
            confidence=0.95,
        ),
    ]
    rows = threshold_sweep(preds, CATALOG_SET, cutoffs=[0.0, 0.5], k=1)

    assert rows[0]["cutoff"] == 0.0
    assert rows[0]["answered"] == 1.0
    assert rows[0]["false_edible"] == 0.5

    assert rows[1]["cutoff"] == 0.5
    assert rows[1]["answered"] == 0.5       # the 0.30 pred is withheld
    assert rows[1]["false_edible"] == 0.0   # and so the danger is gone


def test_threshold_sweep_reports_toxic_sample_size():
    # Dangerous calls are low-confidence here and safe catalog calls are high,
    # so a high cutoff filters out EVERY toxic photo: false_edible reads a
    # perfect 0.0 while having measured nothing. toxic_n is what exposes that,
    # and without it the emptiest row looks like the safest cutoff to ship.
    preds = [
        _pred("Amanita phalloides", "toxic", ["Boletus"], confidence=0.35)
    ] * 2 + [_pred("Boletus", "catalog", ["Boletus"], confidence=0.95)] * 2
    low, high = threshold_sweep(preds, CATALOG_SET, cutoffs=[0.0, 0.9], k=1)

    assert low["toxic_n"] == 2
    assert low["false_edible"] == 1.0        # every toxic photo called edible

    assert high["toxic_n"] == 0              # nothing toxic survived the cutoff
    assert high["false_edible"] == 0.0       # so this 0.0 means "unmeasured"


def test_threshold_sweep_top1_stays_pinned_to_k1():
    # Truth sits at rank 2: top-1 misses it, top-3 finds it. The `top1` field
    # must stay anchored at k=1 even when the gate itself runs at k=3, or the
    # column stops meaning what its name says.
    preds = [_pred("Boletus", "catalog", ["Cantharellus cibarius", "Boletus"])]
    row = threshold_sweep(preds, CATALOG_SET, cutoffs=[0.0], k=3)[0]

    assert row["top1"] == 0.0
    assert top_k_accuracy(preds, k=3) == 1.0   # would be 1.0 if it followed k


def test_taxonomic_prompt_uses_full_lineage():
    lineage = {
        "kingdom": "Fungi",
        "phylum": "Basidiomycota",
        "class": "Agaricomycetes",
        "order": "Cantharellales",
        "family": "Cantharellaceae",
        "genus": "Cantharellus",
        "species": "Cantharellus cibarius",
    }
    assert taxonomic_prompt(lineage) == (
        "a photo of Fungi Basidiomycota Agaricomycetes Cantharellales "
        "Cantharellaceae Cantharellus cibarius."
    )


def test_taxonomic_prompt_skips_missing_ranks():
    lineage = {"kingdom": "Fungi", "genus": "Boletus"}
    assert taxonomic_prompt(lineage) == "a photo of Fungi Boletus."


def test_taxonomic_prompt_does_not_repeat_the_genus():
    # iNat species names include the genus; emitting both would duplicate it
    lineage = {"genus": "Amanita", "species": "Amanita phalloides"}
    assert taxonomic_prompt(lineage) == "a photo of Amanita phalloides."


def test_taxonomic_prompt_refuses_a_lineage_with_no_standard_rank():
    # iNat uses ranks outside our seven ("complex", "section", ...). A lineage
    # holding only those would render "a photo of ." — a prompt that embeds
    # without error and silently corrupts that label's whole report column.
    with pytest.raises(ValueError):
        taxonomic_prompt({})
    with pytest.raises(ValueError):
        taxonomic_prompt({"complex": "Morchella esculenta complex"})


def test_taxonomic_prompt_does_not_merge_a_non_genus_ancestor():
    # Family is not a prefix of the species name, so the dedup must NOT fire.
    # This is the case that proves the trailing-space check earns its keep: a
    # loosened startswith would swallow "Amanitaceae" and lose a rank.
    lineage = {"family": "Amanitaceae", "species": "Amanita phalloides"}
    assert taxonomic_prompt(lineage) == "a photo of Amanitaceae Amanita phalloides."
