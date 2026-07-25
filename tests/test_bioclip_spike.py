from bioclip_spike import split_by_observation


def _obs(obs_id, n_photos):
    return {
        "observation_id": obs_id,
        "photo_urls": [f"https://x/{obs_id}_{i}.jpg" for i in range(n_photos)],
    }


def test_split_never_shares_an_observation():
    # 10 observations, 3 photos each
    obs = [_obs(i, 3) for i in range(10)]
    gallery, test = split_by_observation(obs, gallery_n=9, test_n=9)

    gallery_obs = {p["observation_id"] for p in gallery}
    test_obs = {p["observation_id"] for p in test}
    assert gallery_obs & test_obs == set(), "observation leaked across the split"


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
