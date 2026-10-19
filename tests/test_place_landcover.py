"""A place's land-cover shares: the classes in the window around it, clipped at the grid edge."""
import numpy as np

import build_place_landcover as pl


def test_window_shares_count_the_square_around_each_place(monkeypatch):
    monkeypatch.setattr(pl, "WINDOW", 3)
    grid = np.zeros((5, 5), np.uint8)
    grid[1:3, 1:3] = 2          # a 2x2 block of class 2
    grid[4, 4] = 1
    shares = pl.window_shares(grid, np.array([2, 0, 4]), np.array([2, 0, 4]), 3)
    np.testing.assert_allclose(shares[0], [5 / 9, 0, 4 / 9])      # centre: 4 of 9 cells are class 2
    np.testing.assert_allclose(shares[1], [3 / 4, 0, 1 / 4])      # corner: clipped to a 2x2 window
    np.testing.assert_allclose(shares[2], [3 / 4, 1 / 4, 0])
