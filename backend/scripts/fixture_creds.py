"""Credentials for the QA fixture accounts.

Throwaway accounts on the hidden QA realm keep a documented default so `seed_qa_db.py` stays one command, but every
one of them can be overridden from the environment. Accounts that carry real power in a live realm (`gm_admin`,
`view_all_regions`) have no default at all: running those seeders against a real deployment must be a deliberate act
with a password chosen by the operator, not a value anyone can read in this repository.
"""
from __future__ import annotations

import os
import sys


def cred(var: str, default: str | None = None) -> str:
    value = os.environ.get(var)
    if value:
        return value
    if default is None:
        sys.exit(f"{var} is required: this fixture creates a privileged account, choose its password explicitly")
    return default
