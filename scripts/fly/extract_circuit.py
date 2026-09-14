"""Extract the right-hemisphere mushroom body circuit from the MaleCNS v1.0 connectome.

Source: HHMI Janelia / Google Research, "male-cns" v1.0 flat connectome (CC-BY 4.0),
https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/

The output is a small JSON graph with three layers:
  inputs  -> projection neurons that synapse onto Kenyon cells (olfactory ALPNs and
             visual projection neurons). The game state is presented to these.
  kc      -> Kenyon cells, the sparse expansion layer of the mushroom body.
  mbon    -> mushroom body output neurons. The KC->MBON synapses are the plastic
             site of associative learning in the real fly, and the only synapses
             the training script is allowed to change.
Synapse counts are kept as integers; no synaptic strengths exist in the source data.

Usage:
  python -m venv .venv && .venv/bin/pip install -r scripts/fly/requirements.txt
  .venv/bin/python scripts/fly/extract_circuit.py --cache /path/to/downloads
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import urllib.request

import pandas as pd
import pyarrow.feather as pf

BASE = "https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/"
FILES = {
    "annotations": "body-annotations-male-cns-v1.0-minconf-0.5.feather",
    "neurotransmitters": "body-neurotransmitters-male-cns-v1.0.feather",
    "weights": "connectome-weights-male-cns-v1.0-minconf-0.5-significant-only.feather",
}
INHIBITORY = {"gaba", "glutamate", "histamine"}


def fetch(cache: pathlib.Path, name: str) -> pathlib.Path:
    path = cache / name
    if not path.exists():
        print(f"downloading {name} ...")
        urllib.request.urlretrieve(BASE + name, path)
    return path


def sha256(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", default=".runtime/malecns")
    parser.add_argument("--side", default="R", help="R, L, or both")
    parser.add_argument("--out", default="data/fly/circuit.json")
    args = parser.parse_args()
    cache = pathlib.Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)
    paths = {k: fetch(cache, v) for k, v in FILES.items()}

    ann = pd.read_feather(paths["annotations"]).set_index("bodyId")
    nt = pd.read_feather(paths["neurotransmitters"]).set_index("body")["consensus_nt"]
    side = ann[ann.somaSide.isin(["L", "R"]) if args.side == "both" else ann.somaSide == args.side]
    kc_ids = list(side[side["class"] == "Kenyon_Cell"].index)
    mbon_ids = set(side[side["class"] == "MBON"].index)
    kc_set = set(kc_ids)

    table = pf.read_table(paths["weights"], columns=["body_pre", "body_post", "weight"], memory_map=True)
    w = table.to_pandas()
    onto_kc = w[w.body_post.isin(kc_set)]
    kc_to_mbon = w[w.body_pre.isin(kc_set) & w.body_post.isin(mbon_ids)]

    pre_class = ann.loc[onto_kc.body_pre, "class"].values
    pre_super = ann.loc[onto_kc.body_pre, "superclass"].values
    is_input = (pre_class == "ALPN") | (pre_super == "visual_projection")
    pn_edges = onto_kc[is_input]
    # Rank input neurons by how strongly they drive Kenyon cells; sister neurons of
    # the same type share a "glomerulus" (feature) at runtime.
    strength = pn_edges.groupby("body_pre").weight.sum().sort_values(ascending=False)
    input_ids = list(strength.index)
    used_mbons = sorted(kc_to_mbon.body_post.unique(), key=lambda b: (str(ann.loc[b, "type"]), b))

    def neuron(b: int) -> dict:
        t = ann.loc[b, "type"]
        n = nt.get(b)
        return {
            "id": int(b),
            "type": None if pd.isna(t) else str(t),
            "nt": None if not isinstance(n, str) else n,
            "sign": -1 if isinstance(n, str) and n in INHIBITORY else 1,
        }

    kc_index = {b: i for i, b in enumerate(kc_ids)}
    in_index = {b: i for i, b in enumerate(input_ids)}
    mb_index = {b: i for i, b in enumerate(used_mbons)}
    pn_to_kc = sorted(
        (in_index[r.body_pre], kc_index[r.body_post], int(r.weight)) for r in pn_edges.itertuples()
    )
    kc_to_mbon_list = sorted(
        (kc_index[r.body_pre], mb_index[r.body_post], int(r.weight)) for r in kc_to_mbon.itertuples()
    )
    dan = int((side["class"] == "DAN").sum())
    out = {
        "source": {
            "dataset": "MaleCNS v1.0 (HHMI Janelia Research Campus and Google Research)",
            "license": "CC-BY 4.0",
            "base_url": BASE,
            "files": {k: {"name": v, "sha256": sha256(paths[k])} for k, v in FILES.items()},
            "hemisphere": args.side,
            "notes": "Synapse counts only. Signs from consensus neurotransmitter predictions. "
            "Kenyon cell to MBON synapses are the plastic site; everything else is fixed wiring.",
        },
        "counts": {
            "inputs": len(input_ids),
            "kc": len(kc_ids),
            "mbon": len(used_mbons),
            "dan": dan,
            "pn_to_kc": len(pn_to_kc),
            "kc_to_mbon": len(kc_to_mbon_list),
        },
        "inputs": [neuron(b) for b in input_ids],
        "kc": [{"id": int(b), "type": str(ann.loc[b, "type"])} for b in kc_ids],
        "mbon": [neuron(b) for b in used_mbons],
        "pnToKc": [x for e in pn_to_kc for x in e],
        "kcToMbon": [x for e in kc_to_mbon_list for x in e],
    }
    pathlib.Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(json.dumps(out["counts"]))


if __name__ == "__main__":
    main()
