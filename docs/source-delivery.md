# Klim-Lux: controlled source recovery

This draft branch prepares migration of the existing site into this repository. It does not yet contain the current application source.

The verified published baseline is Sites v39, source commit `8fe371c438b7a0d5c5fc2d77bd4b5728984fe3ae`. The existing `main` history remains the parent of this preparation change.

Before importing a source tree, complete its publication review, preserve an independently restorable source backup, and compare the imported file inventory. Use a supported authenticated Git transport for the full source and assets. Keep the original `main` branch unchanged until review and acceptance.

Delivery remains explicit: source change, suitable tests, critical review where needed, checkpoint, exact archive-backed Sites version, and separately authorized deployment to the existing site. Do not create another site or infer deployment from a GitHub commit. Do not enable automatic production releases.
