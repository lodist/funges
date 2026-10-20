from bioclip_export import cap_vocabulary, caution_genera, label_kind
from bioclip_spike import CULTIVATED_NAMES


def test_label_kind():
    caution = caution_genera()
    # Toxic and catalog win, even in a genus that also has toxic members.
    assert label_kind("Amanita phalloides", caution) == "toxic"
    assert label_kind("Boletus edulis", caution) == "catalog"
    # Relatives of a toxic entry, and members of a danger genus without one.
    assert label_kind("Amanita citrina", caution) == "caution"
    assert label_kind("Conocybe filaris", caution) == "caution"
    # Cultivated labels exist so a champignon shows no warning; hemlock
    # look-alikes that are not poisonous themselves stay neutral too.
    assert label_kind("Agaricus bisporus", caution) == "other"
    assert label_kind("Anthriscus sylvestris", caution) == "other"
    assert label_kind("Russula cyanoxantha", caution) == "other"


def test_cap_vocabulary_is_per_kingdom_and_keeps_curated():
    vocab = {
        "tier1": ["Amanita phalloides"],
        "curated": sorted(CULTIVATED_NAMES),
        # Most sighted first, as build_vocabulary returns them.
        "regional": {"Fungi": ["Fz a", "Fa b", "Fm c"], "Plantae": ["Pz a", "Pa b"]},
    }

    got = cap_vocabulary(vocab, {"Fungi": 2, "Plantae": 1})

    assert got == ["Amanita phalloides"] + sorted(
        {"Fz a", "Fa b", "Pz a"} | CULTIVATED_NAMES
    )
