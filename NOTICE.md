# Third-party notices

## BioCLIP 2

The photo-identification feature runs a quantized ONNX export of the **BioCLIP 2**
image tower on the user's device. The model is used unmodified in substance; only
the image tower is exported and its weights are quantized for size.

- Model: <https://huggingface.co/imageomics/bioclip-2>
- Authors: Imageomics Institute
- Licence: **MIT** (permits commercial use)
- DOI: [10.57967/hf/5765](https://doi.org/10.57967/hf/5765)

The model card asks that use be cited. Both citations it requests:

```bibtex
@software{Gu_BioCLIP_2_model,
  author = {Jianyang Gu and Samuel Stevens and Elizabeth G Campolongo and
            Matthew J Thompson and Net Zhang and Jiaman Wu and Andrei Kopanev and
            Zheda Mai and Alexander E. White and James Balhoff and
            Wasila M Dahdul and Daniel Rubenstein and Hilmar Lapp and
            Tanya Berger-Wolf and Wei-Lun Chao and Yu Su},
  license = {MIT},
  title = {{BioCLIP 2}},
  url = {https://huggingface.co/imageomics/bioclip-2},
  version = {1.0.0},
  doi = {10.57967/hf/5765},
  publisher = {Hugging Face},
  year = {2025}
}
```

```bibtex
@inproceedings{gu2025bioclip2,
  title = {{BioCLIP 2}: Emergent Properties from Scaling Hierarchical
           Contrastive Learning},
  author = {Jianyang Gu and Samuel Stevens and Elizabeth G Campolongo and
            Matthew J Thompson and Net Zhang and Jiaman Wu and Andrei Kopanev and
            Zheda Mai and Alexander E. White and James Balhoff and
            Wasila M Dahdul and Daniel Rubenstein and Hilmar Lapp and
            Tanya Berger-Wolf and Wei-Lun Chao and Yu Su},
  booktitle = {Advances in Neural Information Processing Systems},
  year = {2025}
}
```

The model card also recommends citing OpenCLIP and the original BioCLIP:

- OpenCLIP — <https://github.com/mlfoundations/open_clip> (MIT)
- BioCLIP (v1) — <https://huggingface.co/imageomics/bioclip> (MIT)

### MIT licence text

Reproduced because MIT requires the copyright and permission notice to
accompany distributions of the software, and this app distributes a derived
artifact of the model weights.

```
MIT License

Copyright (c) 2024-2025 Imageomics Institute

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## ONNX Runtime Web

Runs the model in the browser. MIT licence.
<https://github.com/microsoft/onnxruntime>

## Protomaps basemap assets

The map bundles Protomaps basemap sprite sheets and Noto Sans glyph ranges so
labels and symbols remain available without a network connection.

- Asset source: <https://github.com/protomaps/basemaps-assets>
- Noto Sans fonts: SIL Open Font License 1.1
- Sprite icons: derived from the MIT-licensed Tangram icon set
- Basemap data: © OpenStreetMap contributors, Open Database License

OpenStreetMap attribution is also retained in every MapLibre style so it stays
visible when an offline regional basemap is active.

## Terrain tiles

The map's relief shading is pre-rendered from the **AWS Terrain Tiles** open
dataset (Terrarium encoding), originally assembled by Mapzen, and served from
the app's own tile host as `basemap/hillshade_z11.pmtiles`
(`scripts/build_hillshade_tiles.py`). No request reaches Amazon from a user's
browser.

- Source tiles: <https://registry.opendata.aws/terrain-tiles/>
- Attribution: Mapzen / AWS Terrain Tiles; underlying data from SRTM, GMTED,
  ETOPO1 and other public sources listed in the dataset's documentation.

The attribution is carried in the `hillshade` source of every MapLibre style.

## Species occurrence data

The regional species list used as the identification vocabulary was derived from
**iNaturalist** observation counts. iNaturalist observation data is available
under its own terms; see <https://www.inaturalist.org/pages/terms>.
No iNaturalist photographs are redistributed by this app — they were used only
offline, to measure accuracy.

## ERA5 reanalysis

Past days' rain in the forecast is replaced with **ERA5** hourly total precipitation
once it is published, about five days after the day (`backend/era5_rain.py`). ERA5 is
distributed under the Licence to use Copernicus Products, which is free and permits
commercial use, with this attribution:

- "Contains modified Copernicus Climate Change Service information 2026. Neither the
  European Commission nor ECMWF is responsible for any use that may be made of the
  Copernicus information or data it contains."
- Hersbach, H., Bell, B., Berrisford, P., et al. (2023). ERA5 hourly data on single
  levels from 1940 to present. Copernicus Climate Change Service (C3S) Climate Data
  Store (CDS). <https://doi.org/10.24381/cds.adbb2d47>

## Cherry blossom forecast

The cherry blossom layer's normals are NASA POWER's 1991–2020 monthly mean
temperatures (MERRA-2), shipped in `backend/generated/bloom_normals_*.npz`
(`backend/tools/build_bloom_normals.py`). NASA POWER data carry no use
restrictions; the project asks to be acknowledged:

- "These data were obtained from the NASA Langley Research Center (LaRC) POWER
  Project funded through the NASA Earth Science/Applied Science Program."
- <https://power.larc.nasa.gov/>

The layer is drawn on Natural Earth's 1:10m urban areas, cut to its land polygons
(`backend/generated/bloom_towns_*.geojson`, `backend/tools/build_bloom_towns.py`).
Natural Earth is in the public domain: "Made with Natural Earth", <https://www.naturalearthdata.com/>.

The model was fitted on the National Park Service's Tidal Basin peak-bloom dates,
the Japan Meteorological Agency's Yoshino first-bloom dates (both as cleaned by the
GMU cherry blossom prediction competition) and iNaturalist observation dates. None
of those records are redistributed; see `docs/species/2026-09-30-cherry-blossom.md`.
