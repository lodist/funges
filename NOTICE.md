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

## Species occurrence data

The regional species list used as the identification vocabulary was derived from
**iNaturalist** observation counts. iNaturalist observation data is available
under its own terms; see <https://www.inaturalist.org/pages/terms>.
No iNaturalist photographs are redistributed by this app — they were used only
offline, to measure accuracy.
